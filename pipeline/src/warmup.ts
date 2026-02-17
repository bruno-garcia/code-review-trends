#!/usr/bin/env tsx
/**
 * Cache warm-up script for Cloud Run deployments.
 *
 * Hits each main page on a tagged revision URL before traffic is switched.
 * Instrumented with Sentry: one transaction per warmup run, one span per page.
 *
 * Usage:
 *   SENTRY_DSN=... tsx pipeline/src/warmup.ts <base-url>
 *
 * Options:
 *   --timeout <ms>    Per-page timeout in milliseconds (default: 30000)
 *   --retries <n>     Number of retries per page on failure (default: 2)
 *
 * Exit codes:
 *   0  All pages warmed successfully
 *   1  One or more pages failed (after retries)
 */

import * as Sentry from "@sentry/node";

// ── Configuration ──────────────────────────────────────────────────────

export const PAGES = ["/", "/bots", "/orgs", "/compare", "/about", "/status"];

export const PAGE_NAMES: Record<string, string> = {
  "/": "overview",
  "/bots": "bots",
  "/orgs": "orgs",
  "/compare": "compare",
  "/about": "about",
  "/status": "status",
};

// ── Arg parsing ────────────────────────────────────────────────────────

export interface WarmupArgs {
  baseUrl: string;
  timeout: number;
  retries: number;
}

export function parseArgs(argv: string[]): WarmupArgs | null {
  let baseUrl = "";
  let timeout = 30_000;
  let retries = 2;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--timeout" && argv[i + 1]) {
      const v = parseInt(argv[++i], 10);
      if (!Number.isFinite(v) || v < 0) return null;
      timeout = v;
    } else if (argv[i] === "--retries" && argv[i + 1]) {
      const v = parseInt(argv[++i], 10);
      if (!Number.isFinite(v) || v < 0) return null;
      retries = v;
    } else if (!argv[i].startsWith("--")) {
      baseUrl = argv[i].replace(/\/$/, ""); // strip trailing slash
    }
  }

  if (!baseUrl) return null;
  return { baseUrl, timeout, retries };
}

// ── Fetch with retry ───────────────────────────────────────────────────

export interface PageResult {
  page: string;
  status: number;
  duration_ms: number;
  ok: boolean;
  error?: string;
  attempts: number;
}

