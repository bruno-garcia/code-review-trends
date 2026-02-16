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
import { type RateLimiter } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
import { handleEnterprisePolicyError } from "./enterprise-policy.js";

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
  const whereFragments = [
    "c.bot_id IS NULL",
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
    `SELECT DISTINCT e.repo_name, e.pr_number, e.bot_id, max(e.event_week) as latest_week
     FROM pr_bot_events e
     LEFT JOIN (
       SELECT DISTINCT repo_name, pr_number, bot_id FROM pr_comments
     ) c ON e.repo_name = c.repo_name AND e.pr_number = c.pr_number AND e.bot_id = c.bot_id
     WHERE ${whereFragments.join(" AND ")}
     GROUP BY e.repo_name, e.pr_number, e.bot_id
     ORDER BY latest_week DESC
     LIMIT {limit:UInt32}`,
    queryParams,
  );

  console.log(
    `[comments] Found ${combos.length} PR/bot combos needing comment enrichment`,
  );

  let fetched = 0;
  let skipped = 0;
  let repliesFiltered = 0;
  let errors = 0;

  for (const { repo_name, pr_number, bot_id } of combos) {
    const [owner, repo] = repo_name.split("/");
    if (!owner || !repo) {
      skipped++;
      continue;
    }

    const bot = BOT_BY_ID.get(bot_id);
    if (!bot) {
      console.warn(`[comments] Unknown bot_id "${bot_id}", skipping`);
      skipped++;
      continue;
    }

    const loginSet = new Set([bot.github_login]);

    await rateLimiter.waitIfNeeded();

    try {
      // Paginate through all review comments on the PR.
      const rows: PrCommentRow[] = [];
      let page = 1;

      while (true) {
        const { data, headers } = await octokit.rest.pulls.listReviewComments({
          owner,
          repo,
          pull_number: pr_number,
          per_page: 100,
          page,
        });
        rateLimiter.update(headers as Record<string, string>);

        for (const comment of data) {
          const login = comment.user?.login;
          if (!login || !loginSet.has(login)) continue;

          // Filter out replies — we only want top-level review comments.
          if (comment.in_reply_to_id) {
            repliesFiltered++;
            continue;
          }

          const reactions = comment.reactions;
          rows.push({
            repo_name,
            pr_number,
            comment_id: String(comment.id),
            bot_id,
            body_length: comment.body?.length ?? 0,
            created_at: comment.created_at,
            thumbs_up: reactions?.["+1"] ?? 0,
            thumbs_down: reactions?.["-1"] ?? 0,
            laugh: reactions?.laugh ?? 0,
            confused: reactions?.confused ?? 0,
            heart: reactions?.heart ?? 0,
            hooray: reactions?.hooray ?? 0,
            eyes: reactions?.eyes ?? 0,
            rocket: reactions?.rocket ?? 0,
          });
        }

        if (data.length < 100) break;
        page++;

        await rateLimiter.waitIfNeeded();
      }

      if (rows.length > 0) {
        await insertPrComments(ch, rows);
      } else {
        // Insert a sentinel row so this PR/bot combo isn't re-fetched on
        // subsequent runs (the bot left a review but no line-level comments).
        await insertPrComments(ch, [{
          repo_name,
          pr_number,
          comment_id: "0",
          bot_id,
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
        }]);
      }
      fetched++;
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;

      if (status === 404) {
        console.warn(
          `[comments] 404 for ${repo_name}#${pr_number}, skipping`,
        );
        skipped++;
      } else if (status === 403) {
        const headers = (err as { response?: { headers?: Record<string, string> } }).response?.headers;
        if (headers) {
          rateLimiter.update(headers);
          const retryAfter = headers["retry-after"];
          if (retryAfter) {
            await rateLimiter.handleRetryAfter(parseInt(retryAfter, 10));
          }
        }
        if (!handleEnterprisePolicyError(err, repo_name, "comments")) {
          console.warn(
            `[comments] 403 for ${repo_name}#${pr_number}, skipping`,
          );
        }
        skipped++;
      } else {
        console.error(
          `[comments] Error fetching ${repo_name}#${pr_number}:`,
          err instanceof Error ? err.message : err,
        );
        errors++;
      }
    }

    const total = fetched + skipped + errors;
    if (total % 50 === 0 && total > 0) {
      console.log(
        `[comments] Progress: ${fetched} fetched, ${skipped} skipped, ${repliesFiltered} replies filtered, ${errors} errors`,
      );
    }
  }

  console.log(
    `[comments] Done: ${fetched} fetched, ${skipped} skipped, ${repliesFiltered} replies filtered, ${errors} errors`,
  );
  return {
    fetched,
    skipped,
    replies_filtered: repliesFiltered,
    errors,
  };
}
