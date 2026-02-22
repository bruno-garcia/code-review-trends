/**
 * Sentry initialization for the pipeline.
 *
 * Import this at the very top of the CLI entry point
 * so instrumentation is set up before any other imports.
 *
 * Features:
 * - Tracing (spans) for BigQuery queries, GitHub API batches, ClickHouse writes
 * - Cron monitoring (upsert API) for scheduled jobs
 * - Metrics (counters, gauges) for job progress
 * - Structured logs with UTC timestamps
 * - DSN from env var (--no-sentry to opt out)
 * - Required --env flag (development | staging | production)
 */

import * as Sentry from "@sentry/node";

// ── CLI arg → process.env promotion ────────────────────────────────────
// Runs before anything reads process.env so that --clickhouse-url etc.
// are available to all downstream code (clickhouse.ts, sentry tags, etc.).
// CLI args take precedence over env vars.

const CLI_TO_ENV: Record<string, string> = {
  "--clickhouse-url": "CLICKHOUSE_URL",
  "--clickhouse-password": "CLICKHOUSE_PASSWORD",
  "--sentry-dsn": "SENTRY_DSN_CRT_CLI",
};

{
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    const envKey = CLI_TO_ENV[argv[i]];
    if (envKey && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      process.env[envKey] = argv[i + 1];
    }
  }
}

const VALID_ENVS = ["development", "staging", "production"] as const;
type PipelineEnv = (typeof VALID_ENVS)[number];

const command = process.argv[2] ?? "unknown";
const isTestRunner = process.env.NODE_TEST_CONTEXT !== undefined;
const noSentry = process.argv.includes("--no-sentry") || isTestRunner;
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";

// Mask credentials from ClickHouse URL (only keep protocol://host:port)
function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return raw; // not a valid URL, pass through
  }
}

const maskedClickhouseUrl = maskUrl(clickhouseUrl);

/**
 * Parse --env from argv. Required for all pipeline commands.
 *
 * The environment identifies where the pipeline *code* is running
 * (development, staging, production). This is independent of which
 * ClickHouse database it talks to — that's captured separately as
 * the `pipeline.clickhouse_url` tag. This distinction matters because
 * you can run the pipeline locally (development) against a remote
 * database (staging/production).
 */
function parseEnv(): PipelineEnv {
  const args = process.argv;
  const idx = args.indexOf("--env");
  if (idx >= 0 && idx + 1 < args.length && !args[idx + 1].startsWith("--")) {
    const val = args[idx + 1];
    if (VALID_ENVS.includes(val as PipelineEnv)) return val as PipelineEnv;
    console.error(
      `Error: Invalid --env value "${val}". Must be one of: ${VALID_ENVS.join(", ")}`,
    );
    process.exit(1);
  }

  // Fall back to NODE_ENV (set by Cloud Run jobs) for backward compat
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv && VALID_ENVS.includes(nodeEnv as PipelineEnv)) return nodeEnv as PipelineEnv;

  // In test runners, default to "development" silently
  if (isTestRunner) return "development";

  // help/--help and local-only commands don't need environment
  if (!command || command === "help" || command === "--help" || command === "-h" || command === "generate-compare-pairs") {
    return "development";
  }

  console.error(
    "Error: --env is required. Specify the runtime environment:\n" +
    "       --env development   (local dev)\n" +
    "       --env staging       (staging infra)\n" +
    "       --env production    (production infra)\n" +
    "\n" +
    "       This identifies where the pipeline is running, not which\n" +
    "       database it connects to (that's shown via CLICKHOUSE_URL).",
  );
  process.exit(1);
}

const environment = parseEnv();

/** The validated environment value. Exported for use in CLI logging. */
export const pipelineEnv: PipelineEnv = environment;

// Parse worker config from argv with validation
function parseWorkerTag(): string {
  const args = process.argv;
  const wIdx = args.indexOf("--worker-id");
  const tIdx = args.indexOf("--total-workers");
  const workerId = wIdx >= 0 && wIdx + 1 < args.length && !args[wIdx + 1].startsWith("--")
    ? args[wIdx + 1] : "0";
  const totalWorkers = tIdx >= 0 && tIdx + 1 < args.length && !args[tIdx + 1].startsWith("--")
    ? args[tIdx + 1] : "1";
  return `${Number(workerId) + 1}/${totalWorkers}`;
}

const workerTag = parseWorkerTag();

// DSN from env var only — no hardcoded default
const dsn = process.env.SENTRY_DSN_CRT_CLI;

const isHelp = !command || command === "help" || command === "--help" || command === "-h";

if (!noSentry && !isHelp && !dsn) {
  console.error(
    "Error: Sentry DSN not configured. Pass --sentry-dsn <DSN> or set SENTRY_DSN_CRT_CLI env var.\n" +
    "       Use --no-sentry to run without observability.",
  );
  process.exit(1);
}

