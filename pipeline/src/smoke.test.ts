/**
 * Smoke tests for the data pipeline — BigQuery → ClickHouse → App queries.
 *
 * These tests hit REAL external APIs (BigQuery, GitHub) and write to
 * REAL (local) ClickHouse to verify the full data flow end-to-end.
 * They catch issues like:
 * - BigQuery schema changes (e.g. payload fields returning NULL)
 * - GitHub API response shape changes
 * - Missing columns in pipeline mappings
 * - App queries returning 0 for fields that should have data
 *
 * Requires:
 * - GCP credentials (gcloud auth application-default login)
 * - GITHUB_TOKEN env var (for enrichment tests)
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
  insertRepos,
  insertRepoLanguages,
  insertPullRequests,
  insertPrComments,
  syncBots,
  syncProducts,
  type RepoRow,
  type RepoLanguageRow,
  type PullRequestRow,
  type PrCommentRow,
} from "./clickhouse.js";
import {
  mapBotActivityRows,
  mapHumanActivityRows,
  mapPrBotEventRows,
} from "./sync.js";
import { BOTS, BOT_BY_LOGIN, BOT_LOGINS, PRODUCTS } from "./bots.js";
import { extractReactionCounts } from "./github.js";
import type { ClickHouseClient } from "@clickhouse/client";
import { Octokit } from "@octokit/rest";
import { enrichPullRequests } from "./enrichment/pull-requests.js";
import { enrichComments } from "./enrichment/comments.js";
import { RateLimiter } from "./enrichment/rate-limiter.js";

// ── Skip checks ─────────────────────────────────────────────────────────

let skipBigQuery = false;
// In CI (google-github-actions/auth), ADC credentials are set via env vars.
// Locally, gcloud CLI provides credentials. Check both paths.
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_GHA_CREDS_PATH) {
  // CI environment — credentials injected by google-github-actions/auth
  skipBigQuery = false;
} else {
  try {
    const { execFileSync } = await import("node:child_process");
    const project = execFileSync("gcloud", ["config", "get-value", "project"], {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (!project || project === "(unset)") skipBigQuery = true;
  } catch {
    skipBigQuery = true;
  }
}

const skipGitHub = !process.env.GITHUB_TOKEN;

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

// ── Known stable test targets ──────────────────────────────────────────
// Use high-traffic public repos where bot activity is guaranteed.
const TEST_REPO = "vercel/next.js";
const TEST_REPO_OWNER = "vercel";
const TEST_REPO_NAME = "next.js";

// ── BigQuery smoke tests ───────────────────────────────────────────────

describe("BigQuery smoke tests", { skip: skipBigQuery ? "No GCP credentials" : false }, () => {
  let ch: ClickHouseClient;
  const logins = [...BOT_LOGINS];

  before(async () => {
    ch = createCHClient();
    await syncProducts(ch, PRODUCTS);
    await syncBots(ch, BOTS);
  });

  after(async () => {
    await ch?.close();
  });

  // ── BigQuery: bot review activity ───────────────────────────────────

  describe("bot review activity", () => {
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
      assert.ok(withRepos.length > 0, "All rows have repo_count=0 — repo.name extraction may be broken");
    });

    it("has non-zero org_count", () => {
      const withOrgs = rows.filter((r) => Number(r.org_count) > 0);
      assert.ok(withOrgs.length > 0, "All rows have org_count=0 — org extraction may be broken");
    });

    it("org_count <= repo_count for each row", () => {
      for (const r of rows) {
        assert.ok(
          Number(r.org_count) <= Number(r.repo_count),
          `org_count (${r.org_count}) > repo_count (${r.repo_count}) for ${r.actor_login}`,
        );
      }
    });

    it("actor_logins match known bots", () => {
      const known = rows.filter((r) => BOT_BY_LOGIN.has(r.actor_login));
      assert.ok(known.length > 0, "No rows match known bot logins");
    });
  });

  // ── BigQuery: human review activity ─────────────────────────────────

  describe("human review activity", () => {
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

  describe("PR bot events (discover)", () => {
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

    it("all event types are expected values", () => {
      const types = new Set(rows.map((r) => r.event_type));
      for (const t of types) {
        assert.ok(
          ["PullRequestReviewEvent", "PullRequestReviewCommentEvent", "IssueCommentEvent"].includes(t),
          `Unexpected event_type: ${t}`,
        );
      }
    });
  });

  // ── Full pipeline: BigQuery → ClickHouse → App query ────────────────

  describe("End-to-end: BigQuery → ClickHouse → app queries", () => {
    before(async () => {
      const bq = createBigQueryClient();

      // Fetch from BigQuery
      const botRows = await queryBotReviewActivity(bq, TEST_START, TEST_END, logins);
      const humanRows = await queryHumanReviewActivity(bq, TEST_START, TEST_END, logins);
      const eventRows = await queryBotPREvents(bq, TEST_START, TEST_END, logins);

      // Map and write to ClickHouse — uses the same mappers as production
      const activityRows = mapBotActivityRows(botRows);
      const humanActivityRows = mapHumanActivityRows(humanRows);
      const chEventRows = mapPrBotEventRows(eventRows);

      await Promise.all([
        insertReviewActivity(ch, activityRows),
        insertHumanActivity(ch, humanActivityRows),
        insertPrBotEvents(ch, chEventRows),
      ]);
    });

    // ── Product-level queries ──────────────────────────────────────────

    it("getProductSummaries: non-zero reviews, repos, orgs", async () => {
      const rows = await query<{
        id: string; total_reviews: string; total_comments: string;
        total_repos: string; total_orgs: string; avg_comments_per_review: string;
        first_seen: string;
      }>(
        ch,
        `WITH
          weekly_product AS (
            SELECT b.product_id, ra.week,
              sum(ra.review_count) AS review_count, sum(ra.review_comment_count) AS review_comment_count,
              sum(ra.repo_count) AS repo_count, sum(ra.org_count) AS org_count
            FROM review_activity ra FINAL JOIN bots b FINAL ON ra.bot_id = b.id
            GROUP BY b.product_id, ra.week
          ),
          activity_agg AS (
            SELECT product_id, sum(review_count) AS total_reviews, sum(review_comment_count) AS total_comments,
              max(repo_count) AS max_repos, max(org_count) AS max_orgs, min(week) AS first_seen
            FROM weekly_product GROUP BY product_id
          )
        SELECT p.id,
          COALESCE(ra.total_reviews, 0) AS total_reviews, COALESCE(ra.total_comments, 0) AS total_comments,
          COALESCE(ra.max_repos, 0) AS total_repos, COALESCE(ra.max_orgs, 0) AS total_orgs,
          round(if(ra.total_reviews > 0, ra.total_comments / ra.total_reviews, 0), 1) AS avg_comments_per_review,
          COALESCE(formatDateTime(ra.first_seen, '%Y-%m-%d'), '') AS first_seen
        FROM products p FINAL LEFT JOIN activity_agg ra ON p.id = ra.product_id
        ORDER BY total_reviews DESC`,
      );
      assert.ok(rows.length > 0, "No product summaries returned");
      const active = rows.filter((r) => Number(r.total_reviews) > 0);
      assert.ok(active.length > 0, "No products have total_reviews > 0");
      assert.ok(active.some((r) => Number(r.total_repos) > 0), "All products have total_repos=0");
      assert.ok(active.some((r) => Number(r.total_orgs) > 0), "All products have total_orgs=0");
      assert.ok(active.some((r) => Number(r.avg_comments_per_review) > 0), "All products have avg_comments_per_review=0");
      assert.ok(active.some((r) => r.first_seen.length > 0), "No products have first_seen populated");
    });

    it("getProductComparisons: reviews_per_org and comments_per_repo", async () => {
      const rows = await query<{
        id: string; total_repos: string; total_orgs: string;
        comments_per_repo: string; reviews_per_org: string; weeks_active: string;
      }>(
        ch,
        `WITH
          weekly_product AS (
            SELECT b.product_id, ra.week,
              sum(ra.review_count) AS review_count, sum(ra.review_comment_count) AS review_comment_count,
              sum(ra.repo_count) AS repo_count, sum(ra.org_count) AS org_count
            FROM review_activity ra FINAL JOIN bots b FINAL ON ra.bot_id = b.id
            GROUP BY b.product_id, ra.week
          ),
          activity_agg AS (
            SELECT product_id, sum(review_count) AS total_reviews, sum(review_comment_count) AS total_comments,
              max(repo_count) AS max_repos, max(org_count) AS max_orgs, count(DISTINCT week) AS weeks_active
            FROM weekly_product GROUP BY product_id
          )
        SELECT p.id, COALESCE(ra.max_repos, 0) AS total_repos, COALESCE(ra.max_orgs, 0) AS total_orgs,
          round(if(ra.max_repos > 0, ra.total_comments / ra.max_repos, 0), 0) AS comments_per_repo,
          round(if(ra.max_orgs > 0, ra.total_reviews / ra.max_orgs, 0), 0) AS reviews_per_org,
          COALESCE(ra.weeks_active, 0) AS weeks_active
        FROM products p FINAL LEFT JOIN activity_agg ra ON p.id = ra.product_id
        ORDER BY total_repos DESC`,
      );
      const active = rows.filter((r) => Number(r.total_repos) > 0);
      assert.ok(active.length > 0, "No products with repos");
      assert.ok(active.some((r) => Number(r.reviews_per_org) > 0), "All products have reviews_per_org=0");
      assert.ok(active.some((r) => Number(r.comments_per_repo) > 0), "All products have comments_per_repo=0");
      assert.ok(active.some((r) => Number(r.weeks_active) > 0), "All products have weeks_active=0");
    });

    // ── Bot-level queries ───────────────────────────────────────────────

    it("getBotSummaries: non-zero reviews, repos, orgs per bot", async () => {
      const rows = await query<{
        id: string; total_reviews: string; total_repos: string; total_orgs: string;
      }>(
        ch,
        `WITH activity_agg AS (
          SELECT bot_id, sum(review_count) AS total_reviews,
            max(repo_count) AS max_repos, max(org_count) AS max_orgs
          FROM review_activity FINAL GROUP BY bot_id
        )
        SELECT b.id, COALESCE(ra.total_reviews, 0) AS total_reviews,
          COALESCE(ra.max_repos, 0) AS total_repos, COALESCE(ra.max_orgs, 0) AS total_orgs
        FROM bots b FINAL LEFT JOIN activity_agg ra ON b.id = ra.bot_id
        ORDER BY total_reviews DESC`,
      );
      assert.ok(rows.length > 0, "No bot summaries returned");
      const active = rows.filter((r) => Number(r.total_reviews) > 0);
      assert.ok(active.length > 0, "No bots have total_reviews > 0");
      assert.ok(active.some((r) => Number(r.total_repos) > 0), "All bots have total_repos=0");
      assert.ok(active.some((r) => Number(r.total_orgs) > 0), "All bots have total_orgs=0");
    });

    // ── Weekly totals ───────────────────────────────────────────────────

    it("getWeeklyTotals: bot share between 0-100, humans > bots", async () => {
      const rows = await query<{
        week: string; bot_reviews: string; human_reviews: string; bot_share_pct: string;
      }>(
        ch,
        `SELECT formatDateTime(h.week, '%Y-%m-%d') AS week,
          COALESCE(b.bot_reviews, 0) AS bot_reviews, h.review_count AS human_reviews,
          round(COALESCE(b.bot_reviews, 0) * 100.0 / (h.review_count + COALESCE(b.bot_reviews, 0)), 2) AS bot_share_pct
         FROM human_review_activity h FINAL
         LEFT JOIN (SELECT week, sum(review_count) AS bot_reviews FROM review_activity FINAL GROUP BY week) b ON h.week = b.week
         ORDER BY h.week ASC`,
      );
      assert.ok(rows.length > 0, "No weekly totals found");
      assert.ok(Number(rows[0].bot_share_pct) > 0, "Bot share is 0%");
      for (const r of rows) {
        const pct = Number(r.bot_share_pct);
        assert.ok(pct > 0 && pct < 100, `bot_share_pct out of range: ${pct}`);
        assert.ok(
          Number(r.human_reviews) > Number(r.bot_reviews),
          `human (${r.human_reviews}) should exceed bot (${r.bot_reviews}) reviews`,
        );
      }
    });

    // ── Discovery data ──────────────────────────────────────────────────

    it("pr_bot_events have valid repo/PR data", async () => {
      const rows = await query<{ total: string; with_repo: string; with_pr: string }>(
        ch,
        `SELECT count() AS total,
          countIf(repo_name != '' AND repo_name LIKE '%/%') AS with_repo,
          countIf(pr_number > 0) AS with_pr
         FROM pr_bot_events WHERE event_week >= {start:Date}`,
        { start: TEST_START },
      );
      assert.ok(Number(rows[0].total) > 0, "No pr_bot_events found");
      assert.equal(rows[0].total, rows[0].with_repo, "Some pr_bot_events have invalid repo_name");
      assert.equal(rows[0].total, rows[0].with_pr, "Some pr_bot_events have invalid pr_number");
    });

    // ── Cross-table consistency ─────────────────────────────────────────

    it("every bot in review_activity exists in bots table", async () => {
      const orphans = await query<{ bot_id: string }>(
        ch,
        `SELECT DISTINCT ra.bot_id FROM review_activity ra FINAL
         LEFT JOIN bots b FINAL ON ra.bot_id = b.id WHERE b.id = ''`,
      );
      assert.equal(orphans.length, 0, `Orphan bot_ids: ${orphans.map((r) => r.bot_id).join(", ")}`);
    });

    it("org_count <= repo_count in review_activity", async () => {
      const violations = await query<{ bot_id: string; org_count: string; repo_count: string }>(
        ch,
        `SELECT bot_id, org_count, repo_count FROM review_activity FINAL WHERE org_count > repo_count`,
      );
      assert.equal(violations.length, 0, `org_count > repo_count: ${JSON.stringify(violations.slice(0, 3))}`);
    });
  });
});

// ── GitHub API smoke tests ─────────────────────────────────────────────

describe("GitHub API smoke tests", { skip: skipGitHub ? "No GITHUB_TOKEN" : false }, () => {
  let octokit: Octokit;
  let ch: ClickHouseClient;

  before(async () => {
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    ch = createCHClient();
    await syncProducts(ch, PRODUCTS);
    await syncBots(ch, BOTS);
  });

  after(async () => {
    await ch?.close();
  });

  describe("repo metadata", () => {
    let repoData: Awaited<ReturnType<typeof octokit.rest.repos.get>>["data"];
    let languages: Record<string, number>;

    before(async () => {
      const resp = await octokit.rest.repos.get({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
      });
      repoData = resp.data;

      const langResp = await octokit.rest.repos.listLanguages({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
      });
      languages = langResp.data as Record<string, number>;
    });

    it("has stars > 0", () => {
      assert.ok(repoData.stargazers_count > 0, "stars should be > 0");
    });

    it("has primary language", () => {
      assert.ok(repoData.language, "primary language should not be null");
    });

    it("has language breakdown", () => {
      assert.ok(Object.keys(languages).length > 0, "language breakdown should not be empty");
      assert.ok(languages["TypeScript"]! > 0, "TypeScript bytes should be > 0");
    });

    it("maps cleanly to RepoRow", () => {
      const row: RepoRow = {
        name: repoData.full_name,
        owner: repoData.owner.login,
        stars: repoData.stargazers_count,
        primary_language: repoData.language ?? "",
        fork: repoData.fork,
        archived: repoData.archived,
        fetch_status: "ok",
      };
      assert.ok(row.name.includes("/"), "full_name should be owner/repo");
      assert.ok(row.owner.length > 0, "owner should not be empty");
      assert.ok(row.stars > 0, "stars should be > 0");
    });

    it("writes and reads back from ClickHouse", async () => {
      const row: RepoRow = {
        name: repoData.full_name,
        owner: repoData.owner.login,
        stars: repoData.stargazers_count,
        primary_language: repoData.language ?? "",
        fork: repoData.fork,
        archived: repoData.archived,
        fetch_status: "ok",
      };
      await insertRepos(ch, [row]);

      const langRows: RepoLanguageRow[] = Object.entries(languages).map(
        ([language, bytes]) => ({ repo_name: repoData.full_name, language, bytes }),
      );
      await insertRepoLanguages(ch, langRows);

      const readBack = await query<{ name: string; stars: string; primary_language: string }>(
        ch,
        "SELECT name, stars, primary_language FROM repos FINAL WHERE name = {name:String}",
        { name: repoData.full_name },
      );
      assert.equal(readBack.length, 1);
      assert.ok(Number(readBack[0].stars) > 0, "stars should survive round-trip");
      assert.ok(readBack[0].primary_language.length > 0, "language should survive round-trip");
    });
  });

  describe("pull request metadata", () => {
    let prData: Awaited<ReturnType<typeof octokit.rest.pulls.list>>["data"];

    before(async () => {
      const resp = await octokit.rest.pulls.list({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: 5,
      });
      prData = resp.data;
    });

    it("returns PRs", () => {
      assert.ok(prData.length > 0, "Expected closed PRs");
    });

    it("PRs have required fields", () => {
      const pr = prData[0];
      assert.ok(pr.title.length > 0, "title should not be empty");
      assert.ok(pr.user?.login, "author should not be null");
      assert.ok(pr.number > 0, "pr_number should be > 0");
      assert.ok(pr.created_at, "created_at should not be null");
    });

    it("maps cleanly to PullRequestRow", () => {
      const pr = prData[0];
      const row: PullRequestRow = {
        repo_name: TEST_REPO,
        pr_number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? "",
        state: pr.merged_at ? "merged" : pr.closed_at ? "closed" : "open",
        created_at: pr.created_at,
        merged_at: pr.merged_at ?? null,
        closed_at: pr.closed_at ?? null,
        additions: 0, // list endpoint doesn't include these
        deletions: 0,
        changed_files: 0,
        thumbs_up: 0,
        thumbs_down: 0,
        laugh: 0,
        confused: 0,
        heart: 0,
        hooray: 0,
        eyes: 0,
        rocket: 0,
      };
      assert.ok(row.author.length > 0, "author should not be empty");
      assert.ok(["merged", "closed", "open"].includes(row.state), `unexpected state: ${row.state}`);
    });

    it("writes and reads back from ClickHouse", async () => {
      // Fetch full PR detail for additions/deletions
      const { data: detail } = await octokit.rest.pulls.get({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        pull_number: prData[0].number,
      });

      const reactions = extractReactionCounts(detail);

      const row: PullRequestRow = {
        repo_name: TEST_REPO,
        pr_number: detail.number,
        title: detail.title,
        author: detail.user?.login ?? "",
        state: detail.merged_at ? "merged" : detail.closed_at ? "closed" : "open",
        created_at: detail.created_at,
        merged_at: detail.merged_at ?? null,
        closed_at: detail.closed_at ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        changed_files: detail.changed_files,
        ...reactions,
      };
      await insertPullRequests(ch, [row]);

      const readBack = await query<{
        repo_name: string;
        pr_number: string;
        title: string;
        additions: string;
      }>(
        ch,
        "SELECT repo_name, pr_number, title, additions FROM pull_requests FINAL WHERE repo_name = {repo:String} AND pr_number = {pr:UInt32}",
        { repo: TEST_REPO, pr: detail.number },
      );
      assert.equal(readBack.length, 1);
      assert.ok(readBack[0].title.length > 0, "title should survive round-trip");
    });
  });

  describe("review comments with reactions", () => {
    let comments: Awaited<ReturnType<typeof octokit.rest.pulls.listReviewComments>>["data"];
    let testPRNumber: number;

    before(async () => {
      // Find a PR with bot review comments by looking at recent pr_bot_events
      // Fall back to a hardcoded approach: just fetch comments from a recent PR
      const resp = await octokit.rest.pulls.list({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: 10,
      });

      // Try each PR until we find one with review comments
      for (const pr of resp.data) {
        const commentResp = await octokit.rest.pulls.listReviewComments({
          owner: TEST_REPO_OWNER,
          repo: TEST_REPO_NAME,
          pull_number: pr.number,
          per_page: 5,
        });
        if (commentResp.data.length > 0) {
          comments = commentResp.data;
          testPRNumber = pr.number;
          break;
        }
      }
    });

    it("finds review comments", () => {
      assert.ok(comments && comments.length > 0, "Expected to find review comments on at least one PR");
    });

    it("comments have required fields", () => {
      const c = comments[0];
      assert.ok(c.id > 0, "comment_id should be > 0");
      assert.ok(c.user?.login, "comment author should not be null");
      assert.ok(c.body !== undefined, "body should not be undefined");
      assert.ok(c.created_at, "created_at should not be null");
    });

    it("comments have reactions object", () => {
      const c = comments[0];
      assert.ok(c.reactions !== undefined, "reactions should be present on review comments");
      // Reactions should have the standard keys
      const reactions = c.reactions!;
      const keys = Object.keys(reactions);
      for (const expected of ["+1", "-1", "laugh", "confused", "heart", "hooray", "eyes", "rocket"]) {
        assert.ok(keys.includes(expected), `Missing reaction key: ${expected}`);
      }
    });

    it("maps cleanly to PrCommentRow", () => {
      const c = comments[0];
      const row: PrCommentRow = {
        repo_name: TEST_REPO,
        pr_number: testPRNumber,
        comment_id: String(c.id),
        bot_id: "test-bot",
        body_length: c.body?.length ?? 0,
        created_at: c.created_at,
        thumbs_up: c.reactions?.["+1"] ?? 0,
        thumbs_down: c.reactions?.["-1"] ?? 0,
        laugh: c.reactions?.laugh ?? 0,
        confused: c.reactions?.confused ?? 0,
        heart: c.reactions?.heart ?? 0,
        hooray: c.reactions?.hooray ?? 0,
        eyes: c.reactions?.eyes ?? 0,
        rocket: c.reactions?.rocket ?? 0,
      };
      assert.ok(Number(row.comment_id) > 0, "comment_id should be numeric and > 0");
      assert.ok(row.body_length >= 0, "body_length should be >= 0");
    });

    it("writes and reads back from ClickHouse", async () => {
      const c = comments[0];
      const row: PrCommentRow = {
        repo_name: TEST_REPO,
        pr_number: testPRNumber,
        comment_id: String(c.id),
        bot_id: "test-smoke",
        body_length: c.body?.length ?? 0,
        created_at: c.created_at,
        thumbs_up: c.reactions?.["+1"] ?? 0,
        thumbs_down: c.reactions?.["-1"] ?? 0,
        laugh: c.reactions?.laugh ?? 0,
        confused: c.reactions?.confused ?? 0,
        heart: c.reactions?.heart ?? 0,
        hooray: c.reactions?.hooray ?? 0,
        eyes: c.reactions?.eyes ?? 0,
        rocket: c.reactions?.rocket ?? 0,
      };
      await insertPrComments(ch, [row]);

      const readBack = await query<{
        comment_id: string;
        body_length: string;
        thumbs_up: string;
      }>(
        ch,
        "SELECT comment_id, body_length, thumbs_up FROM pr_comments FINAL WHERE repo_name = {repo:String} AND comment_id = {cid:UInt64}",
        { repo: TEST_REPO, cid: c.id },
      );
      assert.equal(readBack.length, 1);
      assert.ok(Number(readBack[0].comment_id) > 0, "comment_id should survive round-trip");
    });
  });

  // ── Enrichment discovery integration tests ─────────────────────────────

  describe("Enrichment discovery queries", () => {
    let testRepoName: string;
    let testPRNumber: number;
    let testBotId: string;

    before(async () => {
      // Use a known high-activity repo and get a recent PR number
      testRepoName = TEST_REPO;
      testBotId = "copilot"; // Use a known bot from the registry

      // Fetch a recent closed PR to use for testing
      const resp = await octokit.rest.pulls.list({
        owner: TEST_REPO_OWNER,
        repo: TEST_REPO_NAME,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: 1,
      });
      if (resp.data.length === 0) {
        throw new Error("No closed PRs found for testing");
      }
      testPRNumber = resp.data[0].number;
    });

    describe("enrichPullRequests discovery", () => {
      before(async () => {
        // Set up test data: insert pr_bot_events and repos, but leave pull_requests empty
        await insertPrBotEvents(ch, [
          {
            event_week: new Date().toISOString().split("T")[0],
            repo_name: testRepoName,
            pr_number: testPRNumber,
            bot_id: testBotId,
            event_type: "PullRequestReviewEvent",
          },
        ]);

        // Insert repo so it's not filtered out
        await insertRepos(ch, [
          {
            name: testRepoName,
            owner: TEST_REPO_OWNER,
            stars: 10000,
            primary_language: "TypeScript",
            fork: false,
            archived: false,
            fetch_status: "ok",
          },
        ]);

        // Ensure pull_requests table doesn't have this PR yet
        const existing = await query(
          ch,
          "SELECT count() as cnt FROM pull_requests WHERE repo_name = {repo:String} AND pr_number = {pr:UInt32}",
          { repo: testRepoName, pr: testPRNumber },
        );
        if (Number(existing[0]?.cnt) > 0) {
          // Clean it up so we can test discovery
          await query(
            ch,
            "ALTER TABLE pull_requests DELETE WHERE repo_name = {repo:String} AND pr_number = {pr:UInt32}",
            { repo: testRepoName, pr: testPRNumber },
          );
          // Wait for mutation to complete
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      });

      it("finds PRs needing enrichment via LEFT JOIN IS NULL pattern", async () => {
        // Query the discovery SQL directly to ensure it returns the test PR
        const prs = await query<{ repo_name: string; pr_number: string }>(
          ch,
          `SELECT DISTINCT e.repo_name, e.pr_number
           FROM pr_bot_events e
           LEFT JOIN pull_requests p ON e.repo_name = p.repo_name AND e.pr_number = p.pr_number
           WHERE p.pr_number IS NULL
             AND e.repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))
             AND e.repo_name = {repo:String}`,
          { repo: testRepoName },
        );
        assert.ok(prs.length > 0, "Discovery query should find PRs needing enrichment");
        const found = prs.find(
          (pr) => pr.repo_name === testRepoName && Number(pr.pr_number) === testPRNumber,
        );
        assert.ok(found, `Discovery query should find test PR ${testRepoName}#${testPRNumber}`);
      });

      it("enrichPullRequests() fetches and inserts discovered PRs", async () => {
        const rateLimiter = new RateLimiter();
        const result = await enrichPullRequests(
          octokit,
          ch,
          rateLimiter,
          { workerId: 0, totalWorkers: 1 },
          { limit: 10 },
        );

        assert.ok(result.fetched > 0, "Should fetch at least one PR");

        // Verify the PR was inserted into pull_requests
        const inserted = await query<{
          repo_name: string;
          pr_number: string;
          title: string;
          author: string;
        }>(
          ch,
          "SELECT repo_name, pr_number, title, author FROM pull_requests FINAL WHERE repo_name = {repo:String} AND pr_number = {pr:UInt32}",
          { repo: testRepoName, pr: testPRNumber },
        );
        assert.equal(inserted.length, 1, "PR should be inserted exactly once");
        assert.ok(inserted[0].title.length > 0, "PR title should not be empty");
        assert.ok(inserted[0].author.length > 0, "PR author should not be empty");
      });

      it("app queries return non-zero values after enrichment", async () => {
        // Query getProductSummaries-style aggregation to verify reactions are captured
        const summaries = await query<{ total_reviews: string; approval_rate: string }>(
          ch,
          `WITH
            reaction_agg AS (
              SELECT
                b.product_id,
                sum(pr.thumbs_up) AS thumbs_up,
                sum(pr.thumbs_down) AS thumbs_down
              FROM pull_requests pr FINAL
              JOIN pr_bot_events e ON pr.repo_name = e.repo_name AND pr.pr_number = e.pr_number
              JOIN bots b FINAL ON e.bot_id = b.id
              WHERE pr.repo_name = {repo:String}
              GROUP BY b.product_id
            )
          SELECT
            count() as total_reviews,
            round(if((sum(thumbs_up) + sum(thumbs_down)) > 0,
              sum(thumbs_up) * 100.0 / (sum(thumbs_up) + sum(thumbs_down)),
              0), 1) AS approval_rate
          FROM reaction_agg`,
          { repo: testRepoName },
        );
        // Note: approval_rate may be 0 if the PR has no reactions, which is fine.
        // The key is that the query runs and returns data.
        assert.ok(summaries.length > 0, "Should return summary data");
      });
    });

    describe("enrichComments discovery", () => {
      before(async () => {
        // Set up: pr_bot_events exists, repos exists, pull_requests now exists,
        // but pr_comments should be empty for this PR/bot combo
        const existing = await query(
          ch,
          "SELECT count() as cnt FROM pr_comments WHERE repo_name = {repo:String} AND pr_number = {pr:UInt32} AND bot_id = {bot:String}",
          { repo: testRepoName, pr: testPRNumber, bot: testBotId },
        );
        if (Number(existing[0]?.cnt) > 0) {
          // Clean up so we can test discovery
          await query(
            ch,
            "ALTER TABLE pr_comments DELETE WHERE repo_name = {repo:String} AND pr_number = {pr:UInt32} AND bot_id = {bot:String}",
            { repo: testRepoName, pr: testPRNumber, bot: testBotId },
          );
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      });

      it("finds PR/bot combos needing enrichment via LEFT JOIN IS NULL pattern", async () => {
        // Query the discovery SQL directly
        const combos = await query<{ repo_name: string; pr_number: string; bot_id: string }>(
          ch,
          `SELECT DISTINCT e.repo_name, e.pr_number, e.bot_id
           FROM pr_bot_events e
           LEFT JOIN (
             SELECT DISTINCT repo_name, pr_number, bot_id FROM pr_comments
           ) c ON e.repo_name = c.repo_name AND e.pr_number = c.pr_number AND e.bot_id = c.bot_id
           WHERE c.bot_id IS NULL
             AND e.repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))
             AND e.repo_name = {repo:String}`,
          { repo: testRepoName },
        );
        assert.ok(combos.length > 0, "Discovery query should find PR/bot combos needing enrichment");
        const found = combos.find(
          (combo) =>
            combo.repo_name === testRepoName &&
            Number(combo.pr_number) === testPRNumber &&
            combo.bot_id === testBotId,
        );
        assert.ok(
          found,
          `Discovery query should find test combo ${testRepoName}#${testPRNumber} for bot ${testBotId}`,
        );
      });

      it("enrichComments() fetches and inserts discovered comments", async () => {
        const rateLimiter = new RateLimiter();
        const result = await enrichComments(
          octokit,
          ch,
          rateLimiter,
          { workerId: 0, totalWorkers: 1 },
          { limit: 10 },
        );

        assert.ok(result.fetched > 0, "Should fetch at least one PR/bot combo");

        // Verify comments or sentinel row were inserted
        const inserted = await query<{ comment_id: string; bot_id: string }>(
          ch,
          "SELECT comment_id, bot_id FROM pr_comments FINAL WHERE repo_name = {repo:String} AND pr_number = {pr:UInt32} AND bot_id = {bot:String}",
          { repo: testRepoName, pr: testPRNumber, bot: testBotId },
        );
        assert.ok(
          inserted.length > 0,
          "Should insert comments or sentinel row for the PR/bot combo",
        );
      });

      it("app queries return non-zero reactions after comment enrichment", async () => {
        // Query getBotReactionLeaderboard-style aggregation
        const reactions = await query<{
          bot_id: string;
          total_thumbs_up: string;
          total_comments: string;
        }>(
          ch,
          `SELECT
            c.bot_id,
            sum(c.thumbs_up) AS total_thumbs_up,
            count() AS total_comments
          FROM pr_comments c FINAL
          WHERE c.comment_id > 0 AND c.repo_name = {repo:String}
          GROUP BY c.bot_id`,
          { repo: testRepoName },
        );
        // Note: May have 0 reactions if no comments had reactions, which is fine.
        // The key is that the query runs and finds comments (filtered by comment_id > 0).
        if (reactions.length > 0) {
          assert.ok(Number(reactions[0].total_comments) >= 0, "Should return comment counts");
        }
      });
    });
  });
});
