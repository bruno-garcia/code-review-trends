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

const PAGES = ["/", "/bots", "/orgs", "/compare", "/about", "/status"];

const PAGE_NAMES: Record<string, string> = {
  "/": "overview",
  "/bots": "bots",
  "/orgs": "orgs",
  "/compare": "compare",
  "/about": "about",
  "/status": "status",
};

// ── Arg parsing ────────────────────────────────────────────────────────

function parseArgs(): { baseUrl: string; timeout: number; retries: number } {
  const args = process.argv.slice(2);
  let baseUrl = "";
  let timeout = 30_000;
  let retries = 2;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--timeout" && args[i + 1]) {
      timeout = parseInt(args[++i], 10);
    } else if (args[i] === "--retries" && args[i + 1]) {
      retries = parseInt(args[++i], 10);
    } else if (!args[i].startsWith("--")) {
      baseUrl = args[i].replace(/\/$/, ""); // strip trailing slash
    }
  }

  if (!baseUrl) {
    console.error("Usage: tsx pipeline/src/warmup.ts <base-url> [--timeout <ms>] [--retries <n>]");
    process.exit(1);
  }

  return { baseUrl, timeout, retries };
}

// ── Sentry init ────────────────────────────────────────────────────────

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

// ── Fetch with retry ───────────────────────────────────────────────────

interface PageResult {
  page: string;
  status: number;
  duration_ms: number;
  ok: boolean;
  error?: string;
  attempts: number;
}

async function fetchPage(
  url: string,
  page: string,
  timeout: number,
  maxRetries: number,
): Promise<PageResult> {
  const fullUrl = `${url}${page}`;
  let lastError: string | undefined;
  let lastStatus = 0;
  let totalDuration = 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(fullUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "crt-warmup/1.0" },
      });
      clearTimeout(timer);

      const duration = Date.now() - start;
      totalDuration += duration;

      // Read body to ensure the page is fully rendered server-side
      await res.text();

      if (res.status >= 200 && res.status < 400) {
        return {
          page,
          status: res.status,
          duration_ms: duration,
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
    }

    // Retry with backoff (500ms, 1000ms, ...)
    if (attempt <= maxRetries) {
      const delay = attempt * 500;
      console.log(`    Retry ${attempt}/${maxRetries} in ${delay}ms...`);
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

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { baseUrl, timeout, retries } = parseArgs();

  console.log(`Warming up: ${baseUrl}`);
  console.log(`  Pages: ${PAGES.join(", ")}`);
  console.log(`  Timeout: ${timeout}ms, Retries: ${retries}\n`);

  const results = await Sentry.startSpan(
    {
      op: "deploy.warmup",
      name: "cache-warmup",
      attributes: {
        "warmup.base_url": baseUrl,
        "warmup.page_count": PAGES.length,
        "warmup.timeout_ms": timeout,
        "warmup.max_retries": retries,
      },
    },
    async (rootSpan) => {
      const results: PageResult[] = [];

      for (const page of PAGES) {
        const result = await Sentry.startSpan(
          {
            op: "http.client",
            name: `GET ${page}`,
            attributes: {
              "http.method": "GET",
              "http.url": `${baseUrl}${page}`,
              "warmup.page": PAGE_NAMES[page] ?? page,
            },
          },
          async (span) => {
            const result = await fetchPage(baseUrl, page, timeout, retries);

            span.setAttributes({
              "http.status_code": result.status,
              "warmup.duration_ms": result.duration_ms,
              "warmup.attempts": result.attempts,
            });

            if (!result.ok) {
              span.setStatus({ code: 2, message: result.error }); // ERROR
            }

            return result;
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
                  base_url: baseUrl,
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

      return results;
    },
  );

  // Summary
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

  console.log(`\nWarmup complete: ${succeeded}/${PAGES.length} pages OK, total ${totalDuration}ms`);

  // Report metrics
  if (dsn) {
    for (const result of results) {
      Sentry.metrics.distribution("warmup.page_duration", result.duration_ms, {
        unit: "millisecond",
        attributes: {
          page: PAGE_NAMES[result.page] ?? result.page,
          status: result.ok ? "ok" : "error",
        },
      });
    }
    Sentry.metrics.distribution("warmup.total_duration", totalDuration, {
      unit: "millisecond",
    });
    Sentry.metrics.count("warmup.pages_succeeded", succeeded);
    Sentry.metrics.count("warmup.pages_failed", failed);
  }

  await Sentry.flush(5000);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(async (err) => {
  Sentry.captureException(err, {
    level: "fatal",
    fingerprint: ["warmup-crash"],
  });
  console.error("Warmup crashed:", err);
  await Sentry.flush(5000);
  process.exit(1);
});
