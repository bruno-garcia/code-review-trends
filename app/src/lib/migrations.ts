/**
 * Schema migration system for ClickHouse.
 *
 * Tracks which migrations have been applied via a `schema_migrations` table.
 * The app checks the current version on every request (cached 60s) and:
 *   - If DB is behind: auto-migrates (with a best-effort distributed lock)
 *   - If app is behind: shows a warning banner
 *
 * All migration DDL is idempotent (CREATE IF NOT EXISTS, ALTER ADD COLUMN IF NOT EXISTS),
 * so concurrent execution from multiple serverless instances is safe — the lock only
 * prevents redundant work, not data corruption.
 *
 * Migration definitions are embedded as TypeScript constants so they work on Vercel
 * without filesystem access to db/init/. Keep them in sync with db/init/001_schema.sql.
 */

import { getClickHouseClient } from "./clickhouse";
import type { ClickHouseClient } from "@clickhouse/client";
import * as Sentry from "@sentry/nextjs";
import { connection } from "next/server";

// ---------------------------------------------------------------------------
// Version & types
// ---------------------------------------------------------------------------

/** The schema version this app deployment expects. Bump when adding a migration. */
export const EXPECTED_SCHEMA_VERSION = 10;

export type SchemaStatus = {
  /**
   * "ok"        — DB matches expected version.
   * "app_behind" — DB is ahead of this app deployment.
   * "db_behind" — DB is behind and auto-migration failed (DDL error). Site still works,
   *               banner is shown. Connection failures throw instead (→ error boundary).
   * "migrating" — another instance holds the migration lock. Spinner + auto-refresh.
   */
  status: "ok" | "app_behind" | "db_behind" | "migrating";
  dbVersion: number;
  expectedVersion: number;
  error?: string;
};

type Migration = {
  version: number;
  name: string;
  statements: string[];
};

// ---------------------------------------------------------------------------
// Migration definitions
// ---------------------------------------------------------------------------

/**
 * Migration 1 — baseline schema.
 * Matches db/init/001_schema.sql (without the database prefix, since the
 * ClickHouse client is already connected to the target database).
 */
const MIGRATION_001: Migration = {
  version: 1,
  name: "initial_schema",
  statements: [
    // Products
    `CREATE TABLE IF NOT EXISTS products (
      id String,
      name String,
      website String,
      description String,
      brand_color String,
      avatar_url String
    ) ENGINE = ReplacingMergeTree()
    ORDER BY id`,

    // Bots
    `CREATE TABLE IF NOT EXISTS bots (
      id String,
      name String,
      product_id String,
      brand_color String,
      avatar_url String,
      website String,
      description String,
      github_id UInt64 DEFAULT 0
    ) ENGINE = ReplacingMergeTree()
    ORDER BY id`,

    // Bot logins
    `CREATE TABLE IF NOT EXISTS bot_logins (
      bot_id String,
      github_login String
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (bot_id, github_login)`,

    // Review activity
    `CREATE TABLE IF NOT EXISTS review_activity (
      week Date,
      bot_id String,
      review_count UInt64,
      review_comment_count UInt64,
      pr_comment_count UInt64 DEFAULT 0,
      repo_count UInt64,
      org_count UInt64
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (week, bot_id)`,

    // Human review activity
    `CREATE TABLE IF NOT EXISTS human_review_activity (
      week Date,
      review_count UInt64,
      review_comment_count UInt64,
      pr_comment_count UInt64 DEFAULT 0,
      repo_count UInt64
    ) ENGINE = ReplacingMergeTree()
    ORDER BY week`,

    // PR bot events (discovery)
    `CREATE TABLE IF NOT EXISTS pr_bot_events (
      repo_name String,
      pr_number UInt32,
      bot_id String,
      actor_login String,
      event_type String,
      event_week Date,
      discovered_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (repo_name, pr_number, bot_id, event_type, event_week)`,

    // Repos
    `CREATE TABLE IF NOT EXISTS repos (
      name String,
      owner String,
      stars UInt32,
      primary_language String,
      fork Bool DEFAULT false,
      archived Bool DEFAULT false,
      fetch_status String DEFAULT 'ok',
      updated_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(updated_at)
    ORDER BY name`,

    // Repo languages
    `CREATE TABLE IF NOT EXISTS repo_languages (
      repo_name String,
      language String,
      bytes UInt64,
      updated_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(updated_at)
    ORDER BY (repo_name, language)`,

    // Pull requests
    `CREATE TABLE IF NOT EXISTS pull_requests (
      repo_name String,
      pr_number UInt32,
      title String,
      author String,
      state String,
      created_at DateTime,
      merged_at Nullable(DateTime),
      closed_at Nullable(DateTime),
      additions UInt32,
      deletions UInt32,
      changed_files UInt32,
      thumbs_up UInt32 DEFAULT 0,
      thumbs_down UInt32 DEFAULT 0,
      laugh UInt32 DEFAULT 0,
      confused UInt32 DEFAULT 0,
      heart UInt32 DEFAULT 0,
      hooray UInt32 DEFAULT 0,
      eyes UInt32 DEFAULT 0,
      rocket UInt32 DEFAULT 0,
      updated_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(updated_at)
    ORDER BY (repo_name, pr_number)`,

    // PR comments
    `CREATE TABLE IF NOT EXISTS pr_comments (
      repo_name String,
      pr_number UInt32,
      comment_id UInt64,
      bot_id String,
      body_length UInt32,
      created_at DateTime,
      thumbs_up UInt32 DEFAULT 0,
      thumbs_down UInt32 DEFAULT 0,
      laugh UInt32 DEFAULT 0,
      confused UInt32 DEFAULT 0,
      heart UInt32 DEFAULT 0,
      hooray UInt32 DEFAULT 0,
      eyes UInt32 DEFAULT 0,
      rocket UInt32 DEFAULT 0,
      updated_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(updated_at)
    ORDER BY (repo_name, pr_number, comment_id)`,
  ],
};

