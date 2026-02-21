/**
 * Tests for GraphQL comment batch processing.
 *
 * Covers the parseResults function which extracts bot review comments
 * from GraphQL responses. Key scenarios:
 * - Normal response with bot comments and reactions
 * - Filtering out non-bot comments (only matching logins kept)
 * - Null repos and PRs (not found)
 * - Multiple repos with multiple PRs
 * - hasMore pagination flag
 * - Null author in comment
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseResults, type CommentBatchInput } from "./graphql-comments.js";

function makeInput(overrides: Partial<CommentBatchInput> & { repo_name: string; pr_number: number }): CommentBatchInput {
  return {
    bot_id: "test-bot",
    bot_login: "bot-login",
    bot_logins: new Set(["bot-login"]),
    ...overrides,
  };
}

function makeByRepo(inputs: CommentBatchInput[]): Map<string, CommentBatchInput[]> {
  const byRepo = new Map<string, CommentBatchInput[]>();
  for (const input of inputs) {
    const existing = byRepo.get(input.repo_name) ?? [];
    existing.push(input);
    byRepo.set(input.repo_name, existing);
  }
  return byRepo;
}

function makeRepoIndex(byRepo: Map<string, CommentBatchInput[]>): Map<string, number> {
  const repoIndex = new Map<string, number>();
  let ri = 0;
  for (const repoName of byRepo.keys()) {
    repoIndex.set(repoName, ri++);
  }
  return repoIndex;
}

describe("graphql-comments parseResults", () => {
  it("extracts bot comments with reactions", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 12345,
                      author: { login: "bot-login" },
                      bodyText: "LGTM! Great refactor.",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [
                        { content: "THUMBS_UP", reactors: { totalCount: 5 } },
                        { content: "HEART", reactors: { totalCount: 2 } },
                      ],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].comments.length, 1);
    assert.equal(results[0].hasMore, false);
    assert.equal(results[0].error, undefined);

    const comment = results[0].comments[0];
    assert.equal(comment.repo_name, "owner/repo");
    assert.equal(comment.pr_number, 1);
    assert.equal(comment.comment_id, "12345");
    assert.equal(comment.bot_id, "test-bot");
    assert.equal(comment.body_length, "LGTM! Great refactor.".length);
    assert.equal(comment.thumbs_up, 5);
    assert.equal(comment.heart, 2);
    assert.equal(comment.thumbs_down, 0);
  });

  it("filters out non-bot comments", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 111,
                      author: { login: "human-developer" },
                      bodyText: "Nice work!",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 222,
                      author: { login: "bot-login" },
                      bodyText: "Bot comment",
                      createdAt: "2024-01-01T11:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].comments.length, 1, "Only the bot comment should be included");
    assert.equal(results[0].comments[0].comment_id, "222");
  });

  it("supports multiple bot logins for one bot", () => {
    const inputs = [
      makeInput({
        repo_name: "owner/repo",
        pr_number: 1,
        bot_logins: new Set(["bot-login", "bot-alt-login"]),
      }),
    ];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 333,
                      author: { login: "bot-alt-login" },
                      bodyText: "Alt login comment",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].comments.length, 1);
    assert.equal(results[0].comments[0].comment_id, "333");
  });

  it("handles null repo (not found)", () => {
    const inputs = [makeInput({ repo_name: "owner/gone", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: null };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].comments.length, 0);
    assert.equal(results[0].error, "repo_not_found");
  });

  it("handles null PR (deleted)", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 999 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = { repo0: { pr0: null } };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results.length, 1);
    assert.equal(results[0].comments.length, 0);
    assert.equal(results[0].error, "pr_not_found");
  });

  it("handles null author in comment (deleted user)", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 444,
                      author: null,
                      bodyText: "ghost comment",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].comments.length, 0, "Null-author comments should be filtered out");
  });

  it("reports hasMore when threads are paginated", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [],
            pageInfo: { hasNextPage: true },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].hasMore, true);
  });

  it("handles multiple repos with multiple PRs", () => {
    const inputs = [
      makeInput({ repo_name: "org/repo-a", pr_number: 1 }),
      makeInput({ repo_name: "org/repo-a", pr_number: 2 }),
      makeInput({ repo_name: "org/repo-b", pr_number: 10 }),
    ];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const makeThread = (id: number) => ({
      comments: {
        nodes: [
          {
            databaseId: id,
            author: { login: "bot-login" },
            bodyText: `Comment ${id}`,
            createdAt: "2024-01-01T10:00:00Z",
            reactionGroups: [],
          },
        ],
      },
    });

    const data = {
      repo0: {
        pr0: {
          reviewThreads: { nodes: [makeThread(1001)], pageInfo: { hasNextPage: false } },
        },
        pr1: {
          reviewThreads: { nodes: [makeThread(1002)], pageInfo: { hasNextPage: false } },
        },
      },
      repo1: {
        pr0: {
          reviewThreads: { nodes: [makeThread(1003)], pageInfo: { hasNextPage: false } },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results.length, 3);

    assert.equal(results[0].input.repo_name, "org/repo-a");
    assert.equal(results[0].input.pr_number, 1);
    assert.equal(results[0].comments[0].comment_id, "1001");

    assert.equal(results[1].input.repo_name, "org/repo-a");
    assert.equal(results[1].input.pr_number, 2);
    assert.equal(results[1].comments[0].comment_id, "1002");

    assert.equal(results[2].input.repo_name, "org/repo-b");
    assert.equal(results[2].input.pr_number, 10);
    assert.equal(results[2].comments[0].comment_id, "1003");
  });

  it("maps all 8 reaction types", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 555,
                      author: { login: "bot-login" },
                      bodyText: "x",
                      createdAt: "2024-01-01T10:00:00Z",
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
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    const c = results[0].comments[0];
    assert.equal(c.thumbs_up, 1);
    assert.equal(c.thumbs_down, 2);
    assert.equal(c.laugh, 3);
    assert.equal(c.confused, 4);
    assert.equal(c.heart, 5);
    assert.equal(c.hooray, 6);
    assert.equal(c.eyes, 7);
    assert.equal(c.rocket, 8);
  });

  it("matches bot login without [bot] suffix (GraphQL strips it)", () => {
    // GitHub GraphQL API returns Bot authors WITHOUT the "[bot]" suffix
    // (e.g. "coderabbitai" not "coderabbitai[bot]"). The filter must handle this.
    const inputs = [
      makeInput({
        repo_name: "owner/repo",
        pr_number: 1,
        bot_logins: new Set(["coderabbitai[bot]"]),
      }),
    ];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 666,
                      author: { login: "coderabbitai" }, // GraphQL strips [bot]
                      bodyText: "Review comment",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].comments.length, 1, "Should match login without [bot] suffix");
    assert.equal(results[0].comments[0].comment_id, "666");
  });

  it("still matches exact login (no suffix stripping needed)", () => {
    // When bot_logins contains the exact login (e.g. "Copilot"), it should match directly.
    const inputs = [
      makeInput({
        repo_name: "owner/repo",
        pr_number: 1,
        bot_logins: new Set(["Copilot"]),
      }),
    ];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: {
                  nodes: [
                    {
                      databaseId: 777,
                      author: { login: "Copilot" },
                      bodyText: "Looks good",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].comments.length, 1, "Should match exact login");
    assert.equal(results[0].comments[0].comment_id, "777");
  });

  it("handles empty thread nodes (no first comment)", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const byRepo = makeByRepo(inputs);
    const repoIndex = makeRepoIndex(byRepo);

    const data = {
      repo0: {
        pr0: {
          reviewThreads: {
            nodes: [
              {
                comments: { nodes: [] }, // empty — no first comment
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].comments.length, 0);
  });
});
