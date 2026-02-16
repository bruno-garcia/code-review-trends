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

export function getConfig(): ClickHouseConfig {
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
  });
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
      brand_color String,
      avatar_url String
    ) ENGINE = ReplacingMergeTree()
    ORDER BY id`,
  });

  await client.insert({
    table: "products",
    values: products.map((p) => ({
      id: p.id,
      name: p.name,
      website: p.website,
      description: p.description,
      brand_color: p.brand_color,
      avatar_url: p.avatar_url,
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
    query: `ALTER TABLE bots ADD COLUMN IF NOT EXISTS product_id String DEFAULT ''`,
  });
  await client.command({
    query: `ALTER TABLE bots ADD COLUMN IF NOT EXISTS brand_color String DEFAULT ''`,
  });
  await client.command({
    query: `ALTER TABLE bots ADD COLUMN IF NOT EXISTS avatar_url String DEFAULT ''`,
  });

  // Write display info to bots table
  await client.insert({
    table: "bots",
    values: bots.map((b) => ({
      id: b.id,
      name: b.name,
      website: b.website,
      description: b.description,
      product_id: b.product_id,
      brand_color: b.brand_color,
      avatar_url: b.avatar_url,
    })),
    format: "JSONEachRow",
  });

  // Write login mappings to bot_logins table
  const loginRows = bots.map((b) => ({
    bot_id: b.id,
    github_login: b.github_login,
  }));

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
 */
export async function insertPrBotEvents(
  client: ClickHouseClient,
  rows: PrBotEventRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "pr_bot_events",
    values: rows,
    format: "JSONEachRow",
  });
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

export type RepoLanguageRow = {
  repo_name: string;
  language: string;
  bytes: number;
};

/**
 * Insert repo language breakdown rows.
 */
export async function insertRepoLanguages(
  client: ClickHouseClient,
  rows: RepoLanguageRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "repo_languages",
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
};

/**
 * Insert pull request metadata rows.
 */
export async function insertPullRequests(
  client: ClickHouseClient,
  rows: PullRequestRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "pull_requests",
    values: rows,
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
    values: rows,
    format: "JSONEachRow",
  });
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