/**
 * Migration 2 — pr_bot_reactions + reaction_scan_progress.
 * Matches db/init/003_pr_bot_reactions.sql.
 */
const MIGRATION_002: Migration = {
  version: 2,
  name: "pr_bot_reactions",
  statements: [
    `CREATE TABLE IF NOT EXISTS pr_bot_reactions (
      repo_name String,
      pr_number UInt32,
      bot_id String,
      reaction_type String,
      reacted_at DateTime,
      reaction_id UInt64,
      updated_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(updated_at)
    ORDER BY (repo_name, pr_number, bot_id, reaction_id)`,

    `CREATE TABLE IF NOT EXISTS reaction_scan_progress (
      repo_name String,
      pr_number UInt32,
      scanned_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree(scanned_at)
    ORDER BY (repo_name, pr_number)`,
  ],
};

/**
 * Migration 3 — pr_bot_event_counts materialized view.
 * Matches db/init/004_pr_bot_event_counts.sql.
 *
 * Pre-aggregates pr_bot_events at (repo_name, bot_id) granularity using
 * uniqExactState(pr_number). Reduces org/repo queries from ~815 MiB to ~40 MiB.
 * Auto-updates on INSERT to pr_bot_events; backfill populates existing data.
 */
const MIGRATION_003: Migration = {
  version: 3,
  name: "pr_bot_event_counts",
  statements: [
    // Target table
    `CREATE TABLE IF NOT EXISTS pr_bot_event_counts (
      repo_name String,
      bot_id String,
      pr_count AggregateFunction(uniqExact, UInt32)
    ) ENGINE = AggregatingMergeTree()
    ORDER BY (repo_name, bot_id)`,

    // Materialized view — auto-populates on INSERT to pr_bot_events
    `CREATE MATERIALIZED VIEW IF NOT EXISTS pr_bot_event_counts_mv
    TO pr_bot_event_counts
    AS SELECT
      repo_name,
      bot_id,
      uniqExactState(pr_number) AS pr_count
    FROM pr_bot_events
    GROUP BY repo_name, bot_id`,

    // Backfill existing data
    `INSERT INTO pr_bot_event_counts
    SELECT
      repo_name,
      bot_id,
      uniqExactState(pr_number) AS pr_count
    FROM pr_bot_events
    GROUP BY repo_name, bot_id`,
  ],
};

