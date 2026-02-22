/**
 * Integration tests for GraphQL API resilience.
 *
 * Hits REAL GitHub API with the same batch functions + custom HTTPS agent
 * used in production. Validates that:
 * - The custom Octokit agent works with live GitHub endpoints
 * - fetchReposBatch returns correct metadata for known repos
 * - fetchPRsBatch returns correct PR data for known bot-reviewed PRs
 * - fetchCommentsBatch finds bot comments on known PRs
 * - graphqlWithRetry passes through cleanly for successful requests
 * - Multi-repo / multi-PR batches work (the actual batch pattern)
 * - Not-found repos/PRs are handled gracefully
 *
 * Uses hardcoded repos + PR numbers with known bot activity so results
 * are deterministic and reproducible across runs.
 *
 * Requires: GITHUB_TOKEN env var. Fails immediately if missing to prevent
 * false confidence from silently-skipped tests. Set SKIP_GITHUB_TESTS=1
 * to explicitly opt out (e.g. in environments without API access).
 *
 * Run:
 *   GITHUB_TOKEN=... npm run test:integration --workspace=pipeline
 *   SKIP_GITHUB_TESTS=1 npm run test:integration --workspace=pipeline  # explicit skip
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { Octokit } from "@octokit/rest";
import { RateLimiter } from "./rate-limiter.js";
import { createOctokitAgent } from "./octokit-agent.js";
import { fetchReposBatch } from "./graphql-repos.js";
import { fetchPRsBatch } from "./graphql-pull-requests.js";
import { fetchCommentsBatch, type CommentBatchInput } from "./graphql-comments.js";
import { graphqlWithRetry } from "./graphql-retry.js";

const explicitSkip = process.env.SKIP_GITHUB_TESTS === "1";
if (!process.env.GITHUB_TOKEN && !explicitSkip) {
  console.error(
    "Error: GITHUB_TOKEN is required for integration tests.\n" +
    "  Set GITHUB_TOKEN env var, or set SKIP_GITHUB_TESTS=1 to explicitly opt out.",
  );
  process.exit(1);
}
const skip = explicitSkip;

// ── Known stable test targets ──────────────────────────────────────────
// These are merged PRs with verified bot review thread comments.
// Merged PRs are immutable — their data won't change.

/** Well-known public repos used across tests. */
const REPOS = {
  BLT: "OWASP-BLT/BLT",                   // CodeRabbit + Sentry bot activity
  KENT: "kentcdodds/kentcdodds.com",        // Cursor bot activity
  NEXTJS: "vercel/next.js",                 // High-star OSS
  REACT: "facebook/react",                  // High-star OSS
  TYPESCRIPT: "microsoft/typescript",        // High-star OSS
};

/**
 * OWASP-BLT/BLT PR #5330: "Add DB-backed project freshness score"
 * MERGED. Has 33 review threads from both coderabbitai[bot] and sentry[bot].
 */
const BLT_PR = { repo_name: REPOS.BLT, pr_number: 5330 };

/**
 * kentcdodds/kentcdodds.com PR #649: "Content favorites support"
 * MERGED. Has 6 review threads from cursor[bot].
 */
const KENT_PR = { repo_name: REPOS.KENT, pr_number: 649 };

/** A repo that definitely doesn't exist — for not-found handling. */
const NONEXISTENT_REPO = "this-org-does-not-exist-xyz/fake-repo-abc";

/** A PR number that definitely doesn't exist in a real repo. */
const NONEXISTENT_PR_NUMBER = 999999999;

