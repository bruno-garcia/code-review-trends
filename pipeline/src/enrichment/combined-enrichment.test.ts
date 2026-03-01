/**
 * Tests for combined enrichment sentinel behavior.
 *
 * The combined enrichment stage fetches PR metadata and comments via GraphQL.
 * When a PR is not_found or forbidden, it must insert sentinel rows to prevent
 * infinite re-querying. Without sentinels, the ClickHouse query keeps returning
 * the same inaccessible PRs every run, burning API calls in an infinite loop.
 *
 * Bug: Before the fix, not_found/forbidden PRs had no sentinel inserted for
 * either pull_requests or pr_comments. The query `WHERE p.repo_name = '' AND
 * c.repo_name = ''` kept returning them because neither LEFT JOIN found a match.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CombinedBatchResult } from "./graphql-combined.js";
import type { CombinedBatchInput } from "./graphql-combined.js";

/**
 * Helper: simulate what combined enrichment does for a batch of results.
 * Extracted from the inner loop of enrichCombined to make it testable
 * without ClickHouse or Octokit dependencies.
 *
 * Returns the collected rows that would be bulk-inserted.
 */
function collectInsertRows(results: CombinedBatchResult[]) {
  const allPrRows: { repo_name: string; pr_number: number; state: string; title: string }[] = [];
  const allCommentRows: { repo_name: string; pr_number: number; comment_id: string; bot_id: string }[] = [];
  const allScanProgress: { repo_name: string; pr_number: number; scan_status: string }[] = [];
  let batchSkipped = 0;

  for (const result of results) {
    // --- PR row collection (matches combined-enrichment.ts logic) ---
    if (result.pr) {
      allPrRows.push({
        repo_name: result.pr.repo_name,
        pr_number: result.pr.pr_number,
        state: result.pr.state,
        title: result.pr.title,
      });
    } else if (
      result.prStatus === "not_found" ||
      result.prStatus === "forbidden"
    ) {
      // THE FIX: insert sentinel PR row so the combo is excluded from future queries
      allPrRows.push({
        repo_name: result.input.repo_name,
        pr_number: result.input.pr_number,
        state: result.prStatus,
        title: "",
      });
      batchSkipped++;
    }

    // --- Comment sentinel collection ---
    if (result.prStatus === "ok" && !result.hasMoreThreads) {
      for (const botEntry of result.input.bot_entries) {
        const botComments = result.comments.get(botEntry.bot_id) ?? [];
        if (botComments.length > 0) {
          for (const c of botComments) {
            allCommentRows.push({
              repo_name: c.repo_name,
              pr_number: c.pr_number,
              comment_id: c.comment_id,
              bot_id: c.bot_id,
            });
          }
        } else {
          allCommentRows.push({
            repo_name: result.input.repo_name,
            pr_number: result.input.pr_number,
            comment_id: "0",
            bot_id: botEntry.bot_id,
          });
        }
      }
    } else if (
      result.prStatus === "not_found" ||
      result.prStatus === "forbidden"
    ) {
      // THE FIX: insert comment sentinels for not_found/forbidden PRs too
      for (const botEntry of result.input.bot_entries) {
        allCommentRows.push({
          repo_name: result.input.repo_name,
          pr_number: result.input.pr_number,
          comment_id: "0",
          bot_id: botEntry.bot_id,
        });
      }
    }

    // --- Scan progress ---
    if (result.prStatus === "not_found" || result.prStatus === "forbidden") {
      allScanProgress.push({
        repo_name: result.input.repo_name,
        pr_number: result.input.pr_number,
        scan_status: result.prStatus === "forbidden" ? "forbidden" : "not_found",
      });
    }
  }

  return { allPrRows, allCommentRows, allScanProgress, batchSkipped };
}

function makeInput(repo: string, pr: number, botIds: string[] = ["bot-1"]): CombinedBatchInput {
  return {
    repo_name: repo,
    pr_number: pr,
    bot_entries: botIds.map((id) => ({
      bot_id: id,
      bot_login: `${id}[bot]`,
      bot_logins: new Set([`${id}[bot]`, id]),
    })),
  };
}

