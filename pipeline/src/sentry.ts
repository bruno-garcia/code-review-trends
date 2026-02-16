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
 */

import * as Sentry from "@sentry/node";

const command = process.argv[2] ?? "unknown";
const isTestRunner = process.env.NODE_TEST_CONTEXT !== undefined;
const noSentry = process.argv.includes("--no-sentry") || isTestRunner;
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";

// Mask credentials from ClickHouse URL (only keep host:port)
function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return raw; // not a valid URL, pass through
  }
}

const maskedClickhouseUrl = maskUrl(clickhouseUrl);

// Determine environment from ClickHouse URL
function detectEnvironment(): string {
  if (process.env.NODE_ENV) return process.env.NODE_ENV;
  if (clickhouseUrl.includes("localhost") || clickhouseUrl.includes("127.0.0.1")) return "development";
  return "production";
}

const environment = detectEnvironment();

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

if (!noSentry && !dsn) {
  console.error(
    "Error: Sentry DSN not configured. Set SENTRY_DSN or SENTRY_DSN_CRT_CLI env var.\n" +
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
): Promise<T> {
  if (noSentry) return fn();

  const monitorConfig = {
    schedule: schedule ?? { type: "crontab" as const, value: "0 */6 * * *" },
    checkinMargin: 5,
    maxRuntime: 120,
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
