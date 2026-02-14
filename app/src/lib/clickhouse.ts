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
  org_count: number;
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
  total_comments: number;
  total_repos: number;
  total_orgs: number;
  avg_comments_per_review: number;
  latest_week_reviews: number;
  growth_pct: number;
  thumbs_up: number;
  thumbs_down: number;
  heart: number;
  approval_rate: number;
  comments_per_repo: number;
  first_seen: string;
};

export type WeeklyReactions = {
  week: string;
  thumbs_up: number;
  thumbs_down: number;
  heart: number;
  laugh: number;
  confused: number;
};

export type BotComparison = {
  id: string;
  name: string;
  total_reviews: number;
  total_comments: number;
  total_repos: number;
  total_orgs: number;
  avg_comments_per_review: number;
  comments_per_repo: number;
  reviews_per_org: number;
  thumbs_up: number;
  thumbs_down: number;
  heart: number;
  approval_rate: number;
  growth_pct: number;
  latest_week_reviews: number;
  latest_week_comments: number;
  weeks_active: number;
};

async function query<T>(sql: string, params?: Record<string, string | number>): Promise<T[]> {
  const client = getClickHouseClient();
  try {
    const result = await client.query({
      query: sql,
      query_params: params ?? {},
      format: "JSONEachRow",
    });
    return (await result.json()) as T[];
  } finally {
    await client.close();
  }
}

export async function getBots(): Promise<Bot[]> {
  return query<Bot>("SELECT * FROM bots ORDER BY name");
}

export async function getBotById(id: string): Promise<Bot | null> {
  const rows = await query<Bot>(
    "SELECT * FROM bots WHERE id = {id:String}",
    { id },
  );
  return rows[0] ?? null;
}

export async function getWeeklyActivity(
  botId?: string,
): Promise<WeeklyActivity[]> {
  const where = botId ? "WHERE ra.bot_id = {botId:String}" : "";
  return query<WeeklyActivity>(
    `
      SELECT
        formatDateTime(ra.week, '%Y-%m-%d') AS week,
        ra.bot_id,
        b.name AS bot_name,
        ra.review_count,
        ra.review_comment_count,
        ra.repo_count,
        ra.org_count
      FROM review_activity ra
      JOIN bots b ON ra.bot_id = b.id
      ${where}
      ORDER BY ra.week ASC, ra.review_count DESC
    `,
    botId ? { botId } : {},
  );
}

export async function getWeeklyTotals(): Promise<WeeklyTotals[]> {
  return query<WeeklyTotals>(`
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
  `);
}

export async function getBotSummaries(): Promise<BotSummary[]> {
  return query<BotSummary>(`
    SELECT
      b.id,
      b.name,
      b.website,
      b.description,
      COALESCE(ra.total_reviews, 0) AS total_reviews,
      COALESCE(ra.total_comments, 0) AS total_comments,
      COALESCE(ra.max_repos, 0) AS total_repos,
      COALESCE(ra.max_orgs, 0) AS total_orgs,
      round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
      COALESCE(ra.latest_week_reviews, 0) AS latest_week_reviews,
      round(
        if(ra.prev_period_reviews > 0,
          (ra.latest_week_reviews - ra.prev_period_reviews) * 100.0 / ra.prev_period_reviews,
          0),
        1
      ) AS growth_pct,
      COALESCE(rr.thumbs_up, 0) AS thumbs_up,
      COALESCE(rr.thumbs_down, 0) AS thumbs_down,
      COALESCE(rr.heart, 0) AS heart,
      round(if((COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)) > 0,
        COALESCE(rr.thumbs_up, 0) * 100.0 / (COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)),
        0), 1) AS approval_rate,
      round(if(ra.max_repos > 0, ra.total_comments / ra.max_repos, 0), 0) AS comments_per_repo,
      COALESCE(formatDateTime(ra.first_seen, '%Y-%m-%d'), '') AS first_seen
    FROM bots b
    LEFT JOIN (
      SELECT
        bot_id,
        sum(review_count) AS total_reviews,
        sum(review_comment_count) AS total_comments,
        max(repo_count) AS max_repos,
        max(org_count) AS max_orgs,
        min(week) AS first_seen,
        sumIf(review_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
        sumIf(review_count, week >= toDate(now()) - INTERVAL 8 WEEK AND week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
      FROM review_activity
      GROUP BY bot_id
    ) ra ON b.id = ra.bot_id
    LEFT JOIN (
      SELECT
        bot_id,
        sum(thumbs_up) AS thumbs_up,
        sum(thumbs_down) AS thumbs_down,
        sum(heart) AS heart
      FROM review_reactions
      GROUP BY bot_id
    ) rr ON b.id = rr.bot_id
    ORDER BY total_reviews DESC
  `);
}

export async function getBotReactions(
  botId: string,
): Promise<WeeklyReactions[]> {
  return query<WeeklyReactions>(
    `
      SELECT
        formatDateTime(week, '%Y-%m-%d') AS week,
        thumbs_up,
        thumbs_down,
        heart,
        laugh,
        confused
      FROM review_reactions
      WHERE bot_id = {botId:String}
      ORDER BY week ASC
    `,
    { botId },
  );
}

export async function getBotComparisons(): Promise<BotComparison[]> {
  return query<BotComparison>(`
    SELECT
      b.id,
      b.name,
      COALESCE(ra.total_reviews, 0) AS total_reviews,
      COALESCE(ra.total_comments, 0) AS total_comments,
      COALESCE(ra.max_repos, 0) AS total_repos,
      COALESCE(ra.max_orgs, 0) AS total_orgs,
      round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
      round(if(ra.max_repos > 0, ra.total_comments / ra.max_repos, 0), 0) AS comments_per_repo,
      round(if(ra.max_orgs > 0, ra.total_reviews / ra.max_orgs, 0), 0) AS reviews_per_org,
      COALESCE(rr.thumbs_up, 0) AS thumbs_up,
      COALESCE(rr.thumbs_down, 0) AS thumbs_down,
      COALESCE(rr.heart, 0) AS heart,
      round(if((COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)) > 0,
        COALESCE(rr.thumbs_up, 0) * 100.0 / (COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)),
        0), 1) AS approval_rate,
      round(
        if(ra.prev_period_reviews > 0,
          (ra.latest_week_reviews - ra.prev_period_reviews) * 100.0 / ra.prev_period_reviews,
          0),
        1
      ) AS growth_pct,
      COALESCE(ra.latest_week_reviews, 0) AS latest_week_reviews,
      COALESCE(ra.latest_week_comments, 0) AS latest_week_comments,
      COALESCE(ra.weeks_active, 0) AS weeks_active
    FROM bots b
    LEFT JOIN (
      SELECT
        bot_id,
        sum(review_count) AS total_reviews,
        sum(review_comment_count) AS total_comments,
        max(repo_count) AS max_repos,
        max(org_count) AS max_orgs,
        count() AS weeks_active,
        sumIf(review_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
        sumIf(review_comment_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_comments,
        sumIf(review_count, week >= toDate(now()) - INTERVAL 8 WEEK AND week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
      FROM review_activity
      GROUP BY bot_id
    ) ra ON b.id = ra.bot_id
    LEFT JOIN (
      SELECT
        bot_id,
        sum(thumbs_up) AS thumbs_up,
        sum(thumbs_down) AS thumbs_down,
        sum(heart) AS heart
      FROM review_reactions
      GROUP BY bot_id
    ) rr ON b.id = rr.bot_id
    ORDER BY total_reviews DESC
  `);
}
