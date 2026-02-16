/**
 * App query integration tests.
 *
 * Loads captured pipeline fixture data into ClickHouse and runs every
 * app query to verify non-zero values for columns the UI renders.
 *
 * This catches:
 * - Missing FINAL on ReplacingMergeTree joins
 * - Columns silently returning 0 due to broken extraction
 * - Query regressions after SQL refactors
 * - ClickHouse DEFAULT 0 masking pipeline bugs
 *
 * Uses pre-captured fixture data — NO external API calls needed.
 * Runs in CI on every PR (~2s, only needs ClickHouse).
 *
 * Run: npm run test:app-queries --workspace=pipeline
 * Requires: ClickHouse running locally (npm run dev:infra)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCHClient,
  query,
  insertReviewActivity,
  insertHumanActivity,
  insertPrBotEvents,
  insertRepos,
  insertRepoLanguages,
  insertPullRequests,
  insertPrComments,
  syncBots,
  syncProducts,
  type ReviewActivityRow,
  type HumanActivityRow,
  type PrCommentRow,
} from "./clickhouse.js";
import { BOTS, BOT_BY_LOGIN, PRODUCTS } from "./bots.js";
import type { ClickHouseClient } from "@clickhouse/client";

// ── Load fixture ────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "fixtures", "pipeline-fixture.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
const TEST_WEEK = fixture.metadata.start;

// ── Helpers ─────────────────────────────────────────────────────────────

/** Assert a numeric column is > 0 on at least one row. */
function assertSomePositive<T>(rows: T[], field: keyof T, label: string) {
  const values = rows.map((r) => Number(r[field]));
  const positive = values.filter((v) => v > 0);
  assert.ok(positive.length > 0, `${label}: all rows have ${String(field)} = 0 (${rows.length} rows checked)`);
}

/** Convert ISO datetime to ClickHouse-compatible format. */
function toCHDateTime(iso: string | null): string | null {
  if (!iso) return null;
  return iso.replace("T", " ").replace("Z", "").replace(/\.\d+$/, "");
}

