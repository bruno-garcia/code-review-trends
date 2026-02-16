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
import { Sentry, log, logError, countMetric } from "../sentry.js";
import { type RateLimiter } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
import { handleEnterprisePolicyError } from "./enterprise-policy.js";
import { summarizeOrgs } from "./summary.js";

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
  const partition_clause = partitionWhereClause(partition);

  // Find repos needing enrichment (in pr_bot_events but not in repos)
  const whereFragments = [
    "repo_name NOT IN (SELECT name FROM repos)",
  ];
  const queryParams: Record<string, number> = { limit };
  if (partition_clause) {
    whereFragments.push(partition_clause.sql);
    Object.assign(queryParams, partition_clause.params);
  }

  const repos = await query<{ repo_name: string }>(
    ch,
    `SELECT repo_name, max(event_week) AS latest_week FROM pr_bot_events
     WHERE ${whereFragments.join(" AND ")}
     GROUP BY repo_name
     ORDER BY latest_week DESC
     LIMIT {limit:UInt32}`,
    queryParams,
  );

  // Total pending (without limit) for context
  const [{ total_pending }] = await query<{ total_pending: string }>(
    ch,
    `SELECT count(DISTINCT repo_name) as total_pending FROM pr_bot_events
     WHERE repo_name NOT IN (SELECT name FROM repos)`,
  );

  // Summarize what this run will work on
  log(`[repos] Processing ${repos.length} of ${total_pending} pending repos`);
  if (repos.length > 0) {
    log(`[repos] ${summarizeOrgs(repos.map((r) => r.repo_name))}`);
  }

  let fetched = 0;
  let notFound = 0;
  let forbidden = 0;
  let rateLimited = 0;
  let errors = 0;
  const BATCH_SIZE = 50;

  // Process in batches — each batch is a Sentry span wrapping real work
  for (let batchStart = 0; batchStart < repos.length; batchStart += BATCH_SIZE) {
    const batch = repos.slice(batchStart, batchStart + BATCH_SIZE);
    const batchLabel = `repos batch ${batchStart}–${batchStart + batch.length}`;

    await Sentry.startSpan(
      { op: "enrichment.batch", name: batchLabel },
      async () => {
        for (const { repo_name } of batch) {
          const [owner, repo] = repo_name.split("/");
          if (!owner || !repo) continue;

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
                name: repo_name, owner, stars: 0, primary_language: "",
                fork: false, archived: false, fetch_status: "not_found",
              }]);
              notFound++;
            } else if (status === 403) {
              const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers;
              const isRateLimit = headers?.["retry-after"] || (headers?.["x-ratelimit-remaining"] === "0");
              if (headers) {
                rateLimiter.update(headers);
                const retryAfter = headers["retry-after"];
                if (retryAfter) {
                  await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
                }
              }
              if (isRateLimit) {
                rateLimited++;
              } else {
                handleEnterprisePolicyError(err, repo_name, "repos");
                await insertRepos(ch, [{
                  name: repo_name, owner, stars: 0, primary_language: "",
                  fork: false, archived: false, fetch_status: "forbidden",
                }]);
                forbidden++;
              }
            } else {
              Sentry.captureException(err, { tags: { repo: repo_name }, contexts: { enrichment: { phase: "repos", repo: repo_name } } });
              logError(`[repos] Error fetching ${repo_name}: ${err instanceof Error ? err.message : err}`);
              errors++;
            }
          }
        }
      },
    );

    const processed = fetched + notFound + forbidden + rateLimited + errors;
    log(`[repos] Progress: ${processed}/${repos.length} (${fetched} ok, ${notFound} not_found, ${forbidden} forbidden, ${errors} errors)`);
    countMetric("pipeline.enrich.repos.batch", 1);
  }

  log(`[repos] Done: ${fetched} fetched, ${notFound} not_found, ${forbidden} forbidden, ${rateLimited} rate_limited, ${errors} errors`);
  return { fetched, skipped: notFound + forbidden + rateLimited, errors };
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
  const partition_clause = partitionWhereClause(partition, "name");

  const whereFragments = [
    "fetch_status = 'ok'",
    `updated_at < now() - toIntervalDay({staleDays:UInt32})`,
  ];
  const queryParams: Record<string, number> = { limit, staleDays };
  if (partition_clause) {
    whereFragments.push(partition_clause.sql);
    Object.assign(queryParams, partition_clause.params);
  }

  const staleRepos = await query<{ name: string }>(
    ch,
    `SELECT name FROM repos
     WHERE ${whereFragments.join(" AND ")}
     ORDER BY updated_at ASC
     LIMIT {limit:UInt32}`,
    queryParams,
  );

  log(`[repos] Found ${staleRepos.length} stale repos to refresh`);

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
      } else if (status === 403) {
        const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers;
        const isRateLimit = headers?.["retry-after"] || (headers?.["x-ratelimit-remaining"] === "0");
        if (headers) {
          rateLimiter.update(headers);
          const retryAfter = headers["retry-after"];
          if (retryAfter) {
            await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
          }
        }
        if (!isRateLimit) {
          // Check for enterprise token policy before marking forbidden
          handleEnterprisePolicyError(err, name, "repos");

          // Real 403 (DMCA, private, enterprise policy, etc.) — mark as forbidden
          await insertRepos(ch, [{
            name,
            owner,
            stars: 0,
            primary_language: "",
            fork: false,
            archived: false,
            fetch_status: "forbidden",
          }]);
        } else {
          log(`[repos] Rate-limited refreshing ${name}, will retry later`);
        }
      } else {
        Sentry.captureException(err, { tags: { repo: name }, contexts: { enrichment: { phase: "repos.refresh", repo: name } } });
        logError(`[repos] Error refreshing ${name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (refreshed % 50 === 0 && refreshed > 0) {
      log(`[repos] Refresh progress: ${refreshed} refreshed`);
    }
  }

  log(`[repos] Refresh done: ${refreshed} refreshed`);
  return { refreshed };
}
