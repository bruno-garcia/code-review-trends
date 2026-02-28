/**
 * Tests for combined PR + Comments GraphQL batch processing.
 *
 * Covers the buildCombinedResults function which parses GraphQL responses
 * containing both PR metadata and review thread comments.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCombinedResults,
  GRAPHQL_COMBINED_BATCH_MAX,
  GRAPHQL_COMBINED_BATCH_MIN,
  type CombinedBatchInput,
} from "./graphql-combined.js";
import { REVIEW_THREADS_PAGE_SIZE } from "./graphql-comments.js";

function makeInput(overrides: Partial<CombinedBatchInput> & { repo_name: string; pr_number: number }): CombinedBatchInput {
  return {
    bot_entries: [
      { bot_id: "test-bot", bot_login: "bot-login", bot_logins: new Set(["bot-login"]) },
    ],
    ...overrides,
  };
}

function makeByRepo(inputs: CombinedBatchInput[]): Map<string, CombinedBatchInput[]> {
  const byRepo = new Map<string, CombinedBatchInput[]>();
  for (const input of inputs) {
    const existing = byRepo.get(input.repo_name) ?? [];
    existing.push(input);
    byRepo.set(input.repo_name, existing);
  }
  return byRepo;
}

function makeRepoIndex(byRepo: Map<string, CombinedBatchInput[]>): Map<string, number> {
  const repoIndex = new Map<string, number>();
  let ri = 0;
  for (const repoName of byRepo.keys()) {
    repoIndex.set(repoName, ri++);
  }
  return repoIndex;
}

function makePrData(overrides: Record<string, unknown> = {}) {
  return {
    title: "feat: awesome feature",
    author: { login: "developer" },
    state: "MERGED",
    createdAt: "2024-01-01T10:00:00Z",
    mergedAt: "2024-01-01T14:00:00Z",
    closedAt: "2024-01-01T14:00:00Z",
    additions: 100,
    deletions: 20,
    changedFiles: 5,
    reactionGroups: [
      { content: "THUMBS_UP", reactors: { totalCount: 3 } },
    ],
    reviewThreads: {
      nodes: [],
      pageInfo: { hasNextPage: false },
    },
    ...overrides,
  };
}

function makeThread(id: number, login: string, body = "Review comment") {
  return {
    comments: {
      nodes: [
        {
          databaseId: id,
          author: { login },
          bodyText: body,
          createdAt: "2024-01-01T12:00:00Z",
          reactionGroups: [
            { content: "THUMBS_UP", reactors: { totalCount: 2 } },
          ],
        },
      ],
    },
  };
}

describe("graphql-combined buildCombinedResults", () => {
  it("parses PR metadata and comments from combined response", () => {
    const inputs = [makeInput({
      repo_name: "owner/repo",
      pr_number: 42,
    })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: makePrData({
          reviewThreads: {
            nodes: [
              makeThread(111, "bot-login"),
              makeThread(222, "human-dev"),
            ],
            pageInfo: { hasNextPage: false },
          },
        }),
      },
    };

    const results = buildCombinedResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);

    const r = results[0];
    assert.equal(r.prStatus, "ok");
    assert.equal(r.hasMoreThreads, false);

    // PR metadata
    const pr = r.pr!;
    assert.equal(pr.repo_name, "owner/repo");
    assert.equal(pr.pr_number, 42);
    assert.equal(pr.title, "feat: awesome feature");
    assert.equal(pr.author, "developer");
    assert.equal(pr.state, "merged");
    assert.equal(pr.additions, 100);
    assert.equal(pr.thumbs_up, 3);

    // Comments — only bot comment matched
    const botComments = r.comments.get("test-bot")!;
    assert.equal(botComments.length, 1);
    assert.equal(botComments[0].comment_id, "111");
    assert.equal(botComments[0].thumbs_up, 2);
  });

  it("handles null repo (not found)", () => {
    const inputs = [makeInput({ repo_name: "owner/gone", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: null };

    const results = buildCombinedResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].prStatus, "not_found");
    assert.equal(results[0].pr, null);
    assert.equal(results[0].comments.get("test-bot")!.length, 0);
  });

  it("handles null PR (not found)", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 999 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: { pr0: null } };

    const results = buildCombinedResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].prStatus, "not_found");
    assert.equal(results[0].pr, null);
  });

  it("matches bot login with [bot] suffix", () => {
    const inputs = [makeInput({
      repo_name: "owner/repo",
      pr_number: 1,
      bot_entries: [{
        bot_id: "coderabbit",
        bot_login: "coderabbitai[bot]",
        bot_logins: new Set(["coderabbitai[bot]"]),
      }],
    })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: makePrData({
          reviewThreads: {
            nodes: [makeThread(666, "coderabbitai")], // GraphQL strips [bot]
            pageInfo: { hasNextPage: false },
          },
        }),
      },
    };

    const results = buildCombinedResults(byRepo, repoIndex, data);
    const comments = results[0].comments.get("coderabbit")!;
    assert.equal(comments.length, 1, "Should match login without [bot] suffix");
    assert.equal(comments[0].comment_id, "666");
  });

  it("groups comments by bot_id", () => {
    const inputs = [makeInput({
      repo_name: "owner/repo",
      pr_number: 1,
      bot_entries: [
        { bot_id: "bot-a", bot_login: "bot-a-login", bot_logins: new Set(["bot-a-login"]) },
        { bot_id: "bot-b", bot_login: "bot-b-login", bot_logins: new Set(["bot-b-login"]) },
      ],
    })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: makePrData({
          reviewThreads: {
            nodes: [
              makeThread(100, "bot-a-login"),
              makeThread(200, "bot-b-login"),
              makeThread(300, "bot-a-login"),
            ],
            pageInfo: { hasNextPage: false },
          },
        }),
      },
    };

    const results = buildCombinedResults(byRepo, repoIndex, data);
    assert.equal(results[0].comments.get("bot-a")!.length, 2);
    assert.equal(results[0].comments.get("bot-b")!.length, 1);
  });

  it("returns empty comments for PR with no bot comments", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: makePrData({
          reviewThreads: {
            nodes: [makeThread(999, "human-reviewer")],
            pageInfo: { hasNextPage: false },
          },
        }),
      },
    };

    const results = buildCombinedResults(byRepo, repoIndex, data);
    assert.equal(results[0].prStatus, "ok");
    assert.notEqual(results[0].pr, null);
    assert.equal(results[0].comments.get("test-bot")!.length, 0);
  });

  it("reports hasMoreThreads when pagination truncated", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: makePrData({
          reviewThreads: {
            nodes: [],
            pageInfo: { hasNextPage: true },
          },
        }),
      },
    };

    const results = buildCombinedResults(byRepo, repoIndex, data);
    assert.equal(results[0].hasMoreThreads, true);
  });
});

describe("graphql-combined constants", () => {
  it("GRAPHQL_COMBINED_BATCH_MAX is 60", () => {
    // Increased from 25 to compensate for reduced REVIEW_THREADS_PAGE_SIZE.
    // Combined queries are heavier than comment-only (PR metadata + reactions),
    // so the increase is more conservative (~2.4×) than comments (~3×).
    assert.equal(GRAPHQL_COMBINED_BATCH_MAX, 60);
  });

  it("GRAPHQL_COMBINED_BATCH_MIN is 5", () => {
    assert.equal(GRAPHQL_COMBINED_BATCH_MIN, 5);
  });

  it("uses same REVIEW_THREADS_PAGE_SIZE as graphql-comments", () => {
    // Both modules must use the same page size to avoid inconsistent hasMore behavior.
    assert.equal(REVIEW_THREADS_PAGE_SIZE, 30);
  });

  it("batch max is proportional to page size reduction", () => {
    // With first:100, old batch max was 25. With first:30, we can fit ~2.4× more.
    // 60 is conservative because combined queries also include PR metadata and reactions.
    assert.ok(
      GRAPHQL_COMBINED_BATCH_MAX >= 40,
      `combined batch max ${GRAPHQL_COMBINED_BATCH_MAX} should be ≥40 to benefit from reduced page size`,
    );
    assert.ok(
      GRAPHQL_COMBINED_BATCH_MAX <= 80,
      `combined batch max ${GRAPHQL_COMBINED_BATCH_MAX} should be ≤80 to stay within GitHub complexity budget`,
    );
  });

  it("combined batch max is smaller than comment batch max", async () => {
    // Combined queries are heavier per item (PR metadata + reactions + threads),
    // so the batch size must be smaller than standalone comment enrichment.
    const { GRAPHQL_COMMENT_BATCH_MAX } = await import("./graphql-comments.js");
    assert.ok(
      GRAPHQL_COMBINED_BATCH_MAX < GRAPHQL_COMMENT_BATCH_MAX,
      `combined max (${GRAPHQL_COMBINED_BATCH_MAX}) should be < comment max (${GRAPHQL_COMMENT_BATCH_MAX})`,
    );
  });
});
