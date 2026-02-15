/**
 * BigQuery queries against GH Archive.
 *
 * GH Archive stores all public GitHub events in BigQuery at:
 *   `githubarchive.day.YYYYMMDD` (daily tables)
 *   `githubarchive.month.YYYYMM` (monthly tables)
 *
 * The `day` dataset contains a `yesterday` view that breaks wildcard queries
 * (`githubarchive.day.*`). We work around this by using `githubarchive.day.2*`
 * which matches all date tables (they start with `20...`) but excludes the view.
 * The `_TABLE_SUFFIX` then contains everything after the `2` prefix,
 * e.g. table `20250106` has suffix `0250106`.
 *
 * IMPORTANT: BigQuery only prunes wildcard tables when _TABLE_SUFFIX conditions
 * use literal values — parameterized values (@param) disable pruning and scan
 * ALL matching tables (~100GB+). We therefore interpolate suffix values directly
 * into the SQL string. These are date-derived strings validated by this module,
 * not user input. Bot logins remain parameterized.
 *
 * Cost: ~150MB per day scanned. A 7-day query costs ~1GB.
 */

import { BigQuery } from "@google-cloud/bigquery";

export type BigQueryConfig = {
  projectId?: string;
  /** If set, limits query cost (in bytes). Queries exceeding this are rejected. */
  maxBytesProcessed?: number;
};

export function createBigQueryClient(config?: BigQueryConfig): BigQuery {
  return new BigQuery({
    projectId: config?.projectId ?? process.env.GCP_PROJECT_ID,
  });
}

/**
 * Convert a YYYY-MM-DD date to the _TABLE_SUFFIX format used with
 * `githubarchive.day.2*`. Strips the leading "2" from YYYYMMDD.
 * E.g. "2025-01-06" → "0250106"
 *
 * Validates format to prevent SQL injection (only digits allowed).
 */
function toSuffix(date: string): string {
  const compact = date.replace(/-/g, "");
  if (!/^\d{8}$/.test(compact)) {
    throw new Error(`Invalid date format: "${date}". Expected YYYY-MM-DD.`);
  }
  return compact.slice(1); // "20250106" → "0250106"
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

  const startSuffix = toSuffix(startDate);
  const endSuffix = toSuffix(endDate);

  // Suffix literals are interpolated for wildcard table pruning.
  // Bot logins remain parameterized to prevent injection.
  const query = `
    WITH events AS (
      SELECT
        DATE_TRUNC(DATE(created_at), WEEK(MONDAY)) AS week,
        actor.login AS actor_login,
        type,
        JSON_VALUE(payload, '$.pull_request.base.repo.full_name') AS repo_name
      FROM \`githubarchive.day.2*\`
      WHERE
        _TABLE_SUFFIX BETWEEN '${startSuffix}' AND '${endSuffix}'
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
      bot_logins: botLogins,
    },
    maximumBytesBilled:
      config?.maxBytesProcessed?.toString() ??
      process.env.BQ_MAX_BYTES_BILLED ??
      "500000000000", // 500GB — BigQuery wildcard estimates are much higher than actual scan
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
  const startSuffix = toSuffix(startDate);
  const endSuffix = toSuffix(endDate);

  const query = `
    WITH events AS (
      SELECT
        DATE_TRUNC(DATE(created_at), WEEK(MONDAY)) AS week,
        type,
        JSON_VALUE(payload, '$.pull_request.base.repo.full_name') AS repo_name
      FROM \`githubarchive.day.2*\`
      WHERE
        _TABLE_SUFFIX BETWEEN '${startSuffix}' AND '${endSuffix}'
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
      bot_logins: botLogins,
    },
    maximumBytesBilled:
      config?.maxBytesProcessed?.toString() ??
      process.env.BQ_MAX_BYTES_BILLED ??
      "500000000000",
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
  const startSuffix = toSuffix(startDate);
  const endSuffix = toSuffix(endDate);

  const query = `
    SELECT
      actor.login AS login,
      COUNT(*) AS event_count,
      COUNT(DISTINCT repo.name) AS repo_count
    FROM \`githubarchive.day.2*\`
    WHERE
      _TABLE_SUFFIX BETWEEN '${startSuffix}' AND '${endSuffix}'
      AND type IN ('PullRequestReviewEvent', 'PullRequestReviewCommentEvent')
      AND actor.login LIKE '%[bot]'
    GROUP BY actor.login
    HAVING event_count > 100
    ORDER BY event_count DESC
    LIMIT 100
  `;

  const [rows] = await bq.query({
    query,
    maximumBytesBilled:
      config?.maxBytesProcessed?.toString() ??
      process.env.BQ_MAX_BYTES_BILLED ??
      "500000000000",
  });

  return rows as { login: string; event_count: number; repo_count: number }[];
}
