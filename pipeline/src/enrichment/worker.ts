/**
 * Enrichment worker — orchestrates repo → PR → comment enrichment.
 *
 * Creates GitHub and ClickHouse clients, runs enrichment in priority order,
 * then refreshes stale repos. Supports multi-worker partitioning.
 */

import { Octokit } from "@octokit/rest";
import { Sentry, log, countMetric, distributionMetric, gaugeMetric, sentryLogger } from "../sentry.js";
import { createCHClient } from "../clickhouse.js";
import { RateLimiter, RateLimitExitError } from "./rate-limiter.js";
import { enrichRepos, refreshStaleRepos } from "./repos.js";
import { enrichPullRequests } from "./pull-requests.js";
import { enrichComments } from "./comments.js";
import { enrichReactions } from "./reactions.js";
import type { WorkerConfig } from "./partitioner.js";
import { enrichCombined, type CombinedResult } from "./combined-enrichment.js";
import { createPinnedFetch } from "./proxy-pool.js";

export type Step = "repos" | "prs" | "comments" | "reactions";

/** The default stage execution order (no flags). */
export const DEFAULT_ORDER: readonly Step[] = ["repos", "reactions", "comments", "prs"];

/**
 * Determine which stages to run and in what order.
 *
 * - `--only`: run exactly one stage; skip combined and stale refresh.
 * - `--priority`: move one stage to front; run all stages.
 *   Combined runs only when priority is prs or comments (or unset).
 * - Default: all stages in DEFAULT_ORDER.
 */
export function planExecution(options: {
  priority?: Step;
  only?: Step;
}): { order: Step[]; runCombined: boolean; runStaleRefresh: boolean } {
  const { priority, only } = options;

  // --only: exclusive single-stage execution
  if (only) {
    return {
      order: [only],
      runCombined: false,
      runStaleRefresh: false,
    };
  }

  // Determine base order
  let order: Step[];
  if (priority && priority !== "repos") {
    const rest = DEFAULT_ORDER.filter((s) => s !== priority);
    order = [priority, ...rest];
  } else {
    order = [...DEFAULT_ORDER];
  }

  // Combined enrichment runs when no priority is set, or priority targets prs/comments
  const runCombined = !priority || priority === "prs" || priority === "comments";

  return { order, runCombined, runStaleRefresh: true };
}

export type EnrichmentOptions = {
  githubToken: string;
  workerId?: number;
  totalWorkers?: number;
  limit?: number;
  staleDays?: number;
  priority?: "repos" | "prs" | "comments" | "reactions";
  only?: "repos" | "prs" | "comments" | "reactions";
  exitOnRateLimit?: boolean;
  /** HTTP CONNECT proxy URLs for IP rotation (e.g., ["http://10.0.0.233:8888"]) */
  proxyUrls?: string[];
};

export type EnrichmentResult = {
  repos: { fetched: number; skipped: number; errors: number };
  pullRequests: { fetched: number; skipped: number; errors: number };
  comments: { fetched: number; skipped: number; replies_filtered: number; errors: number };
  reactions: { fetched: number; scanned: number; skipped: number; errors: number };
  combined: { prs_fetched: number; comments_fetched: number; reactions_scanned: number; reactions_found: number; skipped: number; errors: number };
  reposRefreshed: number;
  duration: number;
};

