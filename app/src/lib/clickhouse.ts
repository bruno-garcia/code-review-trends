import { createClient } from "@clickhouse/client";
import * as Sentry from "@sentry/nextjs";

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
  pr_comment_count: number;
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
  pr_comment_count: number;
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
  bot_pr_comments: number;
  human_pr_comments: number;
  bot_pr_comment_share_pct: number;
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
  total_pr_comments: number;
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
  total_pr_comments: number;
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
  total_pr_comments: number;
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
  latest_week_pr_comments: number;
  weeks_active: number;
};

export type BotComparison = {
  id: string;
  name: string;
  total_reviews: number;
  total_comments: number;
  total_pr_comments: number;
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
  latest_week_pr_comments: number;
  weeks_active: number;
};

export type ProductBot = {
  id: string;
  name: string;
  github_login: string;
  brand_color: string;
  total_reviews: number;
  total_comments: number;
  total_pr_comments: number;
  first_week: string;
  last_week: string;
};

export type WeeklyTotalVolume = {
  week: string;
  total_reviews: number;
  total_comments: number;
  total_pr_comments: number;
};

async function query<T>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  // Sanitize the SQL for the span description — strip excess whitespace
  const sanitizedSql = sql.replace(/\s+/g, " ").trim();

  // Extract hostname from URL for span attributes — avoid leaking credentials
  const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
  let serverAddress = "localhost";
  let serverPort = 8123;
  try {
    const parsed = new URL(clickhouseUrl);
    serverAddress = parsed.hostname;
    serverPort = parseInt(parsed.port, 10) || 8123;
  } catch {
    // fall back to defaults
  }

  return Sentry.startSpan(
    {
      op: "db.query",
      name: sanitizedSql,
      attributes: {
        "db.system": "clickhouse",
        "db.name": process.env.CLICKHOUSE_DB ?? "code_review_trends",
        "db.statement": sanitizedSql,
        "server.address": serverAddress,
        "server.port": serverPort,
      },
    },
    async () => {
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
    },
  );
}

