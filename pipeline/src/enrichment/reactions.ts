/**
 * PR reaction enrichment.
 *
 * Discovers PRs where tracked bots left reactions (especially 🎉/hooray)
 * that don't generate GH Archive events. This catches "reaction-only"
 * reviews — e.g., Sentry adds 🎉 when it reviews a PR and finds no issues.
 *
 * Discovery approach:
 *   1. Find repos where tracked bots have been active (from pr_bot_events)
 *   2. List issues (PRs) in those repos via the GitHub API
 *   3. For PRs with hooray reactions > 0, fetch per-user reactions
 *   4. Filter for reactions by tracked bot logins
 *   5. Store in pr_bot_reactions
 *
 * Uses reaction_scan_progress to track which PRs have been scanned,
 * so subsequent runs only check new PRs.
 */

import type { Octokit } from "@octokit/rest";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  insertPrBotReactions,
  insertReactionScanProgress,
  query,
  type PrBotReactionRow,
} from "../clickhouse.js";
import { BOT_BY_LOGIN } from "../bots.js";
import { Sentry, log, logError, countMetric } from "../sentry.js";
import { type RateLimiter } from "./rate-limiter.js";
import { partitionWhereClause, type WorkerConfig } from "./partitioner.js";
import { handleEnterprisePolicyError } from "./enterprise-policy.js";

/** Only count 🎉 (hooray) as a review signal. Eyes = still reviewing, not approval. */
const REVIEW_REACTION_TYPES = new Set(["hooray"]);

