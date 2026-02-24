/**
 * Combined PR + Comments enrichment orchestrator.
 *
 * Finds PRs that need BOTH PR metadata AND bot comments, then fetches
 * both in a single GraphQL query via fetchCombinedBatch. This reduces
 * API calls by ~50% compared to running separate PR + comment stages.
 *
 * Items that fail here are left for the individual enrichPullRequests
 * and enrichComments stages to pick up — no REST fallback needed.
 */

import type { Octokit } from "@octokit/rest";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  insertPullRequests,
  insertPrComments,
  insertPrBotReactions,
  insertReactionScanProgress,
  query,
} from "../clickhouse.js";
import { BOT_BY_ID } from "../bots.js";
import {
  Sentry,
  log,
  logError,
  countMetric,
  captureEnrichmentError,
  sentryLogger,
} from "../sentry.js";
import { type RateLimiter, RateLimitExitError } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
import { summarizeOrgs, summarizeRepos } from "./summary.js";
import { AdaptiveBatch } from "./adaptive-batch.js";
import { isServerError } from "./graphql-retry.js";
import {
  fetchCombinedBatch,
  GRAPHQL_COMBINED_BATCH_MAX,
  GRAPHQL_COMBINED_BATCH_MIN,
  type CombinedBatchInput,
} from "./graphql-combined.js";

export type CombinedResult = {
  prs_fetched: number;
  comments_fetched: number;
  reactions_scanned: number;
  reactions_found: number;
  skipped: number;
  errors: number;
};

/**
 * Find and enrich PRs that need both PR metadata and bot comments.
 * Uses combined GraphQL queries for efficiency. Failed items are
 * left for individual stages (enrichPullRequests, enrichComments).
 */
