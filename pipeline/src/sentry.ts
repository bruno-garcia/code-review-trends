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

  // help/--help don't need environment (no Sentry, no ClickHouse)
  if (!command || command === "help" || command === "--help" || command === "-h") {
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
  return `${workerId}/${totalWorkers}`;
}

const workerTag = parseWorkerTag();

// DSN from env var only — no hardcoded default
const dsn = process.env.SENTRY_DSN_CRT_CLI ?? process.env.SENTRY_DSN;

const isHelp = !command || command === "help" || command === "--help" || command === "-h";

if (!noSentry && !isHelp && !dsn) {
  console.error(
    "Error: Sentry DSN not configured. Set SENTRY_DSN_CRT_CLI env var.\n" +
    "       Use --no-sentry to run without observability.",
  );
  process.exit(1);
}

Sentry.init({
  dsn: noSentry ? undefined : dsn,
  enabled: !noSentry,
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

// ── Timestamped logger ─────────────────────────────────────────────────

/** Timestamped console.log — use instead of raw console.log in pipeline code. */
export function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

/** Timestamped console.error */
export function logError(message: string): void {
  console.error(`[${new Date().toISOString()}] ${message}`);
}

/** Timestamped console.warn */
export function logWarn(message: string): void {
  console.warn(`[${new Date().toISOString()}] ${message}`);
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

export { Sentry };