/** Fetch function signature — injectable for testing. */
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchPage(
  url: string,
  page: string,
  timeout: number,
  maxRetries: number,
  fetchFn: FetchFn = globalThis.fetch,
  log: (msg: string) => void = console.log,
): Promise<PageResult> {
  const fullUrl = `${url}${page}`;
  let lastError: string | undefined;
  let lastStatus = 0;
  let totalDuration = 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetchFn(fullUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "crt-warmup/1.0" },
      });

      // Read body to ensure the page is fully rendered server-side.
      // Duration includes the full response (headers + body).
      await res.text();

      const duration = Date.now() - start;
      totalDuration += duration;

      if (res.status >= 200 && res.status < 400) {
        return {
          page,
          status: res.status,
          duration_ms: totalDuration,
          ok: true,
          attempts: attempt,
        };
      }

      lastStatus = res.status;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      totalDuration += Date.now() - start;
      lastStatus = 0;
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    // Retry with backoff (500ms, 1000ms, ...)
    if (attempt <= maxRetries) {
      const delay = attempt * 500;
      log(`    Retry ${attempt}/${maxRetries} in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return {
    page,
    status: lastStatus,
    duration_ms: totalDuration,
    ok: false,
    error: lastError,
    attempts: maxRetries + 1,
  };
}

// ── Warmup orchestrator ────────────────────────────────────────────────

export interface WarmupOptions {
  baseUrl: string;
  timeout: number;
  retries: number;
  pages?: string[];
  fetchFn?: FetchFn;
  log?: (msg: string) => void;
}

export interface WarmupSummary {
  results: PageResult[];
  succeeded: number;
  failed: number;
  totalDuration: number;
}

/**
 * Purge the ISR cache on the target revision so that subsequent page fetches
 * trigger fresh server-side renders (with real ClickHouse) instead of serving
 * stale pre-rendered pages from `next build` (where CLICKHOUSE_URL was empty).
 */
export async function purgeCache(
  baseUrl: string,
  timeout: number = 15_000,
  fetchFn: FetchFn = globalThis.fetch,
  log: (msg: string) => void = console.log,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers: Record<string, string> = { "User-Agent": "crt-warmup/1.0" };
    const token = process.env.REVALIDATE_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetchFn(`${baseUrl}/api/revalidate`, {
      method: "POST",
      signal: controller.signal,
      headers,
    });
    // Drain response body to avoid socket leaks
    await res.text();
    if (res.ok) {
      log("  ✓ ISR cache purged via /api/revalidate");
      return true;
    }
    log(`  ✗ /api/revalidate returned ${res.status}`);
    return false;
  } catch (err) {
    log(`  ✗ /api/revalidate failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run cache warmup against a set of pages.
 * Pure orchestration — no Sentry, no process.exit.
 */
export async function warmup(opts: WarmupOptions): Promise<WarmupSummary> {
  const {
    baseUrl,
    timeout,
    retries,
    pages = PAGES,
    fetchFn = globalThis.fetch,
    log = console.log,
  } = opts;

  // Purge stale build-time ISR cache before fetching pages.
  // Without this, pages serve the pre-rendered error state for up to
  // `revalidate` seconds (3600s) after each deploy.
  const purged = await purgeCache(baseUrl, timeout, fetchFn, log);
  if (!purged) {
    throw new Error("Failed to purge ISR cache — aborting warmup to avoid caching stale pages");
  }

  const results: PageResult[] = [];

  for (const page of pages) {
    const result = await fetchPage(baseUrl, page, timeout, retries, fetchFn, log);

    const indicator = result.ok ? "✓" : "✗";
    const statusStr = result.status > 0 ? `${result.status}` : "ERR";
    const retriesStr = result.attempts > 1 ? ` (${result.attempts} attempts)` : "";
    log(`  ${indicator} ${page.padEnd(12)} ${statusStr.padEnd(6)} ${result.duration_ms}ms${retriesStr}`);

    if (!result.ok) {
      log(`    Error: ${result.error}`);
    }

    results.push(result);
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

  return { results, succeeded, failed, totalDuration };
}

// ── Sentry-instrumented runner ─────────────────────────────────────────

async function runWithSentry(args: WarmupArgs): Promise<WarmupSummary> {
  return Sentry.startSpan(
    {
      op: "deploy.warmup",
      name: "cache-warmup",
      attributes: {
        "warmup.base_url": args.baseUrl,
        "warmup.page_count": PAGES.length,
        "warmup.timeout_ms": args.timeout,
        "warmup.max_retries": args.retries,
      },
    },
    async (rootSpan) => {
      // Purge stale build-time ISR cache before fetching pages.
      await Sentry.startSpan(
        { op: "cache.purge", name: "POST /api/revalidate" },
        async (span) => {
          const purged = await purgeCache(args.baseUrl, args.timeout);
          if (!purged) {
            span.setStatus({ code: 2, message: "cache purge failed" });
            throw new Error("Failed to purge ISR cache — aborting warmup to avoid caching stale pages");
          }
        },
      );

      const results: PageResult[] = [];

      for (const page of PAGES) {
        const result = await Sentry.startSpan(
          {
            op: "http.client",
            name: `GET ${page}`,
            attributes: {
              "http.method": "GET",
              "http.url": `${args.baseUrl}${page}`,
              "warmup.page": PAGE_NAMES[page] ?? page,
            },
          },
          async (span) => {
            const r = await fetchPage(args.baseUrl, page, args.timeout, args.retries);

            span.setAttributes({
              "http.status_code": r.status,
              "warmup.duration_ms": r.duration_ms,
              "warmup.attempts": r.attempts,
            });

            if (!r.ok) {
              span.setStatus({ code: 2, message: r.error }); // ERROR
            }

            return r;
          },
        );

        const indicator = result.ok ? "✓" : "✗";
        const statusStr = result.status > 0 ? `${result.status}` : "ERR";
        const retriesStr = result.attempts > 1 ? ` (${result.attempts} attempts)` : "";
        console.log(`  ${indicator} ${page.padEnd(12)} ${statusStr.padEnd(6)} ${result.duration_ms}ms${retriesStr}`);

        if (!result.ok) {
          console.log(`    Error: ${result.error}`);
          Sentry.captureException(
            new Error(`Warmup failed: ${page} — ${result.error}`),
            {
              level: "error",
              fingerprint: ["warmup-failure", page],
              tags: {
                "warmup.page": PAGE_NAMES[page] ?? page,
                "warmup.status": String(result.status),
              },
              contexts: {
                warmup: {
                  base_url: args.baseUrl,
                  page,
                  status: result.status,
                  duration_ms: result.duration_ms,
                  attempts: result.attempts,
                  error: result.error,
                },
              },
            },
          );
        }

        results.push(result);
      }

      // Set summary attributes on root span
      const succeeded = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok).length;
      const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

      rootSpan.setAttributes({
        "warmup.succeeded": succeeded,
        "warmup.failed": failed,
        "warmup.total_duration_ms": totalDuration,
      });

      if (failed > 0) {
        rootSpan.setStatus({ code: 2, message: `${failed} page(s) failed` });
      }

      return { results, succeeded, failed, totalDuration };
    },
  );
}

// ── Main (only runs when executed directly) ────────────────────────────

const isDirectRun = process.argv[1]?.endsWith("warmup.ts") || process.argv[1]?.endsWith("warmup.js");

if (isDirectRun) {
  const dsn = process.env.SENTRY_DSN ?? process.env.SENTRY_DSN_CRT_CLI;

  Sentry.init({
    dsn: dsn || undefined,
    enabled: !!dsn,
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV ?? "staging",
    initialScope: {
      tags: {
        "warmup.commit": process.env.GITHUB_SHA?.slice(0, 7) ?? "unknown",
        "warmup.run_id": process.env.GITHUB_RUN_ID ?? "local",
      },
    },
  });

  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error("Usage: tsx pipeline/src/warmup.ts <base-url> [--timeout <ms>] [--retries <n>]");
    console.error("  --timeout must be a non-negative integer (milliseconds)");
    console.error("  --retries must be a non-negative integer");
    process.exit(1);
  }

  console.log(`Warming up: ${args.baseUrl}`);
  console.log(`  Pages: ${PAGES.join(", ")}`);
  console.log(`  Timeout: ${args.timeout}ms, Retries: ${args.retries}\n`);

  runWithSentry(args)
    .then(async (summary) => {
      const { succeeded, failed, totalDuration } = summary;
      console.log(`\nWarmup complete: ${succeeded}/${PAGES.length} pages OK, total ${totalDuration}ms`);

      // Report metrics
      if (dsn) {
        for (const result of summary.results) {
          Sentry.metrics.distribution("warmup.page_duration", result.duration_ms, {
            unit: "millisecond",
            attributes: {
              page: PAGE_NAMES[result.page] ?? result.page,
              status: result.ok ? "ok" : "error",
            },
          });
        }
        Sentry.metrics.count("warmup.pages_succeeded", succeeded);
        Sentry.metrics.count("warmup.pages_failed", failed);
        Sentry.metrics.distribution("warmup.total_duration", totalDuration, {
          unit: "millisecond",
        });
      }

      await Sentry.flush(5000);

      if (failed > 0) {
        process.exit(1);
      }
    })
    .catch(async (err) => {
      Sentry.captureException(err, {
        level: "fatal",
        fingerprint: ["warmup-crash"],
      });
      console.error("Warmup crashed:", err);
      await Sentry.flush(5000);
      process.exit(1);
    });
}
