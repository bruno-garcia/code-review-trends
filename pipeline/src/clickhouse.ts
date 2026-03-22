/**
 * ClickHouse client for the pipeline.
 *
 * Handles writing aggregated data into ClickHouse tables.
 * Tables use ReplacingMergeTree so inserts are idempotent —
 * re-running a pipeline job for the same week just overwrites old rows.
 */

import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { type BotDefinition, type ProductDefinition } from "./bots.js";

export type ClickHouseConfig = {
  url: string;
  username: string;
  password: string;
  database: string;
};

function getConfig(): ClickHouseConfig {
  return {
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "dev",
    database: process.env.CLICKHOUSE_DB ?? "code_review_trends",
  };
}

export function createCHClient(config?: ClickHouseConfig): ClickHouseClient {
  const c = config ?? getConfig();
  return createClient({
    url: c.url,
    username: c.username,
    password: c.password,
    database: c.database,
    request_timeout: 120_000,
    clickhouse_settings: {
      // Server default is 60s (set in infra/clickhouse.ts) which is too
      // tight for pipeline operations like OPTIMIZE TABLE FINAL and bulk
      // INSERT...SELECT. Match the client-side request_timeout.
      max_execution_time: 120,
    },
  });
}

/**
 * Stop tests from running against a live instance such as production
 * if accidentally configured to do so once prod goes live.
 *
 * Call this in the `before` hook of every test suite that creates a
 * ClickHouse client. Throws if CLICKHOUSE_URL points at a .com host.
 */
export function assertNotLiveDatabase(): void {
  const url = process.env.CLICKHOUSE_URL;
  if (!url) return; // defaults to localhost — safe
  const host = new URL(url).hostname;
  if (host.endsWith(".com")) {
    throw new Error(
      `Refusing to run tests against a live database: ${url} — ` +
        `unset CLICKHOUSE_URL or point it at localhost.`,
    );
  }
}

/**
 * Sync product definitions into the `products` table.
 * Uses ReplacingMergeTree so re-inserts update existing rows.
 */
export async function syncProducts(
  client: ClickHouseClient,
  products: ProductDefinition[],
): Promise<void> {
  if (products.length === 0) return;

  // Ensure products table exists (for migration of existing DBs)
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS products (
      id String,
      name String,
      website String,
      description String,
      docs_url String DEFAULT '',
      brand_color String,
      avatar_url String
    ) ENGINE = ReplacingMergeTree()
    ORDER BY id`,
  });

  // Ensure docs_url column exists (for migration of existing DBs)
  await client.command({
    query: `ALTER TABLE products ADD COLUMN IF NOT EXISTS docs_url String DEFAULT ''`,
  });

  // Ensure status column exists (for migration of existing DBs)
  await client.command({
    query: `ALTER TABLE products ADD COLUMN IF NOT EXISTS status String DEFAULT 'active'`,
  });

  await client.insert({
    table: "products",
    values: products.map((p) => ({
      id: p.id,
      name: p.name,
      website: p.website,
      description: p.description,
      docs_url: p.docs_url,
      brand_color: p.brand_color,
      avatar_url: p.avatar_url,
      status: p.status ?? "active",
    })),
    format: "JSONEachRow",
  });
}

/**
 * Sync bot definitions into the `bots` and `bot_logins` tables.
 * Uses ReplacingMergeTree so re-inserts update existing rows.
 */
export async function syncBots(
  client: ClickHouseClient,
  bots: BotDefinition[],
): Promise<void> {
  if (bots.length === 0) return;

  // Ensure bot_logins table exists (for migration of existing DBs)
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS bot_logins (
      bot_id String,
      github_login String
    ) ENGINE = ReplacingMergeTree()
    ORDER BY (bot_id, github_login)`,
  });

  // Ensure bots table has new columns (for migration of existing DBs)
  await client.command({
    query: `ALTER TABLE bots ADD COLUMN IF NOT EXISTS github_id UInt64 DEFAULT 0`,
  });
  await client.command({
    query: `ALTER TABLE bots ADD COLUMN IF NOT EXISTS product_id String DEFAULT ''`,
  });
  await client.command({
    query: `ALTER TABLE bots ADD COLUMN IF NOT EXISTS brand_color String DEFAULT ''`,
  });
  await client.command({
    query: `ALTER TABLE bots ADD COLUMN IF NOT EXISTS avatar_url String DEFAULT ''`,
  });

  // Ensure activity tables have pr_comment_count (for migration of existing DBs)
  await client.command({
    query: `ALTER TABLE review_activity ADD COLUMN IF NOT EXISTS pr_comment_count UInt64 DEFAULT 0`,
  });
  await client.command({
    query: `ALTER TABLE human_review_activity ADD COLUMN IF NOT EXISTS pr_comment_count UInt64 DEFAULT 0`,
  });

  // Write bot identity info to bots table
  // Display fields (website, description, brand_color, avatar_url) live on the
  // products table — bots only store identity and product linkage.
  await client.insert({
    table: "bots",
    values: bots.map((b) => ({
      id: b.id,
      name: b.name,
      github_id: b.github_id,
      product_id: b.product_id,
    })),
    format: "JSONEachRow",
  });

  // Write login mappings to bot_logins table (includes additional_logins)
  const loginRows = bots.flatMap((b) => [
    { bot_id: b.id, github_login: b.github_login },
    ...(b.additional_logins ?? []).map((login) => ({
      bot_id: b.id,
      github_login: login,
    })),
  ]);

  if (loginRows.length > 0) {
    await client.insert({
      table: "bot_logins",
      values: loginRows,
      format: "JSONEachRow",
    });
  }
}

