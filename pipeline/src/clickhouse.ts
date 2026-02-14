/**
 * ClickHouse client for the pipeline.
 *
 * Handles writing aggregated data into ClickHouse tables.
 * Tables use ReplacingMergeTree so inserts are idempotent —
 * re-running a pipeline job for the same week just overwrites old rows.
 */

import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { type BotDefinition } from "./bots.js";

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
 * Sync bot definitions into the `bots` table.
 * Uses ReplacingMergeTree so re-inserts update existing rows.
 */
export async function syncBots(
  client: ClickHouseClient,
  bots: BotDefinition[],
): Promise<void> {
  if (bots.length === 0) return;

  await client.insert({
    table: "bots",
    values: bots.map((b) => ({
      id: b.id,
      name: b.name,
      github_login: b.github_login,
      website: b.website,
      description: b.description,
    })),
    format: "JSONEachRow",
  });
}

export type ReviewActivityRow = {
  week: string; // YYYY-MM-DD (Monday of the week)
  bot_id: string;
  review_count: number;
  review_comment_count: number;
  repo_count: number;
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

export type ReactionRow = {
  week: string;
  bot_id: string;
  thumbs_up: number;
  thumbs_down: number;
  laugh: number;
  confused: number;
  heart: number;
};

/**
 * Insert weekly reaction data for bot reviews.
 */
export async function insertReactions(
  client: ClickHouseClient,
  rows: ReactionRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "review_reactions",
    values: rows,
    format: "JSONEachRow",
  });
}

export type RepoBotUsageRow = {
  repo_full_name: string;
  bot_id: string;
  first_seen: string;
  last_seen: string;
  total_reviews: number;
  stars: number;
};

/**
 * Insert per-repo bot usage records.
 */
export async function insertRepoBotUsage(
  client: ClickHouseClient,
  rows: RepoBotUsageRow[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.insert({
    table: "repo_bot_usage",
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
