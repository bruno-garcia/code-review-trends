/**
 * GraphQL batch reaction scanning.
 *
 * Checks PR description reactions for multiple PRs in a single query.
 * Identifies bot reactions (especially hooray/🎉) that indicate
 * "reaction-only" reviews.
 */

import type { Octokit } from "@octokit/rest";
import { log } from "../sentry.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { PrBotReactionRow } from "../clickhouse.js";
import { BOT_BY_LOGIN } from "../bots.js";

export const GRAPHQL_REACTION_BATCH_SIZE = 50; // PRs per query

/** Set of all tracked bot logins */
const TRACKED_LOGINS = new Set(BOT_BY_LOGIN.keys());

export type ReactionBatchInput = {
  repo_name: string;
  pr_number: number;
};

export type ReactionBatchResult = {
  input: ReactionBatchInput;
  reactions: PrBotReactionRow[];
  scanned: boolean; // true if successfully checked
  hasMore?: boolean; // true if >20 hooray reactions (truncated)
  error?: string;
};

type GraphQLReactionData = {
  number: number;
  reactions?: {
    totalCount: number;
    pageInfo: { hasNextPage: boolean };
    nodes: Array<{
      databaseId: number;
      user: { login: string } | null;
      createdAt: string;
      content: string;
    }>;
  };
} | null;

export function buildResults(
  byRepo: Map<string, ReactionBatchInput[]>,
  repoIndex: Map<string, number>,
  data: Record<string, unknown>,
): ReactionBatchResult[] {
  const results: ReactionBatchResult[] = [];

  for (const [repoName, prInputs] of byRepo) {
    const rIdx = repoIndex.get(repoName)!;
    const repoData = data[`repo${rIdx}`] as Record<string, unknown> | null;

    for (let pi = 0; pi < prInputs.length; pi++) {
      const input = prInputs[pi];

      if (!repoData) {
        results.push({ input, reactions: [], scanned: false, error: "repo_not_found" });
        continue;
      }

      const prData = repoData[`pr${pi}`] as GraphQLReactionData;

      if (!prData) {
        results.push({ input, reactions: [], scanned: true }); // PR deleted or is an Issue, mark scanned
        continue;
      }

      // Check if reactions field is present (could be missing due to field-level error)
      if (!prData.reactions) {
        results.push({ input, reactions: [], scanned: false, error: "reactions_unavailable" });
        continue;
      }

      // Filter reactions for tracked bot logins
      const botReactions: PrBotReactionRow[] = [];
      for (const reaction of prData.reactions.nodes) {
        const login = reaction.user?.login;
        if (!login || !TRACKED_LOGINS.has(login)) continue;

        const bot = BOT_BY_LOGIN.get(login);
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

      const hasMore = prData.reactions.pageInfo.hasNextPage;
      results.push({
        input,
        reactions: botReactions,
        scanned: true,
        hasMore,
      });
    }
  }

  return results;
}

export async function fetchReactionsBatch(
  octokit: Octokit,
  rateLimiter: RateLimiter,
  inputs: ReactionBatchInput[],
): Promise<ReactionBatchResult[]> {
  if (inputs.length === 0) return [];

  await rateLimiter.waitIfNeeded();

  // Group by repo
  const byRepo = new Map<string, ReactionBatchInput[]>();
  for (const input of inputs) {
    const existing = byRepo.get(input.repo_name) ?? [];
    existing.push(input);
    byRepo.set(input.repo_name, existing);
  }

  // Build query: for each PR, fetch hooray reactions with user info
  const repoFragments: string[] = [];
  const repoIndex = new Map<string, number>();
  let ri = 0;

  for (const [repoName, prInputs] of byRepo) {
    const [owner, repo] = repoName.split("/");
    repoIndex.set(repoName, ri);

    const prFragments = prInputs.map(
      (input, pi) =>
        `pr${pi}: issueOrPullRequest(number: ${input.pr_number}) {
        ... on PullRequest {
          number
          reactions(content: HOORAY, first: 20) {
            totalCount
            pageInfo { hasNextPage }
            nodes {
              databaseId
              user { login }
              createdAt
              content
            }
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
    const response = await octokit.request("POST /graphql", { query: queryStr });
    rateLimiter.update(response.headers as Record<string, string>);
    const data = response.data.data as Record<string, unknown> | undefined;
    if (!data) {
      const gqlErrors = (response.data as { errors?: Array<{ type?: string; message?: string }> }).errors;
      const count = gqlErrors?.length ?? 0;
      const types = gqlErrors ? [...new Set(gqlErrors.map((e) => e.type ?? "unknown"))].join(", ") : "";
      log(`[graphql-reactions] Errors-only GraphQL response: ${count} errors${types ? ` (${types})` : ""}`);
      return inputs.map((input) => ({ input, reactions: [], scanned: false, error: "no_data" }));
    }

    return buildResults(byRepo, repoIndex, data);
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

    if (gqlErr.response?.data?.data && gqlErr.response?.data?.errors) {
      log(`[graphql-reactions] Partial response: ${gqlErr.response.data.errors.length} errors`);
      return buildResults(byRepo, repoIndex, gqlErr.response.data.data);
    }

    if (gqlErr.status === 403 || gqlErr.status === 429 || gqlErr.response?.status === 403 || gqlErr.response?.status === 429) {
      const retryAfter = gqlErr.response?.headers?.["retry-after"];
      if (retryAfter) {
        await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
      }
    }

    throw err;
  }
}