export type ReviewActivityRow = {
  week: string; // YYYY-MM-DD (Monday of the week)
  bot_id: string;
  review_count: number;
  review_comment_count: number;
  pr_comment_count: number;
  repo_count: number;
  org_count: number;
};

/**
 * Insert weekly bot review activity data.
 */
export async function insertReviewActivity(
  client: ClickHouseClient,
  rows: ReviewActivityRow[],
): Promise<void> {
  if (rows.length === 0) return;

  // Ensure org_count column exists (for migration of existing DBs)
  await client.command({
    query: `ALTER TABLE review_activity ADD COLUMN IF NOT EXISTS org_count UInt64 DEFAULT 0`,
  });

  await client.insert({
    table: "review_activity",
    values: rows,
    format: "JSONEachRow",
  });
}

export type HumanActivityRow = {
  week: string;
  review_count: number;
  review_comment_count: number;
  pr_comment_count: number;
  repo_count: number;
};

/**
 * Insert weekly human review activity totals.
 */
export async function insertHumanActivity(
  client: ClickHouseClient,
  rows: HumanActivityRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "human_review_activity",
    values: rows,
    format: "JSONEachRow",
  });
}

export type PrBotEventRow = {
  repo_name: string;
  pr_number: number;
  bot_id: string;
  actor_login: string;
  event_type: string;
  event_week: string; // YYYY-MM-DD
};

/**
 * Insert PR bot event rows from GH Archive discovery.
 * Batches large inserts to avoid hitting Node.js string length limits.
 */
export async function insertPrBotEvents(
  client: ClickHouseClient,
  rows: PrBotEventRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const BATCH_SIZE = 100_000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await client.insert({
      table: "pr_bot_events",
      values: rows.slice(i, i + BATCH_SIZE),
      format: "JSONEachRow",
    });
  }
}

export type RepoRow = {
  name: string;
  owner: string;
  stars: number;
  primary_language: string;
  fork: boolean;
  archived: boolean;
  fetch_status: string;
};

/**
 * Insert repo metadata rows.
 */
export async function insertRepos(
  client: ClickHouseClient,
  rows: RepoRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "repos",
    values: rows,
    format: "JSONEachRow",
  });
}

export type PullRequestRow = {
  repo_name: string;
  pr_number: number;
  title: string;
  author: string;
  state: string;
  created_at: string; // ISO datetime
  merged_at: string | null;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  thumbs_up: number;
  thumbs_down: number;
  laugh: number;
  confused: number;
  heart: number;
  hooray: number;
  eyes: number;
  rocket: number;
};

/** Ensure reaction columns exist on pull_requests (runs at most once per process). */
let prReactionsMigrated = false;
async function ensurePrReactionColumns(client: ClickHouseClient): Promise<void> {
  if (prReactionsMigrated) return;
  const reactionCols = [
    "thumbs_up", "thumbs_down", "laugh", "confused",
    "heart", "hooray", "eyes", "rocket",
  ];
  for (const col of reactionCols) {
    await client.command({
      query: `ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS ${col} UInt32 DEFAULT 0`,
    });
  }
  prReactionsMigrated = true;
}

/**
 * Insert pull request metadata rows.
 */
export async function insertPullRequests(
  client: ClickHouseClient,
  rows: PullRequestRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await ensurePrReactionColumns(client);

  await client.insert({
    table: "pull_requests",
    values: rows.map((r) => ({
      ...r,
      created_at: toCHDateTime(r.created_at),
      merged_at: toCHDateTime(r.merged_at),
      closed_at: toCHDateTime(r.closed_at),
    })),
    format: "JSONEachRow",
  });
}

export type PrCommentRow = {
  repo_name: string;
  pr_number: number;
  comment_id: string;
  bot_id: string;
  body_length: number;
  created_at: string; // ISO datetime
  thumbs_up: number;
  thumbs_down: number;
  laugh: number;
  confused: number;
  heart: number;
  hooray: number;
  eyes: number;
  rocket: number;
};

