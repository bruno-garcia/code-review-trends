/**
 * GraphQL batch repo enrichment.
 *
 * Fetches metadata for multiple repos in a single GraphQL query using
 * field aliases. Each query can include up to BATCH_SIZE repos, reducing
 * API calls from N to N/BATCH_SIZE.
 *
 * GraphQL rate limit: 5,000 points/hour. A query with N repos costs ~N+1 points.
 */

import type { Octokit } from "@octokit/rest";
import { log } from "../sentry.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { RepoRow } from "../clickhouse.js";
import { graphqlWithRetry } from "./graphql-retry.js";

export const GRAPHQL_REPO_BATCH_SIZE = 30;

export type GraphQLRepoResult = {
  row: RepoRow;
  status: "ok" | "not_found" | "forbidden";
};

/**
 * Fetch metadata for a batch of repos via a single GraphQL query.
 * Returns results for each repo (including not_found/forbidden).
 *
 * Uses `octokit.request("POST /graphql")` instead of `octokit.graphql()`
 * to get access to response headers for rate limit tracking.
 */
export async function fetchReposBatch(
  octokit: Octokit,
  rateLimiter: RateLimiter,
  repoNames: string[], // ["owner/repo", ...]
): Promise<GraphQLRepoResult[]> {
  if (repoNames.length === 0) return [];

  await rateLimiter.waitIfNeeded();

  // Build aliased query: r0: repository(owner:"a", name:"b") { ...fields } ...
  const fragments = repoNames.map((name, i) => {
    const [owner, repo] = name.split("/");
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) {
      stargazerCount
      primaryLanguage { name }
      isFork
      isArchived
    }`;
  });

  const queryStr = `query { ${fragments.join("\n")} }`;

  try {
    const response = await graphqlWithRetry(octokit, queryStr, "graphql-repos");
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
    return buildResults(repoNames, data);
  } catch (err: unknown) {
    // GraphQL errors may include partial data + errors array
    const gqlErr = err as {
      response?: {
        data?: { data?: Record<string, unknown>; errors?: Array<{ type: string; path: string[]; message: string }> };
        headers?: Record<string, string>;
        status?: number;
      };
      status?: number;
    };

    // Update rate limiter from headers if available
    if (gqlErr.response?.headers) {
      rateLimiter.update(gqlErr.response.headers);
    }

    // If we got partial data + errors, process what we can
    const responseData = gqlErr.response?.data;
    if (responseData?.data && responseData?.errors) {
      log(`[graphql-repos] Partial response: ${responseData.errors.length} errors in batch of ${repoNames.length}`);

      const results: GraphQLRepoResult[] = [];
      for (let i = 0; i < repoNames.length; i++) {
        const name = repoNames[i];
        const [owner] = name.split("/");
        const repoData = responseData.data[`r${i}`] as {
          stargazerCount: number;
          primaryLanguage: { name: string } | null;
          isFork: boolean;
          isArchived: boolean;
        } | null;

        if (repoData === null) {
          const repoError = responseData.errors?.find((e) => e.path?.[0] === `r${i}`);
          const isForbidden = repoError?.type === "FORBIDDEN";
          results.push({
            row: {
              name, owner: owner ?? "", stars: 0, primary_language: "",
              fork: false, archived: false,
              fetch_status: isForbidden ? "forbidden" : "not_found",
            },
            status: isForbidden ? "forbidden" : "not_found",
          });
        } else {
          results.push({
            row: {
              name,
              owner: owner ?? "",
              stars: repoData.stargazerCount,
              primary_language: repoData.primaryLanguage?.name ?? "",
              fork: repoData.isFork,
              archived: repoData.isArchived,
              fetch_status: "ok",
            },
            status: "ok",
          });
        }
      }
      return results;
    }

    // Check for rate limit
    const status = gqlErr.status ?? gqlErr.response?.status;
    if (status === 403 || status === 429) {
      const retryAfter = gqlErr.response?.headers?.["retry-after"];
      if (retryAfter) {
        await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
      }
    }

    // Re-throw if we can't handle it
    throw err;
  }
}

type GraphQLRepoData = {
  stargazerCount: number;
  primaryLanguage: { name: string } | null;
  isFork: boolean;
  isArchived: boolean;
} | null;

export function buildResults(
  repoNames: string[],
  data: Record<string, unknown>,
): GraphQLRepoResult[] {
  const results: GraphQLRepoResult[] = [];

  for (let i = 0; i < repoNames.length; i++) {
    const name = repoNames[i];
    const [owner] = name.split("/");
    const repoData = data[`r${i}`] as GraphQLRepoData;

    if (repoData === null || repoData === undefined) {
      results.push({
        row: {
          name, owner: owner ?? "", stars: 0, primary_language: "",
          fork: false, archived: false, fetch_status: "not_found",
        },
        status: "not_found",
      });
    } else {
      results.push({
        row: {
          name,
          owner: owner ?? "",
          stars: repoData.stargazerCount,
          primary_language: repoData.primaryLanguage?.name ?? "",
          fork: repoData.isFork,
          archived: repoData.isArchived,
          fetch_status: "ok",
        },
        status: "ok",
      });
    }
  }

  return results;
}