describe("App query integration tests (fixture-based)", () => {
  let ch: ClickHouseClient;

  before(async () => {
    ch = createCHClient();

    // Sync reference data
    await syncProducts(ch, PRODUCTS);
    await syncBots(ch, BOTS);

    // Load BigQuery fixture data into ClickHouse
    const activityRows: ReviewActivityRow[] = fixture.bigquery.bot_activity
      .map((row: Record<string, unknown>) => {
        const bot = BOT_BY_LOGIN.get(row.actor_login as string);
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
      .filter((r: ReviewActivityRow | null): r is ReviewActivityRow => r !== null);

    const humanRows: HumanActivityRow[] = fixture.bigquery.human_activity.map(
      (row: Record<string, unknown>) => ({
        week: row.week,
        review_count: Number(row.review_count),
        review_comment_count: Number(row.review_comment_count),
        repo_count: Number(row.repo_count),
      }),
    );

    const eventRows = fixture.bigquery.pr_events
      .map((row: Record<string, unknown>) => {
        const bot = BOT_BY_LOGIN.get(row.actor_login as string);
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
      .filter((r: unknown): r is NonNullable<typeof r> => r !== null);

    await Promise.all([
      insertReviewActivity(ch, activityRows),
      insertHumanActivity(ch, humanRows),
      insertPrBotEvents(ch, eventRows),
    ]);

    // Load GitHub fixture data
    const repo = fixture.github.repo;
    await insertRepos(ch, [{
      name: repo.full_name,
      owner: repo.owner,
      stars: repo.stars,
      primary_language: repo.language ?? "",
      fork: repo.fork,
      archived: repo.archived,
      fetch_status: "ok",
    }]);

    const langRows = Object.entries(fixture.github.languages).map(
      ([language, bytes]) => ({
        repo_name: repo.full_name,
        language,
        bytes: bytes as number,
      }),
    );
    if (langRows.length > 0) {
      await insertRepoLanguages(ch, langRows);
    }

    for (const pr of fixture.github.pull_requests) {
      await insertPullRequests(ch, [{
        repo_name: pr.repo_name,
        pr_number: pr.number,
        title: pr.title,
        author: pr.author,
        state: pr.state,
        created_at: toCHDateTime(pr.created_at)!,
        merged_at: toCHDateTime(pr.merged_at),
        closed_at: toCHDateTime(pr.closed_at),
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
      }]);
    }

    // Create synthetic bot comments with reactions for testing
    // (the fixture may not have bot comments; generate some from pr_events)
    const commentRows: PrCommentRow[] = [];
    const seenCombos = new Set<string>();
    let commentId = 900_000_000;
    for (const evt of eventRows.slice(0, 20)) {
      const key = `${evt.repo_name}:${evt.pr_number}:${evt.bot_id}`;
      if (seenCombos.has(key)) continue;
      seenCombos.add(key);
      commentRows.push({
        repo_name: evt.repo_name,
        pr_number: evt.pr_number,
        comment_id: String(commentId++),
        bot_id: evt.bot_id,
        body_length: 500 + Math.floor(Math.random() * 2000),
        created_at: toCHDateTime(new Date().toISOString())!,
        thumbs_up: Math.floor(Math.random() * 5),
        thumbs_down: Math.floor(Math.random() * 2),
        laugh: Math.floor(Math.random() * 2),
        confused: 0,
        heart: Math.floor(Math.random() * 3),
        hooray: 0,
        eyes: 0,
        rocket: Math.floor(Math.random() * 2),
      });
    }
    if (commentRows.length > 0) {
      await insertPrComments(ch, commentRows);
    }
  });

  after(async () => {
    await ch?.close();
  });

  // ── Product queries ───────────────────────────────────────────────────

  describe("getProductSummaries", () => {
    type Row = {
      id: string; name: string; total_reviews: string; total_comments: string;
      total_repos: string; total_orgs: string; avg_comments_per_review: string;
      thumbs_up: string; thumbs_down: string; heart: string;
      approval_rate: string; comments_per_repo: string; first_seen: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        WITH
          weekly_product AS (
            SELECT b.product_id, ra.week,
              sum(ra.review_count) AS review_count,
              sum(ra.review_comment_count) AS review_comment_count,
              sum(ra.repo_count) AS repo_count,
              sum(ra.org_count) AS org_count
            FROM review_activity ra FINAL
            JOIN bots b FINAL ON ra.bot_id = b.id
            GROUP BY b.product_id, ra.week
          ),
          activity_agg AS (
            SELECT product_id,
              sum(review_count) AS total_reviews,
              sum(review_comment_count) AS total_comments,
              max(repo_count) AS max_repos,
              max(org_count) AS max_orgs,
              min(week) AS first_seen
            FROM weekly_product GROUP BY product_id
          ),
          reaction_agg AS (
            SELECT b.product_id,
              sum(c.thumbs_up) AS thumbs_up,
              sum(c.thumbs_down) AS thumbs_down,
              sum(c.heart) AS heart
            FROM pr_comments c FINAL
            JOIN bots b FINAL ON c.bot_id = b.id
            WHERE c.comment_id > 0
            GROUP BY b.product_id
          )
        SELECT p.id, p.name,
          COALESCE(ra.total_reviews, 0) AS total_reviews,
          COALESCE(ra.total_comments, 0) AS total_comments,
          COALESCE(ra.max_repos, 0) AS total_repos,
          COALESCE(ra.max_orgs, 0) AS total_orgs,
          round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
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
    });

    it("returns rows", () => assert.ok(rows.length > 0));
    it("has non-zero total_reviews", () => assertSomePositive(rows, "total_reviews", "productSummaries"));
    it("has non-zero total_repos", () => assertSomePositive(rows, "total_repos", "productSummaries"));
    it("has non-zero total_orgs", () => assertSomePositive(rows, "total_orgs", "productSummaries"));
    it("has non-zero total_comments", () => assertSomePositive(rows, "total_comments", "productSummaries"));
    it("has non-zero avg_comments_per_review", () => assertSomePositive(rows, "avg_comments_per_review", "productSummaries"));
    it("has reactions data", () => assertSomePositive(rows, "thumbs_up", "productSummaries"));
    it("has non-empty first_seen", () => {
      const withDates = rows.filter((r) => r.first_seen.length > 0);
      assert.ok(withDates.length > 0, "No products have first_seen populated");
    });
  });

  describe("getWeeklyActivityByProduct", () => {
    type Row = {
      week: string; product_id: string; product_name: string;
      review_count: string; review_comment_count: string;
      repo_count: string; org_count: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        SELECT
          formatDateTime(ra.week, '%Y-%m-%d') AS week,
          b.product_id, p.name AS product_name, p.brand_color,
          sum(ra.review_count) AS review_count,
          sum(ra.review_comment_count) AS review_comment_count,
          sum(ra.repo_count) AS repo_count,
          sum(ra.org_count) AS org_count
        FROM review_activity ra FINAL
        JOIN bots b FINAL ON ra.bot_id = b.id
        JOIN products p FINAL ON b.product_id = p.id
        GROUP BY ra.week, b.product_id, p.name, p.brand_color
        ORDER BY ra.week ASC, review_count DESC
      `);
    });

    it("returns rows", () => assert.ok(rows.length > 0));
    it("has non-zero review_count", () => assertSomePositive(rows, "review_count", "weeklyActivityByProduct"));
    it("has non-zero repo_count", () => assertSomePositive(rows, "repo_count", "weeklyActivityByProduct"));
    it("has non-zero org_count", () => assertSomePositive(rows, "org_count", "weeklyActivityByProduct"));
    it("has product names", () => {
      const withNames = rows.filter((r) => r.product_name.length > 0);
      assert.ok(withNames.length === rows.length, "Some rows have empty product_name");
    });
  });

  describe("getProductComparisons", () => {
    type Row = {
      id: string; name: string; total_reviews: string; total_comments: string;
      total_repos: string; total_orgs: string; avg_comments_per_review: string;
      comments_per_repo: string; reviews_per_org: string;
      thumbs_up: string; approval_rate: string; weeks_active: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        WITH
          weekly_product AS (
            SELECT b.product_id, ra.week,
              sum(ra.review_count) AS review_count,
              sum(ra.review_comment_count) AS review_comment_count,
              sum(ra.repo_count) AS repo_count,
              sum(ra.org_count) AS org_count
            FROM review_activity ra FINAL
            JOIN bots b FINAL ON ra.bot_id = b.id
            GROUP BY b.product_id, ra.week
          ),
          activity_agg AS (
            SELECT product_id,
              sum(review_count) AS total_reviews,
              sum(review_comment_count) AS total_comments,
              max(repo_count) AS max_repos,
              max(org_count) AS max_orgs,
              count(DISTINCT week) AS weeks_active
            FROM weekly_product GROUP BY product_id
          ),
          reaction_agg AS (
            SELECT b.product_id,
              sum(c.thumbs_up) AS thumbs_up,
              sum(c.thumbs_down) AS thumbs_down,
              sum(c.heart) AS heart
            FROM pr_comments c FINAL
            JOIN bots b FINAL ON c.bot_id = b.id
            WHERE c.comment_id > 0
            GROUP BY b.product_id
          )
        SELECT p.id, p.name,
          COALESCE(ra.total_reviews, 0) AS total_reviews,
          COALESCE(ra.total_comments, 0) AS total_comments,
          COALESCE(ra.max_repos, 0) AS total_repos,
          COALESCE(ra.max_orgs, 0) AS total_orgs,
          round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
          round(if(ra.max_repos > 0, ra.total_comments / ra.max_repos, 0), 0) AS comments_per_repo,
          round(if(ra.max_orgs > 0, ra.total_reviews / ra.max_orgs, 0), 0) AS reviews_per_org,
          COALESCE(rr.thumbs_up, 0) AS thumbs_up,
          round(if((COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)) > 0,
            COALESCE(rr.thumbs_up, 0) * 100.0 / (COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)),
            0), 1) AS approval_rate,
          COALESCE(ra.weeks_active, 0) AS weeks_active
        FROM products p FINAL
        LEFT JOIN activity_agg ra ON p.id = ra.product_id
        LEFT JOIN reaction_agg rr ON p.id = rr.product_id
        ORDER BY total_reviews DESC
      `);
    });

    it("returns rows", () => assert.ok(rows.length > 0));
    it("has non-zero total_repos", () => assertSomePositive(rows, "total_repos", "productComparisons"));
    it("has non-zero total_orgs", () => assertSomePositive(rows, "total_orgs", "productComparisons"));
    it("has non-zero reviews_per_org", () => assertSomePositive(rows, "reviews_per_org", "productComparisons"));
    it("has non-zero comments_per_repo", () => assertSomePositive(rows, "comments_per_repo", "productComparisons"));
    it("has non-zero weeks_active", () => assertSomePositive(rows, "weeks_active", "productComparisons"));
  });

  // ── Bot queries ───────────────────────────────────────────────────────

  describe("getBotSummaries", () => {
    type Row = {
      id: string; name: string; total_reviews: string; total_comments: string;
      total_repos: string; total_orgs: string; avg_comments_per_review: string;
      thumbs_up: string; approval_rate: string; comments_per_repo: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        WITH
          activity_agg AS (
            SELECT bot_id,
              sum(review_count) AS total_reviews,
              sum(review_comment_count) AS total_comments,
              max(repo_count) AS max_repos,
              max(org_count) AS max_orgs
            FROM review_activity FINAL
            GROUP BY bot_id
          ),
          reaction_agg AS (
            SELECT c.bot_id,
              sum(c.thumbs_up) AS thumbs_up,
              sum(c.thumbs_down) AS thumbs_down,
              sum(c.heart) AS heart
            FROM pr_comments c FINAL
            WHERE c.comment_id > 0
            GROUP BY c.bot_id
          )
        SELECT b.id, b.name,
          COALESCE(ra.total_reviews, 0) AS total_reviews,
          COALESCE(ra.total_comments, 0) AS total_comments,
          COALESCE(ra.max_repos, 0) AS total_repos,
          COALESCE(ra.max_orgs, 0) AS total_orgs,
          round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
          COALESCE(rr.thumbs_up, 0) AS thumbs_up,
          round(if((COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)) > 0,
            COALESCE(rr.thumbs_up, 0) * 100.0 / (COALESCE(rr.thumbs_up, 0) + COALESCE(rr.thumbs_down, 0)),
            0), 1) AS approval_rate,
          round(if(ra.max_repos > 0, ra.total_comments / ra.max_repos, 0), 0) AS comments_per_repo
        FROM bots b FINAL
        LEFT JOIN activity_agg ra ON b.id = ra.bot_id
        LEFT JOIN reaction_agg rr ON b.id = rr.bot_id
        ORDER BY total_reviews DESC
      `);
    });

    it("returns rows", () => assert.ok(rows.length > 0));
    it("has non-zero total_reviews", () => assertSomePositive(rows, "total_reviews", "botSummaries"));
    it("has non-zero total_repos", () => assertSomePositive(rows, "total_repos", "botSummaries"));
    it("has non-zero total_orgs", () => assertSomePositive(rows, "total_orgs", "botSummaries"));
    it("has non-zero comments_per_repo", () => assertSomePositive(rows, "comments_per_repo", "botSummaries"));
  });

  // ── Weekly totals ─────────────────────────────────────────────────────

  describe("getWeeklyTotals", () => {
    type Row = {
      week: string; bot_reviews: string; human_reviews: string;
      bot_share_pct: string; bot_comments: string; human_comments: string;
      bot_comment_share_pct: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        SELECT
          formatDateTime(h.week, '%Y-%m-%d') AS week,
          COALESCE(b.bot_reviews, 0) AS bot_reviews,
          h.review_count AS human_reviews,
          round(COALESCE(b.bot_reviews, 0) * 100.0 / (h.review_count + COALESCE(b.bot_reviews, 0)), 2) AS bot_share_pct,
          COALESCE(b.bot_comments, 0) AS bot_comments,
          h.review_comment_count AS human_comments,
          round(COALESCE(b.bot_comments, 0) * 100.0 / (h.review_comment_count + COALESCE(b.bot_comments, 0)), 2) AS bot_comment_share_pct
        FROM human_review_activity h FINAL
        LEFT JOIN (
          SELECT week, sum(review_count) AS bot_reviews, sum(review_comment_count) AS bot_comments
          FROM review_activity FINAL GROUP BY week
        ) b ON h.week = b.week
        ORDER BY h.week ASC
      `);
    });

    it("returns rows", () => assert.ok(rows.length > 0));
    it("has non-zero bot_reviews", () => assertSomePositive(rows, "bot_reviews", "weeklyTotals"));
    it("has non-zero human_reviews", () => assertSomePositive(rows, "human_reviews", "weeklyTotals"));
    it("has non-zero bot_share_pct", () => assertSomePositive(rows, "bot_share_pct", "weeklyTotals"));
    it("bot_share_pct is between 0 and 100", () => {
      for (const r of rows) {
        const pct = Number(r.bot_share_pct);
        assert.ok(pct >= 0 && pct <= 100, `bot_share_pct out of range: ${pct}`);
      }
    });
    it("human_reviews > bot_reviews", () => {
      for (const r of rows) {
        assert.ok(
          Number(r.human_reviews) > Number(r.bot_reviews),
          `human (${r.human_reviews}) should exceed bot (${r.bot_reviews}) reviews`,
        );
      }
    });
  });

  // ── Reaction/enrichment queries ─────────────────────────────────────

  describe("getBotReactionLeaderboard", () => {
    type Row = {
      bot_id: string; bot_name: string; total_thumbs_up: string;
      total_comments: string; approval_rate: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        SELECT c.bot_id, b.name AS bot_name,
          sum(c.thumbs_up) AS total_thumbs_up,
          sum(c.thumbs_down) AS total_thumbs_down,
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
    });

    it("returns rows", () => assert.ok(rows.length > 0, "No reaction leaderboard rows — pr_comments may be empty"));
    it("has non-zero total_comments", () => assertSomePositive(rows, "total_comments", "reactionLeaderboard"));
    it("has bot names", () => {
      const withNames = rows.filter((r) => r.bot_name.length > 0);
      assert.ok(withNames.length > 0, "No rows have bot_name populated");
    });
  });

  describe("getAvgCommentsPerPR", () => {
    type Row = {
      bot_id: string; avg_comments_per_pr: string;
      total_prs: string; total_comments: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        SELECT c.bot_id, b.name AS bot_name,
          round(if(countDistinct(c.repo_name, c.pr_number) > 0,
            count() / countDistinct(c.repo_name, c.pr_number), 0), 2) AS avg_comments_per_pr,
          countDistinct(c.repo_name, c.pr_number) AS total_prs,
          count() AS total_comments
        FROM pr_comments c FINAL
        JOIN bots b FINAL ON c.bot_id = b.id
        WHERE c.comment_id > 0
        GROUP BY c.bot_id, b.name, b.product_id
        ORDER BY avg_comments_per_pr DESC
      `);
    });

    it("returns rows", () => assert.ok(rows.length > 0));
    it("has non-zero total_prs", () => assertSomePositive(rows, "total_prs", "avgCommentsPerPR"));
    it("avg_comments_per_pr is positive", () => assertSomePositive(rows, "avg_comments_per_pr", "avgCommentsPerPR"));
  });

  describe("getTopOrgsByStars", () => {
    type Row = { owner: string; total_stars: string; repo_count: string };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        SELECT owner, sum(stars) AS total_stars, count() AS repo_count
        FROM repos WHERE fetch_status = 'ok'
        GROUP BY owner ORDER BY total_stars DESC LIMIT 50
      `);
    });

    it("returns rows", () => assert.ok(rows.length > 0, "No repos with fetch_status=ok"));
    it("has non-zero total_stars", () => assertSomePositive(rows, "total_stars", "topOrgsByStars"));
  });

  describe("getEnrichmentStats", () => {
    type Row = {
      total_discovered_repos: string; enriched_repos: string;
      total_discovered_prs: string;
    };
    let rows: Row[];

    before(async () => {
      rows = await query<Row>(ch, `
        SELECT
          (SELECT count() FROM repos) AS total_discovered_repos,
          (SELECT countIf(fetch_status = 'ok') FROM repos) AS enriched_repos,
          (SELECT count(DISTINCT (repo_name, pr_number)) FROM pr_bot_events) AS total_discovered_prs
      `);
    });

    it("returns data", () => assert.equal(rows.length, 1));
    it("has discovered repos", () => {
      assert.ok(Number(rows[0].total_discovered_repos) > 0, "No repos in repos table");
    });
    it("has discovered PRs", () => {
      assert.ok(Number(rows[0].total_discovered_prs) > 0, "No PRs in pr_bot_events");
    });
  });

  // ── Cross-table consistency ───────────────────────────────────────────

  describe("cross-table consistency", () => {
    it("every bot in review_activity exists in bots table", async () => {
      const orphans = await query<{ bot_id: string }>(
        ch,
        `SELECT DISTINCT ra.bot_id FROM review_activity ra FINAL
         LEFT JOIN bots b FINAL ON ra.bot_id = b.id
         WHERE b.id IS NULL OR b.id = ''`,
      );
      assert.equal(orphans.length, 0, `Orphan bot_ids in review_activity: ${orphans.map((r) => r.bot_id).join(", ")}`);
    });

    it("every bot in bots table has a product", async () => {
      const orphans = await query<{ id: string }>(
        ch,
        `SELECT b.id FROM bots b FINAL
         LEFT JOIN products p FINAL ON b.product_id = p.id
         WHERE p.id IS NULL OR p.id = ''`,
      );
      assert.equal(orphans.length, 0, `Bots without products: ${orphans.map((r) => r.id).join(", ")}`);
    });

    it("org_count <= repo_count in review_activity", async () => {
      const violations = await query<{ bot_id: string; week: string; org_count: string; repo_count: string }>(
        ch,
        `SELECT bot_id, formatDateTime(week, '%Y-%m-%d') AS week, org_count, repo_count
         FROM review_activity FINAL
         WHERE org_count > repo_count`,
      );
      assert.equal(violations.length, 0, `org_count > repo_count: ${JSON.stringify(violations.slice(0, 3))}`);
    });
  });
});