/**
 * Migration 4 — drop orphaned repo_languages table.
 * Matches db/init/005_drop_repo_languages.sql.
 *
 * The table stored per-language byte breakdowns from the old REST-based repo
 * enrichment. Writing was removed in PR #112, and no app query reads from it.
 * All language data comes from repos.primary_language instead.
 */
const MIGRATION_004: Migration = {
  version: 4,
  name: "drop_repo_languages",
  statements: [
    `DROP TABLE IF EXISTS repo_languages`,
  ],
};

/**
 * Migration 5 — reaction_only_review_counts refreshable materialized view.
 * Matches db/init/006_reaction_only_review_counts.sql.
 *
 * Pre-aggregates weekly reaction-only review counts per bot using a REFRESHABLE
 * MV (every 30 min). Bucketed by ISO week so counts can be UNION'd into the
 * review_activity pipeline — growth_pct, latest_week, and time-range filters
 * all work automatically. Replaces the expensive inline NOT EXISTS subquery
 * (~3s) with an instant table lookup (<200ms).
 */
const MIGRATION_005: Migration = {
  version: 5,
  name: "reaction_only_review_counts",
  statements: [
    // Target table — weekly granularity
    `CREATE TABLE IF NOT EXISTS reaction_only_review_counts (
      bot_id String,
      week Date,
      reaction_reviews UInt64
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (bot_id, week)`,

    // Refreshable materialized view — recomputes every 30 minutes
    `CREATE MATERIALIZED VIEW IF NOT EXISTS reaction_only_review_counts_mv
    REFRESH EVERY 30 MINUTE
    TO reaction_only_review_counts
    AS SELECT
      r.bot_id,
      toStartOfWeek(r.reacted_at, 1) AS week,
      countDistinct((r.repo_name, r.pr_number)) AS reaction_reviews
    FROM pr_bot_reactions r FINAL
    WHERE r.reaction_type = 'hooray'
      AND NOT EXISTS (
        SELECT 1 FROM pr_bot_events e
        WHERE e.repo_name = r.repo_name AND e.pr_number = r.pr_number AND e.bot_id = r.bot_id
      )
    GROUP BY r.bot_id, toStartOfWeek(r.reacted_at, 1)`,
  ],
};

/**
 * Migration 6 — comment_stats_weekly AggregatingMergeTree.
 * Matches db/init/007_comment_stats.sql.
 *
 * Pre-aggregates pr_comments by (bot_id, week) for fast reaction/comment queries.
 * Replaces expensive `FROM pr_comments FINAL` full-table scans (~15–120s on
 * millions of rows) with instant reads from a ~9K row summary table.
 */
const MIGRATION_006: Migration = {
  version: 6,
  name: "comment_stats_weekly",
  statements: [
    `CREATE TABLE IF NOT EXISTS comment_stats_weekly (
      bot_id String,
      week Date,
      comment_count SimpleAggregateFunction(sum, UInt64),
      thumbs_up SimpleAggregateFunction(sum, UInt64),
      thumbs_down SimpleAggregateFunction(sum, UInt64),
      heart SimpleAggregateFunction(sum, UInt64),
      pr_count AggregateFunction(uniqExact, String, UInt32)
    ) ENGINE = AggregatingMergeTree()
    ORDER BY (bot_id, week)`,

    // Backfill BEFORE creating the MV to avoid double-counting: if the MV
    // exists during the backfill, concurrent pr_comments inserts would be
    // counted by both the MV trigger and the backfill's FINAL scan.
    `INSERT INTO comment_stats_weekly
    SELECT
      bot_id,
      toMonday(created_at) AS week,
      count() AS comment_count,
      sum(thumbs_up) AS thumbs_up,
      sum(thumbs_down) AS thumbs_down,
      sum(heart) AS heart,
      uniqExactState(repo_name, pr_number) AS pr_count
    FROM pr_comments FINAL
    WHERE comment_id > 0
    GROUP BY bot_id, week
    SETTINGS max_execution_time = 300`,

    `CREATE MATERIALIZED VIEW IF NOT EXISTS comment_stats_weekly_mv
    TO comment_stats_weekly
    AS SELECT
      bot_id,
      toMonday(created_at) AS week,
      count() AS comment_count,
      sum(thumbs_up) AS thumbs_up,
      sum(thumbs_down) AS thumbs_down,
      sum(heart) AS heart,
      uniqExactState(repo_name, pr_number) AS pr_count
    FROM pr_comments
    WHERE comment_id > 0
    GROUP BY bot_id, week`,
  ],
};

