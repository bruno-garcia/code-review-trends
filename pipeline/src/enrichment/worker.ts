/**
 * Enrichment worker — orchestrates repo → PR → comment enrichment.
 *
 * Creates GitHub and ClickHouse clients, runs enrichment in priority order,
 * then refreshes stale repos. Supports multi-worker partitioning.
 */

import { Octokit } from "@octokit/rest";
import { Sentry, log, countMetric, distributionMetric, gaugeMetric } from "../sentry.js";
import { createCHClient } from "../clickhouse.js";
import { RateLimiter } from "./rate-limiter.js";
import { enrichRepos, refreshStaleRepos } from "./repos.js";
import { enrichPullRequests } from "./pull-requests.js";
import { enrichComments } from "./comments.js";
import type { WorkerConfig } from "./partitioner.js";

export type EnrichmentOptions = {
  githubToken: string;
  workerId?: number;
  totalWorkers?: number;
  limit?: number;
  staleDays?: number;
  priority?: "repos" | "prs" | "comments";
};

export type EnrichmentResult = {
  repos: { fetched: number; skipped: number; errors: number };
  pullRequests: { fetched: number; skipped: number; errors: number };
  comments: { fetched: number; skipped: number; replies_filtered: number; errors: number };
  reposRefreshed: number;
  duration: number;
};

export async function runEnrichment(options: EnrichmentOptions): Promise<EnrichmentResult> {
  const start = Date.now();

  const octokit = new Octokit({ auth: options.githubToken });
  const ch = createCHClient();
  const rateLimiter = new RateLimiter();
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
  type Step = "repos" | "prs" | "comments";
  const defaultOrder: Step[] = ["repos", "prs", "comments"];
  let order: Step[];
  if (options.priority && options.priority !== "repos") {
    // Move priority step to front, keep others in default relative order
    const rest = defaultOrder.filter((s) => s !== options.priority);
    order = [options.priority as Step, ...rest];
  } else {
    order = defaultOrder;
  }

  let reposResult = { fetched: 0, skipped: 0, errors: 0 };
  let prsResult = { fetched: 0, skipped: 0, errors: 0 };
  let commentsResult = { fetched: 0, skipped: 0, replies_filtered: 0, errors: 0 };

  try {
    for (const step of order) {
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
      }
    }

    // Refresh stale repos
    log("[worker] Refreshing stale repos...");
    const refreshResult = await Sentry.startSpan(
      { op: "enrichment", name: "enrich.refresh-stale-repos" },
      () => refreshStaleRepos(octokit, ch, rateLimiter, partition, {
        staleDays: options.staleDays ?? 7,
        limit: limit ? Math.min(limit, 500) : 500,
      }),
    );

    const duration = Date.now() - start;
    log(`[worker] Enrichment complete in ${Math.ceil(duration / 1000)}s`);

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
    distributionMetric("pipeline.enrich.duration", duration, "millisecond");

    return {
      repos: reposResult,
      pullRequests: prsResult,
      comments: commentsResult,
      reposRefreshed: refreshResult.refreshed,
      duration,
    };
  } finally {
    await ch.close();
  }
}