export async function enrichCombined(
  octokit: Octokit,
  ch: ClickHouseClient,
  rateLimiter: RateLimiter,
  partition: WorkerConfig,
  options?: { limit?: number },
): Promise<CombinedResult> {
  const limit = options?.limit ?? 1000;
  const partition_clause = partitionWhereClause(partition, "e.repo_name");

  // Find (repo, pr, bot_id) tuples where BOTH PR metadata AND that bot's
  // comments are missing. Group client-side by (repo, pr).
  const whereFragments = [
    "p.repo_name = ''",
    "c.repo_name = ''",
    "e.repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))",
  ];
  const queryParams: Record<string, number> = { limit };
  if (partition_clause) {
    whereFragments.push(partition_clause.sql);
    Object.assign(queryParams, partition_clause.params);
  }

  const rows = await query<{
    repo_name: string;
    pr_number: number;
    bot_id: string;
  }>(
    ch,
    `SELECT
       e.repo_name AS repo_name,
       e.pr_number AS pr_number,
       e.bot_id AS bot_id,
       max(e.event_week) AS latest_week,
       COALESCE(max(r.stars), 0) AS repo_stars
     FROM pr_bot_events e
     LEFT JOIN pull_requests p
       ON e.repo_name = p.repo_name AND e.pr_number = p.pr_number
     LEFT JOIN (
       SELECT DISTINCT repo_name, pr_number, bot_id FROM pr_comments
     ) c ON e.repo_name = c.repo_name AND e.pr_number = c.pr_number AND e.bot_id = c.bot_id
     LEFT JOIN repos r ON e.repo_name = r.name
     WHERE ${whereFragments.join(" AND ")}
     GROUP BY e.repo_name, e.pr_number, e.bot_id
     ORDER BY latest_week DESC, repo_stars DESC
     LIMIT {limit:UInt32}`,
    queryParams,
  );

  // Group by (repo_name, pr_number)
  const prMap = new Map<
    string,
    { repo_name: string; pr_number: number; bot_ids: string[] }
  >();
  for (const row of rows) {
    const key = `${row.repo_name}#${row.pr_number}`;
    let group = prMap.get(key);
    if (!group) {
      group = {
        repo_name: row.repo_name,
        pr_number: row.pr_number,
        bot_ids: [],
      };
      prMap.set(key, group);
    }
    group.bot_ids.push(row.bot_id);
  }
  const prGroups = [...prMap.values()];

  log(
    `[combined] Processing ${prGroups.length} PRs (${rows.length} bot combos)`,
  );
  if (prGroups.length > 0) {
    log(
      `[combined] ${summarizeOrgs(prGroups.map((g) => g.repo_name))}`,
    );
    log(`[combined] ${summarizeRepos(prGroups)}`);
  }

  if (prGroups.length === 0) {
    return { prs_fetched: 0, comments_fetched: 0, reactions_scanned: 0, reactions_found: 0, skipped: 0, errors: 0 };
  }

  let prs_fetched = 0;
  let comments_fetched = 0;
  let reactions_scanned = 0;
  let reactions_found = 0;
  let skipped = 0;
  let errors = 0;
  const adaptive = new AdaptiveBatch({
    max: GRAPHQL_COMBINED_BATCH_MAX,
    min: GRAPHQL_COMBINED_BATCH_MIN,
  });

  let batchStart = 0;
  while (batchStart < prGroups.length) {
    const batch = prGroups.slice(batchStart, batchStart + adaptive.size);
    const batchLabel = `combined batch ${batchStart}–${batchStart + batch.length}`;

    let batchHandled = false;
    await Sentry.startSpan(
      { op: "enrichment.batch", name: batchLabel },
      async () => {
        // Build batch inputs, resolving bot_ids to login info
        const batchInputs: CombinedBatchInput[] = [];
        for (const group of batch) {
          const botEntries: CombinedBatchInput["bot_entries"] = [];
          for (const bot_id of group.bot_ids) {
            const bot = BOT_BY_ID.get(bot_id);
            if (!bot) continue;
            botEntries.push({
              bot_id,
              bot_login: bot.github_login,
              bot_logins: new Set([
                bot.github_login,
                ...(bot.additional_logins ?? []),
              ]),
            });
          }
          if (botEntries.length === 0) continue;
          batchInputs.push({
            repo_name: group.repo_name,
            pr_number: group.pr_number,
            bot_entries: botEntries,
          });
        }

        if (batchInputs.length === 0) {
          skipped += batch.length;
          batchHandled = true;
          return;
        }

        try {
          const graphqlStart = Date.now();
          const results = await fetchCombinedBatch(
            octokit,
            rateLimiter,
            batchInputs,
          );
          const graphqlMs = Date.now() - graphqlStart;

          // Collect all rows for bulk insert instead of inserting one-by-one.
          // This reduces ~75+ sequential HTTP calls to ClickHouse down to 4.
          const allPrRows: import("../clickhouse.js").PullRequestRow[] = [];
          const allCommentRows: import("../clickhouse.js").PrCommentRow[] = [];
          const allReactionRows: import("../clickhouse.js").PrBotReactionRow[] = [];
          const allScanProgress: { repo_name: string; pr_number: number; scan_status: string }[] = [];

          // Track batch-local counters — only merge into outer counters
          // after bulk insert succeeds, so retries don't double-count.
          let batchPrs = 0;
          let batchComments = 0;
          let batchSkipped = 0;
          let batchReactionsScanned = 0;
          let batchReactionsFound = 0;

          for (const result of results) {
            // Collect PR row
            if (result.pr) {
              allPrRows.push(result.pr);
              batchPrs++;
            } else if (
              result.prStatus === "not_found" ||
              result.prStatus === "forbidden"
            ) {
              batchSkipped++;
            }

            // Collect comment rows for each bot — only when PR was actually found.
            // Skip not_found/forbidden PRs: don't insert sentinels that would
            // permanently prevent retry if the PR was only temporarily unavailable.
            // Also skip if hasMoreThreads is true — there may be bot comments
            // beyond the first 100 threads that we couldn't fetch.
            if (result.prStatus === "ok" && !result.hasMoreThreads) {
              for (const botEntry of result.input.bot_entries) {
                const botComments =
                  result.comments.get(botEntry.bot_id) ?? [];
                if (botComments.length > 0) {
                  allCommentRows.push(...botComments);
                } else {
                  // Sentinel row — marks this bot/PR combo as enriched with no results
                  allCommentRows.push({
                    repo_name: result.input.repo_name,
                    pr_number: result.input.pr_number,
                    comment_id: "0",
                    bot_id: botEntry.bot_id,
                    body_length: 0,
                    created_at: new Date().toISOString(),
                    thumbs_up: 0,
                    thumbs_down: 0,
                    laugh: 0,
                    confused: 0,
                    heart: 0,
                    hooray: 0,
                    eyes: 0,
                    rocket: 0,
                  });
                }
                batchComments++;
              }
            } else if (result.prStatus === "ok" && result.hasMoreThreads) {
              // PR has >100 review threads — insert found comments but skip
              // sentinels. The individual enrichComments stage will handle the rest.
              for (const botEntry of result.input.bot_entries) {
                const botComments =
                  result.comments.get(botEntry.bot_id) ?? [];
                if (botComments.length > 0) {
                  allCommentRows.push(...botComments);
                  batchComments++;
                }
                // No sentinel — leave for individual stage to process fully
              }
              if (result.hasMoreThreads) {
                log(
                  `[combined] ${result.input.repo_name}#${result.input.pr_number} has >100 review threads, skipping sentinels`,
                );
              }
            }

            // Collect reaction data — only for successfully fetched PRs
            // where the hoorayReactions field was present in the response.
            // Skip if hasMoreReactions (>20 hooray reactions) — leave for
            // the dedicated reaction stage which can paginate.
            if (result.prStatus === "ok" && result.reactionsAvailable && !result.hasMoreReactions) {
              if (result.reactions.length > 0) {
                allReactionRows.push(...result.reactions);
                batchReactionsFound++;
              }
              allScanProgress.push({
                repo_name: result.input.repo_name,
                pr_number: result.input.pr_number,
                scan_status: "ok",
              });
              batchReactionsScanned++;
            } else if (result.prStatus === "ok" && result.reactionsAvailable && result.hasMoreReactions) {
              // Collect what we have but don't mark as scanned — dedicated
              // reaction stage will do a full scan with pagination.
              if (result.reactions.length > 0) {
                allReactionRows.push(...result.reactions);
              }
              log(
                `[combined] ${result.input.repo_name}#${result.input.pr_number} has >20 hooray reactions, leaving for reaction stage`,
              );
            }
          }

          // Bulk insert all collected rows (4 calls instead of ~75+)
          const insertStart = Date.now();
          await Sentry.startSpan(
            { op: "db.insert", name: "combined bulk insert" },
            async () => {
              await insertPullRequests(ch, allPrRows);
              await insertPrComments(ch, allCommentRows);
              await insertPrBotReactions(ch, allReactionRows);
              await insertReactionScanProgress(ch, allScanProgress);
            },
          );
          const insertMs = Date.now() - insertStart;

          // Merge counters only after successful insert to avoid
          // double-counting when adaptive batch reduction retries.
          prs_fetched += batchPrs;
          comments_fetched += batchComments;
          skipped += batchSkipped;
          reactions_scanned += batchReactionsScanned;
          reactions_found += batchReactionsFound;

          log(
            `[combined] Batch timing: graphql=${graphqlMs}ms, insert=${insertMs}ms (${allPrRows.length} PRs, ${allCommentRows.length} comments, ${allReactionRows.length} reactions, ${allScanProgress.length} scans)`,
          );

          batchHandled = true;
        } catch (err: unknown) {
          if (err instanceof RateLimitExitError) throw err;

          // On server error, reduce batch size and retry
          if (
            isServerError(err) &&
            adaptive.size > GRAPHQL_COMBINED_BATCH_MIN
          ) {
            adaptive.onServerError();
            return; // batchHandled stays false → while loop retries
          }

          // Log and skip — individual stages will handle leftovers
          const errMsg =
            err instanceof Error ? err.message : String(err);
          logError(
            `[combined] Batch failed, skipping (individual stages will retry): ${errMsg}`,
          );
          sentryLogger.warn(
            sentryLogger.fmt`Combined enrichment batch failed batchSize=${batch.length} error=${errMsg}`,
          );
          captureEnrichmentError(err, "combined", {
            batchSize: batch.length,
            repos: [...new Set(batch.map((b) => b.repo_name))],
          });
          errors += batch.length;
          batchHandled = true;
        }
      },
    );

    if (batchHandled) {
      batchStart += batch.length;
    }
    // else: adaptive reduced size, retry same batchStart

    const processed = prs_fetched + skipped + errors;
    if (processed % 50 < adaptive.size && processed > 0) {
      log(
        `[combined] Progress: ${processed}/${prGroups.length} (${prs_fetched} PRs, ${comments_fetched} comment combos, ${reactions_scanned} reactions scanned, ${skipped} skipped, ${errors} errors)`,
      );
      // Flush Sentry periodically so spans are visible in the UI during
      // long-running enrichment (otherwise buffered until root span ends).
      void Sentry.flush(5000);
    }
    countMetric("pipeline.enrich.combined.batch", 1);
  }

  log(
    `[combined] Batch sizing: final=${adaptive.summary().current}, max=${adaptive.summary().max}, reductions=${adaptive.summary().reductions}`,
  );
  log(
    `[combined] Done: ${prs_fetched} PRs fetched, ${comments_fetched} comment combos, ${reactions_scanned} reactions scanned (${reactions_found} with bot reactions), ${skipped} skipped, ${errors} errors`,
  );

  return { prs_fetched, comments_fetched, reactions_scanned, reactions_found, skipped, errors };
}