/**
 * Migration 7 — reaction_only_repo_counts refreshable materialized view.
 * Based on db/init/008_reaction_only_repo_counts.sql, plus an INSERT backfill
 * for immediate population (not present in init SQL since the refreshable MV
 * handles it there).
 *
 * Pre-aggregates reaction-only reviews per (repo_name, bot_id) with two counts:
 *   - pr_count: PRs where this bot reacted but has no event (per-bot NOT EXISTS)
 *   - exclusive_pr_count: subset where NO bot has an event (safe to add to event totals)
 *
 * Enables the org listing page to include reaction-based products (e.g. Sentry)
 * without scanning raw pr_bot_reactions at query time.
 */
const MIGRATION_007: Migration = {
  version: 7,
  name: "reaction_only_repo_counts",
  statements: [
    // Target table
    `CREATE TABLE IF NOT EXISTS reaction_only_repo_counts (
      repo_name String,
      bot_id String,
      pr_count UInt64,
      exclusive_pr_count UInt64
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (repo_name, bot_id)`,

    // Refreshable materialized view — recomputes every 30 minutes
    `CREATE MATERIALIZED VIEW IF NOT EXISTS reaction_only_repo_counts_mv
    REFRESH EVERY 30 MINUTE
    TO reaction_only_repo_counts
    AS SELECT
      r.repo_name,
      r.bot_id,
      uniqExact(r.pr_number) AS pr_count,
      uniqExactIf(r.pr_number, ev.pr_number IS NULL) AS exclusive_pr_count
    FROM pr_bot_reactions r FINAL
    LEFT JOIN (
      SELECT DISTINCT repo_name, pr_number
      FROM pr_bot_events
    ) ev ON r.repo_name = ev.repo_name AND r.pr_number = ev.pr_number
    WHERE r.reaction_type = 'hooray'
      AND NOT EXISTS (
        SELECT 1 FROM pr_bot_events e
        WHERE e.repo_name = r.repo_name AND e.pr_number = r.pr_number AND e.bot_id = r.bot_id
      )
    GROUP BY r.repo_name, r.bot_id`,

    // Backfill — run the same query to populate immediately
    `INSERT INTO reaction_only_repo_counts
    SELECT
      r.repo_name,
      r.bot_id,
      uniqExact(r.pr_number) AS pr_count,
      uniqExactIf(r.pr_number, ev.pr_number IS NULL) AS exclusive_pr_count
    FROM pr_bot_reactions r FINAL
    LEFT JOIN (
      SELECT DISTINCT repo_name, pr_number
      FROM pr_bot_events
    ) ev ON r.repo_name = ev.repo_name AND r.pr_number = ev.pr_number
    WHERE r.reaction_type = 'hooray'
      AND NOT EXISTS (
        SELECT 1 FROM pr_bot_events e
        WHERE e.repo_name = r.repo_name AND e.pr_number = r.pr_number AND e.bot_id = r.bot_id
      )
    GROUP BY r.repo_name, r.bot_id`,
  ],
};

/**
 * Migration 8 — add reacted_comment_count to comment_stats_weekly.
 * Matches db/init/009_comment_stats_reacted_count.sql.
 *
 * Tracks how many comments received at least one 👍 or 👎 reaction, enabling
 * "reaction rate" = reacted_comment_count / comment_count. Requires drop+recreate
 * of the MV and a full re-backfill since the column can't be derived from
 * existing aggregated data.
 */