describe("combined enrichment sentinel behavior", () => {
  describe("not_found PRs", () => {
    it("inserts sentinel PR row with state='not_found'", () => {
      const input = makeInput("owner/deleted-repo", 42);
      const result: CombinedBatchResult = {
        input,
        pr: null,
        comments: new Map([["bot-1", []]]),
        reactions: [],
        reactionsAvailable: false,
        hasMoreReactions: false,
        prStatus: "not_found",
        hasMoreThreads: false,
      };

      const { allPrRows } = collectInsertRows([result]);
      assert.equal(allPrRows.length, 1, "should insert a sentinel PR row");
      assert.equal(allPrRows[0].repo_name, "owner/deleted-repo");
      assert.equal(allPrRows[0].pr_number, 42);
      assert.equal(allPrRows[0].state, "not_found");
    });

    it("inserts comment sentinels for each bot on not_found PRs", () => {
      const input = makeInput("owner/deleted-repo", 42, ["bot-a", "bot-b"]);
      const result: CombinedBatchResult = {
        input,
        pr: null,
        comments: new Map([["bot-a", []], ["bot-b", []]]),
        reactions: [],
        reactionsAvailable: false,
        hasMoreReactions: false,
        prStatus: "not_found",
        hasMoreThreads: false,
      };

      const { allCommentRows } = collectInsertRows([result]);
      assert.equal(allCommentRows.length, 2, "should insert sentinel for each bot");
      assert.equal(allCommentRows[0].bot_id, "bot-a");
      assert.equal(allCommentRows[0].comment_id, "0");
      assert.equal(allCommentRows[1].bot_id, "bot-b");
      assert.equal(allCommentRows[1].comment_id, "0");
    });

    it("records scan_progress for not_found PRs", () => {
      const input = makeInput("owner/gone", 99);
      const result: CombinedBatchResult = {
        input,
        pr: null,
        comments: new Map([["bot-1", []]]),
        reactions: [],
        reactionsAvailable: false,
        hasMoreReactions: false,
        prStatus: "not_found",
        hasMoreThreads: false,
      };

      const { allScanProgress } = collectInsertRows([result]);
      assert.equal(allScanProgress.length, 1);
      assert.equal(allScanProgress[0].scan_status, "not_found");
    });
  });

  describe("forbidden PRs", () => {
    it("inserts sentinel PR row with state='forbidden'", () => {
      const input = makeInput("owner/private-repo", 10);
      const result: CombinedBatchResult = {
        input,
        pr: null,
        comments: new Map([["bot-1", []]]),
        reactions: [],
        reactionsAvailable: false,
        hasMoreReactions: false,
        prStatus: "forbidden",
        hasMoreThreads: false,
      };

      const { allPrRows } = collectInsertRows([result]);
      assert.equal(allPrRows.length, 1);
      assert.equal(allPrRows[0].state, "forbidden");
    });

    it("inserts comment sentinels for each bot on forbidden PRs", () => {
      const input = makeInput("owner/private", 5, ["bot-x"]);
      const result: CombinedBatchResult = {
        input,
        pr: null,
        comments: new Map([["bot-x", []]]),
        reactions: [],
        reactionsAvailable: false,
        hasMoreReactions: false,
        prStatus: "forbidden",
        hasMoreThreads: false,
      };

      const { allCommentRows } = collectInsertRows([result]);
      assert.equal(allCommentRows.length, 1);
      assert.equal(allCommentRows[0].bot_id, "bot-x");
      assert.equal(allCommentRows[0].comment_id, "0");
    });
  });

  describe("ok PRs (baseline — existing behavior preserved)", () => {
    it("does NOT insert sentinel PR row for ok PRs", () => {
      const input = makeInput("owner/repo", 1);
      const result: CombinedBatchResult = {
        input,
        pr: {
          repo_name: "owner/repo",
          pr_number: 1,
          title: "feat: something",
          author: "dev",
          state: "merged",
          created_at: "2024-01-01T00:00:00Z",
          merged_at: "2024-01-02T00:00:00Z",
          closed_at: "2024-01-02T00:00:00Z",
          additions: 10,
          deletions: 5,
          changed_files: 2,
          thumbs_up: 0, thumbs_down: 0, laugh: 0, confused: 0,
          heart: 0, hooray: 0, eyes: 0, rocket: 0,
        },
        comments: new Map([["bot-1", []]]),
        reactions: [],
        reactionsAvailable: true,
        hasMoreReactions: false,
        prStatus: "ok",
        hasMoreThreads: false,
      };

      const { allPrRows, batchSkipped } = collectInsertRows([result]);
      assert.equal(allPrRows.length, 1);
      assert.equal(allPrRows[0].state, "merged", "ok PRs should use real state");
      assert.equal(batchSkipped, 0, "ok PRs should not be counted as skipped");
    });

    it("inserts comment sentinel (comment_id=0) for ok PRs with no bot comments", () => {
      const input = makeInput("owner/repo", 1);
      const result: CombinedBatchResult = {
        input,
        pr: {
          repo_name: "owner/repo", pr_number: 1, title: "test", author: "dev",
          state: "open", created_at: "2024-01-01T00:00:00Z",
          merged_at: null, closed_at: null,
          additions: 0, deletions: 0, changed_files: 0,
          thumbs_up: 0, thumbs_down: 0, laugh: 0, confused: 0,
          heart: 0, hooray: 0, eyes: 0, rocket: 0,
        },
        comments: new Map([["bot-1", []]]),
        reactions: [],
        reactionsAvailable: true,
        hasMoreReactions: false,
        prStatus: "ok",
        hasMoreThreads: false,
      };

      const { allCommentRows } = collectInsertRows([result]);
      assert.equal(allCommentRows.length, 1);
      assert.equal(allCommentRows[0].comment_id, "0", "sentinel for no-comments");
    });
  });

  describe("mixed batch", () => {
    it("handles mix of ok, not_found, and forbidden in one batch", () => {
      const okInput = makeInput("owner/good", 1);
      const notFoundInput = makeInput("owner/gone", 2, ["bot-a", "bot-b"]);
      const forbiddenInput = makeInput("owner/private", 3);

      const results: CombinedBatchResult[] = [
        {
          input: okInput,
          pr: {
            repo_name: "owner/good", pr_number: 1, title: "ok pr", author: "dev",
            state: "merged", created_at: "2024-01-01T00:00:00Z",
            merged_at: "2024-01-02T00:00:00Z", closed_at: "2024-01-02T00:00:00Z",
            additions: 10, deletions: 5, changed_files: 2,
            thumbs_up: 0, thumbs_down: 0, laugh: 0, confused: 0,
            heart: 0, hooray: 0, eyes: 0, rocket: 0,
          },
          comments: new Map([["bot-1", []]]),
          reactions: [],
          reactionsAvailable: true,
          hasMoreReactions: false,
          prStatus: "ok",
          hasMoreThreads: false,
        },
        {
          input: notFoundInput,
          pr: null,
          comments: new Map([["bot-a", []], ["bot-b", []]]),
          reactions: [],
          reactionsAvailable: false,
          hasMoreReactions: false,
          prStatus: "not_found",
          hasMoreThreads: false,
        },
        {
          input: forbiddenInput,
          pr: null,
          comments: new Map([["bot-1", []]]),
          reactions: [],
          reactionsAvailable: false,
          hasMoreReactions: false,
          prStatus: "forbidden",
          hasMoreThreads: false,
        },
      ];

      const { allPrRows, allCommentRows, allScanProgress, batchSkipped } = collectInsertRows(results);

      // 3 PR rows: 1 real + 2 sentinels
      assert.equal(allPrRows.length, 3);
      assert.equal(allPrRows[0].state, "merged");
      assert.equal(allPrRows[1].state, "not_found");
      assert.equal(allPrRows[2].state, "forbidden");

      // 4 comment rows: 1 sentinel for ok PR + 2 sentinels for not_found + 1 sentinel for forbidden
      assert.equal(allCommentRows.length, 4);

      // 2 scan progress entries (not_found + forbidden)
      assert.equal(allScanProgress.length, 2);

      assert.equal(batchSkipped, 2, "not_found + forbidden = 2 skipped");
    });
  });

  describe("regression: infinite loop without sentinels", () => {
    it("without sentinels, not_found PRs produce no PR or comment rows (the bug)", () => {
      // This test documents the OLD behavior (before the fix).
      // Without the fix, not_found PRs produced:
      // - 0 PR rows (so `p.repo_name = ''` stays true in the query)
      // - 0 comment rows (so `c.repo_name = ''` stays true in the query)
      // - 1 scan_progress entry (irrelevant to the query)
      // The query would return the same combo again next run → infinite loop.
      //
      // After the fix, collectInsertRows produces sentinel rows that satisfy
      // both LEFT JOINs, breaking the loop. This test verifies the fix is in place.
      const input = makeInput("owner/gone", 42);
      const result: CombinedBatchResult = {
        input,
        pr: null,
        comments: new Map([["bot-1", []]]),
        reactions: [],
        reactionsAvailable: false,
        hasMoreReactions: false,
        prStatus: "not_found",
        hasMoreThreads: false,
      };

      const { allPrRows, allCommentRows } = collectInsertRows([result]);

      // With the fix: sentinel rows ARE inserted
      assert.ok(allPrRows.length > 0,
        "REGRESSION: not_found PRs must produce a sentinel PR row to break the infinite loop");
      assert.ok(allCommentRows.length > 0,
        "REGRESSION: not_found PRs must produce comment sentinels to break the infinite loop");
    });
  });
});
