/**
 * Pull request details enrichment.
 *
 * Fetches title, author, state, lines changed, and files changed from
 * the GitHub API for PRs discovered in pr_bot_events. Skips PRs whose
 * repos are already known to be deleted (fetch_status = 'not_found').
 */

import type { Octokit } from "@octokit/rest";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  insertPullRequests,
  query,
  type PullRequestRow,
} from "../clickhouse.js";
import { extractReactionCounts } from "../github.js";
import { Sentry, log, logError, countMetric } from "../sentry.js";
import { type RateLimiter } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
import { handleEnterprisePolicyError } from "./enterprise-policy.js";
import { summarizeOrgs, summarizeRepos } from "./summary.js";

/**
 * Fetch and insert details for PRs discovered in pr_bot_events
 * that don't yet exist in the pull_requests table.
 */
export async function enrichPullRequests(
  octokit: Octokit,
  ch: ClickHouseClient,
  rateLimiter: RateLimiter,
  partition: WorkerConfig,
  options?: { limit?: number },
): Promise<{ fetched: number; skipped: number; errors: number }> {
  const limit = options?.limit ?? 1000;
  const partition_clause = partitionWhereClause(partition, "e.repo_name");

  // Find PRs needing enrichment (in pr_bot_events but not in pull_requests).
  // Skip repos known to be deleted — no point hitting the API for them.
  // Note: ClickHouse non-Nullable columns default to '' (String) or 0 (UInt)
  // on LEFT JOIN misses — not NULL. Use the empty-string check, not IS NULL.
  const whereFragments = [
    "p.repo_name = ''",
    "e.repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))",
  ];
  const queryParams: Record<string, number> = { limit };
  if (partition_clause) {
    whereFragments.push(partition_clause.sql);
    Object.assign(queryParams, partition_clause.params);
  }

  const prs = await query<{
    repo_name: string;
    pr_number: number;
  }>(
    ch,
    `SELECT DISTINCT e.repo_name, e.pr_number,
            max(e.event_week) as latest_week,
            COALESCE(max(r.stars), 0) as repo_stars
     FROM pr_bot_events e
     LEFT JOIN pull_requests p ON e.repo_name = p.repo_name AND e.pr_number = p.pr_number
     LEFT JOIN repos r ON e.repo_name = r.name
     WHERE ${whereFragments.join(" AND ")}
     GROUP BY e.repo_name, e.pr_number
     ORDER BY latest_week DESC, repo_stars DESC
     LIMIT {limit:UInt32}`,
    queryParams,
  );

  // Total pending for context
  const { total_pending } = (await query<{ total_pending: string }>(
    ch,
    `SELECT count(DISTINCT (e.repo_name, e.pr_number)) as total_pending
     FROM pr_bot_events e
     LEFT JOIN pull_requests p ON e.repo_name = p.repo_name AND e.pr_number = p.pr_number
     WHERE p.pr_number IS NULL
       AND e.repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))`,
  ))[0] ?? { total_pending: "0" };

  // Filter out PRs with invalid repo_name values
  const invalidPrs = prs.filter((p) => !p.repo_name || p.repo_name.trim() === "");
  if (invalidPrs.length > 0) {
    logError(`[pull-requests] WARNING: Found ${invalidPrs.length} PRs with invalid repo_name (undefined/null/empty) - skipping these`);
    Sentry.captureMessage(
      `Invalid repo_name values in pr_bot_events: ${invalidPrs.length} PRs`,
      { level: "warning", contexts: { enrichment: { phase: "pull-requests", invalid_count: invalidPrs.length } } }
    );
  }
  const validPrs = prs.filter((p) => p.repo_name && p.repo_name.trim() !== "");

  log(`[pull-requests] Processing ${validPrs.length} of ${total_pending} pending PRs`);
  if (validPrs.length > 0) {
    log(`[pull-requests] ${summarizeOrgs(validPrs.map((p) => p.repo_name))}`);
    log(`[pull-requests] ${summarizeRepos(validPrs)}`);
  }

  let fetched = 0;
  let notFound = 0;
  let forbidden = 0;
  let rateLimited = 0;
  let errors = 0;
  const BATCH_SIZE = 100;

  for (let batchStart = 0; batchStart < validPrs.length; batchStart += BATCH_SIZE) {
    const batch = validPrs.slice(batchStart, batchStart + BATCH_SIZE);
    const batchLabel = `prs batch ${batchStart}–${batchStart + batch.length}`;

    await Sentry.startSpan(
      { op: "enrichment.batch", name: batchLabel },
      async () => {
        for (const { repo_name, pr_number } of batch) {
          const [owner, repo] = repo_name.split("/");
          if (!owner || !repo) continue;

          await rateLimiter.waitIfNeeded();

          try {
            const { data, headers } = await octokit.rest.pulls.get({
              owner,
              repo,
              pull_number: pr_number,
            });
            rateLimiter.update(headers as Record<string, string>);

            // Determine state: merged > closed > open
            let state: string;
            if (data.merged_at) {
              state = "merged";
            } else if (data.closed_at) {
              state = "closed";
            } else {
              state = "open";
            }

            const reactions = extractReactionCounts(data);

            const row: PullRequestRow = {
              repo_name,
              pr_number,
              title: data.title,
              author: data.user?.login ?? "",
              state,
              created_at: data.created_at,
              merged_at: data.merged_at ?? null,
              closed_at: data.closed_at ?? null,
              additions: data.additions,
              deletions: data.deletions,
              changed_files: data.changed_files,
              ...reactions,
            };

            await insertPullRequests(ch, [row]);
            fetched++;
          } catch (err: unknown) {
            const status = (err as { status?: number }).status;

            if (status === 404) {
              notFound++;
            } else if (status === 403) {
              const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers;
              if (headers) {
                rateLimiter.update(headers);
                const retryAfter = headers["retry-after"];
                if (retryAfter) {
                  await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
                }
              }
              if (headers?.["retry-after"] || headers?.["x-ratelimit-remaining"] === "0") {
                rateLimited++;
              } else {
                handleEnterprisePolicyError(err, repo_name, "pull-requests");
                forbidden++;
              }
            } else {
              Sentry.captureException(err, { tags: { repo: repo_name }, contexts: { enrichment: { phase: "pull-requests", repo: repo_name, pr_number } } });
              logError(`[pull-requests] Error: ${repo_name}#${pr_number}: ${err instanceof Error ? err.message : err}`);
              errors++;
            }
          }
        }
      },
    );

    const processed = fetched + notFound + forbidden + rateLimited + errors;
    log(`[pull-requests] Progress: ${processed}/${validPrs.length} (${fetched} ok, ${notFound} not_found, ${forbidden} forbidden, ${errors} errors)`);
    countMetric("pipeline.enrich.prs.batch", 1);
  }

  log(`[pull-requests] Done: ${fetched} fetched, ${notFound} not_found, ${forbidden} forbidden, ${rateLimited} rate_limited, ${errors} errors`);
  return { fetched, skipped: notFound + forbidden + rateLimited, errors };
}