/**
 * Insert bot PR comment rows with reaction counts.
 */
export async function insertPrComments(
  client: ClickHouseClient,
  rows: PrCommentRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "pr_comments",
    values: rows.map((r) => ({
      ...r,
      created_at: toCHDateTime(r.created_at),
    })),
    format: "JSONEachRow",
  });
}

/**
 * Normalize an ISO 8601 datetime string to ClickHouse DateTime format.
 * ClickHouse's default date_time_input_format ('basic') only accepts
 * 'YYYY-MM-DD HH:MM:SS' — not the 'T' separator or 'Z' suffix from ISO 8601.
 */
function toCHDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.replace("T", " ").replace("Z", "").replace(/\.\d+/, "");
}

/**
 * Run a read query and return typed rows.
 */
export async function query<T>(
  client: ClickHouseClient,
  sql: string,
  params?: Record<string, string | number>,
): Promise<T[]> {
  const result = await client.query({
    query: sql,
    query_params: params,
    format: "JSONEachRow",
  });
  return (await result.json()) as T[];
}

// ── Bot reactions on PRs ────────────────────────────────────────────────

export type PrBotReactionRow = {
  repo_name: string;
  pr_number: number;
  bot_id: string;
  reaction_type: string;
  reacted_at: string; // ISO datetime
  reaction_id: number;
};

/**
 * Insert bot reaction rows discovered via the GitHub Reactions API.
 */
export async function insertPrBotReactions(
  client: ClickHouseClient,
  rows: PrBotReactionRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: "pr_bot_reactions",
    values: rows.map((r) => ({
      ...r,
      reacted_at: toCHDateTime(r.reacted_at),
    })),
    format: "JSONEachRow",
  });
}

/**
 * Insert sentinel rows marking PRs as scanned for reactions.
 * scan_status distinguishes successful scans from permanent failures:
 *   'ok'          — scanned successfully (may or may not have found reactions)
 *   'not_found'   — repo deleted or renamed, GraphQL returned null
 *   'forbidden'   — repo is private/access denied (combined enrichment only)
 *   'unavailable' — PR exists but reactions field missing (SPAMMY content, etc.)
 *
 * Column defaults to 'unknown' in the DB (for pre-existing rows), but pipeline
 * code must always pass an explicit status — never rely on the default.
 */
export type ReactionScanStatus = "ok" | "not_found" | "forbidden" | "unavailable";

export async function insertReactionScanProgress(
  client: ClickHouseClient,
  rows: { repo_name: string; pr_number: number; scan_status: ReactionScanStatus }[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: "reaction_scan_progress",
    values: rows,
    format: "JSONEachRow",
  });
}

// ── Post-write optimization ─────────────────────────────────────────────

/**
 * All ReplacingMergeTree tables that the app queries.
 * After pipeline writes, we OPTIMIZE these so the app never needs FINAL.
 * Background merges happen naturally, but OPTIMIZE forces it immediately
 * so the next app read sees fully-deduplicated data.
 */
const TABLES_TO_OPTIMIZE = [
  "products",
  "bots",
  "bot_logins",
  "review_activity",
  "human_review_activity",
  "pr_bot_events",
  "org_bot_pr_counts",
  "repo_pr_summary",
  "org_pr_summary",
  "repos",
  "pull_requests",
  "pr_comments",
  "pr_bot_reactions",
  "reaction_scan_progress",
  "pr_product_characteristics",
  "bot_comment_discovery_summary",
  "pr_discovery_global_summary",
  "pull_requests_enrichment_summary",
  "pr_comments_repo_bot_combos",
  "reaction_scan_repo_summary",
  "pr_bot_reactions_pr_summary",
] as const;

const VALID_TABLES = new Set<string>(TABLES_TO_OPTIMIZE);

/**
 * Force-merge all ReplacingMergeTree tables so reads without FINAL are correct.
 * Call after pipeline writes. Each OPTIMIZE is independent — one failure
 * doesn't block the others. Errors are logged but not thrown.
 */
export async function optimizeTables(
  client: ClickHouseClient,
  tables?: readonly string[],
): Promise<void> {
  const toOptimize = tables ?? TABLES_TO_OPTIMIZE;
  for (const table of toOptimize) {
    if (!VALID_TABLES.has(table)) {
      throw new Error(`optimizeTables: invalid table name "${table}"`);
    }
    try {
      await client.command({ query: `OPTIMIZE TABLE \`${table}\` FINAL` });
    } catch (err) {
      // Log but don't fail — the table may not exist in dev/CI, or
      // OPTIMIZE may be already running from another worker.
      console.warn(`  ⚠ OPTIMIZE TABLE ${table} FINAL failed:`, err instanceof Error ? err.message : err);
    }
  }
}
