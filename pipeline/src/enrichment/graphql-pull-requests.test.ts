/**
 * Tests for GraphQL PR batch processing.
 *
 * Covers the buildResults function which parses GraphQL responses
 * into PRBatchResult arrays. Key scenarios:
 * - Merged, closed, open PRs with correct state mapping
 * - Reaction extraction from reactionGroups
 * - Null repos and PRs (not found)
 * - Multiple repos with multiple PRs in one batch
 * - Null author (deleted user)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildResults, type PRBatchInput } from "./graphql-pull-requests.js";

function makeByRepo(inputs: PRBatchInput[]): Map<string, PRBatchInput[]> {
  const byRepo = new Map<string, PRBatchInput[]>();
  for (const input of inputs) {
    const existing = byRepo.get(input.repo_name) ?? [];
    existing.push(input);
    byRepo.set(input.repo_name, existing);
  }
  return byRepo;
}

function makeRepoIndex(byRepo: Map<string, PRBatchInput[]>): Map<string, number> {
  const repoIndex = new Map<string, number>();
  let ri = 0;
  for (const repoName of byRepo.keys()) {
    repoIndex.set(repoName, ri++);
  }
  return repoIndex;
}

describe("graphql-pull-requests buildResults", () => {
  it("parses a merged PR with reactions", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/repo", pr_number: 42 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
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
            { content: "HEART", reactors: { totalCount: 1 } },
            { content: "ROCKET", reactors: { totalCount: 2 } },
          ],
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "ok");

    const row = results[0].row!;
    assert.equal(row.repo_name, "owner/repo");
    assert.equal(row.pr_number, 42);
    assert.equal(row.title, "feat: awesome feature");
    assert.equal(row.author, "developer");
    assert.equal(row.state, "merged");
    assert.equal(row.created_at, "2024-01-01T10:00:00Z");
    assert.equal(row.merged_at, "2024-01-01T14:00:00Z");
    assert.equal(row.additions, 100);
    assert.equal(row.deletions, 20);
    assert.equal(row.changed_files, 5);
    assert.equal(row.thumbs_up, 3);
    assert.equal(row.heart, 1);
    assert.equal(row.rocket, 2);
    assert.equal(row.thumbs_down, 0);
  });

  it("maps CLOSED state correctly", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          title: "closed PR",
          author: { login: "dev" },
          state: "CLOSED",
          createdAt: "2024-01-01T10:00:00Z",
          mergedAt: null,
          closedAt: "2024-01-02T10:00:00Z",
          additions: 10,
          deletions: 5,
          changedFiles: 1,
          reactionGroups: [],
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results[0].row!.state, "closed");
    assert.equal(results[0].row!.merged_at, null);
  });

  it("maps OPEN state correctly", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          title: "open PR",
          author: { login: "dev" },
          state: "OPEN",
          createdAt: "2024-01-01T10:00:00Z",
          mergedAt: null,
          closedAt: null,
          additions: 10,
          deletions: 5,
          changedFiles: 1,
          reactionGroups: [],
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results[0].row!.state, "open");
  });

  it("handles null author (deleted user)", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          title: "ghost PR",
          author: null,
          state: "MERGED",
          createdAt: "2024-01-01T10:00:00Z",
          mergedAt: "2024-01-01T12:00:00Z",
          closedAt: "2024-01-01T12:00:00Z",
          additions: 1,
          deletions: 1,
          changedFiles: 1,
          reactionGroups: [],
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results[0].row!.author, "");
  });

  it("handles null repo (not found)", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/gone", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: null };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "not_found");
    assert.equal(results[0].row, null);
  });

  it("handles null PR (deleted)", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/repo", pr_number: 999 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: { pr0: null } };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "not_found");
    assert.equal(results[0].row, null);
  });

  it("handles multiple repos with multiple PRs", () => {
    const inputs: PRBatchInput[] = [
      { repo_name: "org/repo-a", pr_number: 1 },
      { repo_name: "org/repo-a", pr_number: 2 },
      { repo_name: "org/repo-b", pr_number: 10 },
    ];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const makePr = (title: string) => ({
      title,
      author: { login: "dev" },
      state: "MERGED" as const,
      createdAt: "2024-01-01T10:00:00Z",
      mergedAt: "2024-01-01T12:00:00Z",
      closedAt: "2024-01-01T12:00:00Z",
      additions: 10,
      deletions: 5,
      changedFiles: 1,
      reactionGroups: [],
    });

    const data = {
      repo0: {
        pr0: makePr("PR 1 in repo-a"),
        pr1: makePr("PR 2 in repo-a"),
      },
      repo1: {
        pr0: makePr("PR 10 in repo-b"),
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results.length, 3);

    assert.equal(results[0].row!.repo_name, "org/repo-a");
    assert.equal(results[0].row!.pr_number, 1);
    assert.equal(results[0].row!.title, "PR 1 in repo-a");

    assert.equal(results[1].row!.repo_name, "org/repo-a");
    assert.equal(results[1].row!.pr_number, 2);

    assert.equal(results[2].row!.repo_name, "org/repo-b");
    assert.equal(results[2].row!.pr_number, 10);
  });

  it("maps all 8 reaction types", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          title: "all reactions",
          author: { login: "dev" },
          state: "OPEN" as const,
          createdAt: "2024-01-01T10:00:00Z",
          mergedAt: null,
          closedAt: null,
          additions: 0,
          deletions: 0,
          changedFiles: 0,
          reactionGroups: [
            { content: "THUMBS_UP", reactors: { totalCount: 1 } },
            { content: "THUMBS_DOWN", reactors: { totalCount: 2 } },
            { content: "LAUGH", reactors: { totalCount: 3 } },
            { content: "CONFUSED", reactors: { totalCount: 4 } },
            { content: "HEART", reactors: { totalCount: 5 } },
            { content: "HOORAY", reactors: { totalCount: 6 } },
            { content: "EYES", reactors: { totalCount: 7 } },
            { content: "ROCKET", reactors: { totalCount: 8 } },
          ],
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    const row = results[0].row!;
    assert.equal(row.thumbs_up, 1);
    assert.equal(row.thumbs_down, 2);
    assert.equal(row.laugh, 3);
    assert.equal(row.confused, 4);
    assert.equal(row.heart, 5);
    assert.equal(row.hooray, 6);
    assert.equal(row.eyes, 7);
    assert.equal(row.rocket, 8);
  });

  it("handles missing reactionGroups gracefully", () => {
    const inputs: PRBatchInput[] = [{ repo_name: "owner/repo", pr_number: 1 }];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          title: "no reactions",
          author: { login: "dev" },
          state: "MERGED" as const,
          createdAt: "2024-01-01T10:00:00Z",
          mergedAt: "2024-01-01T12:00:00Z",
          closedAt: "2024-01-01T12:00:00Z",
          additions: 0,
          deletions: 0,
          changedFiles: 0,
          // reactionGroups omitted (undefined)
        },
      },
    };

    const results = buildResults(byRepo, repoIndex, data);
    assert.equal(results[0].status, "ok");
    const row = results[0].row!;
    assert.equal(row.thumbs_up, 0);
    assert.equal(row.thumbs_down, 0);
  });
});
