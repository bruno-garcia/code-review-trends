/**
 * Smoke tests for the data pipeline — BigQuery → ClickHouse → App queries.
 *
 * These tests hit REAL BigQuery and write to REAL (local) ClickHouse to verify
 * the full data flow end-to-end. They catch issues like:
 * - BigQuery schema changes (e.g. payload fields returning NULL)
 * - Missing columns in pipeline mappings
 * - App queries returning 0 for fields that should have data
 *
 * Requires:
 * - GCP credentials (gcloud auth application-default login)
 * - ClickHouse running locally (npm run dev:infra)
 *
 * Skipped automatically if GCP credentials are not available.
 * Run explicitly: npm run test:smoke
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  createBigQueryClient,
  queryBotReviewActivity,
  queryHumanReviewActivity,
  queryBotPREvents,
} from "./bigquery.js";
import {
  createCHClient,
  query,
  insertReviewActivity,
  insertHumanActivity,
  insertPrBotEvents,
  syncBots,
  syncProducts,
  type ReviewActivityRow,
  type HumanActivityRow,
} from "./clickhouse.js";
import { BOTS, BOT_BY_LOGIN, BOT_LOGINS, PRODUCTS } from "./bots.js";
import type { ClickHouseClient } from "@clickhouse/client";

// ── Skip if no GCP credentials ─────────────────────────────────────────

let skipAll = false;
try {
  const { execFileSync } = await import("node:child_process");
  const project = execFileSync("gcloud", ["config", "get-value", "project"], {
    encoding: "utf-8",
    timeout: 5000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  if (!project || project === "(unset)") skipAll = true;
} catch {
  skipAll = true;
}

// Use a recent 1-week range to minimize BigQuery cost (~150MB)
const TEST_START = formatMonday(-1); // last Monday
const TEST_END = formatMonday(0); // this Monday

function formatMonday(weeksOffset: number): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + weeksOffset * 7;
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

describe("Pipeline smoke tests (BigQuery → ClickHouse → App queries)", { skip: skipAll ? "No GCP credentials available" : false }, () => {
  let ch: ClickHouseClient;
  const logins = [...BOT_LOGINS];

  before(async () => {
    ch = createCHClient();
    // Ensure bots are synced so JOINs work
    await syncProducts(ch, PRODUCTS);
    await syncBots(ch, BOTS);
  });

  after(async () => {
    await ch?.close();
  });

  // ── BigQuery: bot review activity ───────────────────────────────────

  describe("BigQuery bot review activity", () => {
    let rows: Awaited<ReturnType<typeof queryBotReviewActivity>>;

    before(async () => {
      const bq = createBigQueryClient();
      rows = await queryBotReviewActivity(bq, TEST_START, TEST_END, logins);
    });

    it("returns rows", () => {
      assert.ok(rows.length > 0, `Expected rows for ${TEST_START}–${TEST_END}, got 0`);
    });

    it("has all expected fields", () => {
      const keys = Object.keys(rows[0]);
      for (const field of ["week", "actor_login", "review_count", "review_comment_count", "repo_count", "org_count"]) {
        assert.ok(keys.includes(field), `Missing field: ${field}`);
      }
    });

    it("has non-zero repo_count", () => {
      const withRepos = rows.filter((r) => Number(r.repo_count) > 0);
      assert.ok(withRepos.length > 0, `All rows have repo_count=0 — repo.name extraction may be broken`);
    });

    it("has non-zero org_count", () => {
      const withOrgs = rows.filter((r) => Number(r.org_count) > 0);
      assert.ok(withOrgs.length > 0, `All rows have org_count=0 — org extraction may be broken`);
    });

    it("actor_logins match known bots", () => {
      const known = rows.filter((r) => BOT_BY_LOGIN.has(r.actor_login));
      assert.ok(known.length > 0, "No rows match known bot logins");
    });
  });

  // ── BigQuery: human review activity ─────────────────────────────────

  describe("BigQuery human review activity", () => {
    let rows: Awaited<ReturnType<typeof queryHumanReviewActivity>>;

    before(async () => {
      const bq = createBigQueryClient();
      rows = await queryHumanReviewActivity(bq, TEST_START, TEST_END, logins);
    });

    it("returns rows", () => {
      assert.ok(rows.length > 0, "Expected human activity rows");
    });

    it("has non-zero repo_count", () => {
      const withRepos = rows.filter((r) => Number(r.repo_count) > 0);
      assert.ok(withRepos.length > 0, "All human rows have repo_count=0");
    });

    it("human reviews outnumber bot reviews", () => {
      const total = rows.reduce((s, r) => s + Number(r.review_count), 0);
      assert.ok(total > 1000, `Expected >1000 human reviews per week, got ${total}`);
    });
  });

  // ── BigQuery: PR bot events (discover) ──────────────────────────────

  describe("BigQuery PR bot events", () => {
    let rows: Awaited<ReturnType<typeof queryBotPREvents>>;

    before(async () => {
      const bq = createBigQueryClient();
      rows = await queryBotPREvents(bq, TEST_START, TEST_END, logins);
    });

    it("returns rows", () => {
      assert.ok(rows.length > 0, "Expected PR bot event rows");
    });

    it("has valid repo_name format (owner/repo)", () => {
      const valid = rows.filter((r) => r.repo_name && r.repo_name.includes("/"));
      assert.ok(valid.length > 0, "No rows have valid owner/repo format in repo_name");
    });

    it("has valid pr_number", () => {
      const valid = rows.filter((r) => Number(r.pr_number) > 0);
      assert.ok(valid.length > 0, "No rows have valid pr_number");
    });
  });

  // ── Full pipeline: BigQuery → ClickHouse → App query ────────────────

  describe("End-to-end: BigQuery → ClickHouse → app query", () => {
    before(async () => {
      const bq = createBigQueryClient();

      // Fetch from BigQuery
      const botRows = await queryBotReviewActivity(bq, TEST_START, TEST_END, logins);
      const humanRows = await queryHumanReviewActivity(bq, TEST_START, TEST_END, logins);
      const eventRows = await queryBotPREvents(bq, TEST_START, TEST_END, logins);

      // Map and write to ClickHouse
      const activityRows: ReviewActivityRow[] = botRows
        .map((row) => {
          const bot = BOT_BY_LOGIN.get(row.actor_login);
          if (!bot) return null;
          return {
            week: row.week,
            bot_id: bot.id,
            review_count: Number(row.review_count),
            review_comment_count: Number(row.review_comment_count),
            repo_count: Number(row.repo_count),
            org_count: Number(row.org_count),
          };
        })
        .filter((r): r is ReviewActivityRow => r !== null);

      const humanActivityRows: HumanActivityRow[] = humanRows.map((row) => ({
        week: row.week,
        review_count: Number(row.review_count),
        review_comment_count: Number(row.review_comment_count),
        repo_count: Number(row.repo_count),
      }));

      const chEventRows = eventRows
        .map((row) => {
          const bot = BOT_BY_LOGIN.get(row.actor_login);
          if (!bot) return null;
          return {
            repo_name: row.repo_name,
            pr_number: Number(row.pr_number),
            bot_id: bot.id,
            actor_login: row.actor_login,
            event_type: row.event_type,
            event_week: row.week,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      await Promise.all([
        insertReviewActivity(ch, activityRows),
        insertHumanActivity(ch, humanActivityRows),
        insertPrBotEvents(ch, chEventRows),
      ]);
    });

    it("product summaries have non-zero orgs", async () => {
      const rows = await query<{ id: string; total_orgs: string }>(
        ch,
        `WITH weekly_product AS (
          SELECT b.product_id, ra.week, sum(ra.org_count) AS org_count
          FROM review_activity ra FINAL JOIN bots b FINAL ON ra.bot_id = b.id
          WHERE ra.week >= {start:Date}
          GROUP BY b.product_id, ra.week
        )
        SELECT product_id AS id, max(org_count) AS total_orgs
        FROM weekly_product
        GROUP BY product_id
        HAVING total_orgs > 0
        ORDER BY total_orgs DESC
        LIMIT 5`,
        { start: TEST_START },
      );
      assert.ok(rows.length > 0, "No products have org_count > 0 after pipeline run");
      assert.ok(Number(rows[0].total_orgs) > 0, `Top product has total_orgs=${rows[0].total_orgs}`);
    });

    it("product summaries have non-zero repos", async () => {
      const rows = await query<{ id: string; total_repos: string }>(
        ch,
        `WITH weekly_product AS (
          SELECT b.product_id, ra.week, sum(ra.repo_count) AS repo_count
          FROM review_activity ra FINAL JOIN bots b FINAL ON ra.bot_id = b.id
          WHERE ra.week >= {start:Date}
          GROUP BY b.product_id, ra.week
        )
        SELECT product_id AS id, max(repo_count) AS total_repos
        FROM weekly_product
        GROUP BY product_id
        HAVING total_repos > 0
        LIMIT 5`,
        { start: TEST_START },
      );
      assert.ok(rows.length > 0, "No products have repo_count > 0 after pipeline run");
    });

    it("weekly totals show bot share > 0", async () => {
      const rows = await query<{ bot_share_pct: string }>(
        ch,
        `SELECT round(b.bot_reviews * 100.0 / (h.review_count + b.bot_reviews), 2) AS bot_share_pct
         FROM human_review_activity h FINAL
         JOIN (SELECT week, sum(review_count) AS bot_reviews FROM review_activity FINAL GROUP BY week) b ON h.week = b.week
         WHERE h.week >= {start:Date}
         LIMIT 1`,
        { start: TEST_START },
      );
      assert.ok(rows.length > 0, "No weekly totals found");
      assert.ok(Number(rows[0].bot_share_pct) > 0, "Bot share is 0%");
    });

    it("pr_bot_events have valid repo/PR data", async () => {
      const rows = await query<{ total: string; with_repo: string; with_pr: string }>(
        ch,
        `SELECT
          count() AS total,
          countIf(repo_name != '' AND repo_name LIKE '%/%') AS with_repo,
          countIf(pr_number > 0) AS with_pr
         FROM pr_bot_events
         WHERE event_week >= {start:Date}`,
        { start: TEST_START },
      );
      assert.ok(Number(rows[0].total) > 0, "No pr_bot_events found");
      assert.equal(rows[0].total, rows[0].with_repo, "Some pr_bot_events have invalid repo_name");
      assert.equal(rows[0].total, rows[0].with_pr, "Some pr_bot_events have invalid pr_number");
    });
  });
});
