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
  docs_url: string;
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
  docs_url: string;
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
      formatDateTime(ra.week, '%Y-%m-%d') AS week,
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

export async function getProductSummaries(since?: string): Promise<ProductSummary[]> {
  // Don't filter the CTE — apply since via sumIf so growth_pct always has
  // access to the full 8-week window it needs for comparison.
  const sinceCond = since
    ? "week >= toDate({since:String})"
    : "1";
  const reactionSinceFilter = since
    ? "AND toDate(c.created_at) >= toDate({since:String})"
    : "";
  return query<ProductSummary>(
    `
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
          sumIf(review_count, ${sinceCond}) AS total_reviews,
          sumIf(review_comment_count, ${sinceCond}) AS total_comments,
          sumIf(pr_comment_count, ${sinceCond}) AS total_pr_comments,
          maxIf(repo_count, ${sinceCond}) AS max_repos,
          maxIf(org_count, ${sinceCond}) AS max_orgs,
          minIf(week, ${sinceCond}) AS first_seen,
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
        WHERE c.comment_id > 0 ${reactionSinceFilter}
        GROUP BY b.product_id
      )
    SELECT
      p.id,
      p.name,
      p.website,
      p.description,
      p.docs_url,
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
    `,
    since ? { since } : {},
  );
}

export async function getWeeklyActivityByProduct(
  productId?: string,
  since?: string,
): Promise<WeeklyActivityByProduct[]> {
  const conditions: string[] = [];
  if (productId) conditions.push("b.product_id = {productId:String}");
  if (since) conditions.push("ra.week >= toDate({since:String})");
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const params: Record<string, string> = {};
  if (productId) params.productId = productId;
  if (since) params.since = since;
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
    params,
  );
}

export async function getProductComparisons(since?: string): Promise<ProductComparison[]> {
  const sinceCond = since
    ? "week >= toDate({since:String})"
    : "1";
  const reactionSinceFilter = since
    ? "AND toDate(c.created_at) >= toDate({since:String})"
    : "";
  return query<ProductComparison>(
    `
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
          sumIf(review_count, ${sinceCond}) AS total_reviews,
          sumIf(review_comment_count, ${sinceCond}) AS total_comments,
          sumIf(pr_comment_count, ${sinceCond}) AS total_pr_comments,
          maxIf(repo_count, ${sinceCond}) AS max_repos,
          maxIf(org_count, ${sinceCond}) AS max_orgs,
          countIf(DISTINCT week, ${sinceCond}) AS weeks_active,
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
        WHERE c.comment_id > 0 ${reactionSinceFilter}
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
    `,
    since ? { since } : {},
  );
}

