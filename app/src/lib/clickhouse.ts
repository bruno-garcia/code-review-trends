import { createClient } from "@clickhouse/client";

export function getClickHouseClient() {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "dev",
    database: process.env.CLICKHOUSE_DB ?? "code_review_trends",
  });
}

export type Bot = {
  id: string;
  name: string;
  github_login: string;
  website: string;
  description: string;
};

export type WeeklyActivity = {
  week: string;
  bot_id: string;
  bot_name: string;
  review_count: number;
  review_comment_count: number;
  repo_count: number;
};

export type WeeklyTotals = {
  week: string;
  bot_reviews: number;
  human_reviews: number;
  bot_share_pct: number;
  bot_comments: number;
  human_comments: number;
  bot_comment_share_pct: number;
};

export type BotSummary = {
  id: string;
  name: string;
  website: string;
  description: string;
  total_reviews: number;
  total_repos: number;
  latest_week_reviews: number;
  growth_pct: number;
};

export type WeeklyReactions = {
  week: string;
  thumbs_up: number;
  thumbs_down: number;
  heart: number;
};

export async function getBots(): Promise<Bot[]> {
  const client = getClickHouseClient();
  try {
    const result = await client.query({
      query: "SELECT * FROM bots ORDER BY name",
      format: "JSONEachRow",
    });
    return (await result.json()) as Bot[];
  } finally {
    await client.close();
  }
}

export async function getBotById(id: string): Promise<Bot | null> {
  const client = getClickHouseClient();
  try {
    const result = await client.query({
      query: "SELECT * FROM bots WHERE id = {id:String}",
      query_params: { id },
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as Bot[];
    return rows[0] ?? null;
  } finally {
    await client.close();
  }
}

export async function getWeeklyActivity(
  botId?: string,
): Promise<WeeklyActivity[]> {
  const client = getClickHouseClient();
  try {
    const where = botId ? "WHERE ra.bot_id = {botId:String}" : "";
    const result = await client.query({
      query: `
        SELECT
          formatDateTime(ra.week, '%Y-%m-%d') AS week,
          ra.bot_id,
          b.name AS bot_name,
          ra.review_count,
          ra.review_comment_count,
          ra.repo_count
        FROM review_activity ra
        JOIN bots b ON ra.bot_id = b.id
        ${where}
        ORDER BY ra.week ASC, ra.review_count DESC
      `,
      query_params: botId ? { botId } : {},
      format: "JSONEachRow",
    });
    return (await result.json()) as WeeklyActivity[];
  } finally {
    await client.close();
  }
}

export async function getWeeklyTotals(): Promise<WeeklyTotals[]> {
  const client = getClickHouseClient();
  try {
    const result = await client.query({
      query: `
        SELECT
          formatDateTime(h.week, '%Y-%m-%d') AS week,
          COALESCE(b.bot_reviews, 0) AS bot_reviews,
          h.review_count AS human_reviews,
          round(COALESCE(b.bot_reviews, 0) * 100.0 / (h.review_count + COALESCE(b.bot_reviews, 0)), 2) AS bot_share_pct,
          COALESCE(b.bot_comments, 0) AS bot_comments,
          h.review_comment_count AS human_comments,
          round(COALESCE(b.bot_comments, 0) * 100.0 / (h.review_comment_count + COALESCE(b.bot_comments, 0)), 2) AS bot_comment_share_pct
        FROM human_review_activity h
        LEFT JOIN (
          SELECT week, sum(review_count) AS bot_reviews, sum(review_comment_count) AS bot_comments
          FROM review_activity
          GROUP BY week
        ) b ON h.week = b.week
        ORDER BY h.week ASC
      `,
      format: "JSONEachRow",
    });
    return (await result.json()) as WeeklyTotals[];
  } finally {
    await client.close();
  }
}

export async function getBotSummaries(): Promise<BotSummary[]> {
  const client = getClickHouseClient();
  try {
    const result = await client.query({
      query: `
        SELECT
          b.id,
          b.name,
          b.website,
          b.description,
          sum(ra.review_count) AS total_reviews,
          max(ra.repo_count) AS total_repos,
          sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
          round(
            (sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 8 WEEK AND ra.week < toDate(now()) - INTERVAL 4 WEEK) > 0)
            ? ((sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 4 WEEK)
               - sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 8 WEEK AND ra.week < toDate(now()) - INTERVAL 4 WEEK))
              * 100.0
              / sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 8 WEEK AND ra.week < toDate(now()) - INTERVAL 4 WEEK))
            : 0
          , 1) AS growth_pct
        FROM bots b
        LEFT JOIN review_activity ra ON b.id = ra.bot_id
        GROUP BY b.id, b.name, b.website, b.description
        ORDER BY total_reviews DESC
      `,
      format: "JSONEachRow",
    });
    return (await result.json()) as BotSummary[];
  } finally {
    await client.close();
  }
}

export async function getBotReactions(
  botId: string,
): Promise<WeeklyReactions[]> {
  const client = getClickHouseClient();
  try {
    const result = await client.query({
      query: `
        SELECT
          formatDateTime(week, '%Y-%m-%d') AS week,
          thumbs_up,
          thumbs_down,
          heart
        FROM review_reactions
        WHERE bot_id = {botId:String}
        ORDER BY week ASC
      `,
      query_params: { botId },
      format: "JSONEachRow",
    });
    return (await result.json()) as WeeklyReactions[];
  } finally {
    await client.close();
  }
}
