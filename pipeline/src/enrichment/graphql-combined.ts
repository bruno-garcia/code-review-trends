/**
 * Combined PR + Comments GraphQL batch enrichment.
 *
 * Fetches both PR metadata and review thread comments in a single GraphQL
 * query, reducing API calls by ~50% compared to separate PR + comment stages.
 * Groups PRs by repo and uses field aliases (same pattern as other modules).
 */

import type { Octokit } from "@octokit/rest";
import { log } from "../sentry.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { PullRequestRow, PrCommentRow, PrBotReactionRow } from "../clickhouse.js";
import { BOT_BY_LOGIN } from "../bots.js";
import { graphqlWithRetry } from "./graphql-retry.js";

export const GRAPHQL_COMBINED_BATCH_MAX = 25;
export const GRAPHQL_COMBINED_BATCH_MIN = 5;

const REACTION_MAP: Record<string, string> = {
  THUMBS_UP: "thumbs_up",
  THUMBS_DOWN: "thumbs_down",
  LAUGH: "laugh",
  CONFUSED: "confused",
  HEART: "heart",
  HOORAY: "hooray",
  EYES: "eyes",
  ROCKET: "rocket",
};

export type CombinedBatchInput = {
  repo_name: string;
  pr_number: number;
  /** All bots that need comment enrichment for this PR */
  bot_entries: Array<{
    bot_id: string;
    bot_login: string;
    bot_logins: ReadonlySet<string>;
  }>;
};

export type CombinedBatchResult = {
  input: CombinedBatchInput;
  pr: PullRequestRow | null;
  /** bot_id → comment rows (empty array = no matching comments, caller inserts sentinel) */
  comments: Map<string, PrCommentRow[]>;
  /** Bot hooray reactions found on the PR (for reaction-only review detection) */
  reactions: PrBotReactionRow[];
  /** Whether the hoorayReactions field was present in the response (false on partial/field-level errors) */
  reactionsAvailable: boolean;
  /** Whether more hooray reactions exist beyond the first 20 fetched */
  hasMoreReactions: boolean;
  prStatus: "ok" | "not_found" | "forbidden";
  hasMoreThreads: boolean;
};

/**
 * Fetch PR metadata + review comments for a batch of PRs via a single GraphQL query.
 * Groups PRs by repo for nested queries.
 */