describe("GraphQL API resilience (live GitHub)", { skip: skip ? "Skipped via SKIP_GITHUB_TESTS=1" : false }, () => {
  let octokit: Octokit;
  let rateLimiter: RateLimiter;

  before(() => {
    // Use the same Octokit config as the real worker (custom agent + timeout)
    octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
      request: {
        agent: createOctokitAgent(),
        timeout: 30_000,
      },
    });
    rateLimiter = new RateLimiter();
  });

  // ── graphqlWithRetry direct ────────────────────────────────────────

  describe("graphqlWithRetry with live API", () => {
    it("executes a simple viewer query", async () => {
      const response = await graphqlWithRetry(
        octokit,
        "query { viewer { login } }",
        "integration-test",
      );

      assert.ok(response.data.data, "Response should have data field");
      const viewer = response.data.data as { viewer?: { login?: string } };
      assert.ok(viewer.viewer?.login, "Should return authenticated user login");
    });

    it("returns rate-limit headers", async () => {
      const response = await graphqlWithRetry(
        octokit,
        "query { rateLimit { remaining resetAt } }",
        "integration-test",
      );

      assert.ok(response.headers, "Response should have headers");
      // GitHub always returns these headers on GraphQL responses
      assert.ok(
        response.headers["x-ratelimit-remaining"] !== undefined ||
        response.headers["x-ratelimit-limit"] !== undefined,
        "Should have rate-limit headers",
      );
    });
  });

  // ── fetchReposBatch ────────────────────────────────────────────────

  describe("fetchReposBatch", () => {
    it("fetches metadata for known repos in a single batch", async () => {
      const repoNames = [REPOS.NEXTJS, REPOS.REACT, REPOS.TYPESCRIPT];
      const results = await fetchReposBatch(octokit, rateLimiter, repoNames);

      assert.equal(results.length, repoNames.length, "Should return one result per repo");

      for (let i = 0; i < repoNames.length; i++) {
        const result = results[i];
        assert.equal(result.status, "ok", `${repoNames[i]} should be fetchable`);
        assert.equal(result.row.name, repoNames[i]);
        assert.ok(result.row.stars > 0, `${repoNames[i]} should have stars`);
        assert.ok(result.row.primary_language.length > 0, `${repoNames[i]} should have a language`);
        assert.equal(result.row.fork, false, `${repoNames[i]} should not be a fork`);
        assert.equal(result.row.archived, false, `${repoNames[i]} should not be archived`);
        assert.equal(result.row.fetch_status, "ok");
      }
    });

    it("returns specific metadata for vercel/next.js", async () => {
      const results = await fetchReposBatch(octokit, rateLimiter, [REPOS.NEXTJS]);

      assert.equal(results.length, 1);
      const repo = results[0].row;
      assert.equal(repo.name, REPOS.NEXTJS);
      assert.equal(repo.owner, "vercel");
      assert.ok(repo.stars > 100_000, "next.js should have >100k stars");
      assert.equal(repo.primary_language, "JavaScript");
    });

    it("handles non-existent repo in a mixed batch", async () => {
      const results = await fetchReposBatch(octokit, rateLimiter, [
        REPOS.NEXTJS,         // exists
        NONEXISTENT_REPO,     // doesn't exist
        REPOS.REACT,          // exists
      ]);

      assert.equal(results.length, 3);
      assert.equal(results[0].status, "ok");
      assert.equal(results[1].status, "not_found");
      assert.equal(results[1].row.fetch_status, "not_found");
      assert.equal(results[2].status, "ok");
    });

    it("handles empty input", async () => {
      const results = await fetchReposBatch(octokit, rateLimiter, []);
      assert.equal(results.length, 0);
    });
  });

  // ── fetchPRsBatch ──────────────────────────────────────────────────

  describe("fetchPRsBatch", () => {
    it("fetches metadata for BLT PR with CodeRabbit activity", async () => {
      const results = await fetchPRsBatch(octokit, rateLimiter, [BLT_PR]);

      assert.equal(results.length, 1);
      const result = results[0];
      assert.equal(result.status, "ok");
      assert.ok(result.row);
      assert.equal(result.row!.repo_name, REPOS.BLT);
      assert.equal(result.row!.pr_number, BLT_PR.pr_number);
      assert.ok(result.row!.title.length > 0, "PR should have a title");
      assert.ok(result.row!.author.length > 0, "PR should have an author");
      assert.equal(result.row!.state, "merged", "BLT PR 5330 should be merged");
      assert.ok(result.row!.created_at.length > 0, "PR should have created_at");
      assert.ok(result.row!.merged_at, "Merged PR should have merged_at");
    });

    it("returns diff stats for real PRs", async () => {
      const results = await fetchPRsBatch(octokit, rateLimiter, [BLT_PR]);
      const row = results[0].row!;

      assert.ok(
        row.additions > 0 || row.deletions > 0,
        "A real PR should have additions or deletions",
      );
      assert.ok(row.changed_files > 0, "A real PR should have changed files");
    });

    it("handles multi-repo batch with PRs from different repos", async () => {
      const inputs = [BLT_PR, KENT_PR];
      const results = await fetchPRsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 2);
      assert.equal(results[0].status, "ok");
      assert.equal(results[0].row!.repo_name, REPOS.BLT);
      assert.equal(results[1].status, "ok");
      assert.equal(results[1].row!.repo_name, REPOS.KENT);
    });

    it("handles non-existent PR in a mixed batch", async () => {
      const results = await fetchPRsBatch(octokit, rateLimiter, [
        BLT_PR,
        { repo_name: REPOS.NEXTJS, pr_number: NONEXISTENT_PR_NUMBER },
      ]);

      assert.equal(results.length, 2);
      assert.equal(results[0].status, "ok");
      assert.equal(results[1].status, "not_found");
      assert.equal(results[1].row, null);
    });

    it("handles non-existent repo in PR batch", async () => {
      const results = await fetchPRsBatch(octokit, rateLimiter, [
        BLT_PR,
        { repo_name: NONEXISTENT_REPO, pr_number: 1 },
      ]);

      assert.equal(results.length, 2);
      assert.equal(results[0].status, "ok");
      assert.equal(results[1].status, "not_found");
    });
  });

  // ── fetchCommentsBatch ─────────────────────────────────────────────

  describe("fetchCommentsBatch", () => {
    it("finds CodeRabbit review comments on OWASP-BLT/BLT PR 5330", async () => {
      const inputs: CommentBatchInput[] = [{
        repo_name: BLT_PR.repo_name,
        pr_number: BLT_PR.pr_number,
        bot_id: "coderabbit",
        bot_login: "coderabbitai[bot]",
        bot_logins: new Set(["coderabbitai[bot]"]),
      }];

      const results = await fetchCommentsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 1);
      const result = results[0];
      assert.ok(!result.error, `Should not have error, got: ${result.error}`);
      // BLT PR 5330 is verified to have CodeRabbit review thread comments
      assert.ok(result.comments.length > 0, "Should find CodeRabbit comments on BLT PR 5330");

      const comment = result.comments[0];
      assert.equal(comment.repo_name, REPOS.BLT);
      assert.equal(comment.pr_number, BLT_PR.pr_number);
      assert.equal(comment.bot_id, "coderabbit");
      assert.ok(Number(comment.comment_id) > 0, "comment_id should be a positive number");
      assert.ok(comment.body_length > 0, "Comment should have body text");
      assert.ok(comment.created_at.length > 0, "Comment should have created_at");
      // Reaction counts should be non-negative integers
      for (const field of ["thumbs_up", "thumbs_down", "laugh", "confused", "heart", "hooray", "eyes", "rocket"] as const) {
        assert.ok(comment[field] >= 0, `${field} should be >= 0`);
      }
    });

    it("finds Sentry review comments on the same PR", async () => {
      // BLT PR 5330 also has Sentry bot review thread comments
      const inputs: CommentBatchInput[] = [{
        repo_name: BLT_PR.repo_name,
        pr_number: BLT_PR.pr_number,
        bot_id: "sentry",
        bot_login: "sentry[bot]",
        bot_logins: new Set(["sentry[bot]"]),
      }];

      const results = await fetchCommentsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 1);
      assert.ok(!results[0].error);
      assert.ok(results[0].comments.length > 0, "Should find Sentry comments on BLT PR 5330");
      assert.equal(results[0].comments[0].bot_id, "sentry");
    });

    it("filters out non-bot comments correctly", async () => {
      // Request comments for a bot that didn't review this PR
      const inputs: CommentBatchInput[] = [{
        repo_name: BLT_PR.repo_name,
        pr_number: BLT_PR.pr_number,
        bot_id: "korbit",
        bot_login: "korbit-ai[bot]",
        bot_logins: new Set(["korbit-ai[bot]"]),
      }];

      const results = await fetchCommentsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 1);
      assert.ok(!results[0].error);
      // Korbit didn't review this PR — should have no comments
      assert.equal(results[0].comments.length, 0, "Unrelated bot should have no comments");
    });

    it("handles multi-bot batch: CodeRabbit + Sentry on same PR", async () => {
      const inputs: CommentBatchInput[] = [
        {
          repo_name: BLT_PR.repo_name,
          pr_number: BLT_PR.pr_number,
          bot_id: "coderabbit",
          bot_login: "coderabbitai[bot]",
          bot_logins: new Set(["coderabbitai[bot]"]),
        },
        {
          repo_name: BLT_PR.repo_name,
          pr_number: BLT_PR.pr_number,
          bot_id: "sentry",
          bot_login: "sentry[bot]",
          bot_logins: new Set(["sentry[bot]"]),
        },
      ];

      const results = await fetchCommentsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 2);
      for (const result of results) {
        assert.ok(!result.error, `Should not error, got: ${result.error}`);
      }
      // Both bots have comments on this PR
      assert.equal(results[0].input.bot_id, "coderabbit");
      assert.ok(results[0].comments.length > 0, "CodeRabbit should have comments");
      assert.equal(results[1].input.bot_id, "sentry");
      assert.ok(results[1].comments.length > 0, "Sentry should have comments");
    });

    it("handles cross-repo batch: BLT + Kent PRs with different bots", async () => {
      const inputs: CommentBatchInput[] = [
        {
          repo_name: BLT_PR.repo_name,
          pr_number: BLT_PR.pr_number,
          bot_id: "coderabbit",
          bot_login: "coderabbitai[bot]",
          bot_logins: new Set(["coderabbitai[bot]"]),
        },
        {
          repo_name: KENT_PR.repo_name,
          pr_number: KENT_PR.pr_number,
          bot_id: "cursor",
          bot_login: "cursor[bot]",
          bot_logins: new Set(["cursor[bot]"]),
        },
      ];

      const results = await fetchCommentsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 2);
      assert.ok(!results[0].error);
      assert.ok(!results[1].error);
      assert.equal(results[0].input.bot_id, "coderabbit");
      assert.equal(results[1].input.bot_id, "cursor");
      // Both PRs are verified to have bot review threads
      assert.ok(results[0].comments.length > 0, "CodeRabbit should have comments on BLT PR");
      assert.ok(results[1].comments.length > 0, "Cursor should have comments on Kent PR");
    });

    it("handles non-existent repo in comment batch", async () => {
      const inputs: CommentBatchInput[] = [{
        repo_name: NONEXISTENT_REPO,
        pr_number: 1,
        bot_id: "coderabbit",
        bot_login: "coderabbitai[bot]",
        bot_logins: new Set(["coderabbitai[bot]"]),
      }];

      const results = await fetchCommentsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 1);
      assert.equal(results[0].error, "repo_not_found");
      assert.equal(results[0].comments.length, 0);
    });

    it("handles non-existent PR in comment batch", async () => {
      const inputs: CommentBatchInput[] = [{
        repo_name: REPOS.NEXTJS,
        pr_number: NONEXISTENT_PR_NUMBER,
        bot_id: "coderabbit",
        bot_login: "coderabbitai[bot]",
        bot_logins: new Set(["coderabbitai[bot]"]),
      }];

      const results = await fetchCommentsBatch(octokit, rateLimiter, inputs);

      assert.equal(results.length, 1);
      assert.equal(results[0].error, "pr_not_found");
      assert.equal(results[0].comments.length, 0);
    });
  });

  // ── Octokit agent validation ───────────────────────────────────────

  describe("custom Octokit agent", () => {
    it("uses keep-alive connections across sequential requests", async () => {
      // Make two sequential requests — the second should reuse the connection
      // via the keep-alive agent. If the agent were misconfigured, the second
      // request might fail with ECONNRESET.
      const result1 = await fetchReposBatch(octokit, rateLimiter, [REPOS.NEXTJS]);
      const result2 = await fetchReposBatch(octokit, rateLimiter, [REPOS.REACT]);

      assert.equal(result1[0].status, "ok");
      assert.equal(result2[0].status, "ok");
    });

    it("handles a production-sized repo batch", async () => {
      // Simulate a production batch: 5 repos in one GraphQL query.
      // This exercises the connection pool under realistic load.
      const repoNames = [
        REPOS.NEXTJS,
        REPOS.REACT,
        REPOS.TYPESCRIPT,
        "nodejs/node",
        "denoland/deno",
      ];

      const results = await fetchReposBatch(octokit, rateLimiter, repoNames);

      assert.equal(results.length, repoNames.length);
      for (const result of results) {
        assert.equal(result.status, "ok");
        assert.ok(result.row.stars > 0);
      }
    });
  });
});
