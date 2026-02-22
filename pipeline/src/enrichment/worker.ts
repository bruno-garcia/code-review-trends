/**
 * Enrichment worker — orchestrates repo → PR → comment enrichment.
 *
 * Creates GitHub and ClickHouse clients, runs enrichment in priority order,
 * then refreshes stale repos. Supports multi-worker partitioning.
 */

import { Octokit } from "@octokit/rest";
import { Sentry, log, countMetric, distributionMetric, gaugeMetric, sentryLogger } from "../sentry.js";
import { createCHClient, query } from "../clickhouse.js";
import { RateLimiter, RateLimitExitError } from "./rate-limiter.js";
import { enrichRepos, refreshStaleRepos } from "./repos.js";
import { enrichPullRequests } from "./pull-requests.js";
import { enrichComments } from "./comments.js";
import { enrichReactions } from "./reactions.js";
import type { WorkerConfig } from "./partitioner.js";
import { createOctokitAgent } from "./octokit-agent.js";
import { enrichCombined, type CombinedResult } from "./combined-enrichment.js";

const ROUND_ROBIN_THRESHOLD = 0.70;

export type EnrichmentOptions = {
  githubToken: string;
  workerId?: number;
  totalWorkers?: number;
  limit?: number;
  staleDays?: number;
  priority?: "repos" | "prs" | "comments" | "reactions";
  exitOnRateLimit?: boolean;
};

export type EnrichmentResult = {
  repos: { fetched: number; skipped: number; errors: number };
  pullRequests: { fetched: number; skipped: number; errors: number };
  comments: { fetched: number; skipped: number; replies_filtered: number; errors: number };
  reactions: { fetched: number; scanned: number; skipped: number; errors: number };
  combined: { prs_fetched: number; comments_fetched: number; skipped: number; errors: number };
  reposRefreshed: number;
  duration: number;
};

