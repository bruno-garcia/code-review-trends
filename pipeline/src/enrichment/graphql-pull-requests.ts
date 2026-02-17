/**
 * GraphQL batch PR enrichment.
 *
 * Fetches PR metadata (title, author, state, diff stats, reactions) for
 * multiple PRs in a single GraphQL query using field aliases.
 */

import type { Octokit } from "@octokit/rest";
import { log } from "../sentry.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { PullRequestRow } from "../clickhouse.js";

export const GRAPHQL_PR_BATCH_SIZE = 30;

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

export type PRBatchInput = {
  repo_name: string;
  pr_number: number;
};

export type PRBatchResult = {
  row: PullRequestRow | null;
  status: "ok" | "not_found" | "forbidden";
};

/**
 * Fetch metadata for a batch of PRs via a single GraphQL query.
 * Groups PRs by repo for nested queries.
 */
export async function fetchPRsBatch(
  octokit: Octokit,
  rateLimiter: RateLimiter,
  inputs: PRBatchInput[],
): Promise<PRBatchResult[]> {
  if (inputs.length === 0) return [];

  await rateLimiter.waitIfNeeded();

  // Group by repo for nested queries
  const byRepo = new Map<string, PRBatchInput[]>();
  for (const input of inputs) {
    const existing = byRepo.get(input.repo_name) ?? [];
    existing.push(input);
    byRepo.set(input.repo_name, existing);
  }

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
    const response = await octokit.request("POST /graphql", {
      query: queryStr,
    });
    rateLimiter.update(response.headers as Record<string, string>);
    const data = response.data.data as Record<string, unknown>;

    return buildResults(byRepo, repoIndex, data);
  } catch (err: unknown) {
    // Handle partial responses (same pattern as graphql-repos.ts)
    const gqlErr = err as {
      response?: {
        data?: {
          data?: Record<string, unknown>;
          errors?: Array<{
            type: string;
            path: string[];
            message: string;
          }>;
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
        `[graphql-prs] Partial response: ${gqlErr.response.data.errors.length} errors`,
      );
      return buildResults(byRepo, repoIndex, gqlErr.response.data.data);
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
  reactionGroups: Array<{
    content: string;
    reactors: { totalCount: number };
  }>;
} | null;

function buildResults(
  byRepo: Map<string, PRBatchInput[]>,
  repoIndex: Map<string, number>,
  data: Record<string, unknown>,
): PRBatchResult[] {
  const results: PRBatchResult[] = [];

  for (const [repoName, prInputs] of byRepo) {
    const rIdx = repoIndex.get(repoName)!;
    const repoData = data[`repo${rIdx}`] as Record<string, unknown> | null;

    for (let pi = 0; pi < prInputs.length; pi++) {
      const input = prInputs[pi];

      if (!repoData) {
        results.push({ row: null, status: "not_found" });
        continue;
      }

      const prData = repoData[`pr${pi}`] as GraphQLPRData;

      if (!prData) {
        results.push({ row: null, status: "not_found" });
        continue;
      }

      // Map GraphQL state to our format
      const state =
        prData.state === "MERGED"
          ? "merged"
          : prData.state === "CLOSED"
            ? "closed"
            : "open";

      // Extract reactions
      const reactions: Record<string, number> = {};
      for (const rg of prData.reactionGroups ?? []) {
        const col = REACTION_MAP[rg.content];
        if (col) reactions[col] = rg.reactors.totalCount;
      }

      results.push({
        row: {
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
          thumbs_up: reactions.thumbs_up ?? 0,
          thumbs_down: reactions.thumbs_down ?? 0,
          laugh: reactions.laugh ?? 0,
          confused: reactions.confused ?? 0,
          heart: reactions.heart ?? 0,
          hooray: reactions.hooray ?? 0,
          eyes: reactions.eyes ?? 0,
          rocket: reactions.rocket ?? 0,
        },
        status: "ok",
      });
    }
  }

  return results;
}