const MIGRATION_008: Migration = {
  version: 8,
  name: "comment_stats_reacted_count",
  statements: [
    // Drop MV so it doesn't interfere with the full backfill
    `DROP TABLE IF EXISTS comment_stats_weekly_mv`,

    // Add the new column
    `ALTER TABLE comment_stats_weekly
      ADD COLUMN IF NOT EXISTS reacted_comment_count SimpleAggregateFunction(sum, UInt64)`,

    // Truncate and re-backfill with the new column
    `TRUNCATE TABLE comment_stats_weekly`,

    `INSERT INTO comment_stats_weekly
    SELECT
      bot_id,
      toMonday(created_at) AS week,
      count() AS comment_count,
      sum(pr_comments.thumbs_up) AS thumbs_up,
      sum(pr_comments.thumbs_down) AS thumbs_down,
      sum(pr_comments.heart) AS heart,
      uniqExactState(repo_name, pr_number) AS pr_count,
      countIf(pr_comments.thumbs_up + pr_comments.thumbs_down > 0) AS reacted_comment_count
    FROM pr_comments FINAL
    WHERE comment_id > 0
    GROUP BY bot_id, week
    SETTINGS max_execution_time = 300`,

    // Recreate MV with the new column
    `CREATE MATERIALIZED VIEW IF NOT EXISTS comment_stats_weekly_mv
    TO comment_stats_weekly
    AS SELECT
      bot_id,
      toMonday(created_at) AS week,
      count() AS comment_count,
      sum(pr_comments.thumbs_up) AS thumbs_up,
      sum(pr_comments.thumbs_down) AS thumbs_down,
      sum(pr_comments.heart) AS heart,
      uniqExactState(repo_name, pr_number) AS pr_count,
      countIf(pr_comments.thumbs_up + pr_comments.thumbs_down > 0) AS reacted_comment_count
    FROM pr_comments
    WHERE comment_id > 0
    GROUP BY bot_id, week`,
  ],
};

/**
 * Migration 9 — add status column to products table.
 * Matches db/init/010_product_status.sql.
 *
 * Allows products to be marked as 'retired' when their service is no longer
 * available, preserving historical data while showing a badge in the UI.
 */
const MIGRATION_009: Migration = {
  version: 9,
  name: "product_status",
  statements: [
    `ALTER TABLE products ADD COLUMN IF NOT EXISTS status String DEFAULT 'active'`,
    `ALTER TABLE products UPDATE status = 'retired' WHERE id = 'korbit'`,
  ],
};

/**
 * Migration 10 — pr_product_characteristics materialized view.
 * Matches db/init/011_pr_product_characteristics.sql.
 *
 * Pre-joins pull_requests with pr_bot_events + bots so that per-product PR
 * characteristic queries (avg additions, merge rate, time-to-merge) don't need
 * a DISTINCT over millions of pr_bot_events rows at query time. Reduces the
 * compare page's slowest query from a 5.6M-row DISTINCT + 627K-row JOIN to a
 * simple GROUP BY on ~750K pre-joined rows.
 */
const MIGRATION_010: Migration = {
  version: 10,
  name: "pr_product_characteristics",
  statements: [
    // Target table — one row per (product, PR), deduplicated by ReplacingMergeTree
    `CREATE TABLE IF NOT EXISTS pr_product_characteristics (
      product_id String,
      repo_name String,
      pr_number UInt32,
      additions UInt32,
      deletions UInt32,
      changed_files UInt32,
      state String,
      created_at DateTime,
      merged_at Nullable(DateTime)
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (product_id, repo_name, pr_number)`,

    // MV: auto-populates on INSERT to pull_requests
    `CREATE MATERIALIZED VIEW IF NOT EXISTS pr_product_characteristics_mv
    TO pr_product_characteristics
    AS SELECT
      b.product_id,
      p.repo_name,
      p.pr_number,
      p.additions,
      p.deletions,
      p.changed_files,
      p.state,
      p.created_at,
      p.merged_at
    FROM pull_requests AS p
    INNER JOIN pr_bot_events AS e
      ON p.repo_name = e.repo_name AND p.pr_number = e.pr_number
    INNER JOIN bots AS b
      ON e.bot_id = b.id`,

    // Backfill existing data
    `INSERT INTO pr_product_characteristics
    SELECT
      b.product_id,
      p.repo_name,
      p.pr_number,
      p.additions,
      p.deletions,
      p.changed_files,
      p.state,
      p.created_at,
      p.merged_at
    FROM pull_requests AS p
    INNER JOIN pr_bot_events AS e
      ON p.repo_name = e.repo_name AND p.pr_number = e.pr_number
    INNER JOIN bots AS b
      ON e.bot_id = b.id
    SETTINGS max_execution_time = 300`,
  ],
};

