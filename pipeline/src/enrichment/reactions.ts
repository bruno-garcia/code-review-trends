/**
 * PR reaction enrichment.
 *
 * Discovers PRs where tracked bots left reactions (especially 🎉/hooray)
 * that don't generate GH Archive events. This catches "reaction-only"
 * reviews — e.g., Sentry adds 🎉 when it reviews a PR and finds no issues.
 *
 * Uses GraphQL batch queries to check multiple PRs per API call.
 */

import type { Octokit } from "@octokit/rest";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  insertPrBotReactions,
  insertReactionScanProgress,
  query,
  type PrBotReactionRow,
} from "../clickhouse.js";
import { log, logError, countMetric, captureEnrichmentError } from "../sentry.js";
import { type RateLimiter, RateLimitExitError } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
import { fetchReactionsBatch, GRAPHQL_REACTION_BATCH_SIZE, type ReactionBatchInput } from "./graphql-reactions.js";

export async function enrichReactions(
  octokit: Octokit,
  ch: ClickHouseClient,
  rateLimiter: RateLimiter,
  partition: WorkerConfig,
  options?: { limit?: number },
): Promise<{ fetched: number; scanned: number; skipped: number; errors: number }> {
  const limit = options?.limit ?? 500;
  const partitionClause = partitionWhereClause(partition, "repo_name");

  // Find repos where tracked bots have been active, with pending PRs to scan.
  const whereFragments = [
    "repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))",
  ];
  if (partitionClause) {
    whereFragments.push(partitionClause.sql);
  }

  const repos = await query<{ repo_name: string; pending_prs: number }>(
    ch,
    `SELECT
       e.repo_name AS repo_name,
       countDistinct(e.pr_number) - countDistinctIf(e.pr_number, s.pr_number > 0) AS pending_prs,
       max(e.event_week) AS latest_week,
       COALESCE(max(r.stars), 0) AS repo_stars
     FROM pr_bot_events e
     LEFT JOIN reaction_scan_progress s
       ON e.repo_name = s.repo_name AND e.pr_number = s.pr_number
     LEFT JOIN repos r ON e.repo_name = r.name
     WHERE ${whereFragments.join(" AND ")}
     GROUP BY e.repo_name
     HAVING pending_prs > 0
     ORDER BY latest_week DESC, repo_stars DESC
     LIMIT {limit:UInt32}`,
    { limit, ...(partitionClause?.params ?? {}) },
  );

  if (repos.length === 0) {
    log("[reactions] No repos with pending PRs to scan");
    return { fetched: 0, scanned: 0, skipped: 0, errors: 0 };
  }

  const totalPending = repos.reduce((sum, r) => sum + r.pending_prs, 0);
  log(`[reactions] Found ${repos.length} repos with ${totalPending} pending PRs to scan`);

  // Collect all pending PRs across repos
  const allPendingPrs: ReactionBatchInput[] = [];
  for (const { repo_name } of repos) {
    const pendingPrs = await query<{ pr_number: number }>(
      ch,
      `SELECT DISTINCT e.pr_number
       FROM pr_bot_events e
       LEFT JOIN reaction_scan_progress s
         ON e.repo_name = s.repo_name AND e.pr_number = s.pr_number
       WHERE e.repo_name = {repo:String}
         AND s.pr_number = 0
       ORDER BY e.pr_number DESC`,
      { repo: repo_name },
    );
    for (const { pr_number } of pendingPrs) {
      allPendingPrs.push({ repo_name, pr_number });
    }
  }

  log(`[reactions] Collected ${allPendingPrs.length} pending PRs to scan`);

  let fetched = 0;    // PRs where we found a bot reaction
  let scanned = 0;    // PRs we checked (including no-reaction ones)
  let skipped = 0;    // PRs skipped (not found, forbidden, etc.)
  let errors = 0;
  let totalApiCalls = 0;

  const BATCH_SIZE = GRAPHQL_REACTION_BATCH_SIZE;

  for (let batchStart = 0; batchStart < allPendingPrs.length; batchStart += BATCH_SIZE) {
    const batch = allPendingPrs.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      const results = await fetchReactionsBatch(octokit, rateLimiter, batch);

      const sentinels: { repo_name: string; pr_number: number }[] = [];
      const reactionRows: PrBotReactionRow[] = [];

      for (const result of results) {
        if (!result.scanned) {
          if (result.error === "repo_not_found") skipped++;
          else errors++;
          continue;
        }

        sentinels.push({ repo_name: result.input.repo_name, pr_number: result.input.pr_number });
        scanned++;

        if (result.hasMore) {
          log(`[reactions] ${result.input.repo_name}#${result.input.pr_number} has >20 hooray reactions, saved partial`);
        }

        if (result.reactions.length > 0) {
          reactionRows.push(...result.reactions);
          fetched++;
        }
      }

      if (sentinels.length > 0) {
        await insertReactionScanProgress(ch, sentinels);
      }
      if (reactionRows.length > 0) {
        await insertPrBotReactions(ch, reactionRows);
      }
    } catch (err: unknown) {
      if (err instanceof RateLimitExitError) throw err;
      captureEnrichmentError(err, "reactions", {
        fallback: "none",
        batchSize: batch.length,
        repos: [...new Set(batch.map(b => b.repo_name))],
      });
      logError(`[reactions] Batch GraphQL failed: ${err instanceof Error ? err.message : err}`);
      errors += batch.length;
    }

    totalApiCalls++;
    const batchIndex = batchStart / BATCH_SIZE;
    if (batchIndex % 10 === 0) {
      const processed = scanned + skipped + errors;
      log(`[reactions] Progress: ${processed}/${allPendingPrs.length} PRs (${fetched} with bot reactions)`);
    }
    countMetric("pipeline.enrich.reactions.batch", 1);
  }

  log(`[reactions] Done: ${fetched} PRs with bot reactions, ${scanned} scanned, ${skipped} skipped, ${errors} errors (${totalApiCalls} API calls)`);
  return { fetched, scanned, skipped, errors };
}
