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
import { Sentry, log, logError, countMetric } from "../sentry.js";
import { type RateLimiter, RateLimitExitError } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
// handleEnterprisePolicyError removed — GraphQL batch handles errors differently
import { summarizeOrgs, summarizeRepos } from "./summary.js";
import { fetchCommentsBatch, GRAPHQL_COMMENT_BATCH_SIZE, type CommentBatchInput } from "./graphql-comments.js";

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
    `SELECT DISTINCT e.repo_name, e.pr_number, e.bot_id,
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
  const BATCH_SIZE = GRAPHQL_COMMENT_BATCH_SIZE;

  for (let batchStart = 0; batchStart < combos.length; batchStart += BATCH_SIZE) {
    const batch = combos.slice(batchStart, batchStart + BATCH_SIZE);
    const batchLabel = `comments batch ${batchStart}–${batchStart + batch.length}`;

    await Sentry.startSpan(
      { op: "enrichment.batch", name: batchLabel },
      async () => {
        // Build batch inputs, skipping unknown bots
        const batchInputs: CommentBatchInput[] = [];
        for (const { repo_name, pr_number, bot_id } of batch) {
          const bot = BOT_BY_ID.get(bot_id);
          if (!bot) { unknownBot++; continue; }
          batchInputs.push({ repo_name, pr_number, bot_id, bot_login: bot.github_login });
        }

        try {
          const results = await fetchCommentsBatch(octokit, rateLimiter, batchInputs);

          for (const result of results) {
            if (result.error === "repo_not_found" || result.error === "pr_not_found") {
              notFound++;
              continue;
            }

            if (result.comments.length > 0) {
              await insertPrComments(ch, result.comments);
            } else {
              // Sentinel row — no bot comments found
              await insertPrComments(ch, [{
                repo_name: result.input.repo_name,
                pr_number: result.input.pr_number,
                comment_id: "0",
                bot_id: result.input.bot_id,
                body_length: 0,
                created_at: new Date().toISOString(),
                thumbs_up: 0, thumbs_down: 0, laugh: 0, confused: 0,
                heart: 0, hooray: 0, eyes: 0, rocket: 0,
              }]);
            }

            if (result.hasMore) {
              log(`[comments] ${result.input.repo_name}#${result.input.pr_number} has >100 review threads, saved partial`);
            }

            fetched++;
          }
        } catch (err: unknown) {
          if (err instanceof RateLimitExitError) throw err;

          logError(`[comments] Batch GraphQL failed, processing individually: ${err instanceof Error ? err.message : err}`);

          // Fall back to REST for this batch
          for (const { repo_name, pr_number, bot_id } of batch) {
            const [owner, repo] = repo_name.split("/");
            if (!owner || !repo) continue;
            const bot = BOT_BY_ID.get(bot_id);
            if (!bot) { unknownBot++; continue; }
            const loginSet = new Set([bot.github_login]);

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
                errors++;
              }
            }
          }
        }
      },
    );

    const processed = fetched + notFound + forbidden + rateLimited + unknownBot + errors;
    log(`[comments] Progress: ${processed}/${combos.length} (${fetched} ok, ${notFound} not_found, ${forbidden} forbidden, ${errors} errors)`);
    countMetric("pipeline.enrich.comments.batch", 1);
  }

  log(`[comments] Done: ${fetched} fetched, ${notFound} not_found, ${forbidden} forbidden, ${rateLimited} rate_limited, ${unknownBot} unknown_bot, ${repliesFiltered} replies_filtered, ${errors} errors`);
  return {
    fetched,
    skipped: notFound + forbidden + rateLimited + unknownBot,
    replies_filtered: repliesFiltered,
    errors,
  };
}