/** All migrations, ordered by version. Add new migrations here. */
const MIGRATIONS: Migration[] = [MIGRATION_001, MIGRATION_002, MIGRATION_003, MIGRATION_004, MIGRATION_005, MIGRATION_006, MIGRATION_007, MIGRATION_008, MIGRATION_009, MIGRATION_010];

// ---------------------------------------------------------------------------
// Migration infrastructure tables
// ---------------------------------------------------------------------------

async function ensureMigrationTables(client: ClickHouseClient): Promise<void> {
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS schema_migrations (
      version UInt32,
      name String,
      applied_at DateTime DEFAULT now()
    ) ENGINE = ReplacingMergeTree()
    ORDER BY version`,
  });

  await client.command({
    query: `CREATE TABLE IF NOT EXISTS schema_migration_lock (
      locked_by String,
      locked_at DateTime DEFAULT now()
    ) ENGINE = MergeTree()
    ORDER BY tuple()`,
  });
}

// ---------------------------------------------------------------------------
// Version check
// ---------------------------------------------------------------------------

async function getSchemaVersion(client: ClickHouseClient): Promise<number> {
  try {
    const result = await client.query({
      query: "SELECT max(version) AS v FROM schema_migrations",
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as { v: number }[];
    return rows[0]?.v ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Lock helpers
// ---------------------------------------------------------------------------

const LOCK_EXPIRY_SECONDS = 300; // 5 minutes

async function tryAcquireLock(
  client: ClickHouseClient,
  lockId: string,
): Promise<boolean> {
  // Check for active (non-expired) lock
  const result = await client.query({
    query: `SELECT count() AS cnt FROM schema_migration_lock
            WHERE locked_at > now() - toIntervalSecond(${LOCK_EXPIRY_SECONDS})`,
    format: "JSONEachRow",
  });
  const rows = (await result.json()) as { cnt: string }[];
  if (Number(rows[0]?.cnt) > 0) return false;

  // Clean stale locks and insert ours
  await client.command({
    query: "TRUNCATE TABLE schema_migration_lock",
  });
  await client.insert({
    table: "schema_migration_lock",
    values: [{ locked_by: lockId }],
    format: "JSONEachRow",
  });

  return true;
}

async function releaseLock(client: ClickHouseClient): Promise<void> {
  try {
    await client.command({ query: "TRUNCATE TABLE schema_migration_lock" });
  } catch {
    // Best-effort — lock will expire naturally
  }
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

const LOCK_RETRY_MS = 2_000;
const LOCK_MAX_RETRIES = 15; // 30 seconds total

async function runMigrations(
  client: ClickHouseClient,
): Promise<{ applied: number; error?: string; isDdlError?: true }> {
  const currentVersion = await getSchemaVersion(client);
  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  );

  if (pending.length === 0) return { applied: 0 };

  // Try to acquire lock
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let locked = false;

  for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
    locked = await tryAcquireLock(client, lockId);
    if (locked) break;

    // Someone else might be migrating — re-check if they finished
    const ver = await getSchemaVersion(client);
    if (ver >= EXPECTED_SCHEMA_VERSION) return { applied: 0 };

    await sleep(LOCK_RETRY_MS);
  }

  if (!locked) {
    return { applied: 0, error: "Could not acquire migration lock after 30s" };
  }

  try {
    let applied = 0;
    for (const migration of pending) {
      for (const sql of migration.statements) {
        try {
          await client.command({ query: sql });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            applied,
            error: `Migration ${migration.version} (${migration.name}) failed: ${errorMsg}`,
            isDdlError: true as const,
          };
        }
      }
      // Record this migration
      await client.insert({
        table: "schema_migrations",
        values: [{ version: migration.version, name: migration.name }],
        format: "JSONEachRow",
      });
      applied++;
    }
    return { applied };
  } finally {
    await releaseLock(client);
  }
}

// ---------------------------------------------------------------------------
// Public API — cached schema status check
// ---------------------------------------------------------------------------

let _cachedStatus: SchemaStatus | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000; // Re-check every 60 seconds

/**
 * Check the schema status and auto-migrate if the DB is behind.
 * Results are cached for 60s per serverless container.
 */
export async function getSchemaStatus(): Promise<SchemaStatus> {
  // Signal that this page needs a live server — skip static prerendering during build.
  // At runtime, the schema check runs on-demand and is cached per container (60s).
  // If ClickHouse is unreachable, the exception propagates → error boundary → 500 → not cached.
  await connection();

  const now = Date.now();
  if (_cachedStatus && now - _cachedAt < CACHE_TTL_MS) {
    // If previously OK, trust the cache. Otherwise re-check (might have been fixed).
    if (_cachedStatus.status === "ok") return _cachedStatus;
  }

  let client;
  try {
    client = getClickHouseClient();
    await ensureMigrationTables(client);
    const dbVersion = await getSchemaVersion(client);

    // Already at or ahead of expected version
    if (dbVersion >= EXPECTED_SCHEMA_VERSION) {
      const status: SchemaStatus =
        dbVersion > EXPECTED_SCHEMA_VERSION
          ? {
              status: "app_behind",
              dbVersion,
              expectedVersion: EXPECTED_SCHEMA_VERSION,
            }
          : {
              status: "ok",
              dbVersion,
              expectedVersion: EXPECTED_SCHEMA_VERSION,
            };
      _cachedStatus = status;
      _cachedAt = Date.now();
      return status;
    }

    // DB is behind — try to auto-migrate.
    // Connection failures throw (→ error boundary, 500, not cached by ISR).
    // DDL failures return db_behind (site still works, banner shown, Sentry captures).
    const result = await runMigrations(client);

    if (result.error) {
      if (result.isDdlError) {
        // DDL failure (syntax error, permission denied) — site still works,
        // just missing new schema features. Show a banner, capture to Sentry.
        Sentry.captureException(new Error(result.error), {
          tags: { component: "schema-migration", reason: "ddl_failure" },
          extra: { dbVersion, expectedVersion: EXPECTED_SCHEMA_VERSION },
        });
        return {
          status: "db_behind",
          dbVersion,
          expectedVersion: EXPECTED_SCHEMA_VERSION,
          error: result.error,
        };
      }

      // Lock contention — re-check if someone else finished
      const newVersion = await getSchemaVersion(client);
      if (newVersion >= EXPECTED_SCHEMA_VERSION) {
        const status: SchemaStatus = {
          status: "ok",
          dbVersion: newVersion,
          expectedVersion: EXPECTED_SCHEMA_VERSION,
        };
        _cachedStatus = status;
        _cachedAt = Date.now();
        return status;
      }
      return {
        status: "migrating",
        dbVersion: newVersion,
        expectedVersion: EXPECTED_SCHEMA_VERSION,
        error: result.error,
      };
    }

    const status: SchemaStatus = {
      status: "ok",
      dbVersion: EXPECTED_SCHEMA_VERSION,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
    };
    _cachedStatus = status;
    _cachedAt = Date.now();
    return status;
  } catch (err) {
    // ClickHouse unreachable or misconfigured — let it throw.
    // global-error.tsx renders a retry button and captures to Sentry.
    // Do NOT return a status object here: that produces an HTTP 200 that
    // ISR caches, turning a transient hiccup into a long-lived outage.
    throw err;
  }
}

/** Reset the cached status. Exported for tests only. */
export function _resetCacheForTesting(): void {
  _cachedStatus = null;
  _cachedAt = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
