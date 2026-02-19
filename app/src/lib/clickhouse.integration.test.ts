/**
 * Integration tests for ClickHouse query correctness.
 *
 * Inserts controlled test data (using __test_ prefix, year 2020 dates)
 * and verifies the SQL queries from clickhouse.ts return correct results.
 *
 * Requires: ClickHouse running via `npm run dev:infra`.
 * Run: CLICKHOUSE_URL=http://localhost:${PORT} npx tsx --test src/lib/clickhouse.integration.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient, type ClickHouseClient } from "@clickhouse/client";

function createTestClient(): ClickHouseClient {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "dev",
    database: process.env.CLICKHOUSE_DB ?? "code_review_trends",
  });
}

async function q<T>(ch: ClickHouseClient, sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const result = await ch.query({ query: sql, query_params: params ?? {}, format: "JSONEachRow" });
  return (await result.json()) as T[];
}

// Test data uses year 2020 to avoid collisions with real data (epoch is 2023).
// Weeks are Mondays (ISO week start).
const W1 = "2020-01-06"; // week 1
const W2 = "2020-01-13"; // week 2
const W3 = "2020-01-20"; // week 3
const W4 = "2020-01-27"; // week 4

const PRODUCT_A = "__test_product_a";
const PRODUCT_B = "__test_product_b";
const BOT_A1 = "__test_bot_a1";
const BOT_B1 = "__test_bot_b1";
const BOT_B2 = "__test_bot_b2";

describe("clickhouse query integration tests", () => {
  let ch: ClickHouseClient;

  before(async () => {
    ch = createTestClient();

    // Ensure reaction_only_review_counts table exists
    await ch.command({
      query: `CREATE TABLE IF NOT EXISTS reaction_only_review_counts (
        bot_id String, week Date, reaction_reviews UInt64
      ) ENGINE = ReplacingMergeTree() ORDER BY (bot_id, week)`,
    });

    // Insert products
    await ch.insert({
      table: "products",
      values: [
        { id: PRODUCT_A, name: "Test Product A", website: "https://a.test", description: "Product A desc", docs_url: "", brand_color: "#aaa", avatar_url: "" },
        { id: PRODUCT_B, name: "Test Product B", website: "https://b.test", description: "Product B desc", docs_url: "", brand_color: "#bbb", avatar_url: "" },
      ],
      format: "JSONEachRow",
    });

    // Insert bots: A has 1 bot, B has 2 bots
    await ch.insert({
      table: "bots",
      values: [
        { id: BOT_A1, name: "Bot A1", product_id: PRODUCT_A, brand_color: "#aaa", avatar_url: "", website: "", description: "" },
        { id: BOT_B1, name: "Bot B1", product_id: PRODUCT_B, brand_color: "#bbb", avatar_url: "", website: "", description: "" },
        { id: BOT_B2, name: "Bot B2", product_id: PRODUCT_B, brand_color: "#bbb", avatar_url: "", website: "", description: "" },
      ],
      format: "JSONEachRow",
    });

    // Insert bot_logins
    await ch.insert({
      table: "bot_logins",
      values: [
        { bot_id: BOT_A1, github_login: "test-bot-a1" },
        { bot_id: BOT_B1, github_login: "test-bot-b1" },
        { bot_id: BOT_B2, github_login: "test-bot-b2" },
      ],
      format: "JSONEachRow",
    });

    // review_activity: bot_b1 and bot_b2 each have repo_count=5, org_count=3
    // If product query uses max() it gets 5; if sum() it correctly gets 10.
    await ch.insert({
      table: "review_activity",
      values: [
        { week: W1, bot_id: BOT_A1, review_count: 100, review_comment_count: 50, pr_comment_count: 10, repo_count: 8, org_count: 4 },
        { week: W2, bot_id: BOT_A1, review_count: 120, review_comment_count: 60, pr_comment_count: 12, repo_count: 9, org_count: 5 },
        { week: W1, bot_id: BOT_B1, review_count: 200, review_comment_count: 80, pr_comment_count: 20, repo_count: 5, org_count: 3 },
        { week: W2, bot_id: BOT_B1, review_count: 250, review_comment_count: 100, pr_comment_count: 25, repo_count: 6, org_count: 4 },
        { week: W1, bot_id: BOT_B2, review_count: 150, review_comment_count: 70, pr_comment_count: 15, repo_count: 5, org_count: 3 },
        { week: W2, bot_id: BOT_B2, review_count: 180, review_comment_count: 90, pr_comment_count: 18, repo_count: 7, org_count: 3 },
      ],
      format: "JSONEachRow",
    });

    // human_review_activity for weekly totals test
    await ch.insert({
      table: "human_review_activity",
      values: [
        { week: W1, review_count: 1000, review_comment_count: 500, pr_comment_count: 200, repo_count: 100 },
        { week: W2, review_count: 1200, review_comment_count: 600, pr_comment_count: 250, repo_count: 120 },
      ],
      format: "JSONEachRow",
    });

    // pr_comments for reaction data (approval_rate test)
    // Bot A1: 80 thumbs_up, 20 thumbs_down → approval_rate = 80%
    await ch.insert({
      table: "pr_comments",
      values: [
        { repo_name: "__test_repo/foo", pr_number: 1, comment_id: 900001, bot_id: BOT_A1, body_length: 100, created_at: "2020-01-07 10:00:00", thumbs_up: 80, thumbs_down: 20, heart: 5 },
      ],
      format: "JSONEachRow",
    });

    // reaction_only_review_counts: bot_a1 has 30 reaction-only reviews in W1
    await ch.insert({
      table: "reaction_only_review_counts",
      values: [
        { bot_id: BOT_A1, week: W1, reaction_reviews: 30 },
      ],
      format: "JSONEachRow",
    });

    // OPTIMIZE all tables
    for (const table of [
      "products", "bots", "bot_logins", "review_activity",
      "human_review_activity", "pr_comments", "reaction_only_review_counts",
    ]) {
      await ch.command({ query: `OPTIMIZE TABLE ${table} FINAL` });
    }
  });

  after(async () => {
    // Clean up test data
    const deletes = [
      `ALTER TABLE products DELETE WHERE id LIKE '__test_%'`,
      `ALTER TABLE bots DELETE WHERE id LIKE '__test_%'`,
      `ALTER TABLE bot_logins DELETE WHERE bot_id LIKE '__test_%'`,
      `ALTER TABLE review_activity DELETE WHERE bot_id LIKE '__test_%'`,
      `ALTER TABLE human_review_activity DELETE WHERE week IN ('${W1}','${W2}','${W3}','${W4}')`,
      `ALTER TABLE pr_comments DELETE WHERE bot_id LIKE '__test_%'`,
      `ALTER TABLE reaction_only_review_counts DELETE WHERE bot_id LIKE '__test_%'`,
    ];
    for (const sql of deletes) {
      await ch.command({ query: sql });
    }
    await ch.close();
  });

  describe("getProductSummaries", () => {
    it("multi-bot product uses sum() for repo_count and org_count", async () => {
      // This is the core query from getProductSummaries, filtered to test products
      const rows = await q<{
        id: string; total_reviews: string; total_repos: string; total_orgs: string;
      }>(ch, `
        WITH
          weekly_product AS (
            SELECT product_id, week, sum(review_count) AS review_count,
              sum(review_comment_count) AS review_comment_count,
              sum(pr_comment_count) AS pr_comment_count,
              sum(repo_count) AS repo_count, sum(org_count) AS org_count
            FROM (
              SELECT b.product_id, ra.week, ra.review_count, ra.review_comment_count,
                ra.pr_comment_count, ra.repo_count, ra.org_count
              FROM review_activity ra FINAL
              JOIN bots b FINAL ON ra.bot_id = b.id
              UNION ALL
              SELECT b.product_id, ror.week, ror.reaction_reviews AS review_count,
                0 AS review_comment_count, 0 AS pr_comment_count, 0 AS repo_count, 0 AS org_count
              FROM reaction_only_review_counts ror FINAL
              JOIN bots b FINAL ON ror.bot_id = b.id
            )
            GROUP BY product_id, week
          ),
          activity_agg AS (
            SELECT
              product_id,
              sum(review_count) AS total_reviews,
              max(repo_count) AS max_repos,
              max(org_count) AS max_orgs
            FROM weekly_product
            GROUP BY product_id
          )
        SELECT
          p.id,
          COALESCE(ra.total_reviews, 0) AS total_reviews,
          COALESCE(ra.max_repos, 0) AS total_repos,
          COALESCE(ra.max_orgs, 0) AS total_orgs
        FROM products p FINAL
        LEFT JOIN activity_agg ra ON p.id = ra.product_id
        WHERE p.id IN ('${PRODUCT_A}', '${PRODUCT_B}')
        ORDER BY total_reviews DESC
      `);

      const prodB = rows.find(r => r.id === PRODUCT_B)!;
      assert.ok(prodB, "Product B should exist");

      // Bot B1 week2: repo_count=6, org_count=4; Bot B2 week2: repo_count=7, org_count=3
      // sum at product level for week2: repo_count=13, org_count=7
      // max across weeks: week2 has higher sum → repo_count=13, org_count=7
      // If it used max(individual bot) instead of sum, we'd get max(7)=7 for repos
      assert.equal(Number(prodB.total_repos), 13, "repo_count should be sum of bots per week, then max across weeks");
      assert.equal(Number(prodB.total_orgs), 7, "org_count should be sum of bots per week, then max across weeks");
    });

    it("reaction-only reviews included in total_reviews", async () => {
      const rows = await q<{ id: string; total_reviews: string }>(ch, `
        WITH
          weekly_product AS (
            SELECT product_id, week, sum(review_count) AS review_count
            FROM (
              SELECT b.product_id, ra.week, ra.review_count
              FROM review_activity ra FINAL
              JOIN bots b FINAL ON ra.bot_id = b.id
              UNION ALL
              SELECT b.product_id, ror.week, ror.reaction_reviews AS review_count
              FROM reaction_only_review_counts ror FINAL
              JOIN bots b FINAL ON ror.bot_id = b.id
            )
            GROUP BY product_id, week
          )
        SELECT product_id AS id, sum(review_count) AS total_reviews
        FROM weekly_product
        WHERE product_id = '${PRODUCT_A}'
        GROUP BY product_id
      `);

      const prodA = rows[0]!;
      // Bot A1: W1=100, W2=120 from review_activity + W1=30 from reaction_only = 250
      assert.equal(Number(prodA.total_reviews), 250, "total_reviews should include reaction-only reviews");
    });

    it("results sorted by growth_pct DESC", async () => {
      // The actual query sorts by growth_pct DESC, total_reviews DESC.
      // With 2020 data far in the past, growth_pct will be 0 for all test products
      // (since the ref_week calculation looks at recent data relative to now()).
      // So they'll be sorted by total_reviews DESC as tiebreaker.
      // Product B has more reviews than A, so B should come first.
      const rows = await q<{ id: string; growth_pct: string; total_reviews: string }>(ch, `
        WITH
          ref AS (
            SELECT max(week) AS ref_week FROM (SELECT week FROM review_activity FINAL UNION ALL SELECT week FROM reaction_only_review_counts FINAL)
            WHERE week < toStartOfWeek(now(), 1)
          ),
          weekly_product AS (
            SELECT product_id, week, sum(review_count) AS review_count
            FROM (
              SELECT b.product_id, ra.week, ra.review_count
              FROM review_activity ra FINAL
              JOIN bots b FINAL ON ra.bot_id = b.id
              UNION ALL
              SELECT b.product_id, ror.week, ror.reaction_reviews AS review_count
              FROM reaction_only_review_counts ror FINAL
              JOIN bots b FINAL ON ror.bot_id = b.id
            )
            GROUP BY product_id, week
          ),
          activity_agg AS (
            SELECT
              product_id,
              sum(review_count) AS total_reviews,
              sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 12 WEEK AND week <= (SELECT ref_week FROM ref)) AS recent_12w_reviews,
              sumIf(review_count, week > (SELECT ref_week FROM ref) - INTERVAL 24 WEEK AND week <= (SELECT ref_week FROM ref) - INTERVAL 12 WEEK) AS prev_12w_reviews
            FROM weekly_product
            GROUP BY product_id
          )
        SELECT
          p.id,
          COALESCE(ra.total_reviews, 0) AS total_reviews,
          round(if(ra.prev_12w_reviews > 0,
            (ra.recent_12w_reviews - ra.prev_12w_reviews) * 100.0 / ra.prev_12w_reviews, 0), 1) AS growth_pct
        FROM products p FINAL
        LEFT JOIN activity_agg ra ON p.id = ra.product_id
        WHERE p.id IN ('${PRODUCT_A}', '${PRODUCT_B}')
        ORDER BY growth_pct DESC, total_reviews DESC
      `);

      assert.ok(rows.length >= 2);
      // Both have growth_pct=0 (data is in 2020, far from ref_week), so sorted by total_reviews DESC
      // Product B: 200+250+150+180=780, Product A: 100+120+30=250
      assert.equal(rows[0].id, PRODUCT_B, "Product B should be first (more total_reviews as tiebreaker)");
      assert.equal(rows[1].id, PRODUCT_A);
    });
  });

  describe("getBotSummaries", () => {
    it("approval_rate = thumbs_up / (thumbs_up + thumbs_down) * 100", async () => {
      const rows = await q<{ id: string; approval_rate: string; thumbs_up: string; thumbs_down: string }>(ch, `
        WITH reaction_agg AS (
          SELECT
            c.bot_id,
            sum(c.thumbs_up) AS thumbs_up,
            sum(c.thumbs_down) AS thumbs_down
          FROM pr_comments c FINAL
          WHERE c.comment_id > 0
          GROUP BY c.bot_id
        )
        SELECT
          b.id,
          COALESCE(rr.thumbs_up, 0) AS thumbs_up,
          COALESCE(rr.thumbs_down, 0) AS thumbs_down,
          round(if((COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)) > 0,
            COALESCE(rr.thumbs_up, 0) * 100.0 / (COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)),
            0), 1) AS approval_rate
        FROM bots b FINAL
        LEFT JOIN reaction_agg rr ON b.id = rr.bot_id
        WHERE b.id = '${BOT_A1}'
      `);

      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].thumbs_up), 80);
      assert.equal(Number(rows[0].thumbs_down), 20);
      assert.equal(Number(rows[0].approval_rate), 80, "approval_rate should be 80% (80/(80+20)*100)");
    });
  });

  describe("getWeeklyTotals", () => {
    it("bot_share_pct = bot_reviews / (bot + human) * 100", async () => {
      const rows = await q<{ week: string; bot_reviews: string; human_reviews: string; bot_share_pct: string }>(ch, `
        SELECT
          formatDateTime(h.week, '%Y-%m-%d') AS week,
          COALESCE(b.bot_reviews, 0) AS bot_reviews,
          h.review_count AS human_reviews,
          round(if(h.review_count + COALESCE(b.bot_reviews, 0) > 0,
            COALESCE(b.bot_reviews, 0) * 100.0 / (h.review_count + COALESCE(b.bot_reviews, 0)), 0), 2) AS bot_share_pct
        FROM human_review_activity AS h FINAL
        LEFT JOIN (
          SELECT week, sum(review_count) AS bot_reviews
          FROM review_activity FINAL
          GROUP BY week
        ) b ON h.week = b.week
        WHERE h.week IN ('${W1}', '${W2}')
        ORDER BY h.week ASC
      `);

      assert.ok(rows.length >= 2, `Expected at least 2 rows, got ${rows.length}`);

      const w1 = rows.find(r => r.week === W1)!;
      const w2 = rows.find(r => r.week === W2)!;
      assert.ok(w1, `No row for ${W1}`);
      assert.ok(w2, `No row for ${W2}`);

      // W1: bot_reviews = 100 (A1) + 200 (B1) + 150 (B2) = 450, human = 1000
      // share = 450 / (450 + 1000) * 100 = 31.03
      assert.equal(Number(w1.bot_reviews), 450);
      assert.equal(Number(w1.human_reviews), 1000);
      assert.equal(Number(w1.bot_share_pct), 31.03);

      // W2: bot_reviews = 120 + 250 + 180 = 550, human = 1200
      // share = 550 / (550 + 1200) * 100 = 31.43
      assert.equal(Number(w2.bot_reviews), 550);
      assert.equal(Number(w2.human_reviews), 1200);
      assert.equal(Number(w2.bot_share_pct), 31.43);
    });
  });
});
