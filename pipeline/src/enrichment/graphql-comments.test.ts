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
import {
  parseResults,
  buildCommentsQuery,
  REVIEW_THREADS_PAGE_SIZE,
  GRAPHQL_COMMENT_BATCH_MAX,
  GRAPHQL_COMMENT_BATCH_MIN,
  type CommentBatchInput,
} from "./graphql-comments.js";

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

  it("hasMore true with zero comments — caller must not insert sentinel", () => {
    // When hasMore is true, there may be bot comments in unfetched threads.
    // The caller (comments.ts) must NOT insert a sentinel row in this case,
    // or it will permanently mask the unfetched data (AGENTS.md principle 17).
    // This test documents the contract: parseResults sets hasMore=true and
    // returns empty comments — the caller is responsible for checking hasMore.
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
                      databaseId: 999,
                      author: { login: "human-reviewer" },
                      bodyText: "Human comment only in first 30 threads",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: true }, // more threads exist
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].hasMore, true, "hasMore should be true");
    assert.equal(results[0].comments.length, 0, "no bot comments in first page");
    // The caller must check hasMore before inserting a sentinel.
    // If it inserts a sentinel here, bot comments in threads 31+ are lost forever.
  });

  it("hasMore true with some bot comments — caller should save comments but no sentinel", () => {
    // When hasMore is true AND there are some bot comments, the caller should
    // save the found comments but still not insert a sentinel for missing bots,
    // since more comments may exist in unfetched threads.
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
                      databaseId: 888,
                      author: { login: "bot-login" },
                      bodyText: "Bot found in first 30 threads",
                      createdAt: "2024-01-01T10:00:00Z",
                      reactionGroups: [],
                    },
                  ],
                },
              },
            ],
            pageInfo: { hasNextPage: true },
          },
        },
      },
    };

    const results = parseResults(byRepo, repoIndex, data);
    assert.equal(results[0].hasMore, true);
    assert.equal(results[0].comments.length, 1, "found bot comment should be returned");
    assert.equal(results[0].comments[0].comment_id, "888");
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

describe("graphql-comments constants", () => {
  it("REVIEW_THREADS_PAGE_SIZE is 30", () => {
    // Reduced from 100 to cut per-PR GraphQL complexity by ~70%.
    // Changing this affects rate-limit throughput — update batch sizes accordingly.
    assert.equal(REVIEW_THREADS_PAGE_SIZE, 30);
  });

  it("GRAPHQL_COMMENT_BATCH_MAX is 120", () => {
    // ~3× the old max of 40 to compensate for the reduced page size.
    assert.equal(GRAPHQL_COMMENT_BATCH_MAX, 120);
  });

  it("GRAPHQL_COMMENT_BATCH_MIN is 5", () => {
    assert.equal(GRAPHQL_COMMENT_BATCH_MIN, 5);
  });

  it("batch max is proportional to page size reduction", () => {
    // With first:100 the old batch max was 40 (cost ~36K nodes).
    // With first:30 we can fit ~3.3× more PRs per query for the same cost.
    // 120 is conservative (3×), leaving headroom for GitHub complexity calc variance.
    assert.ok(
      GRAPHQL_COMMENT_BATCH_MAX >= 100,
      `batch max ${GRAPHQL_COMMENT_BATCH_MAX} should be ≥100 to benefit from reduced page size`,
    );
    assert.ok(
      GRAPHQL_COMMENT_BATCH_MAX <= 160,
      `batch max ${GRAPHQL_COMMENT_BATCH_MAX} should be ≤160 to stay within GitHub complexity budget`,
    );
  });
});

describe("graphql-comments buildCommentsQuery", () => {
  it("generates a query using REVIEW_THREADS_PAGE_SIZE", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 42 })];
    const { query } = buildCommentsQuery(inputs);

    assert.ok(
      query.includes(`reviewThreads(first: ${REVIEW_THREADS_PAGE_SIZE})`),
      `query should use REVIEW_THREADS_PAGE_SIZE (${REVIEW_THREADS_PAGE_SIZE}), got: ${query.slice(0, 200)}...`,
    );
    // Must NOT contain the old hardcoded value
    assert.ok(
      !query.includes("reviewThreads(first: 100)"),
      "query must not contain old hardcoded first: 100",
    );
  });

  it("includes pullRequest number in query", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 42 })];
    const { query } = buildCommentsQuery(inputs);

    assert.ok(query.includes("pullRequest(number: 42)"), "query should reference PR number");
  });

  it("includes repository owner and name", () => {
    const inputs = [makeInput({ repo_name: "my-org/my-repo", pr_number: 1 })];
    const { query } = buildCommentsQuery(inputs);

    assert.ok(query.includes('"my-org"'), "query should include owner");
    assert.ok(query.includes('"my-repo"'), "query should include repo name");
  });

  it("groups multiple PRs under the same repo", () => {
    const inputs = [
      makeInput({ repo_name: "owner/repo", pr_number: 1 }),
      makeInput({ repo_name: "owner/repo", pr_number: 2 }),
    ];
    const { query, byRepo, repoIndex } = buildCommentsQuery(inputs);

    // Only one repo alias
    assert.equal(byRepo.size, 1);
    assert.equal(repoIndex.size, 1);
    assert.ok(query.includes("pr0:"), "should have pr0 alias");
    assert.ok(query.includes("pr1:"), "should have pr1 alias");
    // Only one repo fragment
    assert.ok(!query.includes("repo1:"), "should NOT have a second repo alias");
  });

  it("separates different repos into different aliases", () => {
    const inputs = [
      makeInput({ repo_name: "org/repo-a", pr_number: 1 }),
      makeInput({ repo_name: "org/repo-b", pr_number: 2 }),
    ];
    const { query, byRepo, repoIndex } = buildCommentsQuery(inputs);

    assert.equal(byRepo.size, 2);
    assert.equal(repoIndex.size, 2);
    assert.ok(query.includes("repo0:"), "should have repo0 alias");
    assert.ok(query.includes("repo1:"), "should have repo1 alias");
  });

  it("returns correct repoIndex mapping", () => {
    const inputs = [
      makeInput({ repo_name: "org/repo-a", pr_number: 1 }),
      makeInput({ repo_name: "org/repo-b", pr_number: 2 }),
      makeInput({ repo_name: "org/repo-a", pr_number: 3 }),
    ];
    const { byRepo, repoIndex } = buildCommentsQuery(inputs);

    assert.equal(repoIndex.get("org/repo-a"), 0);
    assert.equal(repoIndex.get("org/repo-b"), 1);
    assert.equal(byRepo.get("org/repo-a")!.length, 2, "repo-a should have 2 PRs");
    assert.equal(byRepo.get("org/repo-b")!.length, 1, "repo-b should have 1 PR");
  });

  it("query includes all required GraphQL fields", () => {
    const inputs = [makeInput({ repo_name: "owner/repo", pr_number: 1 })];
    const { query } = buildCommentsQuery(inputs);

    // Verify key fields are present in the query
    const requiredFields = [
      "databaseId",
      "author { login }",
      "bodyText",
      "createdAt",
      "reactionGroups",
      "reactors { totalCount }",
      "pageInfo { hasNextPage }",
      "comments(first: 1)",
    ];
    for (const field of requiredFields) {
      assert.ok(query.includes(field), `query should include "${field}"`);
    }
  });
});
