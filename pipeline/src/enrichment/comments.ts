/**
 * Comment + reaction enrichment.
 *
 * Fetches bot review comments (with inline reactions) from the GitHub API
 * for PRs discovered in pr_bot_events. Filters out reply comments
 * (in_reply_to_id set) since we only want top-level review comments.
 */

import type { Octokit } from "@octokit/rest";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  insertPrComments,
  query,
  type PrCommentRow,
} from "../clickhouse.js";
import { BOT_BY_ID } from "../bots.js";
import { Sentry, log, logError, countMetric, captureEnrichmentError, sentryLogger } from "../sentry.js";
import { type RateLimiter, RateLimitExitError } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
// handleEnterprisePolicyError removed — GraphQL batch handles errors differently
import { summarizeOrgs, summarizeRepos } from "./summary.js";
import { fetchCommentsBatch, GRAPHQL_COMMENT_BATCH_MAX, GRAPHQL_COMMENT_BATCH_MIN, type CommentBatchInput } from "./graphql-comments.js";
import { AdaptiveBatch } from "./adaptive-batch.js";
import { isServerError } from "./graphql-retry.js";

/**
 * Fetch and insert bot review comments with reactions for PRs
 * discovered in pr_bot_events that don't yet exist in pr_comments.
 */
export async function enrichComments(
  octokit: Octokit,
  ch: ClickHouseClient,
  rateLimiter: RateLimiter,
  partition: WorkerConfig,
  options?: { limit?: number },
): Promise<{
  fetched: number;
  skipped: number;
  replies_filtered: number;
  errors: number;
}> {
  const limit = options?.limit ?? 1000;
  const partition_clause = partitionWhereClause(partition, "e.repo_name");

  // Find PR/bot combos needing comment enrichment.
  // Note: ClickHouse non-Nullable columns default to '' (String) or 0 (UInt)
  // on LEFT JOIN misses — not NULL. Use the empty-string check, not IS NULL.
  const whereFragments = [
    "c.repo_name = ''",
    "e.repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))",
  ];
  const queryParams: Record<string, number> = { limit };
  if (partition_clause) {
    whereFragments.push(partition_clause.sql);
    Object.assign(queryParams, partition_clause.params);
  }

  const combos = await query<{
    repo_name: string;
    pr_number: number;
    bot_id: string;
  }>(
    ch,
    `SELECT DISTINCT e.repo_name AS repo_name, e.pr_number AS pr_number, e.bot_id AS bot_id,
            max(e.event_week) as latest_week,
            COALESCE(max(r.stars), 0) as repo_stars
     FROM pr_bot_events e
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

  // Total pending for context
  const { total_pending } = (await query<{ total_pending: string }>(
    ch,
    `SELECT count(DISTINCT (e.repo_name, e.pr_number, e.bot_id)) as total_pending
     FROM pr_bot_events e
     LEFT JOIN (SELECT DISTINCT repo_name, pr_number, bot_id FROM pr_comments) c
       ON e.repo_name = c.repo_name AND e.pr_number = c.pr_number AND e.bot_id = c.bot_id
     WHERE c.repo_name = ''
       AND e.repo_name NOT IN (SELECT name FROM repos WHERE fetch_status IN ('not_found', 'forbidden'))`,
  ))[0] ?? { total_pending: "0" };

  log(`[comments] Processing ${combos.length} of ${total_pending} pending combos`);
  if (combos.length > 0) {
    log(`[comments] ${summarizeOrgs(combos.map((c) => c.repo_name))}`);
    log(`[comments] ${summarizeRepos(combos)}`);
  }

  let fetched = 0;
  let notFound = 0;
  let forbidden = 0;
  let rateLimited = 0;
  let unknownBot = 0;
  let repliesFiltered = 0;
  let errors = 0;
  const adaptive = new AdaptiveBatch({ max: GRAPHQL_COMMENT_BATCH_MAX, min: GRAPHQL_COMMENT_BATCH_MIN });

  let batchStart = 0;
  while (batchStart < combos.length) {
    const batch = combos.slice(batchStart, batchStart + adaptive.size);
    const batchLabel = `comments batch ${batchStart}–${batchStart + batch.length}`;

    let batchHandled = false;
    await Sentry.startSpan(
      { op: "enrichment.batch", name: batchLabel },
      async () => {
        // Build batch inputs, skipping unknown bots
        const batchInputs: CommentBatchInput[] = [];
        for (const { repo_name, pr_number, bot_id } of batch) {
          const bot = BOT_BY_ID.get(bot_id);
          if (!bot) { unknownBot++; continue; }
          const botLogins = new Set([bot.github_login, ...(bot.additional_logins ?? [])]);
          batchInputs.push({ repo_name, pr_number, bot_id, bot_login: bot.github_login, bot_logins: botLogins });
        }

        try {
          const graphqlStart = Date.now();
          const results = await fetchCommentsBatch(octokit, rateLimiter, batchInputs);
          const graphqlMs = Date.now() - graphqlStart;

          // Collect all rows for bulk insert.
          // Track batch-local counters — only merge after insert succeeds
          // to avoid double-counting on adaptive batch retries.
          const allCommentRows: PrCommentRow[] = [];
          let batchFetched = 0;
          let batchNotFound = 0;
          let batchErrors = 0;
          for (const result of results) {
            if (result.error === "repo_not_found" || result.error === "pr_not_found") {
              batchNotFound++;
              continue;
            }
            if (result.error === "partial_error") {
              // Skip — don't insert sentinel, let REST fallback or next run handle it
              batchErrors++;
              continue;
            }

            if (result.comments.length > 0) {
              allCommentRows.push(...result.comments);
            } else {
              // Sentinel row — no bot comments found
              allCommentRows.push({
                repo_name: result.input.repo_name,
                pr_number: result.input.pr_number,
                comment_id: "0",
                bot_id: result.input.bot_id,
                body_length: 0,
                created_at: new Date().toISOString(),
                thumbs_up: 0, thumbs_down: 0, laugh: 0, confused: 0,
                heart: 0, hooray: 0, eyes: 0, rocket: 0,
              });
            }

            if (result.hasMore) {
              log(`[comments] ${result.input.repo_name}#${result.input.pr_number} has >100 review threads, saved partial`);
            }

            batchFetched++;
          }

          const insertStart = Date.now();
          await insertPrComments(ch, allCommentRows);
          const insertMs = Date.now() - insertStart;

          // Merge counters after successful insert
          fetched += batchFetched;
          notFound += batchNotFound;
          errors += batchErrors;

          log(
            `[comments] Batch timing: graphql=${graphqlMs}ms, insert=${insertMs}ms (${allCommentRows.length} rows)`,
          );
          batchHandled = true;
        } catch (err: unknown) {
          if (err instanceof RateLimitExitError) throw err;

          // On server error, reduce batch size and retry
          if (isServerError(err) && adaptive.size > adaptive.minSize) {
            adaptive.onServerError();
            return; // batchHandled stays false → while loop retries
          }

          captureEnrichmentError(err, "comments", {
            fallback: "rest",
            batchSize: batch.length,
            repos: [...new Set(batch.map(b => b.repo_name))],
          });
          const errMsg = err instanceof Error ? err.message : String(err);
          logError(`[comments] Batch GraphQL failed, processing individually: ${errMsg}`);
          sentryLogger.warn(sentryLogger.fmt`REST fallback triggered phase=comments batchSize=${batch.length} error=${errMsg}`);

          // Fall back to REST for this batch
          for (const { repo_name, pr_number, bot_id } of batch) {
            const [owner, repo] = repo_name.split("/");
            if (!owner || !repo) continue;
            const bot = BOT_BY_ID.get(bot_id);
            if (!bot) { unknownBot++; continue; }
            const loginSet = new Set([bot.github_login, ...(bot.additional_logins ?? [])]);

            await rateLimiter.waitIfNeeded();
            try {
              const rows: PrCommentRow[] = [];
              let page = 1;
              while (true) {
                const { data, headers } = await octokit.rest.pulls.listReviewComments({
                  owner, repo, pull_number: pr_number, per_page: 100, page,
                });
                rateLimiter.update(headers as Record<string, string>);
                for (const comment of data) {
                  const login = comment.user?.login;
                  if (!login || !loginSet.has(login)) continue;
                  if (comment.in_reply_to_id) { repliesFiltered++; continue; }
                  const reactions = comment.reactions;
                  rows.push({
                    repo_name, pr_number, comment_id: String(comment.id), bot_id,
                    body_length: comment.body?.length ?? 0, created_at: comment.created_at,
                    thumbs_up: reactions?.["+1"] ?? 0, thumbs_down: reactions?.["-1"] ?? 0,
                    laugh: reactions?.laugh ?? 0, confused: reactions?.confused ?? 0,
                    heart: reactions?.heart ?? 0, hooray: reactions?.hooray ?? 0,
                    eyes: reactions?.eyes ?? 0, rocket: reactions?.rocket ?? 0,
                  });
                }
                if (data.length < 100) break;
                page++;
                await rateLimiter.waitIfNeeded();
              }
              if (rows.length > 0) {
                await insertPrComments(ch, rows);
              } else {
                await insertPrComments(ch, [{
                  repo_name, pr_number, comment_id: "0", bot_id,
                  body_length: 0, created_at: new Date().toISOString(),
                  thumbs_up: 0, thumbs_down: 0, laugh: 0, confused: 0,
                  heart: 0, hooray: 0, eyes: 0, rocket: 0,
                }]);
              }
              fetched++;
            } catch (innerErr: unknown) {
              const status = (innerErr as { status?: number }).status;
              if (status === 404) {
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
                    forbidden++;
                  }
                } else {
                  forbidden++;
                }
              } else {
                captureEnrichmentError(innerErr, "comments", { repo: repo_name, pr_number, bot_id });
                logError(`[comments] REST fallback error: ${repo_name}#${pr_number}: ${innerErr instanceof Error ? innerErr.message : innerErr}`);
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

    const processed = fetched + notFound + forbidden + rateLimited + unknownBot + errors;
    log(`[comments] Progress: ${processed}/${combos.length} (${fetched} ok, ${notFound} not_found, ${forbidden} forbidden, ${errors} errors)`);
    countMetric("pipeline.enrich.comments.batch", 1);
    // Flush Sentry periodically so spans are visible during long runs
    if (processed % 100 < adaptive.size) {
      void Sentry.flush(5000);
    }
  }

  log(`[comments] Batch sizing: final=${adaptive.summary().current}, max=${adaptive.summary().max}, reductions=${adaptive.summary().reductions}`);
  log(`[comments] Done: ${fetched} fetched, ${notFound} not_found, ${forbidden} forbidden, ${rateLimited} rate_limited, ${unknownBot} unknown_bot, ${repliesFiltered} replies_filtered, ${errors} errors`);
  return {
    fetched,
    skipped: notFound + forbidden + rateLimited + unknownBot,
    replies_filtered: repliesFiltered,
    errors,
  };
}