/** Set of all tracked bot logins (for fast lookup). */
const TRACKED_LOGINS = new Set(BOT_BY_LOGIN.keys());

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
  // A repo/PR is "pending" if it's not yet in reaction_scan_progress.
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
       countDistinct(e.pr_number) - countDistinctIf(e.pr_number, s.pr_number > 0) AS pending_prs
     FROM pr_bot_events e
     LEFT JOIN reaction_scan_progress s
       ON e.repo_name = s.repo_name AND e.pr_number = s.pr_number
     WHERE ${whereFragments.join(" AND ")}
     GROUP BY e.repo_name
     HAVING pending_prs > 0
     ORDER BY pending_prs DESC
     LIMIT {limit:UInt32}`,
    { limit, ...(partitionClause?.params ?? {}) },
  );

  if (repos.length === 0) {
    log("[reactions] No repos with pending PRs to scan");
    return { fetched: 0, scanned: 0, skipped: 0, errors: 0 };
  }

  const totalPending = repos.reduce((sum, r) => sum + r.pending_prs, 0);
  log(`[reactions] Found ${repos.length} repos with ${totalPending} pending PRs to scan`);

  let fetched = 0;    // PRs where we found a bot reaction
  let scanned = 0;    // PRs we checked (including no-reaction ones)
  let skipped = 0;    // PRs skipped (not found, forbidden, etc.)
  let errors = 0;
  let totalApiCalls = 0;
  let reposProcessed = 0;

  for (const { repo_name } of repos) {
    const [owner, repo] = repo_name.split("/");
    if (!owner || !repo) continue;

    // Get the list of PR numbers in this repo that need scanning
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

    if (pendingPrs.length === 0) continue;

    const prNumbers = new Set(pendingPrs.map((p) => p.pr_number));
    const batchSentinels: { repo_name: string; pr_number: number }[] = [];
    const batchReactions: PrBotReactionRow[] = [];

    try {
      // Fetch PRs via the issues endpoint (includes inline reaction counts).
      // Process in batches — for each PR we care about, check reactions.
      for (const prNum of prNumbers) {
        await rateLimiter.waitIfNeeded();

        try {
          // First check if this PR has any hooray reactions via the issue endpoint
          const { data: issue, headers } = await octokit.rest.issues.get({
            owner,
            repo,
            issue_number: prNum,
          });
          rateLimiter.update(headers as Record<string, string>);
          totalApiCalls++;

          const hoorayCount = (issue.reactions as unknown as Record<string, number>)?.hooray ?? 0;

          if (hoorayCount === 0) {
            // No hooray reactions — mark as scanned and move on
            batchSentinels.push({ repo_name, pr_number: prNum });
            scanned++;
            continue;
          }

          // Has hooray reactions — fetch per-user reactions to check for bots.
          // Use paginate.iterator so we can update rate limiter with each page's headers.
          await rateLimiter.waitIfNeeded();
          const reactions: Awaited<ReturnType<typeof octokit.rest.reactions.listForIssue>>["data"] = [];
          for await (const response of octokit.paginate.iterator(
            octokit.rest.reactions.listForIssue,
            { owner, repo, issue_number: prNum, per_page: 100 },
          )) {
            rateLimiter.update(response.headers as Record<string, string>);
            reactions.push(...response.data);
            await rateLimiter.waitIfNeeded();
          }
          totalApiCalls++;

          for (const reaction of reactions) {
            const login = reaction.user?.login;
            if (!login || !TRACKED_LOGINS.has(login)) continue;
            if (!REVIEW_REACTION_TYPES.has(reaction.content)) continue;

            const bot = BOT_BY_LOGIN.get(login);
            if (!bot) continue;

            batchReactions.push({
              repo_name,
              pr_number: prNum,
              bot_id: bot.id,
              reaction_type: reaction.content,
              reacted_at: reaction.created_at,
              reaction_id: reaction.id,
            });
          }

          const foundBotReaction = reactions.some((r) => {
            const login = r.user?.login;
            return login && TRACKED_LOGINS.has(login) && REVIEW_REACTION_TYPES.has(r.content);
          });
          batchSentinels.push({ repo_name, pr_number: prNum });
          if (foundBotReaction) fetched++;
          scanned++;
        } catch (err: unknown) {
          const status = (err as { status?: number }).status;
          if (status === 404) {
            batchSentinels.push({ repo_name, pr_number: prNum });
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
            if (headers?.["retry-after"] || headers?.["x-ratelimit-remaining"] === "0") {
              skipped++;
            } else {
              handleEnterprisePolicyError(err, repo_name, "reactions");
              batchSentinels.push({ repo_name, pr_number: prNum });
              skipped++;
            }
          } else {
            Sentry.captureException(err, {
              tags: { repo: repo_name },
              contexts: { enrichment: { phase: "reactions", repo: repo_name, pr_number: prNum } },
            });
            logError(`[reactions] Error: ${repo_name}#${prNum}: ${err instanceof Error ? err.message : err}`);
            errors++;
          }
        }

        // Flush batches periodically
        if (batchSentinels.length >= 100) {
          await insertReactionScanProgress(ch, batchSentinels);
          if (batchReactions.length > 0) {
            await insertPrBotReactions(ch, batchReactions);
          }
          batchSentinels.length = 0;
          batchReactions.length = 0;
        }
      }

      // Flush remaining
      if (batchSentinels.length > 0) {
        await insertReactionScanProgress(ch, batchSentinels);
      }
      if (batchReactions.length > 0) {
        await insertPrBotReactions(ch, batchReactions);
      }
      batchSentinels.length = 0;
      batchReactions.length = 0;
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { repo: repo_name },
        contexts: { enrichment: { phase: "reactions", repo: repo_name } },
      });
      logError(`[reactions] Repo error: ${repo_name}: ${err instanceof Error ? err.message : err}`);
      errors++;
    }

    reposProcessed++;
    const processed = scanned + skipped + errors;
    if (reposProcessed % 10 === 0 || reposProcessed === repos.length) {
      log(`[reactions] Progress: ${reposProcessed}/${repos.length} repos, ${processed} PRs (${fetched} with bot reactions, ${totalApiCalls} API calls)`);
    }
    countMetric("pipeline.enrich.reactions.batch", 1);
  }

  log(`[reactions] Done: ${fetched} PRs with bot reactions, ${scanned} scanned, ${skipped} skipped, ${errors} errors (${totalApiCalls} API calls)`);
  return { fetched, scanned, skipped, errors };
}