export async function getWeeklyTotalVolume(): Promise<WeeklyTotalVolume[]> {
  return query<WeeklyTotalVolume>(`
    SELECT
      toString(ra.week) AS week,
      sum(ra.review_count) AS total_reviews,
      sum(ra.review_comment_count) AS total_comments,
      sum(ra.pr_comment_count) AS total_pr_comments
    FROM review_activity ra FINAL
    GROUP BY ra.week
    ORDER BY ra.week
  `);
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
      weekly_product AS (
        SELECT
          b.product_id,
          ra.week,
          sum(ra.review_count) AS review_count,
          sum(ra.review_comment_count) AS review_comment_count,
          sum(ra.pr_comment_count) AS pr_comment_count,
          sum(ra.repo_count) AS repo_count,
          sum(ra.org_count) AS org_count
        FROM review_activity ra FINAL
        JOIN bots b FINAL ON ra.bot_id = b.id
        GROUP BY b.product_id, ra.week
      ),
      activity_agg AS (
        SELECT
          product_id,
          sum(review_count) AS total_reviews,
          sum(review_comment_count) AS total_comments,
          sum(pr_comment_count) AS total_pr_comments,
          max(repo_count) AS max_repos,
          max(org_count) AS max_orgs,
          min(week) AS first_seen,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 8 WEEK AND week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
        FROM weekly_product
        GROUP BY product_id
      ),
      reaction_agg AS (
        SELECT
          b.product_id,
          sum(c.thumbs_up) AS thumbs_up,
          sum(c.thumbs_down) AS thumbs_down,
          sum(c.heart) AS heart
        FROM pr_comments c FINAL
        JOIN bots b FINAL ON c.bot_id = b.id
        WHERE c.comment_id > 0
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
      COALESCE(ra.total_pr_comments, 0) AS total_pr_comments,
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
        sum(ra.pr_comment_count) AS pr_comment_count,
        sum(ra.repo_count) AS repo_count,
        sum(ra.org_count) AS org_count
      FROM review_activity ra FINAL
      JOIN bots b FINAL ON ra.bot_id = b.id
      JOIN products p FINAL ON b.product_id = p.id
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
      weekly_product AS (
        SELECT
          b.product_id,
          ra.week,
          sum(ra.review_count) AS review_count,
          sum(ra.review_comment_count) AS review_comment_count,
          sum(ra.pr_comment_count) AS pr_comment_count,
          sum(ra.repo_count) AS repo_count,
          sum(ra.org_count) AS org_count
        FROM review_activity ra FINAL
        JOIN bots b FINAL ON ra.bot_id = b.id
        GROUP BY b.product_id, ra.week
      ),
      activity_agg AS (
        SELECT
          product_id,
          sum(review_count) AS total_reviews,
          sum(review_comment_count) AS total_comments,
          sum(pr_comment_count) AS total_pr_comments,
          max(repo_count) AS max_repos,
          max(org_count) AS max_orgs,
          count(DISTINCT week) AS weeks_active,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
          sumIf(review_comment_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_comments,
          sumIf(pr_comment_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_pr_comments,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 8 WEEK AND week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
        FROM weekly_product
        GROUP BY product_id
      ),
      reaction_agg AS (
        SELECT
          b.product_id,
          sum(c.thumbs_up) AS thumbs_up,
          sum(c.thumbs_down) AS thumbs_down,
          sum(c.heart) AS heart
        FROM pr_comments c FINAL
        JOIN bots b FINAL ON c.bot_id = b.id
        WHERE c.comment_id > 0
        GROUP BY b.product_id
      )
    SELECT
      p.id,
      p.name,
      p.brand_color,
      COALESCE(ra.total_reviews, 0) AS total_reviews,
      COALESCE(ra.total_comments, 0) AS total_comments,
      COALESCE(ra.total_pr_comments, 0) AS total_pr_comments,
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
      COALESCE(ra.latest_week_pr_comments, 0) AS latest_week_pr_comments,
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
        COALESCE(sum(ra.pr_comment_count), 0) AS total_pr_comments,
        COALESCE(formatDateTime(min(ra.week), '%Y-%m-%d'), '') AS first_week,
        COALESCE(formatDateTime(max(ra.week), '%Y-%m-%d'), '') AS last_week
      FROM bots b FINAL
      LEFT JOIN bot_logins bl FINAL ON b.id = bl.bot_id
      LEFT JOIN review_activity ra FINAL ON b.id = ra.bot_id
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
        ra.pr_comment_count,
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
      round(if(h.review_count + COALESCE(b.bot_reviews, 0) > 0, COALESCE(b.bot_reviews, 0) * 100.0 / (h.review_count + COALESCE(b.bot_reviews, 0)), 0), 2) AS bot_share_pct,
      COALESCE(b.bot_comments, 0) AS bot_comments,
      h.review_comment_count AS human_comments,
      round(if(h.review_comment_count + COALESCE(b.bot_comments, 0) > 0, COALESCE(b.bot_comments, 0) * 100.0 / (h.review_comment_count + COALESCE(b.bot_comments, 0)), 0), 2) AS bot_comment_share_pct,
      COALESCE(b.bot_pr_comments, 0) AS bot_pr_comments,
      h.pr_comment_count AS human_pr_comments,
      round(if(h.pr_comment_count + COALESCE(b.bot_pr_comments, 0) > 0, COALESCE(b.bot_pr_comments, 0) * 100.0 / (h.pr_comment_count + COALESCE(b.bot_pr_comments, 0)), 0), 2) AS bot_pr_comment_share_pct
    FROM human_review_activity AS h FINAL
    LEFT JOIN (
      SELECT week, sum(review_count) AS bot_reviews, sum(review_comment_count) AS bot_comments, sum(pr_comment_count) AS bot_pr_comments
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
          sum(pr_comment_count) AS total_pr_comments,
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
          c.bot_id,
          sum(c.thumbs_up) AS thumbs_up,
          sum(c.thumbs_down) AS thumbs_down,
          sum(c.heart) AS heart
        FROM pr_comments c FINAL
        WHERE c.comment_id > 0
        GROUP BY c.bot_id
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
      COALESCE(ra.total_pr_comments, 0) AS total_pr_comments,
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
        formatDateTime(toStartOfWeek(c.created_at, 1), '%Y-%m-%d') AS week,
        sum(c.thumbs_up) AS thumbs_up,
        sum(c.thumbs_down) AS thumbs_down,
        sum(c.heart) AS heart,
        sum(c.laugh) AS laugh,
        sum(c.confused) AS confused
      FROM pr_comments c FINAL
      JOIN bots b FINAL ON c.bot_id = b.id
      WHERE b.id = {botId:String} AND c.comment_id > 0
      GROUP BY week
      ORDER BY week ASC
    `,
    { botId },
  );
}

export async function getProductReactions(
  productId: string,
): Promise<WeeklyReactions[]> {
  return query<WeeklyReactions>(
    `
      SELECT
        formatDateTime(toStartOfWeek(c.created_at, 1), '%Y-%m-%d') AS week,
        sum(c.thumbs_up) AS thumbs_up,
        sum(c.thumbs_down) AS thumbs_down,
        sum(c.heart) AS heart,
        sum(c.laugh) AS laugh,
        sum(c.confused) AS confused
      FROM pr_comments c FINAL
      JOIN bots b FINAL ON c.bot_id = b.id
      WHERE b.product_id = {productId:String} AND c.comment_id > 0
      GROUP BY week
      ORDER BY week ASC
    `,
    { productId },
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
          sum(pr_comment_count) AS total_pr_comments,
          max(repo_count) AS max_repos,
          max(org_count) AS max_orgs,
          count() AS weeks_active,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_reviews,
          sumIf(review_comment_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_comments,
          sumIf(pr_comment_count, week >= toDate(now()) - INTERVAL 4 WEEK) AS latest_week_pr_comments,
          sumIf(review_count, week >= toDate(now()) - INTERVAL 8 WEEK AND week < toDate(now()) - INTERVAL 4 WEEK) AS prev_period_reviews
        FROM review_activity FINAL
        GROUP BY bot_id
      ),
      reaction_agg AS (
        SELECT
          c.bot_id,
          sum(c.thumbs_up) AS thumbs_up,
          sum(c.thumbs_down) AS thumbs_down,
          sum(c.heart) AS heart
        FROM pr_comments c FINAL
        WHERE c.comment_id > 0
        GROUP BY c.bot_id
      )
    SELECT
      b.id,
      b.name,
      COALESCE(ra.total_reviews, 0) AS total_reviews,
      COALESCE(ra.total_comments, 0) AS total_comments,
      COALESCE(ra.total_pr_comments, 0) AS total_pr_comments,
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
      COALESCE(ra.latest_week_pr_comments, 0) AS latest_week_pr_comments,
      COALESCE(ra.weeks_active, 0) AS weeks_active
    FROM bots AS b FINAL
    LEFT JOIN activity_agg ra ON b.id = ra.bot_id
    LEFT JOIN reaction_agg rr ON b.id = rr.bot_id
    ORDER BY total_reviews DESC
  `);
}

// --- New entity-level queries ---

export type OrgByStars = {
  owner: string;
  total_stars: number;
  repo_count: number;
};

export async function getTopOrgsByStars(limit?: number): Promise<OrgByStars[]> {
  return query<OrgByStars>(
    `SELECT owner, sum(stars) AS total_stars, count() AS repo_count
     FROM repos
     WHERE fetch_status = 'ok'
     GROUP BY owner
     ORDER BY total_stars DESC
     LIMIT {limit:UInt32}`,
    { limit: limit ?? 50 },
  );
}

export type BotReactions = {
  bot_id: string;
  bot_name: string;
  product_id: string;
  total_thumbs_up: number;
  total_thumbs_down: number;
  total_heart: number;
  total_comments: number;
  approval_rate: number;
};

export async function getBotReactionLeaderboard(): Promise<BotReactions[]> {
  return query<BotReactions>(`
    SELECT
      c.bot_id,
      b.name AS bot_name,
      b.product_id,
      sum(c.thumbs_up) AS total_thumbs_up,
      sum(c.thumbs_down) AS total_thumbs_down,
      sum(c.heart) AS total_heart,
      count() AS total_comments,
      round(if((sum(c.thumbs_up) + sum(c.thumbs_down)) > 0,
        sum(c.thumbs_up) * 100.0 / (sum(c.thumbs_up) + sum(c.thumbs_down)),
        0), 1) AS approval_rate
    FROM pr_comments c FINAL
    JOIN bots b FINAL ON c.bot_id = b.id
    WHERE c.comment_id > 0
    GROUP BY c.bot_id, b.name, b.product_id
    ORDER BY total_thumbs_up DESC
  `);
}

export type BotCommentsPerPR = {
  bot_id: string;
  bot_name: string;
  product_id: string;
  avg_comments_per_pr: number;
  total_prs: number;
  total_comments: number;
};

export async function getAvgCommentsPerPR(botId?: string): Promise<BotCommentsPerPR[]> {
  const where = botId ? "AND c.bot_id = {botId:String}" : "";
  return query<BotCommentsPerPR>(
    `SELECT
      c.bot_id,
      b.name AS bot_name,
      b.product_id,
      round(if(countDistinct(c.repo_name, c.pr_number) > 0,
        count() / countDistinct(c.repo_name, c.pr_number), 0), 2) AS avg_comments_per_pr,
      countDistinct(c.repo_name, c.pr_number) AS total_prs,
      count() AS total_comments
    FROM pr_comments c FINAL
    JOIN bots b FINAL ON c.bot_id = b.id
    WHERE c.comment_id > 0 ${where}
    GROUP BY c.bot_id, b.name, b.product_id
    ORDER BY avg_comments_per_pr DESC`,
    botId ? { botId } : {},
  );
}

export type BotByLanguage = {
  bot_id: string;
  bot_name: string;
  language: string;
  pr_count: number;
  comment_count: number;
};

export async function getBotsByLanguage(botId?: string): Promise<BotByLanguage[]> {
  const where = botId ? "AND e.bot_id = {botId:String}" : "";
  return query<BotByLanguage>(`
    SELECT
      e.bot_id,
      b.name AS bot_name,
      r.primary_language AS language,
      countDistinct(e.repo_name, e.pr_number) AS pr_count,
      count() AS comment_count
    FROM pr_bot_events e
    JOIN bots b ON e.bot_id = b.id
    JOIN repos r ON e.repo_name = r.name
    WHERE r.primary_language != '' ${where}
    GROUP BY e.bot_id, b.name, r.primary_language
    ORDER BY pr_count DESC
  `, botId ? { botId } : {});
}

export type ReactionsByPRSize = {
  size_bucket: string;
  avg_thumbs_up: number;
  avg_thumbs_down: number;
  pr_count: number;
};

export async function getReactionsByPRSize(botId?: string): Promise<ReactionsByPRSize[]> {
  const where = botId ? "AND c.bot_id = {botId:String}" : "";
  return query<ReactionsByPRSize>(
    `SELECT
      multiIf(
        p.additions + p.deletions < 10, 'XS',
        p.additions + p.deletions < 50, 'S',
        p.additions + p.deletions < 200, 'M',
        p.additions + p.deletions < 1000, 'L',
        'XL'
      ) AS size_bucket,
      round(avg(c.thumbs_up), 2) AS avg_thumbs_up,
      round(avg(c.thumbs_down), 2) AS avg_thumbs_down,
      countDistinct(c.repo_name, c.pr_number) AS pr_count
    FROM pr_comments c FINAL
    JOIN pull_requests p ON c.repo_name = p.repo_name AND c.pr_number = p.pr_number
    WHERE c.comment_id > 0 ${where}
    GROUP BY size_bucket
    ORDER BY pr_count DESC`,
    botId ? { botId } : {},
  );
}

export type EnrichmentStats = {
  total_discovered_repos: number;
  enriched_repos: number;
  total_discovered_prs: number;
  enriched_prs: number;
  total_comments: number;
};

export async function getEnrichmentStats(): Promise<EnrichmentStats> {
  const rows = await query<EnrichmentStats>(`
    SELECT
      (SELECT count() FROM repos) AS total_discovered_repos,
      (SELECT countIf(fetch_status = 'ok') FROM repos) AS enriched_repos,
      (SELECT count(DISTINCT (repo_name, pr_number)) FROM pr_bot_events) AS total_discovered_prs,
      (SELECT count() FROM pull_requests) AS enriched_prs,
      (SELECT countIf(comment_id > 0) FROM pr_comments) AS total_comments
  `);
  return rows[0] ?? {
    total_discovered_repos: 0,
    enriched_repos: 0,
    total_discovered_prs: 0,
    enriched_prs: 0,
    total_comments: 0,
  };
}
