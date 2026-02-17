import { createClient } from "@clickhouse/client";
import * as Sentry from "@sentry/nextjs";

// Simple in-memory cache with TTL for expensive queries.
// Lives for the lifetime of a serverless container instance.
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return entry.data as T;
  if (entry) cache.delete(key);
  return undefined;
}

function setCache<T>(key: string, data: T): T {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

// Persistent singleton client — reused across requests within a container.
// Avoids TLS handshake + auth overhead on every query.
let _client: ReturnType<typeof createClient> | null = null;

export function getClickHouseClient() {
  if (!_client) {
    _client = createClient({
      url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
      username: process.env.CLICKHOUSE_USER ?? "default",
      password: process.env.CLICKHOUSE_PASSWORD ?? "dev",
      database: process.env.CLICKHOUSE_DB ?? "code_review_trends",
      keep_alive: { enabled: true },
    });
  }
  return _client;
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
  total_reaction_reviews: number;
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
  total_reaction_reviews: number;
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
  const clickhouseUrl = process.env.CLICKHOUSE_URL || "http://localhost:8123";
  let serverAddress = "localhost";
  let serverPort = 8123;
  try {
    const parsed = new URL(clickhouseUrl);
    serverAddress = parsed.hostname;
    serverPort = parseInt(parsed.port, 10) || 8123;
  } catch {
    // fall back to defaults
  }

  try {
    return await Sentry.startSpan(
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
        const result = await client.query({
          query: sql,
          query_params: params ?? {},
          format: "JSONEachRow",
        });
        return (await result.json()) as T[];
      },
    );
  } catch (error) {
    // During build-time prerendering (e.g. CI), ClickHouse may not be
    // available. Return empty data so the page prerenders successfully;
    // ISR will fill it on first real request.
    if (process.env.NODE_ENV === "production") {
      console.warn(`[ClickHouse] Query failed (returning empty): ${(error as Error).message}`);
      return [];
    }
    throw error;
  }
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
  // access to the full 24-week window it needs for comparison.
  const sinceCond = since
    ? "week >= toDate({since:String})"
    : "1";
  const reactionSinceFilter = since
    ? "AND toDate(c.created_at) >= toDate({since:String})"
    : "";
  return query<ProductSummary>(
    `
    WITH
      ref AS (
        SELECT max(week) AS ref_week FROM review_activity FINAL
        WHERE week < toStartOfWeek(now(), 1)
      ),
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
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_reviews,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 12 WEEK AND week <= (SELECT ref_week FROM ref)) AS recent_12w_reviews,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 24 WEEK AND week <= (SELECT ref_week FROM ref) - INTERVAL 12 WEEK) AS prev_12w_reviews
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
      ),
      reaction_review_agg AS (
        SELECT
          b.product_id,
          countDistinct((r.repo_name, r.pr_number)) AS reaction_reviews
        FROM pr_bot_reactions r FINAL
        JOIN bots b FINAL ON r.bot_id = b.id
        WHERE r.reaction_type = 'hooray'
          AND NOT EXISTS (
            SELECT 1 FROM pr_bot_events e
            WHERE e.repo_name = r.repo_name
              AND e.pr_number = r.pr_number
              AND e.bot_id = r.bot_id
          )
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
      COALESCE(rrv.reaction_reviews, 0) AS total_reaction_reviews,
      COALESCE(ra.max_repos, 0) AS total_repos,
      COALESCE(ra.max_orgs, 0) AS total_orgs,
      round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
      COALESCE(ra.latest_week_reviews, 0) AS latest_week_reviews,
      round(
        if(ra.prev_12w_reviews > 0,
          (ra.recent_12w_reviews - ra.prev_12w_reviews) * 100.0 / ra.prev_12w_reviews,
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
    LEFT JOIN reaction_review_agg rrv ON p.id = rrv.product_id
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
      ref AS (
        SELECT max(week) AS ref_week FROM review_activity FINAL
        WHERE week < toStartOfWeek(now(), 1)
      ),
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
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_reviews,
          sumIf(review_comment_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_comments,
          sumIf(pr_comment_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_pr_comments,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 12 WEEK AND week <= (SELECT ref_week FROM ref)) AS recent_12w_reviews,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 24 WEEK AND week <= (SELECT ref_week FROM ref) - INTERVAL 12 WEEK) AS prev_12w_reviews
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
        if(ra.prev_12w_reviews > 0,
          (ra.recent_12w_reviews - ra.prev_12w_reviews) * 100.0 / ra.prev_12w_reviews,
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
        toString(min(ra.week)) AS first_week,
        toString(max(ra.week)) AS last_week
      FROM bots b FINAL
      LEFT JOIN (
        SELECT bot_id, min(github_login) AS github_login
        FROM bot_logins FINAL
        GROUP BY bot_id
      ) bl ON b.id = bl.bot_id
      LEFT JOIN review_activity ra FINAL ON b.id = ra.bot_id ${sinceFilter}
      WHERE b.product_id = {productId:String}
      GROUP BY b.id, b.name, bl.github_login, b.brand_color
      HAVING total_reviews > 0
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
      ref AS (
        SELECT max(week) AS ref_week FROM review_activity FINAL
        WHERE week < toStartOfWeek(now(), 1)
      ),
      activity_agg AS (
        SELECT
          bot_id,
          sumIf(review_count, ${sinceCond}) AS total_reviews,
          sumIf(review_comment_count, ${sinceCond}) AS total_comments,
          sumIf(pr_comment_count, ${sinceCond}) AS total_pr_comments,
          maxIf(repo_count, ${sinceCond}) AS max_repos,
          maxIf(org_count, ${sinceCond}) AS max_orgs,
          minIf(week, ${sinceCond}) AS first_seen,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_reviews,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 12 WEEK AND week <= (SELECT ref_week FROM ref)) AS recent_12w_reviews,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 24 WEEK AND week <= (SELECT ref_week FROM ref) - INTERVAL 12 WEEK) AS prev_12w_reviews
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
      ),
      reaction_review_agg AS (
        SELECT
          r.bot_id,
          countDistinct((r.repo_name, r.pr_number)) AS reaction_reviews
        FROM pr_bot_reactions r FINAL
        WHERE r.reaction_type = 'hooray'
          AND NOT EXISTS (
            SELECT 1 FROM pr_bot_events e
            WHERE e.repo_name = r.repo_name
              AND e.pr_number = r.pr_number
              AND e.bot_id = r.bot_id
          )
        GROUP BY r.bot_id
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
      COALESCE(rrv.reaction_reviews, 0) AS total_reaction_reviews,
      COALESCE(ra.max_repos, 0) AS total_repos,
      COALESCE(ra.max_orgs, 0) AS total_orgs,
      round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
      COALESCE(ra.latest_week_reviews, 0) AS latest_week_reviews,
      round(
        if(ra.prev_12w_reviews > 0,
          (ra.recent_12w_reviews - ra.prev_12w_reviews) * 100.0 / ra.prev_12w_reviews,
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
    LEFT JOIN reaction_review_agg rrv ON b.id = rrv.bot_id
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
      ref AS (
        SELECT max(week) AS ref_week FROM review_activity FINAL
        WHERE week < toStartOfWeek(now(), 1)
      ),
      activity_agg AS (
        SELECT
          bot_id,
          sumIf(review_count, ${sinceCond}) AS total_reviews,
          sumIf(review_comment_count, ${sinceCond}) AS total_comments,
          sumIf(pr_comment_count, ${sinceCond}) AS total_pr_comments,
          maxIf(repo_count, ${sinceCond}) AS max_repos,
          maxIf(org_count, ${sinceCond}) AS max_orgs,
          countIf(${sinceCond}) AS weeks_active,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_reviews,
          sumIf(review_comment_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_comments,
          sumIf(pr_comment_count, week > (SELECT ref_week FROM ref) - INTERVAL 4 WEEK AND week <= (SELECT ref_week FROM ref)) AS latest_week_pr_comments,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 12 WEEK AND week <= (SELECT ref_week FROM ref)) AS recent_12w_reviews,
          sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 24 WEEK AND week <= (SELECT ref_week FROM ref) - INTERVAL 12 WEEK) AS prev_12w_reviews
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
        if(ra.prev_12w_reviews > 0,
          (ra.recent_12w_reviews - ra.prev_12w_reviews) * 100.0 / ra.prev_12w_reviews,
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

  // Uses pr_bot_event_counts materialized view (~471K rows) instead of
  // scanning the full pr_bot_events table (~7.4M rows). Two-level aggregation:
  // 1. Inner: merge uniqExact states per repo (unions PR sets across bots)
  // 2. Outer: sum exact per-repo counts by owner
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
        sum(repo_pr_count) AS total_prs,
        arrayDistinct(arrayFlatten(groupArray(repo_product_ids))) AS product_ids
      FROM (
        SELECT s.repo_name,
          uniqExactMerge(s.pr_count) AS repo_pr_count,
          groupUniqArray(b.product_id) AS repo_product_ids
        FROM pr_bot_event_counts s
        JOIN bots b ON s.bot_id = b.id
        ${productJoinFilter}
        GROUP BY s.repo_name
      ) repo_agg
      JOIN repos r2 ON repo_agg.repo_name = r2.name
      WHERE r2.fetch_status = 'ok'
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
          sum(repo_pr_count) AS total_prs
        FROM (
          SELECT s.repo_name,
            uniqExactMerge(s.pr_count) AS repo_pr_count
          FROM pr_bot_event_counts s
          JOIN bots b ON s.bot_id = b.id
          ${productJoinFilter}
          GROUP BY s.repo_name
        ) repo_agg
        JOIN repos r2 ON repo_agg.repo_name = r2.name
        WHERE r2.fetch_status = 'ok'
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
  const cached = getCached<EnrichmentStats>("enrichmentStats");
  if (cached) return cached;

  const rows = await query<EnrichmentStats>(`
    SELECT
      (SELECT count() FROM repos) AS total_discovered_repos,
      (SELECT countIf(fetch_status = 'ok') FROM repos) AS enriched_repos,
      (SELECT uniq(repo_name, pr_number) FROM pr_bot_events) AS total_discovered_prs,
      (SELECT count() FROM pull_requests) AS enriched_prs,
      (SELECT countIf(comment_id > 0) FROM pr_comments) AS total_comments
  `);
  return setCache("enrichmentStats", rows[0] ?? {
    total_discovered_repos: 0,
    enriched_repos: 0,
    total_discovered_prs: 0,
    enriched_prs: 0,
    total_comments: 0,
  });
}

// --- Data collection stats (for /about page) ---

export type DataCollectionStats = {
  // BigQuery backfill — which weeks have data
  weeks_with_data: string[]; // ISO date strings of weeks present in review_activity
  last_import: string | null; // UTC timestamp of last pipeline_state backfill run
  // GitHub enrichment — repos
  repos_total: number; // distinct repos found in pr_bot_events (discovered)
  repos_ok: number;
  repos_not_found: number;
  repos_pending: number;
  // GitHub enrichment — PRs
  prs_discovered: number;
  prs_enriched: number;
  // GitHub enrichment — comments
  comments_discovered: number;
  comments_enriched: number;
  // GitHub enrichment — reaction scans
  reactions_total: number;
  reactions_scanned: number;
  reactions_found: number;
};

import { DATA_EPOCH } from "./constants";
export { DATA_EPOCH };

export async function getDataCollectionStats(): Promise<DataCollectionStats> {
  const cached = getCached<DataCollectionStats>("dataCollectionStats");
  if (cached) return cached;

  // Fetch weeks with data + enrichment counts in parallel
  const [weekRows, countRows] = await Promise.all([
    query<{ w: string }>(`
      SELECT DISTINCT toString(week) AS w
      FROM review_activity FINAL
      WHERE week >= toDate('${DATA_EPOCH}')
      ORDER BY w
    `),
    query<{
      repos_total: number;
      repos_ok: number;
      repos_not_found: number;
      prs_discovered: number;
      prs_enriched: number;
      comments_discovered: number;
      comments_enriched: number;
      reactions_total: number;
      reactions_scanned: number;
      reactions_found: number;
    }>(`
      SELECT
        (SELECT uniq(repo_name) FROM pr_bot_events) AS repos_total,
        (SELECT countIf(fetch_status = 'ok') FROM repos FINAL) AS repos_ok,
        (SELECT countIf(fetch_status = 'not_found') FROM repos FINAL) AS repos_not_found,
        (SELECT uniq(repo_name, pr_number) FROM pr_bot_events) AS prs_discovered,
        (SELECT count() FROM pull_requests FINAL) AS prs_enriched,
        (SELECT uniq(repo_name, pr_number, bot_id) FROM pr_bot_events WHERE event_type IN ('PullRequestReviewCommentEvent', 'IssueCommentEvent')) AS comments_discovered,
        (SELECT uniq(repo_name, pr_number, bot_id) FROM pr_comments FINAL) AS comments_enriched,
        (SELECT uniq(repo_name, pr_number) FROM pr_bot_events) AS reactions_total,
        (SELECT count() FROM reaction_scan_progress FINAL) AS reactions_scanned,
        (SELECT uniq(repo_name, pr_number) FROM pr_bot_reactions) AS reactions_found
    `),
  ]);

  // Last import from pipeline_state (may not exist)
  let lastImport: string | null = null;
  try {
    const stateRows = await query<{ last_run: string }>(`
      SELECT toString(max(completed_at)) AS last_run
      FROM pipeline_state FINAL
      WHERE job_name = 'backfill'
    `);
    if (stateRows[0] && stateRows[0].last_run !== "1970-01-01 00:00:00") {
      lastImport = stateRows[0].last_run;
    }
  } catch {
    // pipeline_state table may not exist
  }

  const base = countRows[0];
  return setCache("dataCollectionStats", {
    weeks_with_data: weekRows.map((r) => r.w),
    last_import: lastImport,
    repos_total: Number(base?.repos_total ?? 0),
    repos_ok: Number(base?.repos_ok ?? 0),
    repos_not_found: Number(base?.repos_not_found ?? 0),
    repos_pending: Math.max(0, Number(base?.repos_total ?? 0) - Number(base?.repos_ok ?? 0) - Number(base?.repos_not_found ?? 0)),
    prs_discovered: Number(base?.prs_discovered ?? 0),
    prs_enriched: Number(base?.prs_enriched ?? 0),
    comments_discovered: Number(base?.comments_discovered ?? 0),
    comments_enriched: Number(base?.comments_enriched ?? 0),
    reactions_total: Number(base?.reactions_total ?? 0),
    reactions_scanned: Number(base?.reactions_scanned ?? 0),
    reactions_found: Number(base?.reactions_found ?? 0),
  });
}

/**
 * Returns the percentage of PR comment data that has been collected (0–100).
 * Compares weeks with non-zero pr_comment_count to total weeks with review data
 * in human_review_activity. Returns null if no data at all.
 */
export async function getPrCommentSyncPct(): Promise<number | null> {
  const cached = getCached<number | null>("prCommentSyncPct");
  if (cached !== undefined) return cached;

  try {
    const rows = await query<{
      weeks_with_pr_comments: string;
      total_weeks: string;
    }>(`
      SELECT
        countIf(pr_comment_count > 0) AS weeks_with_pr_comments,
        count() AS total_weeks
      FROM (
        SELECT week, sum(pr_comment_count) AS pr_comment_count
        FROM human_review_activity FINAL
        GROUP BY week
      )
    `);
    const row = rows[0];
    const totalWeeks = Number(row?.total_weeks ?? 0);
    if (!row || totalWeeks === 0) return setCache("prCommentSyncPct", null);
    return setCache(
      "prCommentSyncPct",
      (Number(row.weeks_with_pr_comments) / totalWeeks) * 100,
    );
  } catch {
    return null;
  }
}
