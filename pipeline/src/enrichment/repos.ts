/**
 * Repo metadata enrichment.
 *
 * Fetches stars, languages, and basic info from GitHub API for repos
 * discovered in pr_bot_events. Handles 404/403 gracefully and supports
 * multi-worker partitioning.
 */

import type { Octokit } from "@octokit/rest";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  insertRepos,
  insertRepoLanguages,
  query,
  type RepoRow,
  type RepoLanguageRow,
} from "../clickhouse.js";
import { type RateLimiter } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";

/**
 * Fetch and insert metadata for repos discovered in pr_bot_events
 * that don't yet exist in the repos table.
 */
export async function enrichRepos(
  octokit: Octokit,
  ch: ClickHouseClient,
  rateLimiter: RateLimiter,
  partition: WorkerConfig,
  options?: { limit?: number },
): Promise<{ fetched: number; skipped: number; errors: number }> {
  const limit = options?.limit ?? 1000;
  const partitionClause = partitionWhereClause(partition);

  // Find repos needing enrichment (in pr_bot_events but not in repos)
  const whereFragments = [
    "repo_name NOT IN (SELECT name FROM repos)",
  ];
  if (partitionClause) {
    whereFragments.push(partitionClause);
  }

  const repos = await query<{ repo_name: string }>(
    ch,
    `SELECT DISTINCT repo_name FROM pr_bot_events
     WHERE ${whereFragments.join(" AND ")}
     ORDER BY repo_name
     LIMIT {limit:UInt32}`,
    { limit },
  );

  console.log(`[repos] Found ${repos.length} repos needing enrichment`);

  let fetched = 0;
  let skipped = 0;
  let errors = 0;

  for (const { repo_name } of repos) {
    const [owner, repo] = repo_name.split("/");
    if (!owner || !repo) {
      skipped++;
      continue;
    }

    await rateLimiter.waitIfNeeded();

    try {
      const { data, headers } = await octokit.rest.repos.get({ owner, repo });
      rateLimiter.update(headers as Record<string, string>);

      const repoRow: RepoRow = {
        name: repo_name,
        owner,
        stars: data.stargazers_count,
        primary_language: data.language ?? "",
        fork: data.fork,
        archived: data.archived,
        fetch_status: "ok",
      };

      await insertRepos(ch, [repoRow]);

      // Fetch language breakdown
      await rateLimiter.waitIfNeeded();
      const langResponse = await octokit.rest.repos.listLanguages({ owner, repo });
      rateLimiter.update(langResponse.headers as Record<string, string>);

      const langRows: RepoLanguageRow[] = Object.entries(
        langResponse.data,
      ).map(([language, bytes]) => ({
        repo_name,
        language,
        bytes: bytes as number,
      }));

      if (langRows.length > 0) {
        await insertRepoLanguages(ch, langRows);
      }

      fetched++;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;

      if (status === 404) {
        await insertRepos(ch, [{
          name: repo_name,
          owner,
          stars: 0,
          primary_language: "",
          fork: false,
          archived: false,
          fetch_status: "not_found",
        }]);
        skipped++;
      } else if (status === 403) {
        // Update rate limiter from error response headers if available
        const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers;
        if (headers) {
          rateLimiter.update(headers);
          const retryAfter = headers["retry-after"];
          if (retryAfter) {
            await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
          }
        }

        await insertRepos(ch, [{
          name: repo_name,
          owner,
          stars: 0,
          primary_language: "",
          fork: false,
          archived: false,
          fetch_status: "forbidden",
        }]);
        skipped++;
      } else {
        console.error(`[repos] Error fetching ${repo_name}:`, err instanceof Error ? err.message : err);
        errors++;
      }
    }

    if ((fetched + skipped + errors) % 50 === 0 && (fetched + skipped + errors) > 0) {
      console.log(`[repos] Progress: ${fetched} fetched, ${skipped} skipped, ${errors} errors`);
    }
  }

  console.log(`[repos] Done: ${fetched} fetched, ${skipped} skipped, ${errors} errors`);
  return { fetched, skipped, errors };
}

/**
 * Re-fetch metadata for repos that were successfully fetched but are now stale.
 * Never re-fetches repos with fetch_status 'not_found'.
 */
export async function refreshStaleRepos(
  octokit: Octokit,
  ch: ClickHouseClient,
  rateLimiter: RateLimiter,
  partition: WorkerConfig,
  options?: { staleDays?: number; limit?: number },
): Promise<{ refreshed: number }> {
  const staleDays = options?.staleDays ?? 30;
  const limit = options?.limit ?? 500;
  const partitionClause = partitionWhereClause(partition);

  const whereFragments = [
    "fetch_status = 'ok'",
    `updated_at < now() - INTERVAL ${staleDays} DAY`,
  ];
  if (partitionClause) {
    whereFragments.push(partitionClause.replace("repo_name", "name"));
  }

  const staleRepos = await query<{ name: string }>(
    ch,
    `SELECT name FROM repos
     WHERE ${whereFragments.join(" AND ")}
     ORDER BY updated_at ASC
     LIMIT {limit:UInt32}`,
    { limit },
  );

  console.log(`[repos] Found ${staleRepos.length} stale repos to refresh`);

  let refreshed = 0;

  for (const { name } of staleRepos) {
    const [owner, repo] = name.split("/");
    if (!owner || !repo) continue;

    await rateLimiter.waitIfNeeded();

    try {
      const { data, headers } = await octokit.rest.repos.get({ owner, repo });
      rateLimiter.update(headers as Record<string, string>);

      await insertRepos(ch, [{
        name,
        owner,
        stars: data.stargazers_count,
        primary_language: data.language ?? "",
        fork: data.fork,
        archived: data.archived,
        fetch_status: "ok",
      }]);

      // Refresh languages too
      await rateLimiter.waitIfNeeded();
      const langResponse = await octokit.rest.repos.listLanguages({ owner, repo });
      rateLimiter.update(langResponse.headers as Record<string, string>);

      const langRows: RepoLanguageRow[] = Object.entries(
        langResponse.data,
      ).map(([language, bytes]) => ({
        repo_name: name,
        language,
        bytes: bytes as number,
      }));

      if (langRows.length > 0) {
        await insertRepoLanguages(ch, langRows);
      }

      refreshed++;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        await insertRepos(ch, [{
          name,
          owner,
          stars: 0,
          primary_language: "",
          fork: false,
          archived: false,
          fetch_status: "not_found",
        }]);
      } else {
        console.error(`[repos] Error refreshing ${name}:`, err instanceof Error ? err.message : err);
      }
    }

    if (refreshed % 50 === 0 && refreshed > 0) {
      console.log(`[repos] Refresh progress: ${refreshed} refreshed`);
    }
  }

  console.log(`[repos] Refresh done: ${refreshed} refreshed`);
  return { refreshed };
}