export async function fetchCombinedBatch(
  octokit: Octokit,
  rateLimiter: RateLimiter,
  inputs: CombinedBatchInput[],
): Promise<CombinedBatchResult[]> {
  if (inputs.length === 0) return [];

  await rateLimiter.waitIfNeeded();

  // Group by repo
  const byRepo = new Map<string, CombinedBatchInput[]>();
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

    const prFragments = prInputs.map(
      (input, pi) =>
        `pr${pi}: pullRequest(number: ${input.pr_number}) {
        title
        author { login }
        state
        createdAt
        mergedAt
        closedAt
        additions
        deletions
        changedFiles
        reactionGroups {
          content
          reactors { totalCount }
        }
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
        hoorayReactions: reactions(content: HOORAY, first: 20) {
          totalCount
          pageInfo { hasNextPage }
          nodes {
            databaseId
            user { login }
            createdAt
            content
          }
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
    const response = await graphqlWithRetry(octokit, queryStr, "graphql-combined");
    rateLimiter.update(response.headers);
    const data = response.data.data;
    if (!data) {
      const errors = response.data.errors
        ?.map((e: { message?: string }) => e.message)
        .join("; ");
      throw new Error(
        `GraphQL response contained no data field: ${errors || "unknown"}`,
      );
    }
    return buildCombinedResults(byRepo, repoIndex, data);
  } catch (err: unknown) {
    const gqlErr = err as {
      response?: {
        data?: {
          data?: Record<string, unknown>;
          errors?: Array<{ type: string; path: string[]; message: string }>;
        };
        headers?: Record<string, string>;
        status?: number;
      };
      status?: number;
    };

    if (gqlErr.response?.headers) {
      rateLimiter.update(gqlErr.response.headers);
    }

    if (gqlErr.response?.data?.data && gqlErr.response?.data?.errors) {
      log(
        `[graphql-combined] Partial response: ${gqlErr.response.data.errors.length} errors`,
      );
      return buildCombinedResults(byRepo, repoIndex, gqlErr.response.data.data);
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

type GraphQLReactionGroup = {
  content: string;
  reactors: { totalCount: number };
};

type GraphQLThreadNode = {
  comments: {
    nodes: Array<{
      databaseId: number;
      author: { login: string } | null;
      bodyText: string;
      createdAt: string;
      reactionGroups: GraphQLReactionGroup[];
    }>;
  };
};

type GraphQLHoorayReaction = {
  databaseId: number;
  user: { login: string } | null;
  createdAt: string;
  content: string;
};

type GraphQLPRData = {
  title: string;
  author: { login: string } | null;
  state: "OPEN" | "CLOSED" | "MERGED";
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  reactionGroups: GraphQLReactionGroup[];
  reviewThreads: {
    nodes: GraphQLThreadNode[];
    pageInfo: { hasNextPage: boolean };
  };
  hoorayReactions?: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean };
    nodes: GraphQLHoorayReaction[];
  };
} | null;

function extractReactions(groups: GraphQLReactionGroup[] | undefined): Record<string, number> {
  const reactions: Record<string, number> = {};
  for (const rg of groups ?? []) {
    const col = REACTION_MAP[rg.content];
    if (col) reactions[col] = rg.reactors.totalCount;
  }
  return reactions;
}

export function buildCombinedResults(
  byRepo: Map<string, CombinedBatchInput[]>,
  repoIndex: Map<string, number>,
  data: Record<string, unknown>,
): CombinedBatchResult[] {
  const results: CombinedBatchResult[] = [];

  for (const [repoName, prInputs] of byRepo) {
    const rIdx = repoIndex.get(repoName)!;
    const repoData = data[`repo${rIdx}`] as Record<string, unknown> | null;

    for (let pi = 0; pi < prInputs.length; pi++) {
      const input = prInputs[pi];

      if (!repoData) {
        results.push({
          input,
          pr: null,
          comments: new Map(input.bot_entries.map((b) => [b.bot_id, []])),
          reactions: [],
          reactionsAvailable: false,
          hasMoreReactions: false,
          prStatus: "not_found",
          hasMoreThreads: false,
        });
        continue;
      }

      const prData = repoData[`pr${pi}`] as GraphQLPRData;

      if (!prData) {
        results.push({
          input,
          pr: null,
          comments: new Map(input.bot_entries.map((b) => [b.bot_id, []])),
          reactions: [],
          reactionsAvailable: false,
          hasMoreReactions: false,
          prStatus: "not_found",
          hasMoreThreads: false,
        });
        continue;
      }

      // Parse PR metadata
      const state =
        prData.state === "MERGED"
          ? "merged"
          : prData.state === "CLOSED"
            ? "closed"
            : "open";

      const prReactions = extractReactions(prData.reactionGroups);

      const pr: PullRequestRow = {
        repo_name: input.repo_name,
        pr_number: input.pr_number,
        title: prData.title,
        author: prData.author?.login ?? "",
        state,
        created_at: prData.createdAt,
        merged_at: prData.mergedAt ?? null,
        closed_at: prData.closedAt ?? null,
        additions: prData.additions,
        deletions: prData.deletions,
        changed_files: prData.changedFiles,
        thumbs_up: prReactions.thumbs_up ?? 0,
        thumbs_down: prReactions.thumbs_down ?? 0,
        laugh: prReactions.laugh ?? 0,
        confused: prReactions.confused ?? 0,
        heart: prReactions.heart ?? 0,
        hooray: prReactions.hooray ?? 0,
        eyes: prReactions.eyes ?? 0,
        rocket: prReactions.rocket ?? 0,
      };

      // Parse review threads — group comments by bot_id
      const commentsByBot = new Map<string, PrCommentRow[]>(
        input.bot_entries.map((b) => [b.bot_id, []]),
      );

      const hasMoreThreads = prData.reviewThreads.pageInfo.hasNextPage;

      for (const thread of prData.reviewThreads.nodes) {
        const comment = thread.comments.nodes[0];
        if (!comment) continue;

        const login = comment.author?.login;
        if (!login) continue;

        // Check each bot — GitHub GraphQL strips [bot] suffix
        for (const bot of input.bot_entries) {
          if (!bot.bot_logins.has(login) && !bot.bot_logins.has(`${login}[bot]`)) continue;

          const cReactions = extractReactions(comment.reactionGroups);
          commentsByBot.get(bot.bot_id)!.push({
            repo_name: input.repo_name,
            pr_number: input.pr_number,
            comment_id: String(comment.databaseId),
            bot_id: bot.bot_id,
            body_length: comment.bodyText?.length ?? 0,
            created_at: comment.createdAt,
            thumbs_up: cReactions.thumbs_up ?? 0,
            thumbs_down: cReactions.thumbs_down ?? 0,
            laugh: cReactions.laugh ?? 0,
            confused: cReactions.confused ?? 0,
            heart: cReactions.heart ?? 0,
            hooray: cReactions.hooray ?? 0,
            eyes: cReactions.eyes ?? 0,
            rocket: cReactions.rocket ?? 0,
          });
        }
      }

      // Parse hooray reactions — filter for tracked bot logins
      const botReactions: PrBotReactionRow[] = [];
      const reactionsAvailable = prData.hoorayReactions != null;
      const hasMoreReactions = prData.hoorayReactions?.pageInfo.hasNextPage ?? false;
      for (const reaction of prData.hoorayReactions?.nodes ?? []) {
        const login = reaction.user?.login;
        if (!login) continue;
        // GraphQL strips [bot] suffix — check both forms
        const bot = BOT_BY_LOGIN.get(login) ?? BOT_BY_LOGIN.get(`${login}[bot]`);
        if (!bot) continue;
        botReactions.push({
          repo_name: input.repo_name,
          pr_number: input.pr_number,
          bot_id: bot.id,
          reaction_type: reaction.content.toLowerCase(),
          reacted_at: reaction.createdAt,
          reaction_id: reaction.databaseId,
        });
      }

      results.push({
        input,
        pr,
        comments: commentsByBot,
        reactions: botReactions,
        reactionsAvailable,
        hasMoreReactions,
        prStatus: "ok",
        hasMoreThreads,
      });
    }
  }

  return results;
}