export async function runEnrichment(options: EnrichmentOptions): Promise<EnrichmentResult> {
  const start = Date.now();

  const octokit = new Octokit({
    auth: options.githubToken,
    request: {
      agent: createOctokitAgent(),
      // Request timeout: 30s to prevent hanging on stale connections
      timeout: 30_000,
    },
  });
  const ch = createCHClient();
  const rateLimiter = new RateLimiter(100, options.exitOnRateLimit ?? false);
  const workerId = options.workerId ?? 0;
  const totalWorkers = options.totalWorkers ?? 1;
  if (totalWorkers < 1) throw new Error(`totalWorkers must be >= 1, got ${totalWorkers}`);
  if (workerId < 0 || workerId >= totalWorkers) {
    throw new Error(`workerId must be in [0, ${totalWorkers - 1}], got ${workerId}`);
  }
  const partition: WorkerConfig = { workerId, totalWorkers };
  const limit = options.limit;

  log(
    `[worker] Starting enrichment (worker ${partition.workerId}/${partition.totalWorkers}, limit: ${limit ?? "unlimited"})`,
  );
  if (limit !== undefined) {
    gaugeMetric("pipeline.enrich.limit", limit);
  }

  // Determine execution order based on priority
  type Step = "repos" | "prs" | "comments" | "reactions";
  // Reactions before comments/PRs: reaction scans are cheap (50 PRs/call)
  // and critical for crediting bots that signal reviews via 🎉 emoji.
  const defaultOrder: Step[] = ["repos", "reactions", "comments", "prs"];
  let order: Step[];
  if (options.priority && options.priority !== "repos") {
    // Move priority step to front, keep others in default relative order
    const rest = defaultOrder.filter((s) => s !== options.priority);
    order = [options.priority as Step, ...rest];
  } else {
    order = defaultOrder;
  }

  // Check stage completion percentages and skip stages above threshold
  const completionRows = await query<{
    repos_total: string; repos_done: string;
    comments_total: string; comments_done: string;
    reactions_total: string; reactions_done: string;
    prs_total: string; prs_done: string;
  }>(ch, `SELECT
    (SELECT countDistinct(repo_name) FROM pr_bot_events) as repos_total,
    (SELECT countDistinct(name) FROM repos) as repos_done,
    (SELECT countDistinct(repo_name, pr_number, bot_id) FROM pr_bot_events) as comments_total,
    (SELECT countDistinct(repo_name, pr_number, bot_id) FROM pr_comments) as comments_done,
    (SELECT countDistinct(repo_name, pr_number) FROM pr_bot_events) as reactions_total,
    (SELECT countDistinct(repo_name, pr_number) FROM reaction_scan_progress) as reactions_done,
    (SELECT countDistinct(repo_name, pr_number) FROM pr_bot_events) as prs_total,
    (SELECT countDistinct(repo_name, pr_number) FROM pull_requests) as prs_done`);

  const c = completionRows[0];
  const completion: Record<Step, number> = {
    repos: Number(c.repos_total) > 0 ? Number(c.repos_done) / Number(c.repos_total) : 0,
    comments: Number(c.comments_total) > 0 ? Number(c.comments_done) / Number(c.comments_total) : 0,
    reactions: Number(c.reactions_total) > 0 ? Number(c.reactions_done) / Number(c.reactions_total) : 0,
    prs: Number(c.prs_total) > 0 ? Number(c.prs_done) / Number(c.prs_total) : 0,
  };

  log(`[worker] Stage completion: ${order.map((s) => `${s} ${Math.round(completion[s] * 100)}%`).join(", ")}`);

  if (!options.priority) {
    const belowThreshold = order.filter((s) => completion[s] < ROUND_ROBIN_THRESHOLD);
    if (belowThreshold.length > 0 && belowThreshold.length < order.length) {
      const skipped = order.filter((s) => completion[s] >= ROUND_ROBIN_THRESHOLD);
      log(`[worker] Skipping stages above ${Math.round(ROUND_ROBIN_THRESHOLD * 100)}% complete: ${skipped.join(", ")}`);
      for (const s of skipped) {
        const pct = Math.round(completion[s] * 100);
        sentryLogger.info(sentryLogger.fmt`Skipping stage=${s} completion=${pct}% above threshold=${Math.round(ROUND_ROBIN_THRESHOLD * 100)}%`);
      }
      order = belowThreshold;
    }
  }

  let reposResult = { fetched: 0, skipped: 0, errors: 0 };
  let prsResult = { fetched: 0, skipped: 0, errors: 0 };
  let commentsResult = { fetched: 0, skipped: 0, replies_filtered: 0, errors: 0 };
  let reactionsResult = { fetched: 0, scanned: 0, skipped: 0, errors: 0 };

  let rateLimitExit = false;

  // Combined PR+Comments enrichment — handles items needing BOTH, reducing total API calls.
  // Runs first so individual stages only handle leftovers.
  let combinedResult: CombinedResult = { prs_fetched: 0, comments_fetched: 0, skipped: 0, errors: 0 };
  if (!options.priority || options.priority === "prs" || options.priority === "comments") {
    try {
      combinedResult = await Sentry.startSpan(
        { op: "enrichment", name: "enrich.combined" },
        () => enrichCombined(octokit, ch, rateLimiter, partition, { limit }),
      );
    } catch (e) {
      if (e instanceof RateLimitExitError) {
        log(`[worker] ${e.message}`);
        rateLimitExit = true;
      } else {
        throw e;
      }
    }
  }

  try {
    for (const step of order) {
      if (rateLimitExit) break;
      const stageStart = Date.now();
        const pct = Math.round(completion[step] * 100);
        sentryLogger.info(sentryLogger.fmt`Starting enrichment stage=${step} completion=${pct}% worker=${partition.workerId}/${partition.totalWorkers}`);
      try {
        switch (step) {
          case "repos":
            reposResult = await Sentry.startSpan(
              { op: "enrichment", name: "enrich.repos" },
              () => enrichRepos(octokit, ch, rateLimiter, partition, { limit }),
            );
            break;
          case "prs":
            prsResult = await Sentry.startSpan(
              { op: "enrichment", name: "enrich.pull-requests" },
              () => enrichPullRequests(octokit, ch, rateLimiter, partition, { limit }),
            );
            break;
          case "comments":
            commentsResult = await Sentry.startSpan(
              { op: "enrichment", name: "enrich.comments" },
              () => enrichComments(octokit, ch, rateLimiter, partition, { limit }),
            );
            break;
          case "reactions":
            reactionsResult = await Sentry.startSpan(
              { op: "enrichment", name: "enrich.reactions" },
              () => enrichReactions(octokit, ch, rateLimiter, partition, { limit }),
            );
            break;
        }
        const stageDuration = Date.now() - stageStart;
        sentryLogger.info(sentryLogger.fmt`Completed stage=${step} duration=${stageDuration}ms`);
      } catch (e) {
        if (e instanceof RateLimitExitError) {
          log(`[worker] ${e.message}`);
          rateLimitExit = true;
          break;
        }
        throw e;
      }
    }

    // Refresh stale repos (skip if we already hit the rate limit)
    let refreshResult = { refreshed: 0 };
    if (!rateLimitExit) {
      log("[worker] Refreshing stale repos...");
      try {
        refreshResult = await Sentry.startSpan(
          { op: "enrichment", name: "enrich.refresh-stale-repos" },
          () => refreshStaleRepos(octokit, ch, rateLimiter, partition, {
            staleDays: options.staleDays ?? 7,
            limit: limit ? Math.min(limit, 500) : 500,
          }),
        );
      } catch (e) {
        if (e instanceof RateLimitExitError) {
          log(`[worker] ${e.message}`);
          rateLimitExit = true;
        } else {
          throw e;
        }
      }
    }

    const duration = Date.now() - start;
    const rl = rateLimiter.waitSummary();
    const workTime = duration - rl.totalWaitMs;
    const totalItems = reposResult.fetched + reposResult.skipped + reposResult.errors
      + prsResult.fetched + prsResult.skipped + prsResult.errors
      + commentsResult.fetched + commentsResult.skipped + commentsResult.errors
      + reactionsResult.scanned + reactionsResult.skipped + reactionsResult.errors
      + combinedResult.prs_fetched + combinedResult.comments_fetched + combinedResult.skipped + combinedResult.errors;
    const itemsPerSec = workTime > 0 ? (totalItems / (workTime / 1000)).toFixed(1) : "∞";
    const rlPct = duration > 0 ? ((rl.totalWaitMs / duration) * 100).toFixed(1) : "0";

    log(`[worker] Enrichment ${rateLimitExit ? "stopped (rate limit)" : "complete"} in ${Math.ceil(duration / 1000)}s`);
    log(`[worker]   Items processed: ${totalItems} (${itemsPerSec} items/s effective)`);
    log(`[worker]   Combined: ${combinedResult.prs_fetched} PRs + ${combinedResult.comments_fetched} comment combos (${combinedResult.errors} errors)`);
    log(`[worker]   Rate-limit waits: ${rl.waitCount} pauses, ${Math.ceil(rl.totalWaitMs / 1000)}s total (${rlPct}% of wall time)`);
    if (rl.secondaryHits > 0) {
      log(`[worker]   Secondary rate limits: ${rl.secondaryHits}`);
    }

    // Emit summary metrics
    countMetric("pipeline.enrich.repos.fetched", reposResult.fetched, { phase: "repos" });
    countMetric("pipeline.enrich.repos.skipped", reposResult.skipped, { phase: "repos" });
    countMetric("pipeline.enrich.repos.errors", reposResult.errors, { phase: "repos" });
    countMetric("pipeline.enrich.prs.fetched", prsResult.fetched, { phase: "prs" });
    countMetric("pipeline.enrich.prs.skipped", prsResult.skipped, { phase: "prs" });
    countMetric("pipeline.enrich.prs.errors", prsResult.errors, { phase: "prs" });
    countMetric("pipeline.enrich.comments.fetched", commentsResult.fetched, { phase: "comments" });
    countMetric("pipeline.enrich.comments.skipped", commentsResult.skipped, { phase: "comments" });
    countMetric("pipeline.enrich.comments.errors", commentsResult.errors, { phase: "comments" });
    countMetric("pipeline.enrich.reactions.fetched", reactionsResult.fetched, { phase: "reactions" });
    countMetric("pipeline.enrich.reactions.skipped", reactionsResult.skipped, { phase: "reactions" });
    countMetric("pipeline.enrich.reactions.scanned", reactionsResult.scanned, { phase: "reactions" });
    countMetric("pipeline.enrich.reactions.errors", reactionsResult.errors, { phase: "reactions" });
    countMetric("pipeline.enrich.combined.prs", combinedResult.prs_fetched, { phase: "combined" });
    countMetric("pipeline.enrich.combined.comments", combinedResult.comments_fetched, { phase: "combined" });
    countMetric("pipeline.enrich.combined.errors", combinedResult.errors, { phase: "combined" });
    distributionMetric("pipeline.enrich.duration", duration, "millisecond");
    distributionMetric("pipeline.ratelimit.total_wait", rl.totalWaitMs, "millisecond");
    countMetric("pipeline.ratelimit.total_pauses", rl.waitCount);
    countMetric("pipeline.ratelimit.secondary_hits", rl.secondaryHits);
    gaugeMetric("pipeline.enrich.items_per_sec", workTime > 0 ? totalItems / (workTime / 1000) : 0);

    return {
      repos: reposResult,
      pullRequests: prsResult,
      comments: commentsResult,
      reactions: reactionsResult,
      combined: combinedResult,
      reposRefreshed: refreshResult.refreshed,
      duration,
    };
  } finally {
    await ch.close();
  }
}