export async function runEnrichment(options: EnrichmentOptions): Promise<EnrichmentResult> {
  const start = Date.now();

  // Create pinned fetch for proxy-based IP assignment (if configured).
  // When PROXY_URLS is set, each worker is assigned a specific outbound IP
  // based on its worker ID to avoid GitHub's per-IP secondary rate limits.
  const pinnedFetch = createPinnedFetch(options.proxyUrls ?? [], options.workerId ?? 0);

  const octokit = new Octokit({
    auth: options.githubToken,
    request: {
      // Note: @octokit/request v9 uses fetch, not Node's http module.
      // The `agent` and `timeout` options are silently ignored by v9.
      // We pass a custom fetch for proxy rotation; without proxies,
      // Octokit uses native fetch. The 30s request timeout is applied
      // inside the custom fetch wrapper via AbortSignal.timeout().
      ...(pinnedFetch ? { fetch: pinnedFetch } : {}),
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
    `[worker] Starting enrichment (worker ${partition.workerId + 1}/${partition.totalWorkers}, limit: ${limit ?? "unlimited"})`,
  );
  if (limit !== undefined) {
    gaugeMetric("pipeline.enrich.limit", limit);
  }

  // Plan execution: which stages, what order, combined/stale refresh
  const plan = planExecution({
    priority: options.priority,
    only: options.only,
  });
  const { order } = plan;

  if (options.only) {
    log(`[worker] Running ONLY stage: ${options.only}`);
  }

  log(`[worker] Stages: ${order.join(", ")}${plan.runCombined ? " (+ combined)" : ""}`);

  let reposResult = { fetched: 0, skipped: 0, errors: 0 };
  let prsResult = { fetched: 0, skipped: 0, errors: 0 };
  let commentsResult = { fetched: 0, skipped: 0, replies_filtered: 0, errors: 0 };
  let reactionsResult = { fetched: 0, scanned: 0, skipped: 0, errors: 0 };

  let rateLimitExit = false;

  try {
    // Combined PR+Comments enrichment — handles items needing BOTH, reducing total API calls.
    // Runs first so individual stages only handle leftovers.
    let combinedResult: CombinedResult = { prs_fetched: 0, comments_fetched: 0, reactions_scanned: 0, reactions_found: 0, skipped: 0, errors: 0 };
    if (plan.runCombined) {
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
    for (const step of order) {
      if (rateLimitExit) break;
      const stageStart = Date.now();
      sentryLogger.info(sentryLogger.fmt`Starting enrichment stage=${step} worker=${partition.workerId + 1}/${partition.totalWorkers}`);
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

    // Refresh stale repos (skip if we already hit the rate limit or running single stage)
    let refreshResult = { refreshed: 0 };
    if (!rateLimitExit && plan.runStaleRefresh) {
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
    const workTime = duration - rl.totalWaitMs - rl.totalPacingMs;
    const totalItems = reposResult.fetched + reposResult.skipped + reposResult.errors
      + prsResult.fetched + prsResult.skipped + prsResult.errors
      + commentsResult.fetched + commentsResult.skipped + commentsResult.errors
      + reactionsResult.scanned + reactionsResult.skipped + reactionsResult.errors
      + combinedResult.prs_fetched + combinedResult.comments_fetched + combinedResult.reactions_scanned + combinedResult.skipped + combinedResult.errors;
    const itemsPerSec = workTime > 0 ? (totalItems / (workTime / 1000)).toFixed(1) : "∞";
    const idleMs = rl.totalWaitMs + rl.totalPacingMs;
    const rlPct = duration > 0 ? ((idleMs / duration) * 100).toFixed(1) : "0";

    log(`[worker] Enrichment ${rateLimitExit ? "stopped (rate limit)" : "complete"} in ${Math.ceil(duration / 1000)}s`);
    log(`[worker]   Items processed: ${totalItems} (${itemsPerSec} items/s effective)`);
    log(`[worker]   Combined: ${combinedResult.prs_fetched} PRs + ${combinedResult.comments_fetched} comment combos + ${combinedResult.reactions_scanned} reactions scanned (${combinedResult.reactions_found} with bot reactions, ${combinedResult.errors} errors)`);
    log(`[worker]   Idle time: ${Math.ceil(idleMs / 1000)}s (${rlPct}% of wall time) — ${rl.waitCount} rate-limit pauses (${Math.ceil(rl.totalWaitMs / 1000)}s), ${rl.pacingCount} pacing delays (${Math.ceil(rl.totalPacingMs / 1000)}s)`);
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
    countMetric("pipeline.enrich.combined.reactions_scanned", combinedResult.reactions_scanned, { phase: "combined" });
    countMetric("pipeline.enrich.combined.reactions_found", combinedResult.reactions_found, { phase: "combined" });
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
