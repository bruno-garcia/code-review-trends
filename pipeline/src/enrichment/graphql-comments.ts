/**
 * GraphQL batch comment enrichment.
 *
 * Fetches bot review comments with inline reactions for multiple PRs
 * in a single GraphQL query. Groups PRs by repo and uses field aliases.
 *
 * Uses `reviewThreads` to get top-level review comments only (first comment
 * in each thread), avoiding the need to filter out replies.
 */

import type { Octokit } from "@octokit/rest";
import { log } from "../sentry.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { PrCommentRow } from "../clickhouse.js";
import { graphqlWithRetry } from "./graphql-retry.js";

export const GRAPHQL_COMMENT_BATCH_SIZE = 20;

const REACTION_MAP: Record<string, keyof Pick<PrCommentRow, "thumbs_up" | "thumbs_down" | "laugh" | "confused" | "heart" | "hooray" | "eyes" | "rocket">> = {
  THUMBS_UP: "thumbs_up",
  THUMBS_DOWN: "thumbs_down",
  LAUGH: "laugh",
  CONFUSED: "confused",
  HEART: "heart",
  HOORAY: "hooray",
  EYES: "eyes",
  ROCKET: "rocket",
};

export type CommentBatchInput = {
  repo_name: string;
  pr_number: number;
  bot_id: string;
  /** Primary GitHub login (used for identification/logging). */
  bot_login: string;
  /**
   * All GitHub logins for this bot (primary + additional_logins).
   * Used when filtering comments — a bot may post under different accounts
   * (e.g. Copilot uses both `copilot-pull-request-reviewer[bot]` and `Copilot`).
   */
  bot_logins: ReadonlySet<string>;
};

export type CommentBatchResult = {
  input: CommentBatchInput;
  comments: PrCommentRow[];
  hasMore: boolean;
  error?: string;
};

type ThreadNode = {
  comments: {
    nodes: Array<{
      databaseId: number;
      author: { login: string } | null;
      bodyText: string;
      createdAt: string;
      reactionGroups: Array<{
        content: string;
        reactors: { totalCount: number };
      }>;
    }>;
  };
};

type PrData = {
  reviewThreads: {
    nodes: ThreadNode[];
    pageInfo: { hasNextPage: boolean };
  };
} | null;

/**
 * Fetch bot review comments for a batch of PRs via a single GraphQL query.
 * Groups PRs by repo and uses field aliases.
 */
export async function fetchCommentsBatch(
  octokit: Octokit,
  rateLimiter: RateLimiter,
  inputs: CommentBatchInput[],
): Promise<CommentBatchResult[]> {
  if (inputs.length === 0) return [];

  await rateLimiter.waitIfNeeded();

  // Group by repo
  const byRepo = new Map<string, CommentBatchInput[]>();
  for (const input of inputs) {
    const existing = byRepo.get(input.repo_name) ?? [];
    existing.push(input);
    byRepo.set(input.repo_name, existing);
  }

  // Build query
  const repoFragments: string[] = [];
  const repoIndex = new Map<string, number>();
  let ri = 0;
  for (const [repoName, prInputs] of byRepo) {
    const [owner, repo] = repoName.split("/");
    repoIndex.set(repoName, ri);

    const prFragments = prInputs.map((input, pi) =>
      `pr${pi}: pullRequest(number: ${input.pr_number}) {
        reviewThreads(first: 100) {
          nodes {
            comments(first: 1) {
              nodes {
                databaseId
                author { login }
                bodyText
                createdAt
                reactionGroups {
                  content
                  reactors { totalCount }
                }
              }
            }
          }
          pageInfo { hasNextPage }
        }
      }`,
    );

    repoFragments.push(
      `repo${ri}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) {
        ${prFragments.join("\n")}
      }`,
    );
    ri++;
  }

  const queryStr = `query { ${repoFragments.join("\n")} }`;

  try {
    const response = await graphqlWithRetry(octokit, queryStr, "graphql-comments");
    rateLimiter.update(response.headers);
    const data = response.data.data;
    if (!data) {
      const gqlErrors = response.data.errors;
      const count = gqlErrors?.length ?? 0;
      const messages = gqlErrors?.map((e) => e.message).filter(Boolean).join(" | ") ?? "";
      log(`[graphql-comments] Errors-only GraphQL response: ${count} errors${messages ? ` - ${messages}` : ""}`);
      return inputs.map((input) => ({ input, comments: [], hasMore: false, error: "partial_error" }));
    }
    return parseResults(byRepo, repoIndex, data);
  } catch (err: unknown) {
    const gqlErr = err as {
      response?: {
        data?: { data?: Record<string, unknown>; errors?: Array<{ type: string; path: string[]; message: string }> };
        headers?: Record<string, string>;
        status?: number;
      };
      status?: number;
    };

    if (gqlErr.response?.headers) {
      rateLimiter.update(gqlErr.response.headers);
    }

    // Partial data + errors: return empty results so caller can fall back to REST
    if (gqlErr.response?.data?.data && gqlErr.response?.data?.errors) {
      log(`[graphql-comments] Partial response: ${gqlErr.response.data.errors.length} errors`);
      return inputs.map((input) => ({ input, comments: [], hasMore: false, error: "partial_error" }));
    }

    const status = gqlErr.status ?? gqlErr.response?.status;
    if (status === 403 || status === 429) {
      const retryAfter = gqlErr.response?.headers?.["retry-after"];
      if (retryAfter) {
        await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
      }
    }

    throw err;
  }
}

export function parseResults(
  byRepo: Map<string, CommentBatchInput[]>,
  repoIndex: Map<string, number>,
  data: Record<string, unknown>,
): CommentBatchResult[] {
  const results: CommentBatchResult[] = [];

  for (const [repoName, prInputs] of byRepo) {
    const rIdx = repoIndex.get(repoName)!;
    const repoData = data[`repo${rIdx}`] as Record<string, unknown> | null;

    for (let pi = 0; pi < prInputs.length; pi++) {
      const input = prInputs[pi];

      if (!repoData) {
        results.push({ input, comments: [], hasMore: false, error: "repo_not_found" });
        continue;
      }

      const prData = repoData[`pr${pi}`] as PrData;

      if (!prData) {
        results.push({ input, comments: [], hasMore: false, error: "pr_not_found" });
        continue;
      }

      const comments: PrCommentRow[] = [];
      const hasMore = prData.reviewThreads.pageInfo.hasNextPage;

      for (const thread of prData.reviewThreads.nodes) {
        const comment = thread.comments.nodes[0];
        if (!comment) continue;
        if (!comment.author?.login || !input.bot_logins.has(comment.author.login)) continue;

        const reactions: Record<string, number> = {};
        for (const rg of comment.reactionGroups ?? []) {
          const col = REACTION_MAP[rg.content];
          if (col) reactions[col] = rg.reactors.totalCount;
        }

        comments.push({
          repo_name: input.repo_name,
          pr_number: input.pr_number,
          comment_id: String(comment.databaseId),
          bot_id: input.bot_id,
          body_length: comment.bodyText?.length ?? 0,
          created_at: comment.createdAt,
          thumbs_up: reactions.thumbs_up ?? 0,
          thumbs_down: reactions.thumbs_down ?? 0,
          laugh: reactions.laugh ?? 0,
          confused: reactions.confused ?? 0,
          heart: reactions.heart ?? 0,
          hooray: reactions.hooray ?? 0,
          eyes: reactions.eyes ?? 0,
          rocket: reactions.rocket ?? 0,
        });
      }

      results.push({ input, comments, hasMore });
    }
  }

  return results;
}
