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
    // Display fields (website, description, brand_color, avatar_url) live on
    // products — bots only store identity and product linkage.
    await ch.insert({
      table: "bots",
      values: [
        { id: BOT_A1, name: "Bot A1", product_id: PRODUCT_A },
        { id: BOT_B1, name: "Bot B1", product_id: PRODUCT_B },
        { id: BOT_B2, name: "Bot B2", product_id: PRODUCT_B },
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

    // pr_comments for reaction data (thumbs_up_rate test)
    // Bot A1: 80 thumbs_up, 20 thumbs_down → thumbs_up_rate = 80% (100 total reactions ≥ 30 threshold)
    // Also: 1 comment has reactions out of 1 total → reaction_rate = 100%
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

    // repos: two repos in __test_org, with different star counts
    await ch.insert({
      table: "repos",
      values: [
        { name: "__test_org/repo-alpha", owner: "__test_org", stars: 5000, primary_language: "TypeScript", fork: false, archived: false, fetch_status: "ok" },
        { name: "__test_org/repo-beta", owner: "__test_org", stars: 3000, primary_language: "Python", fork: false, archived: false, fetch_status: "ok" },
      ],
      format: "JSONEachRow",
    });

    // pr_bot_events: bot_a1 reviewed PRs in both repos
    // This populates the pr_bot_event_counts materialized view automatically.
    await ch.insert({
      table: "pr_bot_events",
      values: [
        { repo_name: "__test_org/repo-alpha", pr_number: 1, bot_id: BOT_A1, actor_login: "test-bot-a1", event_type: "review", event_week: W1 },
        { repo_name: "__test_org/repo-alpha", pr_number: 2, bot_id: BOT_A1, actor_login: "test-bot-a1", event_type: "review", event_week: W1 },
        { repo_name: "__test_org/repo-beta", pr_number: 3, bot_id: BOT_A1, actor_login: "test-bot-a1", event_type: "review", event_week: W2 },
      ],
      format: "JSONEachRow",
    });

    // --- Additional test data for org queries with reactions ---

    // pr_bot_reactions: bot_b1 reacted to PRs in __test_org repos.
    // PR 10 in repo-alpha: only a reaction (no event) → reaction-only PR
    // PR 1 in repo-alpha: has both event (bot_a1) and reaction (bot_b1) → NOT reaction-only for bot_b1
    await ch.insert({
      table: "pr_bot_reactions",
      values: [
        { repo_name: "__test_org/repo-alpha", pr_number: 10, bot_id: BOT_B1, reaction_type: "hooray", reacted_at: "2020-01-08 12:00:00", reaction_id: 990001 },
        { repo_name: "__test_org/repo-alpha", pr_number: 11, bot_id: BOT_B1, reaction_type: "hooray", reacted_at: "2020-01-08 13:00:00", reaction_id: 990002 },
        { repo_name: "__test_org/repo-beta", pr_number: 20, bot_id: BOT_B1, reaction_type: "hooray", reacted_at: "2020-01-09 10:00:00", reaction_id: 990003 },
        // This reaction IS reaction-only for bot_b1 (bot_b1 has no event on PR 1).
        // However, it is NOT *exclusive* because bot_a1 has events on PR 1,
        // so it won't appear in exclusive_pr_count (used by getOrgSummary/getOrgRepos).
        // It WILL appear in getOrgProducts (per-bot NOT EXISTS check).
        { repo_name: "__test_org/repo-alpha", pr_number: 1, bot_id: BOT_B1, reaction_type: "hooray", reacted_at: "2020-01-07 14:00:00", reaction_id: 990004 },
      ],
      format: "JSONEachRow",
    });

    // reaction_only_repo_counts: manually insert what the MV would compute.
    // The MV is REFRESH EVERY 30 MINUTE so it won't auto-populate in tests.
    // bot_b1 in repo-alpha: 2 reaction-only PRs (10, 11), both exclusive (no bot events on those PRs)
    // bot_b1 in repo-beta: 1 reaction-only PR (20), exclusive
    // bot_b1 reaction on PR 1 in repo-alpha: NOT counted because bot_a1 has events there
    await ch.insert({
      table: "reaction_only_repo_counts",
      values: [
        { repo_name: "__test_org/repo-alpha", bot_id: BOT_B1, pr_count: 2, exclusive_pr_count: 2 },
        { repo_name: "__test_org/repo-beta", bot_id: BOT_B1, pr_count: 1, exclusive_pr_count: 1 },
      ],
      format: "JSONEachRow",
    });

    // pull_requests: for getPrCharacteristics tests
    // PRs reviewed by bot_a1 (product_a): PR 1, 2 in repo-alpha, PR 3 in repo-beta
    await ch.insert({
      table: "pull_requests",
      values: [
        {
          repo_name: "__test_org/repo-alpha", pr_number: 1, title: "feat: add feature",
          author: "dev1", state: "merged",
          created_at: "2020-01-06 10:00:00", merged_at: "2020-01-06 14:00:00",
          additions: 100, deletions: 20, changed_files: 5,
        },
        {
          repo_name: "__test_org/repo-alpha", pr_number: 2, title: "fix: bug fix",
          author: "dev2", state: "merged",
          created_at: "2020-01-07 08:00:00", merged_at: "2020-01-07 20:00:00",
          additions: 50, deletions: 10, changed_files: 3,
        },
        {
          repo_name: "__test_org/repo-beta", pr_number: 3, title: "chore: update deps",
          author: "dev1", state: "closed",
          created_at: "2020-01-14 09:00:00",
          additions: 200, deletions: 100, changed_files: 8,
        },
      ],
      format: "JSONEachRow",
    });

    // pr_comments in __test_org repos (for org summary comment counts)
    await ch.insert({
      table: "pr_comments",
      values: [
        { repo_name: "__test_org/repo-alpha", pr_number: 1, comment_id: 900010, bot_id: BOT_A1, body_length: 200, created_at: "2020-01-07 11:00:00", thumbs_up: 5, thumbs_down: 1, heart: 2 },
        { repo_name: "__test_org/repo-alpha", pr_number: 2, comment_id: 900011, bot_id: BOT_A1, body_length: 150, created_at: "2020-01-07 12:00:00", thumbs_up: 3, thumbs_down: 0, heart: 1 },
        { repo_name: "__test_org/repo-beta", pr_number: 3, comment_id: 900012, bot_id: BOT_A1, body_length: 100, created_at: "2020-01-14 10:00:00", thumbs_up: 2, thumbs_down: 2, heart: 0 },
      ],
      format: "JSONEachRow",
    });

    // OPTIMIZE all tables (with retry — ClickHouse can transiently fail
    // with "Cancelled merging parts" when background merges are in progress,
    // especially in CI right after bulk inserts).
    async function optimizeWithRetry(table: string, retries = 5): Promise<void> {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await ch.command({ query: `OPTIMIZE TABLE ${table} FINAL` });
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt < retries && msg.includes("merging")) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          throw err;
        }
      }
    }

    for (const table of [
      "products", "bots", "bot_logins", "review_activity",
      "human_review_activity", "pr_comments", "reaction_only_review_counts",
      "repos", "pr_bot_events", "pr_bot_event_counts",
      "pr_bot_reactions", "reaction_only_repo_counts", "pull_requests",
    ]) {
      await optimizeWithRetry(table);
    }
  });

  after(async () => {
    // Clean up test data
    const deletes = [
      `ALTER TABLE products DELETE WHERE id LIKE '__test_%'`,
      `ALTER TABLE bots DELETE WHERE id LIKE '__test_%'`,
      `ALTER TABLE bot_logins DELETE WHERE bot_id LIKE '__test_%'`,
      `ALTER TABLE review_activity DELETE WHERE bot_id LIKE '__test_%'`,
      // human_review_activity has no bot_id or test marker — delete by week.
      // These 2020 dates are safely before the 2023 data epoch.
      `ALTER TABLE human_review_activity DELETE WHERE week IN ('${W1}','${W2}','${W3}','${W4}')`,
      `ALTER TABLE pr_comments DELETE WHERE bot_id LIKE '__test_%'`,
      `ALTER TABLE pr_comments DELETE WHERE repo_name LIKE '__test_%'`,
      `ALTER TABLE reaction_only_review_counts DELETE WHERE bot_id LIKE '__test_%'`,
      `ALTER TABLE repos DELETE WHERE name LIKE '__test_%'`,
      `ALTER TABLE pr_bot_events DELETE WHERE repo_name LIKE '__test_%'`,
      `ALTER TABLE pr_bot_event_counts DELETE WHERE repo_name LIKE '__test_%'`,
      `ALTER TABLE pr_bot_reactions DELETE WHERE repo_name LIKE '__test_%'`,
      `ALTER TABLE reaction_only_repo_counts DELETE WHERE repo_name LIKE '__test_%'`,
      `ALTER TABLE pull_requests DELETE WHERE repo_name LIKE '__test_%'`,
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
    it("thumbs_up_rate = thumbs_up / (thumbs_up + thumbs_down) * 100 when ≥ 30 reactions", async () => {
      const rows = await q<{ id: string; thumbs_up_rate: string; thumbs_up: string; thumbs_down: string }>(ch, `
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
          if((COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)) >= 30,
            round(COALESCE(rr.thumbs_up, 0) * 100.0 / (COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)), 1),
            -1) AS thumbs_up_rate
        FROM bots b FINAL
        LEFT JOIN reaction_agg rr ON b.id = rr.bot_id
        WHERE b.id = '${BOT_A1}'
      `);

      assert.equal(rows.length, 1);
      // Original comment: thumbs_up=80, thumbs_down=20
      // Org comments: thumbs_up=5+3+2=10, thumbs_down=1+0+2=3
      // Total: thumbs_up=90, thumbs_down=23
      assert.equal(Number(rows[0].thumbs_up), 90);
      assert.equal(Number(rows[0].thumbs_down), 23);
      // thumbs_up_rate = 90 / (90+23) * 100 = 79.6% (113 total ≥ 30 threshold)
      assert.equal(Number(rows[0].thumbs_up_rate), 79.6, "thumbs_up_rate should be 90/(90+23)*100");
    });

    it("thumbs_up_rate = -1 when fewer than 30 reactions", async () => {
      const rows = await q<{ thumbs_up_rate: string }>(ch, `
        SELECT
          if((10 + 5) >= 30,
            round(10 * 100.0 / (10 + 5), 1),
            -1) AS thumbs_up_rate
      `);
      assert.equal(Number(rows[0].thumbs_up_rate), -1, "thumbs_up_rate should be -1 (N/A) when < 30 reactions");
    });

    it("display fields (website, brand_color, avatar_url, description) come from products table", async () => {
      // getBotSummaries JOINs products — verify display fields are read from products, not bots.
      // The test setup inserts bots WITHOUT display fields, so only products have the values.
      const rows = await q<{ id: string; website: string; brand_color: string; description: string; avatar_url: string }>(ch, `
        SELECT
          b.id AS id,
          p.website AS website,
          p.description AS description,
          p.brand_color AS brand_color,
          p.avatar_url AS avatar_url
        FROM bots AS b
        JOIN products p ON b.product_id = p.id
        WHERE b.id = '${BOT_A1}'
      `);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].website, "https://a.test", "website should come from products table");
      assert.equal(rows[0].brand_color, "#aaa", "brand_color should come from products table");
      assert.equal(rows[0].description, "Product A desc", "description should come from products table");
    });
  });

  describe("getProductBots", () => {
    it("brand_color comes from products table, not bots", async () => {
      // getProductBots JOINs products for brand_color. Bots no longer store display fields.
      const rows = await q<{ id: string; brand_color: string; github_login: string }>(ch, `
        SELECT
          b.id AS id,
          p.brand_color AS brand_color,
          bl.github_login AS github_login
        FROM bots b
        JOIN products p ON b.product_id = p.id
        LEFT JOIN (
          SELECT bot_id, min(github_login) AS github_login
          FROM bot_logins
          GROUP BY bot_id
        ) bl ON b.id = bl.bot_id
        WHERE b.product_id = '${PRODUCT_B}'
        ORDER BY b.id
      `);
      assert.equal(rows.length, 2, "Product B should have 2 bots");
      assert.equal(rows[0].brand_color, "#bbb", "brand_color should come from products table");
      assert.equal(rows[1].brand_color, "#bbb", "brand_color should come from products table");
      assert.equal(rows[0].github_login, "test-bot-b1");
      assert.equal(rows[1].github_login, "test-bot-b2");
    });

    it("INNER JOIN excludes bots with missing product (data integrity)", async () => {
      // Insert an orphan bot with no matching product to verify it's excluded
      await ch.insert({
        table: "bots",
        values: [{ id: "__test_orphan_bot", name: "Orphan", product_id: "__test_no_such_product" }],
        format: "JSONEachRow",
      });
      const rows = await q<{ id: string }>(ch, `
        SELECT b.id AS id
        FROM bots b
        JOIN products p ON b.product_id = p.id
        WHERE b.id = '__test_orphan_bot'
      `);
      assert.equal(rows.length, 0, "Orphan bot with no matching product should be excluded by INNER JOIN");
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

  // Regression: ClickHouse disambiguates column names when JOINed tables share
  // a column name. Without explicit AS aliases, "SELECT r.name" returns the JSON
  // key "r.name" instead of "name" when repos is joined with bots (both have a
  // "name" column). This caused links to render as https://github.com/undefined.
  describe("getTopReposByProduct — column alias regression", () => {
    it("returns 'name' and 'owner' keys (not 'r.name', 'r.owner')", async () => {
      // This is the exact query from getTopReposByProduct in clickhouse.ts.
      // The JOIN repos+bots creates column ambiguity on "name".
      const rows = await q<Record<string, unknown>>(ch, `
        SELECT
          r.name AS name,
          r.owner AS owner,
          r.stars AS stars,
          r.primary_language AS primary_language,
          uniqExactMerge(s.pr_count) AS pr_count
        FROM pr_bot_event_counts s
        JOIN bots b ON s.bot_id = b.id
        JOIN repos r ON s.repo_name = r.name
        WHERE b.product_id = '${PRODUCT_A}'
          AND r.fetch_status = 'ok'
        GROUP BY r.name, r.owner, r.stars, r.primary_language
        ORDER BY r.stars DESC
      `);

      assert.ok(rows.length > 0, "Should return repos for test product");

      // Verify JSON keys are correct (the actual regression)
      const first = rows[0];
      assert.ok("name" in first, "Result should have 'name' key");
      assert.ok("owner" in first, "Result should have 'owner' key");
      assert.ok("stars" in first, "Result should have 'stars' key");
      assert.ok("primary_language" in first, "Result should have 'primary_language' key");
      assert.ok("pr_count" in first, "Result should have 'pr_count' key");
      assert.ok(!("r.name" in first), "Should NOT have 'r.name' key — missing AS alias");
      assert.ok(!("r.owner" in first), "Should NOT have 'r.owner' key — missing AS alias");

      // Verify actual values
      assert.equal(first.name, "__test_org/repo-alpha", "First repo should be repo-alpha (5000 stars)");
      assert.equal(first.owner, "__test_org");
      assert.equal(Number(first.stars), 5000);
      assert.equal(first.primary_language, "TypeScript");
      assert.equal(Number(first.pr_count), 2, "repo-alpha has 2 distinct PRs");

      // Second repo
      assert.equal(rows.length, 2);
      assert.equal(rows[1].name, "__test_org/repo-beta");
      assert.equal(Number(rows[1].pr_count), 1, "repo-beta has 1 PR");
    });

    it("without AS aliases, ClickHouse returns prefixed keys for ambiguous columns", async () => {
      // Proves the bug: when repos and bots are JOINed, both have "name",
      // so ClickHouse disambiguates by prefixing with the table alias.
      // This test documents the ClickHouse behavior that caused the bug.
      const rows = await q<Record<string, unknown>>(ch, `
        SELECT
          r.name,
          r.owner
        FROM pr_bot_event_counts s
        JOIN bots b ON s.bot_id = b.id
        JOIN repos r ON s.repo_name = r.name
        WHERE b.product_id = '${PRODUCT_A}'
          AND r.fetch_status = 'ok'
        GROUP BY r.name, r.owner
        LIMIT 1
      `);

      assert.ok(rows.length > 0, "Should return at least one row");
      const keys = Object.keys(rows[0]);
      // "name" is ambiguous (repos.name vs bots.name), so ClickHouse returns "r.name".
      // "owner" is unambiguous (only repos has it), so ClickHouse returns "owner".
      assert.ok(
        keys.includes("r.name"),
        `Expected 'r.name' in keys when AS alias is missing (got: ${keys.join(", ")})`,
      );
      assert.ok(
        keys.includes("owner"),
        `Unambiguous column 'owner' should not be prefixed (got: ${keys.join(", ")})`,
      );
    });
  });

  describe("getOrgRepos — column alias consistency", () => {
    it("returns 'name', 'stars', 'primary_language' keys", async () => {
      // This is the core SELECT from getOrgRepos in clickhouse.ts.
      const rows = await q<Record<string, unknown>>(ch, `
        SELECT
          r.name AS name,
          r.stars AS stars,
          r.primary_language AS primary_language
        FROM repos r
        WHERE r.fetch_status = 'ok' AND r.owner = '__test_org'
        ORDER BY r.stars DESC
      `);

      assert.ok(rows.length === 2, `Expected 2 repos, got ${rows.length}`);

      const first = rows[0];
      assert.ok("name" in first, "Result should have 'name' key");
      assert.ok("stars" in first, "Result should have 'stars' key");
      assert.ok("primary_language" in first, "Result should have 'primary_language' key");
      assert.ok(!("r.name" in first), "Should NOT have 'r.name' key");

      assert.equal(first.name, "__test_org/repo-alpha");
      assert.equal(Number(first.stars), 5000);
      assert.equal(first.primary_language, "TypeScript");
    });
  });

  // ─── Org queries with reaction-only reviews ────────────────────────────

  describe("getOrgSummary — includes reaction-only PRs", () => {
    it("total_prs = event PRs + exclusive reaction-only PRs", async () => {
      // Mirrors the query from getOrgSummary in clickhouse.ts.
      // __test_org has:
      //   - 3 event PRs from bot_a1 (PR 1, 2 in repo-alpha, PR 3 in repo-beta)
      //   - 3 exclusive reaction-only PRs from bot_b1 (PR 10, 11 in repo-alpha, PR 20 in repo-beta)
      //   - 1 non-exclusive reaction (PR 1 already has event) → not counted
      // total_prs = 3 + 3 = 6
      const rows = await q<{
        owner: string; total_stars: string; repo_count: string;
        total_prs: string; total_bot_comments: string;
        thumbs_up: string; thumbs_down: string; heart: string;
      }>(ch, `
        SELECT
          r.owner AS owner,
          sum(r.stars) AS total_stars,
          count() AS repo_count,
          groupUniqArray(r.primary_language) AS languages,
          COALESCE(any(ev.event_prs), 0) + COALESCE(any(rr.exclusive_reaction_prs), 0) AS total_prs,
          COALESCE(any(cm.total_bot_comments), 0) AS total_bot_comments,
          COALESCE(any(cm.thumbs_up), 0) AS thumbs_up,
          COALESCE(any(cm.thumbs_down), 0) AS thumbs_down,
          COALESCE(any(cm.heart), 0) AS heart
        FROM repos r
        LEFT JOIN (
          SELECT r2.owner,
            countDistinct(e.repo_name, e.pr_number) AS event_prs
          FROM pr_bot_events e
          JOIN repos r2 ON e.repo_name = r2.name
          WHERE r2.owner = '__test_org' AND r2.fetch_status = 'ok'
          GROUP BY r2.owner
        ) ev ON r.owner = ev.owner
        LEFT JOIN (
          SELECT r2.owner,
            sum(repo_exclusive) AS exclusive_reaction_prs
          FROM (
            SELECT rrc.repo_name,
              max(rrc.exclusive_pr_count) AS repo_exclusive
            FROM reaction_only_repo_counts rrc
            WHERE rrc.repo_name IN (SELECT name FROM repos WHERE owner = '__test_org' AND fetch_status = 'ok')
            GROUP BY rrc.repo_name
          ) repo_agg
          JOIN repos r2 ON repo_agg.repo_name = r2.name
          GROUP BY r2.owner
        ) rr ON r.owner = rr.owner
        LEFT JOIN (
          SELECT
            r3.owner,
            countIf(c.comment_id > 0) AS total_bot_comments,
            sumIf(c.thumbs_up, c.comment_id > 0) AS thumbs_up,
            sumIf(c.thumbs_down, c.comment_id > 0) AS thumbs_down,
            sumIf(c.heart, c.comment_id > 0) AS heart
          FROM pr_comments c
          JOIN repos r3 ON c.repo_name = r3.name
          WHERE r3.owner = '__test_org' AND r3.fetch_status = 'ok'
          GROUP BY r3.owner
        ) cm ON r.owner = cm.owner
        WHERE r.fetch_status = 'ok' AND r.owner = '__test_org'
        GROUP BY r.owner
      `);

      assert.equal(rows.length, 1, "Should return exactly one org");
      const org = rows[0];
      assert.equal(org.owner, "__test_org");
      assert.equal(Number(org.total_stars), 8000, "5000 + 3000 stars");
      assert.equal(Number(org.repo_count), 2);

      // 3 event PRs + 3 exclusive reaction-only PRs = 6
      assert.equal(Number(org.total_prs), 6, "event PRs (3) + exclusive reaction PRs (3)");

      // 3 bot comments from pr_comments inserts (in __test_org repos)
      assert.equal(Number(org.total_bot_comments), 3);
      assert.equal(Number(org.thumbs_up), 10, "5 + 3 + 2 = 10");
      assert.equal(Number(org.thumbs_down), 3, "1 + 0 + 2 = 3");
      assert.equal(Number(org.heart), 3, "2 + 1 + 0 = 3");
    });
  });

  describe("getOrgRepos — includes reaction-only PRs per repo", () => {
    it("pr_count = event PRs + exclusive reaction-only PRs per repo", async () => {
      // Mirrors getOrgRepos query from clickhouse.ts.
      const rows = await q<{
        name: string; stars: string; primary_language: string;
        pr_count: string; bot_comment_count: string;
      }>(ch, `
        SELECT
          r.name AS name,
          r.stars AS stars,
          r.primary_language AS primary_language,
          COALESCE(ev.event_prs, 0) + COALESCE(rr.exclusive_reaction_prs, 0) AS pr_count,
          COALESCE(cm.bot_comment_count, 0) AS bot_comment_count
        FROM repos r
        LEFT JOIN (
          SELECT repo_name, countDistinct(pr_number) AS event_prs
          FROM pr_bot_events
          WHERE repo_name IN (SELECT name FROM repos WHERE owner = '__test_org' AND fetch_status = 'ok')
          GROUP BY repo_name
        ) ev ON r.name = ev.repo_name
        LEFT JOIN (
          SELECT repo_name,
            max(exclusive_pr_count) AS exclusive_reaction_prs
          FROM reaction_only_repo_counts
          WHERE repo_name IN (SELECT name FROM repos WHERE owner = '__test_org' AND fetch_status = 'ok')
          GROUP BY repo_name
        ) rr ON r.name = rr.repo_name
        LEFT JOIN (
          SELECT repo_name, countIf(comment_id > 0) AS bot_comment_count
          FROM pr_comments
          WHERE repo_name IN (SELECT name FROM repos WHERE owner = '__test_org' AND fetch_status = 'ok')
          GROUP BY repo_name
        ) cm ON r.name = cm.repo_name
        WHERE r.fetch_status = 'ok' AND r.owner = '__test_org'
        ORDER BY r.stars DESC
      `);

      assert.equal(rows.length, 2);

      // repo-alpha: 2 event PRs (1, 2) + 2 exclusive reaction PRs (10, 11) = 4
      const alpha = rows.find(r => r.name === "__test_org/repo-alpha")!;
      assert.ok(alpha, "repo-alpha should exist");
      assert.equal(Number(alpha.pr_count), 4, "repo-alpha: 2 event + 2 reaction-only = 4");
      assert.equal(Number(alpha.bot_comment_count), 2, "repo-alpha: 2 comments");

      // repo-beta: 1 event PR (3) + 1 exclusive reaction PR (20) = 2
      const beta = rows.find(r => r.name === "__test_org/repo-beta")!;
      assert.ok(beta, "repo-beta should exist");
      assert.equal(Number(beta.pr_count), 2, "repo-beta: 1 event + 1 reaction-only = 2");
      assert.equal(Number(beta.bot_comment_count), 1, "repo-beta: 1 comment");
    });
  });

  describe("getOrgProducts — includes reaction-only products", () => {
    it("shows both event-based and reaction-only products with correct PR counts", async () => {
      // Mirrors getOrgProducts from clickhouse.ts.
      // Product A (bot_a1): 3 event PRs
      // Product B (bot_b1): 3 reaction-only PRs + 1 reaction on existing event PR (PR 1)
      // The reaction on PR 1 should be excluded by NOT EXISTS (bot_b1 has no event on PR 1,
      // but bot_a1 does — however the NOT EXISTS checks per-bot, so bot_b1's reaction on PR 1
      // IS reaction-only for bot_b1 since bot_b1 has no event on PR 1)
      const rows = await q<{
        product_id: string; product_name: string; pr_count: string; event_count: string;
      }>(ch, `
        SELECT
          product_id,
          any(product_name) AS product_name,
          any(brand_color) AS brand_color,
          any(avatar_url) AS avatar_url,
          countDistinct(repo_name, pr_number) AS pr_count,
          sum(is_event) AS event_count
        FROM (
          SELECT p.id AS product_id, p.name AS product_name,
            p.brand_color AS brand_color, p.avatar_url AS avatar_url,
            e.repo_name AS repo_name, e.pr_number AS pr_number, 1 AS is_event
          FROM pr_bot_events e
          JOIN repos r ON e.repo_name = r.name
          JOIN bots b ON e.bot_id = b.id
          JOIN products p ON b.product_id = p.id
          WHERE r.fetch_status = 'ok' AND r.owner = '__test_org'
          UNION ALL
          SELECT p.id AS product_id, p.name AS product_name,
            p.brand_color AS brand_color, p.avatar_url AS avatar_url,
            rx.repo_name AS repo_name, rx.pr_number AS pr_number, 0 AS is_event
          FROM pr_bot_reactions rx FINAL
          JOIN repos r ON rx.repo_name = r.name
          JOIN bots b ON rx.bot_id = b.id
          JOIN products p ON b.product_id = p.id
          WHERE rx.reaction_type = 'hooray'
            AND r.fetch_status = 'ok' AND r.owner = '__test_org'
            AND NOT EXISTS (
              SELECT 1 FROM pr_bot_events e
              WHERE e.repo_name = rx.repo_name AND e.pr_number = rx.pr_number AND e.bot_id = rx.bot_id
            )
        )
        GROUP BY product_id
        ORDER BY pr_count DESC
      `);

      // Both products should appear
      assert.ok(rows.length >= 2, `Expected at least 2 products, got ${rows.length}`);

      const prodA = rows.find(r => r.product_id === PRODUCT_A)!;
      assert.ok(prodA, "Product A should appear (has events)");
      assert.equal(Number(prodA.pr_count), 3, "Product A: 3 distinct event PRs");
      assert.equal(Number(prodA.event_count), 3, "Product A: 3 events");

      const prodB = rows.find(r => r.product_id === PRODUCT_B)!;
      assert.ok(prodB, "Product B should appear (reaction-only)");
      // bot_b1 has reactions on PR 10, 11, 20 (reaction-only) + PR 1 (also reaction-only for bot_b1)
      assert.equal(Number(prodB.pr_count), 4, "Product B: 4 reaction-only PRs (10, 11, 20, 1)");
      assert.equal(Number(prodB.event_count), 0, "Product B: 0 events (all reaction-only)");
    });
  });

  describe("getOrgList — with product filter and reactions", () => {
    it("returns org with correct totals when filtered by product", async () => {
      // Mirrors the getOrgList query filtered by product.
      // When filtered by PRODUCT_A, only event-based PRs should count.
      const rows = await q<{
        owner: string; total_stars: string; repo_count: string;
        total_prs: string; product_ids: string[];
      }>(ch, `
        SELECT
          r.owner AS owner,
          sum(r.stars) AS total_stars,
          count() AS repo_count,
          groupUniqArray(r.primary_language) AS languages,
          COALESCE(any(pr.total_prs), 0) + COALESCE(any(rr.exclusive_reaction_prs), 0) AS total_prs,
          arrayDistinct(arrayConcat(
            COALESCE(any(pr.product_ids), []),
            COALESCE(any(rr.reaction_product_ids), [])
          )) AS product_ids
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
            WHERE b.product_id IN ('${PRODUCT_A}')
            GROUP BY s.repo_name
          ) repo_agg
          JOIN repos r2 ON repo_agg.repo_name = r2.name
          WHERE r2.fetch_status = 'ok'
          GROUP BY r2.owner
        ) pr ON r.owner = pr.owner
        LEFT JOIN (
          SELECT r2.owner,
            sum(repo_agg.repo_exclusive) AS exclusive_reaction_prs,
            sum(repo_agg.repo_activity) AS reaction_activity,
            arrayDistinct(arrayFlatten(groupArray(repo_agg.repo_product_ids))) AS reaction_product_ids
          FROM (
            SELECT rrc.repo_name,
              max(rrc.exclusive_pr_count) AS repo_exclusive,
              sum(rrc.pr_count) AS repo_activity,
              groupUniqArray(b.product_id) AS repo_product_ids
            FROM reaction_only_repo_counts rrc
            JOIN bots b ON rrc.bot_id = b.id
            WHERE 1=1
              AND b.product_id IN ('${PRODUCT_A}')
            GROUP BY rrc.repo_name
          ) repo_agg
          JOIN repos r2 ON repo_agg.repo_name = r2.name
          WHERE r2.fetch_status = 'ok'
          GROUP BY r2.owner
        ) rr ON r.owner = rr.owner
        WHERE r.fetch_status = 'ok' AND r.owner = '__test_org'
        GROUP BY r.owner
        HAVING (COALESCE(any(pr.total_prs), 0) > 0 OR COALESCE(any(rr.reaction_activity), 0) > 0)
      `);

      assert.equal(rows.length, 1, "Should return __test_org");
      const org = rows[0];
      // PRODUCT_A has only events (3 PRs), no reactions in reaction_only_repo_counts
      assert.equal(Number(org.total_prs), 3, "Filtered by product A: only 3 event PRs");
      assert.ok(org.product_ids.includes(PRODUCT_A), "product_ids should include product A");
    });

    it("search filter works with ILIKE", async () => {
      // Use exact test org name — real repos exist with patterns like "*test-org*"
      const rows = await q<{ owner: string }>(ch, `
        SELECT r.owner AS owner,
          sum(r.stars) AS total_stars,
          count() AS repo_count
        FROM repos r
        WHERE r.fetch_status = 'ok' AND r.owner ILIKE '__test\\_org'
        GROUP BY r.owner
      `);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].owner, "__test_org");
    });
  });

  // ─── getPrCharacteristics ─────────────────────────────────────────────

  describe("getPrCharacteristics", () => {
    it("returns correct averages for PRs reviewed by a product", async () => {
      // Product A (bot_a1) reviewed PRs 1, 2, 3.
      // PR 1: additions=100, deletions=20, changed_files=5, merged (4h to merge)
      // PR 2: additions=50,  deletions=10, changed_files=3, merged (12h to merge)
      // PR 3: additions=200, deletions=100, changed_files=8, closed (not merged)
      const rows = await q<{
        sampled_prs: string; avg_additions: string; avg_deletions: string;
        avg_changed_files: string; merge_rate: string; avg_hours_to_merge: string;
      }>(ch, `
        SELECT
          count() AS sampled_prs,
          round(avg(p.additions), 0) AS avg_additions,
          round(avg(p.deletions), 0) AS avg_deletions,
          round(avg(p.changed_files), 1) AS avg_changed_files,
          round(countIf(p.state = 'merged') * 100.0 / count(), 1) AS merge_rate,
          round(avg(if(p.state = 'merged' AND p.merged_at IS NOT NULL,
            dateDiff('hour', p.created_at, p.merged_at), NULL)), 1) AS avg_hours_to_merge
        FROM (
          SELECT DISTINCT e.repo_name, e.pr_number
          FROM pr_bot_events e
          JOIN bots b ON e.bot_id = b.id
          WHERE b.product_id = '${PRODUCT_A}'
        ) AS de
        JOIN pull_requests p ON de.repo_name = p.repo_name AND de.pr_number = p.pr_number
      `);

      assert.equal(rows.length, 1);
      const r = rows[0];
      assert.equal(Number(r.sampled_prs), 3, "3 PRs reviewed by product A");

      // avg additions: (100 + 50 + 200) / 3 = 116.67 → rounds to 117
      assert.equal(Number(r.avg_additions), 117);

      // avg deletions: (20 + 10 + 100) / 3 = 43.33 → rounds to 43
      assert.equal(Number(r.avg_deletions), 43);

      // avg changed_files: (5 + 3 + 8) / 3 = 5.333 → rounds to 5.3
      assert.equal(Number(r.avg_changed_files), 5.3);

      // merge_rate: 2 merged out of 3 = 66.7%
      assert.equal(Number(r.merge_rate), 66.7);

      // avg_hours_to_merge: only merged PRs → (4 + 12) / 2 = 8.0
      assert.equal(Number(r.avg_hours_to_merge), 8);
    });

    it("returns zero sampled_prs for product with no pull_requests data", async () => {
      // Product B bots have no entries in pull_requests table
      const rows = await q<{ sampled_prs: string }>(ch, `
        SELECT count() AS sampled_prs
        FROM (
          SELECT DISTINCT e.repo_name, e.pr_number
          FROM pr_bot_events e
          JOIN bots b ON e.bot_id = b.id
          WHERE b.product_id = '${PRODUCT_B}'
        ) AS de
        JOIN pull_requests p ON de.repo_name = p.repo_name AND de.pr_number = p.pr_number
      `);

      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].sampled_prs), 0, "Product B has no PR events → 0 sampled PRs");
    });
  });

  // ─── getTopReposByProduct — correctness ───────────────────────────────

  describe("getTopReposByProduct — correctness", () => {
    it("returns repos ordered by stars with correct PR counts", async () => {
      const rows = await q<{
        name: string; owner: string; stars: string;
        primary_language: string; pr_count: string;
      }>(ch, `
        SELECT
          r.name AS name,
          r.owner AS owner,
          r.stars AS stars,
          r.primary_language AS primary_language,
          uniqExactMerge(s.pr_count) AS pr_count
        FROM pr_bot_event_counts s
        JOIN bots b ON s.bot_id = b.id
        JOIN repos r ON s.repo_name = r.name
        WHERE b.product_id = '${PRODUCT_A}'
          AND r.fetch_status = 'ok'
        GROUP BY r.name, r.owner, r.stars, r.primary_language
        ORDER BY r.stars DESC
        LIMIT 5
      `);

      assert.equal(rows.length, 2, "Two repos have events for product A");

      // First: repo-alpha (5000 stars) with 2 PRs
      assert.equal(rows[0].name, "__test_org/repo-alpha");
      assert.equal(Number(rows[0].stars), 5000);
      assert.equal(Number(rows[0].pr_count), 2, "repo-alpha has PR 1 and PR 2");
      assert.equal(rows[0].primary_language, "TypeScript");

      // Second: repo-beta (3000 stars) with 1 PR
      assert.equal(rows[1].name, "__test_org/repo-beta");
      assert.equal(Number(rows[1].stars), 3000);
      assert.equal(Number(rows[1].pr_count), 1, "repo-beta has PR 3");
      assert.equal(rows[1].primary_language, "Python");
    });

    it("respects LIMIT parameter", async () => {
      const rows = await q<{ name: string }>(ch, `
        SELECT
          r.name AS name,
          r.owner AS owner,
          r.stars AS stars,
          r.primary_language AS primary_language,
          uniqExactMerge(s.pr_count) AS pr_count
        FROM pr_bot_event_counts s
        JOIN bots b ON s.bot_id = b.id
        JOIN repos r ON s.repo_name = r.name
        WHERE b.product_id = '${PRODUCT_A}'
          AND r.fetch_status = 'ok'
        GROUP BY r.name, r.owner, r.stars, r.primary_language
        ORDER BY r.stars DESC
        LIMIT 1
      `);

      assert.equal(rows.length, 1, "Should respect LIMIT 1");
      assert.equal(rows[0].name, "__test_org/repo-alpha");
    });

    it("returns empty for product with no events", async () => {
      const rows = await q<{ name: string }>(ch, `
        SELECT
          r.name AS name,
          uniqExactMerge(s.pr_count) AS pr_count
        FROM pr_bot_event_counts s
        JOIN bots b ON s.bot_id = b.id
        JOIN repos r ON s.repo_name = r.name
        WHERE b.product_id = 'nonexistent_product'
          AND r.fetch_status = 'ok'
        GROUP BY r.name
        LIMIT 5
      `);

      assert.equal(rows.length, 0, "No repos for nonexistent product");
    });
  });
});
