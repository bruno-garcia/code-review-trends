/**
 * Tests for GraphQL reaction batch processing.
 *
 * Covers the buildResults function which parses GraphQL responses
 * into ReactionBatchResult arrays. Key scenarios:
 * - Normal responses with bot reactions
 * - Partial GraphQL responses (the Sentry bug: reactions field missing)
 * - Deleted PRs / missing repos
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildResults, type ReactionBatchInput } from "./graphql-reactions.js";
import { BOT_BY_LOGIN } from "../bots.js";

// Pick a real bot login for test data
const FIRST_BOT_LOGIN = BOT_BY_LOGIN.keys().next().value!;
const FIRST_BOT = BOT_BY_LOGIN.get(FIRST_BOT_LOGIN)!;

function makeByRepo(inputs: ReactionBatchInput[]): Map<string, ReactionBatchInput[]> {
  const byRepo = new Map<string, ReactionBatchInput[]>();
  for (const input of inputs) {
    const existing = byRepo.get(input.repo_name) ?? [];
    existing.push(input);
    byRepo.set(input.repo_name, existing);
  }
  return byRepo;
}

function makeRepoIndex(byRepo: Map<string, ReactionBatchInput[]>): Map<string, number> {
  const repoIndex = new Map<string, number>();
  let ri = 0;
  for (const repoName of byRepo.keys()) {
    repoIndex.set(repoName, ri++);
  }
  return repoIndex;
}

describe("buildResults", () => {
  it("returns scanned=true with bot reactions for normal response", () => {
    const inputs: ReactionBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          number: 1,
          reactions: {
            totalCount: 1,
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                databaseId: 100,
                user: { login: FIRST_BOT_LOGIN },
                createdAt: "2024-01-01T00:00:00Z",
                content: "HOORAY",
              },
            ],
          },
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].scanned, true);
    assert.equal(results[0].reactions.length, 1);
    assert.equal(results[0].reactions[0].bot_id, FIRST_BOT.id);
    assert.equal(results[0].reactions[0].reaction_type, "hooray");
    assert.equal(results[0].hasMore, false);
  });

  it("filters out non-bot reactions", () => {
    const inputs: ReactionBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          number: 1,
          reactions: {
            totalCount: 1,
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                databaseId: 200,
                user: { login: "random-human" },
                createdAt: "2024-01-01T00:00:00Z",
                content: "HOORAY",
              },
            ],
          },
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results[0].scanned, true);
    assert.equal(results[0].reactions.length, 0);
  });

  it("handles null repo (repo not found)", () => {
    const inputs: ReactionBatchInput[] = [{ repo_name: "owner/gone", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: null };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].scanned, false);
    assert.equal(results[0].error, "repo_not_found");
  });

  it("handles null PR (deleted or is an Issue)", () => {
    const inputs: ReactionBatchInput[] = [{ repo_name: "owner/repo", pr_number: 999 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: { pr0: null } };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].scanned, true);
    assert.equal(results[0].error, undefined);
  });

  it("handles missing reactions field (Sentry bug repro: reactions_unavailable)", () => {
    // This is the actual bug from CODE-REVIEW-TRENDS-WORKER-10:
    // GraphQL returns PR data but with reactions field missing due to
    // a field-level error in a partial response. Before the fix,
    // this would crash with TypeError: Cannot read properties of undefined.
    const inputs: ReactionBatchInput[] = [
      { repo_name: "owner/repo", pr_number: 1 },
      { repo_name: "owner/repo", pr_number: 2 },
    ];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    // PR 1 has reactions, PR 2 has data but no reactions field (field-level error)
    const data = {
      repo0: {
        pr0: {
          number: 1,
          reactions: {
            totalCount: 0,
            pageInfo: { hasNextPage: false },
            nodes: [],
          },
        },
        pr1: {
          number: 2,
          // reactions field is MISSING — this caused the TypeError
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 2);

    // PR 1: scanned successfully
    assert.equal(results[0].scanned, true);
    assert.equal(results[0].error, undefined);

    // PR 2: marked as not scanned with specific error (sentinel still written to avoid infinite retry)
    assert.equal(results[1].scanned, false);
    assert.equal(results[1].error, "reactions_unavailable");
    assert.equal(results[1].reactions.length, 0);
  });

  it("handles multiple repos in one batch", () => {
    const inputs: ReactionBatchInput[] = [
      { repo_name: "owner/repo-a", pr_number: 1 },
      { repo_name: "owner/repo-b", pr_number: 2 },
    ];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          number: 1,
          reactions: { totalCount: 0, pageInfo: { hasNextPage: false }, nodes: [] },
        },
      },
      repo1: null, // repo-b not found
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 2);
    assert.equal(results[0].scanned, true);
    assert.equal(results[1].scanned, false);
    assert.equal(results[1].error, "repo_not_found");
  });

  it("reports hasMore when reactions are paginated", () => {
    const inputs: ReactionBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          number: 1,
          reactions: {
            totalCount: 25,
            pageInfo: { hasNextPage: true },
            nodes: [],
          },
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results[0].hasMore, true);
  });

  it("handles null user in reaction node", () => {
    const inputs: ReactionBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          number: 1,
          reactions: {
            totalCount: 1,
            pageInfo: { hasNextPage: false },
            nodes: [
              { databaseId: 300, user: null, createdAt: "2024-01-01T00:00:00Z", content: "HOORAY" },
            ],
          },
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results[0].reactions.length, 0); // filtered out
  });
});
