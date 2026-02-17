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

// ---------------------------------------------------------------------------
// Version & types
// ---------------------------------------------------------------------------

/** The schema version this app deployment expects. Bump when adding a migration. */
export const EXPECTED_SCHEMA_VERSION = 3;

export type SchemaStatus = {
  status: "ok" | "app_behind" | "db_behind" | "migrating" | "error";
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

/** All migrations, ordered by version. Add new migrations here. */
const MIGRATIONS: Migration[] = [MIGRATION_001, MIGRATION_002, MIGRATION_003];

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
): Promise<{ applied: number; error?: string }> {
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
          // Log the failed SQL statement for debugging
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(
            `[schema-migration] Migration DDL failed:`,
            err
          );
          return {
            applied,
            error: `Migration ${migration.version} (${migration.name}) failed: ${errorMsg}`,
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

    // DB is behind — try to auto-migrate
    const result = await runMigrations(client);

    if (result.error) {
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
    // ClickHouse unreachable or misconfigured (e.g., empty URL during build)
    return {
      status: "error",
      dbVersion: 0,
      expectedVersion: EXPECTED_SCHEMA_VERSION,
      error: err instanceof Error ? err.message : String(err),
    };
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