export async function getProductBots(productId: string, since?: string): Promise<ProductBot[]> {
  const sinceFilter = since ? "AND ra.week >= toDate({since:String})" : "";
  const params: Record<string, string> = { productId };
  if (since) params.since = since;
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
      LEFT JOIN (
        SELECT bot_id, min(github_login) AS github_login
        FROM bot_logins FINAL
        GROUP BY bot_id
      ) bl ON b.id = bl.bot_id
      LEFT JOIN review_activity ra FINAL ON b.id = ra.bot_id ${sinceFilter}
      WHERE b.product_id = {productId:String}
      GROUP BY b.id, b.name, bl.github_login, b.brand_color
      ORDER BY total_reviews DESC
    `,
    params,
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

export async function getWeeklyTotals(since?: string): Promise<WeeklyTotals[]> {
  const sinceFilter = since ? "WHERE h.week >= toDate({since:String})" : "";
  return query<WeeklyTotals>(
    `
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
    ${sinceFilter}
    ORDER BY h.week ASC
    `,
    since ? { since } : {},
  );
}

export async function getBotSummaries(since?: string): Promise<BotSummary[]> {
  const sinceCond = since
    ? "week >= toDate({since:String})"
    : "1";
  const reactionSinceFilter = since
    ? "AND toDate(c.created_at) >= toDate({since:String})"
    : "";
  return query<BotSummary>(
    `
    WITH
      activity_agg AS (
        SELECT
          bot_id,
          sumIf(review_count, ${sinceCond}) AS total_reviews,
          sumIf(review_comment_count, ${sinceCond}) AS total_comments,
          sumIf(pr_comment_count, ${sinceCond}) AS total_pr_comments,
          maxIf(repo_count, ${sinceCond}) AS max_repos,
          maxIf(org_count, ${sinceCond}) AS max_orgs,
          minIf(week, ${sinceCond}) AS first_seen,
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
        WHERE c.comment_id > 0 ${reactionSinceFilter}
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
    `,
    since ? { since } : {},
  );
}

export async function getBotComparisons(since?: string): Promise<BotComparison[]> {
  const sinceCond = since
    ? "week >= toDate({since:String})"
    : "1";
  const reactionSinceFilter = since
    ? "AND toDate(c.created_at) >= toDate({since:String})"
    : "";
  return query<BotComparison>(
    `
    WITH
      activity_agg AS (
        SELECT
          bot_id,
          sumIf(review_count, ${sinceCond}) AS total_reviews,
          sumIf(review_comment_count, ${sinceCond}) AS total_comments,
          sumIf(pr_comment_count, ${sinceCond}) AS total_pr_comments,
          maxIf(repo_count, ${sinceCond}) AS max_repos,
          maxIf(org_count, ${sinceCond}) AS max_orgs,
          countIf(${sinceCond}) AS weeks_active,
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
        WHERE c.comment_id > 0 ${reactionSinceFilter}
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
    `,
    since ? { since } : {},
  );
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

export async function getBotReactionLeaderboard(since?: string): Promise<BotReactions[]> {
  const sinceFilter = since
    ? "AND toDate(c.created_at) >= toDate({since:String})"
    : "";
  return query<BotReactions>(
    `
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
    WHERE c.comment_id > 0 ${sinceFilter}
    GROUP BY c.bot_id, b.name, b.product_id
    ORDER BY total_thumbs_up DESC
    `,
    since ? { since } : {},
  );
}

export type BotCommentsPerPR = {
  bot_id: string;
  bot_name: string;
  product_id: string;
  avg_comments_per_pr: number;
  total_prs: number;
  total_comments: number;
};

export async function getAvgCommentsPerPR(botId?: string, since?: string): Promise<BotCommentsPerPR[]> {
  const conditions = ["c.comment_id > 0"];
  if (botId) conditions.push("c.bot_id = {botId:String}");
  if (since) conditions.push("toDate(c.created_at) >= toDate({since:String})");
  const where = `WHERE ${conditions.join(" AND ")}`;
  const params: Record<string, string> = {};
  if (botId) params.botId = botId;
  if (since) params.since = since;
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
    ${where}
    GROUP BY c.bot_id, b.name, b.product_id
    ORDER BY avg_comments_per_pr DESC`,
    params,
  );
}

export type BotByLanguage = {
  bot_id: string;
  bot_name: string;
  language: string;
  pr_count: number;
  comment_count: number;
};

export async function getBotsByLanguage(botId?: string, since?: string): Promise<BotByLanguage[]> {
  const conditions = ["r.primary_language != ''"];
  if (botId) conditions.push("e.bot_id = {botId:String}");
  if (since) conditions.push("e.event_week >= toDate({since:String})");
  const where = `WHERE ${conditions.join(" AND ")}`;
  const params: Record<string, string> = {};
  if (botId) params.botId = botId;
  if (since) params.since = since;
  return query<BotByLanguage>(
    `
    SELECT
      e.bot_id,
      b.name AS bot_name,
      r.primary_language AS language,
      countDistinct(e.repo_name, e.pr_number) AS pr_count,
      count() AS comment_count
    FROM pr_bot_events e
    JOIN bots b ON e.bot_id = b.id
    JOIN repos r ON e.repo_name = r.name
    ${where}
    GROUP BY e.bot_id, b.name, r.primary_language
    ORDER BY pr_count DESC
    `,
    params,
  );
}



// --- Organization queries ---

export type OrgSummary = {
  owner: string;
  total_stars: number;
  repo_count: number;
  languages: string[];
  total_prs: number;
  total_bot_comments: number;
  thumbs_up: number;
  thumbs_down: number;
  heart: number;
};

export async function getOrgSummary(owner: string): Promise<OrgSummary | null> {
  const rows = await query<OrgSummary>(
    `
    SELECT
      r.owner,
      sum(r.stars) AS total_stars,
      count() AS repo_count,
      groupUniqArray(r.primary_language) AS languages,
      COALESCE(any(pr.total_prs), 0) AS total_prs,
      COALESCE(any(cm.total_bot_comments), 0) AS total_bot_comments,
      COALESCE(any(cm.thumbs_up), 0) AS thumbs_up,
      COALESCE(any(cm.thumbs_down), 0) AS thumbs_down,
      COALESCE(any(cm.heart), 0) AS heart
    FROM repos r
    LEFT JOIN (
      SELECT
        r2.owner,
        countDistinct(e.repo_name, e.pr_number) AS total_prs
      FROM pr_bot_events e
      JOIN repos r2 ON e.repo_name = r2.name
      WHERE r2.owner = {owner:String} AND r2.fetch_status = 'ok'
      GROUP BY r2.owner
    ) pr ON r.owner = pr.owner
    LEFT JOIN (
      SELECT
        r3.owner,
        countIf(c.comment_id > 0) AS total_bot_comments,
        sumIf(c.thumbs_up, c.comment_id > 0) AS thumbs_up,
        sumIf(c.thumbs_down, c.comment_id > 0) AS thumbs_down,
        sumIf(c.heart, c.comment_id > 0) AS heart
      FROM pr_comments c FINAL
      JOIN repos r3 ON c.repo_name = r3.name
      WHERE r3.owner = {owner:String} AND r3.fetch_status = 'ok'
      GROUP BY r3.owner
    ) cm ON r.owner = cm.owner
    WHERE r.fetch_status = 'ok' AND r.owner = {owner:String}
    GROUP BY r.owner
    `,
    { owner },
  );
  return rows[0] ?? null;
}

export type OrgRepo = {
  name: string;
  stars: number;
  primary_language: string;
  pr_count: number;
  bot_comment_count: number;
};

export async function getOrgRepos(owner: string): Promise<OrgRepo[]> {
  return query<OrgRepo>(
    `
    SELECT
      r.name,
      r.stars,
      r.primary_language,
      COALESCE(pr.pr_count, 0) AS pr_count,
      COALESCE(cm.bot_comment_count, 0) AS bot_comment_count
    FROM repos r
    LEFT JOIN (
      SELECT repo_name, countDistinct(repo_name, pr_number) AS pr_count
      FROM pr_bot_events
      WHERE repo_name IN (SELECT name FROM repos WHERE owner = {owner:String} AND fetch_status = 'ok')
      GROUP BY repo_name
    ) pr ON r.name = pr.repo_name
    LEFT JOIN (
      SELECT repo_name, countIf(comment_id > 0) AS bot_comment_count
      FROM pr_comments FINAL
      WHERE repo_name IN (SELECT name FROM repos WHERE owner = {owner:String} AND fetch_status = 'ok')
      GROUP BY repo_name
    ) cm ON r.name = cm.repo_name
    WHERE r.fetch_status = 'ok' AND r.owner = {owner:String}
    ORDER BY r.stars DESC
    `,
    { owner },
  );
}

export type OrgProduct = {
  product_id: string;
  product_name: string;
  brand_color: string;
  avatar_url: string;
  pr_count: number;
  event_count: number;
};

export async function getOrgProducts(owner: string): Promise<OrgProduct[]> {
  return query<OrgProduct>(
    `
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.brand_color,
      p.avatar_url,
      countDistinct(e.repo_name, e.pr_number) AS pr_count,
      count() AS event_count
    FROM pr_bot_events e
    JOIN repos r ON e.repo_name = r.name
    JOIN bots b ON e.bot_id = b.id
    JOIN products p ON b.product_id = p.id
    WHERE r.fetch_status = 'ok' AND r.owner = {owner:String}
    GROUP BY p.id, p.name, p.brand_color, p.avatar_url
    ORDER BY pr_count DESC
    `,
    { owner },
  );
}

// --- Organization listing queries ---

export type OrgListItem = {
  owner: string;
  total_stars: number;
  repo_count: number;
  languages: string[];
  total_prs: number;
  product_ids: string[];
};

export type OrgListFilters = {
  languages?: string[];
  productIds?: string[];
  sort?: "stars" | "repos" | "prs";
  limit?: number;
  offset?: number;
};

export type OrgListResult = {
  orgs: OrgListItem[];
  total: number;
};

export async function getOrgList(filters: OrgListFilters = {}): Promise<OrgListResult> {
  const { languages, productIds, sort = "stars", limit = 50, offset = 0 } = filters;

  // Build WHERE conditions on the outer query
  const conditions: string[] = ["r.fetch_status = 'ok'"];
  const havingConditions: string[] = [];
  const params: Record<string, unknown> = {
    limit: limit + 1, // fetch one extra to detect if there are more
    offset,
  };

  if (languages && languages.length > 0) {
    conditions.push(
      "r.owner IN (SELECT DISTINCT owner FROM repos WHERE fetch_status = 'ok' AND primary_language IN ({languages:Array(String)}))"
    );
    params.languages = languages;
  }

  // Product filter: only orgs where pr_bot_events includes these products
  let productJoinFilter = "";
  if (productIds && productIds.length > 0) {
    productJoinFilter = "WHERE b.product_id IN ({productIds:Array(String)})";
    havingConditions.push("COALESCE(any(pr.total_prs), 0) > 0");
    params.productIds = productIds;
  }

  const orderBy =
    sort === "repos" ? "repo_count DESC, total_stars DESC" :
    sort === "prs" ? "total_prs DESC, total_stars DESC" :
    "total_stars DESC";

  const whereClause = conditions.join(" AND ");
  const havingClause = havingConditions.length > 0
    ? `HAVING ${havingConditions.join(" AND ")}`
    : "";

  const dataQuery = `
    SELECT
      r.owner,
      sum(r.stars) AS total_stars,
      count() AS repo_count,
      groupUniqArray(r.primary_language) AS languages,
      COALESCE(any(pr.total_prs), 0) AS total_prs,
      COALESCE(any(pr.product_ids), []) AS product_ids
    FROM repos r
    LEFT JOIN (
      SELECT
        r2.owner,
        countDistinct(e.repo_name, e.pr_number) AS total_prs,
        groupUniqArray(b.product_id) AS product_ids
      FROM pr_bot_events e
      JOIN repos r2 ON e.repo_name = r2.name
      JOIN bots b ON e.bot_id = b.id
      ${productJoinFilter}
      GROUP BY r2.owner
    ) pr ON r.owner = pr.owner
    WHERE ${whereClause}
    GROUP BY r.owner
    ${havingClause}
    ORDER BY ${orderBy}
    LIMIT {limit:UInt32}
    OFFSET {offset:UInt32}
  `;

  const countQuery = `
    SELECT count() AS total FROM (
      SELECT r.owner
      FROM repos r
      LEFT JOIN (
        SELECT
          r2.owner,
          countDistinct(e.repo_name, e.pr_number) AS total_prs
        FROM pr_bot_events e
        JOIN repos r2 ON e.repo_name = r2.name
        JOIN bots b ON e.bot_id = b.id
        ${productJoinFilter}
        GROUP BY r2.owner
      ) pr ON r.owner = pr.owner
      WHERE ${whereClause}
      GROUP BY r.owner
      ${havingClause}
    )
  `;

  const [orgs, countRows] = await Promise.all([
    query<OrgListItem>(dataQuery, params),
    query<{ total: number }>(countQuery, params),
  ]);

  return {
    orgs: orgs.slice(0, limit),
    total: countRows[0]?.total ?? 0,
  };
}

export type OrgFilterOption = {
  value: string;
  count: number;
};

export async function getOrgLanguageOptions(): Promise<OrgFilterOption[]> {
  return query<OrgFilterOption>(`
    SELECT primary_language AS value, count(DISTINCT owner) AS count
    FROM repos
    WHERE fetch_status = 'ok' AND primary_language != ''
    GROUP BY primary_language
    HAVING count >= 10
    ORDER BY count DESC
  `);
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

// --- Category metric queries ---

export type CategoryCommentDetail = {
  product_id: string;
  product_name: string;
  brand_color: string;
  avg_body_length: number;
  total_comments: number;
};

export async function getCategoryCommentDetail(): Promise<CategoryCommentDetail[]> {
  return query<CategoryCommentDetail>(`
    SELECT
      b.product_id,
      p.name AS product_name,
      p.brand_color,
      round(avg(c.body_length), 0) AS avg_body_length,
      count() AS total_comments
    FROM pr_comments c FINAL
    JOIN bots b FINAL ON c.bot_id = b.id
    JOIN products p FINAL ON b.product_id = p.id
    WHERE c.comment_id > 0
    GROUP BY b.product_id, p.name, p.brand_color
    ORDER BY avg_body_length DESC
  `);
}

export type CategoryStarAdoption = {
  product_id: string;
  product_name: string;
  brand_color: string;
  repo_count: number;
  total_stars: number;
  avg_repo_stars: number;
};

export async function getCategoryStarAdoption(): Promise<CategoryStarAdoption[]> {
  return query<CategoryStarAdoption>(`
    SELECT
      pr.product_id,
      p.name AS product_name,
      p.brand_color,
      count() AS repo_count,
      sum(r.stars) AS total_stars,
      round(avg(r.stars), 0) AS avg_repo_stars
    FROM (
      SELECT DISTINCT b.product_id, e.repo_name
      FROM pr_bot_events e
      JOIN bots b FINAL ON e.bot_id = b.id
    ) pr
    JOIN products p FINAL ON pr.product_id = p.id
    JOIN repos r ON pr.repo_name = r.name
    WHERE r.fetch_status = 'ok'
    GROUP BY pr.product_id, p.name, p.brand_color
    ORDER BY avg_repo_stars DESC
  `);
}

export type CategoryPRSize = {
  product_id: string;
  product_name: string;
  brand_color: string;
  avg_pr_size: number;
  total_prs: number;
};

export async function getCategoryPRSize(): Promise<CategoryPRSize[]> {
  return query<CategoryPRSize>(`
    SELECT
      bp.product_id,
      p.name AS product_name,
      p.brand_color,
      round(avg(pr.additions + pr.deletions), 0) AS avg_pr_size,
      count() AS total_prs
    FROM (
      SELECT DISTINCT b.product_id, e.repo_name, e.pr_number
      FROM pr_bot_events e
      JOIN bots b FINAL ON e.bot_id = b.id
    ) bp
    JOIN products p FINAL ON bp.product_id = p.id
    JOIN pull_requests pr ON bp.repo_name = pr.repo_name AND bp.pr_number = pr.pr_number
    GROUP BY bp.product_id, p.name, p.brand_color
    ORDER BY avg_pr_size DESC
  `);
}

export type CategoryMergeRate = {
  product_id: string;
  product_name: string;
  brand_color: string;
  total_prs: number;
  merged_prs: number;
  merge_rate: number;
};

export async function getCategoryMergeRate(): Promise<CategoryMergeRate[]> {
  return query<CategoryMergeRate>(`
    SELECT
      bp.product_id,
      p.name AS product_name,
      p.brand_color,
      count() AS total_prs,
      countIf(pr.merged_at IS NOT NULL) AS merged_prs,
      round(countIf(pr.merged_at IS NOT NULL) * 100.0 / count(), 1) AS merge_rate
    FROM (
      SELECT DISTINCT b.product_id, e.repo_name, e.pr_number
      FROM pr_bot_events e
      JOIN bots b FINAL ON e.bot_id = b.id
    ) bp
    JOIN products p FINAL ON bp.product_id = p.id
    JOIN pull_requests pr ON bp.repo_name = pr.repo_name AND bp.pr_number = pr.pr_number
    GROUP BY bp.product_id, p.name, p.brand_color
    HAVING total_prs > 0
    ORDER BY merge_rate DESC
  `);
}

export type CategoryResponseTime = {
  product_id: string;
  product_name: string;
  brand_color: string;
  median_response_minutes: number;
  total_prs: number;
};

export async function getCategoryResponseTime(): Promise<CategoryResponseTime[]> {
  return query<CategoryResponseTime>(`
    SELECT
      fc.product_id,
      p.name AS product_name,
      p.brand_color,
      median(dateDiff('minute', pr.created_at, fc.first_comment_at)) AS median_response_minutes,
      count() AS total_prs
    FROM (
      SELECT b.product_id, c.repo_name, c.pr_number, min(c.created_at) AS first_comment_at
      FROM pr_comments c FINAL
      JOIN bots b FINAL ON c.bot_id = b.id
      WHERE c.comment_id > 0
      GROUP BY b.product_id, c.repo_name, c.pr_number
    ) fc
    JOIN products p FINAL ON fc.product_id = p.id
    JOIN pull_requests pr ON fc.repo_name = pr.repo_name AND fc.pr_number = pr.pr_number
    WHERE pr.created_at >= '2020-01-01'
      AND fc.first_comment_at >= pr.created_at
    GROUP BY fc.product_id, p.name, p.brand_color
    HAVING total_prs >= 5
    ORDER BY median_response_minutes ASC
  `);
}

export type CategoryControversy = {
  product_id: string;
  product_name: string;
  brand_color: string;
  controversy_score: number;
  total_thumbs_up: number;
  total_thumbs_down: number;
  total_confused: number;
  total_comments: number;
};

export async function getCategoryControversy(): Promise<CategoryControversy[]> {
  return query<CategoryControversy>(`
    SELECT
      b.product_id,
      p.name AS product_name,
      p.brand_color,
      round(if(sum(c.thumbs_up) + sum(c.thumbs_down) > 0,
        2.0 * least(sum(c.thumbs_up), sum(c.thumbs_down)) / (sum(c.thumbs_up) + sum(c.thumbs_down)),
        0), 2) AS controversy_score,
      sum(c.thumbs_up) AS total_thumbs_up,
      sum(c.thumbs_down) AS total_thumbs_down,
      sum(c.confused) AS total_confused,
      count() AS total_comments
    FROM pr_comments c FINAL
    JOIN bots b FINAL ON c.bot_id = b.id
    JOIN products p FINAL ON b.product_id = p.id
    WHERE c.comment_id > 0
    GROUP BY b.product_id, p.name, p.brand_color
    HAVING (sum(c.thumbs_up) + sum(c.thumbs_down)) >= 10
    ORDER BY controversy_score DESC
  `);
}

export type CategoryInlineVsSummary = {
  product_id: string;
  product_name: string;
  brand_color: string;
  inline_comments: number;
  summary_comments: number;
  inline_pct: number;
};

export async function getCategoryInlineVsSummary(): Promise<CategoryInlineVsSummary[]> {
  return query<CategoryInlineVsSummary>(`
    SELECT
      b.product_id,
      p.name AS product_name,
      p.brand_color,
      sum(ra.review_comment_count) AS inline_comments,
      sum(ra.pr_comment_count) AS summary_comments,
      round(sum(ra.review_comment_count) * 100.0
        / (sum(ra.review_comment_count) + sum(ra.pr_comment_count)), 1) AS inline_pct
    FROM review_activity ra FINAL
    JOIN bots b FINAL ON ra.bot_id = b.id
    JOIN products p FINAL ON b.product_id = p.id
    GROUP BY b.product_id, p.name, p.brand_color
    HAVING (inline_comments + summary_comments) > 0
    ORDER BY inline_pct DESC
  `);
}

export type CategoryReviewVerdicts = {
  product_id: string;
  product_name: string;
  brand_color: string;
  approved_count: number;
  changes_requested_count: number;
  commented_count: number;
  total_reviews: number;
  approval_pct: number;
};

export async function getCategoryReviewVerdicts(): Promise<CategoryReviewVerdicts[]> {
  return query<CategoryReviewVerdicts>(`
    SELECT
      b.product_id,
      p.name AS product_name,
      p.brand_color,
      countIf(e.review_state = 'approved') AS approved_count,
      countIf(e.review_state = 'changes_requested') AS changes_requested_count,
      countIf(e.review_state = 'commented') AS commented_count,
      count() AS total_reviews,
      round(countIf(e.review_state = 'approved') * 100.0 / count(), 1) AS approval_pct
    FROM pr_bot_events e
    JOIN bots b FINAL ON e.bot_id = b.id
    JOIN products p FINAL ON b.product_id = p.id
    WHERE e.review_state != '' AND e.event_type = 'PullRequestReviewEvent'
    GROUP BY b.product_id, p.name, p.brand_color
    ORDER BY approval_pct DESC
  `);
}
