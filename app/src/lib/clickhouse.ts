import { createClient } from "@clickhouse/client";

export function getClickHouseClient() {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "dev",
    database: process.env.CLICKHOUSE_DB ?? "code_review_trends",
  });
}

export type Product = {
  id: string;
  name: string;
  website: string;
  description: string;
  brand_color: string;
  avatar_url: string;
};

export type Bot = {
  id: string;
  name: string;
  product_id: string;
  github_login: string;
  website: string;
  description: string;
  brand_color: string;
  avatar_url: string;
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

export type WeeklyActivityByProduct = {
  week: string;
  product_id: string;
  product_name: string;
  brand_color: string;
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

export type ProductSummary = {
  id: string;
  name: string;
  website: string;
  description: string;
  brand_color: string;
  avatar_url: string;
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

export type BotSummary = {
  id: string;
  name: string;
  website: string;
  description: string;
  brand_color: string;
  avatar_url: string;
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

export type ProductComparison = {
  id: string;
  name: string;
  brand_color: string;
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

export type ProductBot = {
  id: string;
  name: string;
  github_login: string;
  brand_color: string;
  total_reviews: number;
  total_comments: number;
  first_week: string;
  last_week: string;
};

async function query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
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

// --- Product queries ---

export async function getProducts(): Promise<Product[]> {
  return query<Product>("SELECT * FROM products FINAL ORDER BY name");
}

export async function getProductById(id: string): Promise<Product | null> {
  const rows = await query<Product>(
    "SELECT * FROM products FINAL WHERE id = {id:String}",
    { id },
  );
  return rows[0] ?? null;
}

export async function getProductSummaries(): Promise<ProductSummary[]> {
  return query<ProductSummary>(`
    WITH
      activity_agg AS (
        SELECT
          b.product_id,
          sum(ra.review_count) AS total_reviews,
          sum(ra.review_comment_count) AS total_comments,
          max(ra.repo_count) AS max_repos,
          max(ra.org_count) AS max_orgs,
          min(ra.week) AS first_seen,
          sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
          sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 8 WEEK AND ra.week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
        FROM review_activity ra FINAL
        JOIN bots b ON ra.bot_id = b.id
        GROUP BY b.product_id
      ),
      reaction_agg AS (
        SELECT
          b.product_id,
          sum(rr.thumbs_up) AS thumbs_up,
          sum(rr.thumbs_down) AS thumbs_down,
          sum(rr.heart) AS heart
        FROM review_reactions rr FINAL
        JOIN bots b ON rr.bot_id = b.id
        GROUP BY b.product_id
      )
    SELECT
      p.id,
      p.name,
      p.website,
      p.description,
      p.brand_color,
      p.avatar_url,
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
    FROM products p FINAL
    LEFT JOIN activity_agg ra ON p.id = ra.product_id
    LEFT JOIN reaction_agg rr ON p.id = rr.product_id
    ORDER BY total_reviews DESC
  `);
}

export async function getWeeklyActivityByProduct(
  productId?: string,
): Promise<WeeklyActivityByProduct[]> {
  const where = productId ? "WHERE b.product_id = {productId:String}" : "";
  return query<WeeklyActivityByProduct>(
    `
      SELECT
        formatDateTime(ra.week, '%Y-%m-%d') AS week,
        b.product_id,
        p.name AS product_name,
        p.brand_color,
        sum(ra.review_count) AS review_count,
        sum(ra.review_comment_count) AS review_comment_count,
        max(ra.repo_count) AS repo_count,
        max(ra.org_count) AS org_count
      FROM review_activity ra FINAL
      JOIN bots b ON ra.bot_id = b.id
      JOIN products p ON b.product_id = p.id
      ${where}
      GROUP BY ra.week, b.product_id, p.name, p.brand_color
      ORDER BY ra.week ASC, review_count DESC
    `,
    productId ? { productId } : {},
  );
}

export async function getProductComparisons(): Promise<ProductComparison[]> {
  return query<ProductComparison>(`
    WITH
      activity_agg AS (
        SELECT
          b.product_id,
          sum(ra.review_count) AS total_reviews,
          sum(ra.review_comment_count) AS total_comments,
          max(ra.repo_count) AS max_repos,
          max(ra.org_count) AS max_orgs,
          count(DISTINCT ra.week) AS weeks_active,
          sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
          sumIf(ra.review_comment_count, ra.week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_comments,
          sumIf(ra.review_count, ra.week >= toDate(now()) - INTERVAL 8 WEEK AND ra.week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
        FROM review_activity ra FINAL
        JOIN bots b ON ra.bot_id = b.id
        GROUP BY b.product_id
      ),
      reaction_agg AS (
        SELECT
          b.product_id,
          sum(rr.thumbs_up) AS thumbs_up,
          sum(rr.thumbs_down) AS thumbs_down,
          sum(rr.heart) AS heart
        FROM review_reactions rr FINAL
        JOIN bots b ON rr.bot_id = b.id
        GROUP BY b.product_id
      )
    SELECT
      p.id,
      p.name,
      p.brand_color,
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
    FROM products p FINAL
    LEFT JOIN activity_agg ra ON p.id = ra.product_id
    LEFT JOIN reaction_agg rr ON p.id = rr.product_id
    ORDER BY total_reviews DESC
  `);
}

export async function getProductBots(productId: string): Promise<ProductBot[]> {
  return query<ProductBot>(
    `
      SELECT
        b.id,
        b.name,
        bl.github_login,
        b.brand_color,
        COALESCE(sum(ra.review_count), 0) AS total_reviews,
        COALESCE(sum(ra.review_comment_count), 0) AS total_comments,
        COALESCE(formatDateTime(min(ra.week), '%Y-%m-%d'), '') AS first_week,
        COALESCE(formatDateTime(max(ra.week), '%Y-%m-%d'), '') AS last_week
      FROM bots b FINAL
      LEFT JOIN bot_logins bl ON b.id = bl.bot_id
      LEFT JOIN review_activity ra ON b.id = ra.bot_id
      WHERE b.product_id = {productId:String}
      GROUP BY b.id, b.name, bl.github_login, b.brand_color
      ORDER BY total_reviews DESC
    `,
    { productId },
  );
}

// --- Bot queries (kept for detail views) ---

async function assembleBots(botRows: { id: string; name: string; product_id: string; website: string; description: string; brand_color: string; avatar_url: string }[]): Promise<Bot[]> {
  if (botRows.length === 0) return [];
  const botIds = botRows.map((b) => b.id);
  const loginRows = await query<{ bot_id: string; github_login: string }>(
    "SELECT bot_id, github_login FROM bot_logins FINAL WHERE bot_id IN ({botIds:Array(String)}) ORDER BY bot_id, github_login",
    { botIds },
  );
  const loginByBot = new Map<string, string>();
  for (const row of loginRows) {
    loginByBot.set(row.bot_id, row.github_login);
  }
  return botRows.map((b) => ({
    ...b,
    github_login: loginByBot.get(b.id) ?? "",
  }));
}

export async function getBots(): Promise<Bot[]> {
  const rows = await query<{ id: string; name: string; product_id: string; website: string; description: string; brand_color: string; avatar_url: string }>(
    "SELECT * FROM bots FINAL ORDER BY name",
  );
  return assembleBots(rows);
}

export async function getBotById(id: string): Promise<Bot | null> {
  const rows = await query<{ id: string; name: string; product_id: string; website: string; description: string; brand_color: string; avatar_url: string }>(
    "SELECT * FROM bots FINAL WHERE id = {id:String}",
    { id },
  );
  if (rows.length === 0) return null;
  const bots = await assembleBots(rows);
  return bots[0] ?? null;
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
      FROM review_activity AS ra FINAL
      JOIN bots AS b FINAL ON ra.bot_id = b.id
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
    FROM human_review_activity AS h FINAL
    LEFT JOIN (
      SELECT week, sum(review_count) AS bot_reviews, sum(review_comment_count) AS bot_comments
      FROM review_activity FINAL
      GROUP BY week
    ) b ON h.week = b.week
    ORDER BY h.week ASC
  `);
}

export async function getBotSummaries(): Promise<BotSummary[]> {
  return query<BotSummary>(`
    WITH
      activity_agg AS (
        SELECT
          bot_id,
          sum(review_count) AS total_reviews,
          sum(review_comment_count) AS total_comments,
          max(repo_count) AS max_repos,
          max(org_count) AS max_orgs,
          min(week) AS first_seen,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 8 WEEK AND week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
        FROM review_activity FINAL
        GROUP BY bot_id
      ),
      reaction_agg AS (
        SELECT
          bot_id,
          sum(thumbs_up) AS thumbs_up,
          sum(thumbs_down) AS thumbs_down,
          sum(heart) AS heart
        FROM review_reactions FINAL
        GROUP BY bot_id
      )
    SELECT
      b.id,
      b.name,
      b.website,
      b.description,
      b.brand_color,
      b.avatar_url,
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
    FROM bots AS b FINAL
    LEFT JOIN activity_agg ra ON b.id = ra.bot_id
    LEFT JOIN reaction_agg rr ON b.id = rr.bot_id
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
      FROM review_reactions FINAL
      WHERE bot_id = {botId:String}
      ORDER BY week ASC
    `,
    { botId },
  );
}

export async function getBotComparisons(): Promise<BotComparison[]> {
  return query<BotComparison>(`
    WITH
      activity_agg AS (
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
        FROM review_activity FINAL
        GROUP BY bot_id
      ),
      reaction_agg AS (
        SELECT
          bot_id,
          sum(thumbs_up) AS thumbs_up,
          sum(thumbs_down) AS thumbs_down,
          sum(heart) AS heart
        FROM review_reactions FINAL
        GROUP BY bot_id
      )
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
    FROM bots AS b FINAL
    LEFT JOIN activity_agg ra ON b.id = ra.bot_id
    LEFT JOIN reaction_agg rr ON b.id = rr.bot_id
    ORDER BY total_reviews DESC
  `);
}