Sentry.init({
  dsn: noSentry ? undefined : dsn,
  enabled: !noSentry,
  release: process.env.SENTRY_RELEASE || undefined,
  tracesSampleRate: 1.0,
  environment,

  // Tags applied to all events (transactions, errors, etc.)
  // environment = where the code runs (dev laptop / staging VM / prod Cloud Run)
  // clickhouse_url = which database it talks to (may differ from environment)
  initialScope: {
    tags: {
      "pipeline.command": command,
      "pipeline.clickhouse_url": maskedClickhouseUrl,
      "pipeline.worker": workerTag,
    },
  },

  _experiments: {
    enableLogs: true,
  },
});

// ── Error classification for fingerprinting ────────────────────────────

/**
 * Classify an error into a stable category for Sentry fingerprinting.
 * Groups transient GitHub/network errors so they don't create duplicate issues.
 */
function classifyError(err: unknown): string {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (message.includes("econnreset")) return "econnreset";
  if (message.includes("econnrefused")) return "econnrefused";
  if (message.includes("etimedout") || message.includes("timeout")) return "timeout";
  if (message.includes("other side closed")) return "connection-closed";
  // HTML error pages from GitHub (502/503 proxied through nginx) — check before
  // status codes since proxied responses often contain both HTML and status text
  if (message.includes("<html>") || message.includes("<!doctype html>") || message.includes("server error")) return "github-html-error";
  if (message.includes("502") || message.includes("bad gateway")) return "github-502";
  if (message.includes("503") || message.includes("service unavailable")) return "github-503";
  return "unknown";
}

/**
 * Capture an exception with a stable fingerprint based on error type and phase.
 * This ensures transient network errors group into one issue per phase instead
 * of splitting on message/stacktrace differences.
 */
export function captureEnrichmentError(
  err: unknown,
  phase: string,
  extra?: {
    fallback?: string;
    batchSize?: number;
    repos?: string[];
    repo?: string;
    pr_number?: number;
    bot_id?: string;
  },
): void {
  const errorClass = classifyError(err);
  Sentry.captureException(err, {
    fingerprint: ["enrichment", phase, errorClass],
    tags: {
      phase,
      "error.class": errorClass,
      ...(extra?.fallback ? { fallback: extra.fallback } : {}),
    },
    contexts: {
      enrichment: {
        phase,
        ...(extra?.batchSize != null ? { batch_size: extra.batchSize } : {}),
        ...(extra?.repos ? { repos: extra.repos.slice(0, 10) } : {}),
        ...(extra?.repo ? { repo: extra.repo } : {}),
        ...(extra?.pr_number != null ? { pr_number: extra.pr_number } : {}),
        ...(extra?.bot_id ? { bot_id: extra.bot_id } : {}),
      },
    },
  });
}

// ── Timestamped logger ─────────────────────────────────────────────────

/** Timestamped console.log — use instead of raw console.log in pipeline code. */
export function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/** Timestamped console.error */
export function logError(message: string): void {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

// ── Cron monitoring (upsert API) ───────────────────────────────────────

/**
 * Wrap a pipeline command as a Sentry cron monitor.
 * Uses the upsert API — creates the monitor if it doesn't exist.
 */
export async function withCronMonitor<T>(
  monitorSlug: string,
  fn: () => Promise<T>,
  schedule?: { type: "crontab"; value: string } | { type: "interval"; value: number; unit: "minute" | "hour" | "day" },
  maxRuntime?: number,
): Promise<T> {
  if (noSentry) return fn();

  const monitorConfig = {
    schedule: schedule ?? { type: "crontab" as const, value: "0 6 * * *" },
    checkinMargin: 5,
    maxRuntime: maxRuntime ?? 120,
    timezone: "UTC",
  };

  return Sentry.withMonitor(monitorSlug, fn, monitorConfig);
}

// ── Metrics helpers ────────────────────────────────────────────────────

// Use same key names as transaction tags for correlation
const metricAttrs: Record<string, string> = {
  "pipeline.command": command,
  "pipeline.environment": environment,
  "pipeline.clickhouse_url": maskedClickhouseUrl,
  "pipeline.worker": workerTag,
};

/** Increment a counter metric with standard pipeline attributes. */
export function countMetric(name: string, value: number = 1, extra?: Record<string, string>): void {
  if (noSentry) return;
  Sentry.metrics.count(name, value, { attributes: { ...metricAttrs, ...extra } });
}

/** Record a distribution (histogram) metric with standard pipeline attributes. */
export function distributionMetric(name: string, value: number, unit?: string, extra?: Record<string, string>): void {
  if (noSentry) return;
  Sentry.metrics.distribution(name, value, { attributes: { ...metricAttrs, ...extra }, unit });
}

/** Set a gauge metric with standard pipeline attributes. */
export function gaugeMetric(name: string, value: number, extra?: Record<string, string>): void {
  if (noSentry) return;
  Sentry.metrics.gauge(name, value, { attributes: { ...metricAttrs, ...extra } });
}

/** Sentry structured logger — sends logs to Sentry Logs product. */
export const sentryLogger = Sentry.logger;

export { Sentry };
