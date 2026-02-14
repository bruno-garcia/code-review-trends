/**
 * BigQuery queries against GH Archive.
 *
 * GH Archive stores all public GitHub events in BigQuery at:
 *   `githubarchive.day.YYYYMMDD` (daily tables)
 *   `githubarchive.month.YYYYMM` (monthly tables, cheaper for broad scans)
 *
 * We query PullRequestReviewEvent and PullRequestReviewCommentEvent
 * to get weekly counts of bot vs human reviews.
 *
 * Cost: ~$5/TB scanned. Monthly tables are more efficient for historical backfills.
 */

import { BigQuery } from "@google-cloud/bigquery";

export type BigQueryConfig = {
  projectId?: string;
  /** If set, limits query cost (in GB). Queries exceeding this are rejected. */
  maxBytesProcessed?: number;
};

export function createBigQueryClient(config?: BigQueryConfig): BigQuery {
  return new BigQuery({
    projectId: config?.projectId ?? process.env.GCP_PROJECT_ID,
  });
}

export type WeeklyBotReviewRow = {
  week: string; // YYYY-MM-DD
  actor_login: string;
  review_count: number;
  review_comment_count: number;
  repo_count: number;
};

/**
 * Query GH Archive for weekly bot review activity.
 *
 * Scans a date range and returns weekly aggregates for the specified bot logins.
 *
 * @param startDate - Start date (inclusive), format YYYY-MM-DD
 * @param endDate - End date (inclusive), format YYYY-MM-DD
 * @param botLogins - GitHub logins to filter for (e.g. ["coderabbitai[bot]"])
 */
export async function queryBotReviewActivity(
  bq: BigQuery,
  startDate: string,
  endDate: string,
  botLogins: string[],
  config?: BigQueryConfig,
): Promise<WeeklyBotReviewRow[]> {
  if (botLogins.length === 0) return [];

  // Use UNNEST for the bot login filter
  const query = `
    WITH events AS (
      SELECT
        DATE_TRUNC(DATE(created_at), WEEK(MONDAY)) AS week,
        actor.login AS actor_login,
        type,
        JSON_VALUE(payload, '$.pull_request.base.repo.full_name') AS repo_name
      FROM \`githubarchive.day.*\`
      WHERE
        _TABLE_SUFFIX BETWEEN @start_suffix AND @end_suffix
        AND type IN ('PullRequestReviewEvent', 'PullRequestReviewCommentEvent')
        AND actor.login IN UNNEST(@bot_logins)
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', week) AS week,
      actor_login,
      COUNTIF(type = 'PullRequestReviewEvent') AS review_count,
      COUNTIF(type = 'PullRequestReviewCommentEvent') AS review_comment_count,
      COUNT(DISTINCT repo_name) AS repo_count
    FROM events
    GROUP BY week, actor_login
    ORDER BY week ASC, review_count DESC
  `;

  const [rows] = await bq.query({
    query,
    params: {
      start_suffix: startDate.replace(/-/g, ""),
      end_suffix: endDate.replace(/-/g, ""),
      bot_logins: botLogins,
    },
    maximumBytesBilled:
      config?.maxBytesProcessed?.toString() ??
      process.env.BQ_MAX_BYTES_BILLED ??
      "10000000000", // 10GB default
  });

  return rows as WeeklyBotReviewRow[];
}

export type WeeklyHumanReviewRow = {
  week: string;
  review_count: number;
  review_comment_count: number;
  repo_count: number;
};

/**
 * Query GH Archive for total human review activity (excluding known bots).
 * Used to compute the AI share percentage.
 */
export async function queryHumanReviewActivity(
  bq: BigQuery,
  startDate: string,
  endDate: string,
  botLogins: string[],
  config?: BigQueryConfig,
): Promise<WeeklyHumanReviewRow[]> {
  const query = `
    WITH events AS (
      SELECT
        DATE_TRUNC(DATE(created_at), WEEK(MONDAY)) AS week,
        type,
        JSON_VALUE(payload, '$.pull_request.base.repo.full_name') AS repo_name
      FROM \`githubarchive.day.*\`
      WHERE
        _TABLE_SUFFIX BETWEEN @start_suffix AND @end_suffix
        AND type IN ('PullRequestReviewEvent', 'PullRequestReviewCommentEvent')
        AND actor.login NOT IN UNNEST(@bot_logins)
        AND actor.login NOT LIKE '%[bot]'
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', week) AS week,
      COUNTIF(type = 'PullRequestReviewEvent') AS review_count,
      COUNTIF(type = 'PullRequestReviewCommentEvent') AS review_comment_count,
      COUNT(DISTINCT repo_name) AS repo_count
    FROM events
    GROUP BY week
    ORDER BY week ASC
  `;

  const [rows] = await bq.query({
    query,
    params: {
      start_suffix: startDate.replace(/-/g, ""),
      end_suffix: endDate.replace(/-/g, ""),
      bot_logins: botLogins,
    },
    maximumBytesBilled:
      config?.maxBytesProcessed?.toString() ??
      process.env.BQ_MAX_BYTES_BILLED ??
      "10000000000",
  });

  return rows as WeeklyHumanReviewRow[];
}

/**
 * Discover bot accounts that produce PullRequestReviewEvent or
 * PullRequestReviewCommentEvent in a date range.
 *
 * Useful for finding new bots to add to the registry.
 */
export async function discoverBotReviewers(
  bq: BigQuery,
  startDate: string,
  endDate: string,
  config?: BigQueryConfig,
): Promise<{ login: string; event_count: number; repo_count: number }[]> {
  const query = `
    SELECT
      actor.login AS login,
      COUNT(*) AS event_count,
      COUNT(DISTINCT repo.name) AS repo_count
    FROM \`githubarchive.day.*\`
    WHERE
      _TABLE_SUFFIX BETWEEN @start_suffix AND @end_suffix
      AND type IN ('PullRequestReviewEvent', 'PullRequestReviewCommentEvent')
      AND actor.login LIKE '%[bot]'
    GROUP BY actor.login
    HAVING event_count > 100
    ORDER BY event_count DESC
    LIMIT 100
  `;

  const [rows] = await bq.query({
    query,
    params: {
      start_suffix: startDate.replace(/-/g, ""),
      end_suffix: endDate.replace(/-/g, ""),
    },
    maximumBytesBilled:
      config?.maxBytesProcessed?.toString() ??
      process.env.BQ_MAX_BYTES_BILLED ??
      "5000000000",
  });

  return rows as { login: string; event_count: number; repo_count: number }[];
}
