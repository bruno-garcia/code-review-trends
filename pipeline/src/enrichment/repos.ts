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
  query,
} from "../clickhouse.js";
import { Sentry, log, logError, countMetric, distributionMetric, captureEnrichmentError, sentryLogger } from "../sentry.js";
import { type RateLimiter, RateLimitExitError } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
import { handleEnterprisePolicyError } from "./enterprise-policy.js";
import { summarizeOrgs } from "./summary.js";
import { fetchReposBatch } from "./graphql-repos.js";
import { AdaptiveBatch } from "./adaptive-batch.js";
import { isServerError } from "./graphql-retry.js";

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
  const { total_pending } = (await query<{ total_pending: string }>(
    ch,
    `SELECT count(DISTINCT repo_name) as total_pending FROM pr_bot_events
     WHERE repo_name NOT IN (SELECT name FROM repos)`,
  ))[0] ?? { total_pending: "0" };

  // Filter out repos with invalid repo_name values
  const invalidRepos = repos.filter((r) => !r.repo_name || r.repo_name.trim() === "");
  if (invalidRepos.length > 0) {
    logError(`[repos] WARNING: Found ${invalidRepos.length} repos with invalid repo_name (undefined/null/empty) - skipping these`);
    Sentry.captureMessage(
      `Invalid repo_name values in pr_bot_events: ${invalidRepos.length} repos`,
      { level: "warning", contexts: { enrichment: { phase: "repos", invalid_count: invalidRepos.length } } }
    );
  }
  const validRepos = repos.filter((r) => r.repo_name && r.repo_name.trim() !== "");

  // Summarize what this run will work on
  log(`[repos] Processing ${validRepos.length} of ${total_pending} pending repos`);
  if (validRepos.length > 0) {
    log(`[repos] ${summarizeOrgs(validRepos.map((r) => r.repo_name))}`);
  }

  let fetched = 0;
  let notFound = 0;
  let forbidden = 0;
  let rateLimited = 0;
  let errors = 0;
  const adaptive = new AdaptiveBatch({ max: 50, min: 5 });

  // Process in batches — each batch is a single GraphQL query
  let batchStart = 0;
  while (batchStart < validRepos.length) {
    const batch = validRepos.slice(batchStart, batchStart + adaptive.size);
    const batchLabel = `repos batch ${batchStart}–${batchStart + batch.length}`;

    let batchHandled = false;
    await Sentry.startSpan(
      { op: "enrichment.batch", name: batchLabel },
      async () => {
        const repoNames = batch.map((r) => r.repo_name);

        try {
          const results = await fetchReposBatch(octokit, rateLimiter, repoNames);

          for (const result of results) {
            await insertRepos(ch, [result.row]);
            if (result.status === "ok") {
              fetched++;
            } else if (result.status === "not_found") {
              notFound++;
            } else if (result.status === "forbidden") {
              forbidden++;
            }
          }
          adaptive.onSuccess();
          batchHandled = true;
        } catch (err: unknown) {
          // If the whole batch fails, fall back to individual REST processing
          if (err instanceof RateLimitExitError) throw err;

          // On server error, reduce batch size and retry
          if (isServerError(err) && adaptive.size > adaptive.minSize) {
            adaptive.onServerError();
            return; // batchHandled stays false → while loop retries
          }

          captureEnrichmentError(err, "repos", {
            fallback: "rest",
            batchSize: batch.length,
            repos: batch.map(b => b.repo_name),
          });
          const errMsg = err instanceof Error ? err.message : String(err);
          logError(`[repos] Batch GraphQL query failed, processing individually: ${errMsg}`);
          sentryLogger.warn(sentryLogger.fmt`REST fallback triggered phase=repos batchSize=${batch.length} error=${errMsg}`);

          for (const { repo_name } of batch) {
            const [owner, repo] = repo_name.split("/");
            if (!owner || !repo) continue;

            await rateLimiter.waitIfNeeded();

            try {
              const { data, headers } = await octokit.rest.repos.get({ owner, repo });
              rateLimiter.update(headers as Record<string, string>);

              await insertRepos(ch, [{
                name: repo_name, owner,
                stars: data.stargazers_count,
                primary_language: data.language ?? "",
                fork: data.fork, archived: data.archived,
                fetch_status: "ok",
              }]);
              fetched++;
            } catch (innerErr: unknown) {
              const status = (innerErr as { status?: number }).status;
              if (status === 404) {
                await insertRepos(ch, [{
                  name: repo_name, owner, stars: 0, primary_language: "",
                  fork: false, archived: false, fetch_status: "not_found",
                }]);
                notFound++;
              } else if (status === 403) {
                const headers = (innerErr as { response?: { headers?: Record<string, string> } }).response?.headers;
                if (headers) {
                  rateLimiter.update(headers);
                  const retryAfter = headers["retry-after"];
                  if (retryAfter) {
                    await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
                    rateLimited++;
                  } else if (headers["x-ratelimit-remaining"] === "0") {
                    rateLimited++;
                  } else {
                    // Permanent 403 — record in DB to avoid retrying
                    await insertRepos(ch, [{
                      name: repo_name, owner, stars: 0, primary_language: "",
                      fork: false, archived: false, fetch_status: "forbidden",
                    }]);
                    forbidden++;
                  }
                } else {
                  // Permanent 403 without headers — record in DB to avoid retrying
                  await insertRepos(ch, [{
                    name: repo_name, owner, stars: 0, primary_language: "",
                    fork: false, archived: false, fetch_status: "forbidden",
                  }]);
                  forbidden++;
                }
              } else {
                captureEnrichmentError(innerErr, "repos", { repo: repo_name });
                logError(`[repos] REST fallback error: ${repo_name}: ${innerErr instanceof Error ? innerErr.message : innerErr}`);
                errors++;
              }
            }
          }
          batchHandled = true;
        }
      },
    );

    if (batchHandled) {
      batchStart += batch.length;
    }
    // else: adaptive reduced size, retry same batchStart

    const processed = fetched + notFound + forbidden + rateLimited + errors;
    log(`[repos] Progress: ${processed}/${validRepos.length} (${fetched} ok, ${notFound} not_found, ${forbidden} forbidden, ${errors} errors)`);
    countMetric("pipeline.enrich.repos.batch", 1);
    distributionMetric("pipeline.graphql.batch_size", adaptive.size, "none", { phase: "repos" });
  }

  log(`[repos] Batch sizing: final=${adaptive.summary().current}, max=${adaptive.summary().max}, reductions=${adaptive.summary().reductions}, recoveries=${adaptive.summary().recoveries}`);
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
  const adaptive = new AdaptiveBatch({ max: 50, min: 5 });
  let batchStart = 0;

  while (batchStart < staleRepos.length) {
    const batch = staleRepos.slice(batchStart, batchStart + adaptive.size);
    const repoNames = batch.map(r => r.name);

    try {
      const results = await fetchReposBatch(octokit, rateLimiter, repoNames);

      for (const result of results) {
        await insertRepos(ch, [result.row]);
        if (result.status === "ok") refreshed++;
      }

      adaptive.onSuccess();
      batchStart += batch.length;
    } catch (err: unknown) {
      if (err instanceof RateLimitExitError) throw err;

      if (isServerError(err) && adaptive.size > adaptive.minSize) {
        adaptive.onServerError();
        continue; // retry same batch at smaller size
      }

      // REST fallback for this batch
      const errMsg = err instanceof Error ? err.message : String(err);
      sentryLogger.warn(sentryLogger.fmt`REST fallback triggered phase=${"repos.refresh"} batchSize=${batch.length} error=${errMsg}`);
      captureEnrichmentError(err, "repos.refresh", {
        fallback: "rest",
        batchSize: batch.length,
        repos: repoNames,
      });

      for (const { name } of batch) {
        const [owner, repo] = name.split("/");
        if (!owner || !repo) continue;

        await rateLimiter.waitIfNeeded();

        try {
          const { data, headers } = await octokit.rest.repos.get({ owner, repo });
          rateLimiter.update(headers as Record<string, string>);

          await insertRepos(ch, [{
            name, owner,
            stars: data.stargazers_count,
            primary_language: data.language ?? "",
            fork: data.fork, archived: data.archived,
            fetch_status: "ok",
          }]);
          refreshed++;
        } catch (innerErr: unknown) {
          const status = (innerErr as { status?: number }).status;
          if (status === 404) {
            await insertRepos(ch, [{
              name, owner, stars: 0, primary_language: "",
              fork: false, archived: false, fetch_status: "not_found",
            }]);
          } else if (status === 403) {
            const headers = (innerErr as { response?: { headers?: Record<string, string> } }).response?.headers;
            const isRateLimit = headers?.["retry-after"] || (headers?.["x-ratelimit-remaining"] === "0");
            if (headers) {
              rateLimiter.update(headers);
              const retryAfter = headers["retry-after"];
              if (retryAfter) {
                await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
              }
            }
            if (!isRateLimit) {
              handleEnterprisePolicyError(innerErr, name, "repos");
              await insertRepos(ch, [{
                name, owner, stars: 0, primary_language: "",
                fork: false, archived: false, fetch_status: "forbidden",
              }]);
            } else {
              log(`[repos] Rate-limited refreshing ${name}, will retry later`);
            }
          } else {
            captureEnrichmentError(innerErr, "repos.refresh", { repo: name });
            logError(`[repos] Error refreshing ${name}: ${innerErr instanceof Error ? innerErr.message : innerErr}`);
          }
        }
      }

      batchStart += batch.length;
    }

    const processed = batchStart;
    if (processed % 50 < adaptive.size && processed > 0) {
      log(`[repos] Refresh progress: ${refreshed} refreshed of ${staleRepos.length} processed`);
    }
  }

  log(`[repos] Refresh done: ${refreshed} refreshed (batch size: ${adaptive.summary().current}, reductions: ${adaptive.summary().reductions}, recoveries: ${adaptive.summary().recoveries})`);
  return { refreshed };
}
