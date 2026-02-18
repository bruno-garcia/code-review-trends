import { NextRequest, NextResponse } from "next/server";

/**
 * Per-IP rate limiting middleware.
 *
 * Uses an in-memory sliding window counter. Not distributed — each Cloud Run
 * instance maintains its own counters — but sufficient given the low instance
 * count (minInstances=1, maxInstances≈10) and the goal of blocking aggressive
 * crawlers/scrapers rather than implementing strict global rate limits.
 *
 * ClickHouse is the bottleneck we're protecting: every page load triggers
 * server-side queries (force-dynamic), so unthrottled crawlers can overload it.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 100; // requests per window per IP

const counters = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string | null {
  // Cloud Run's load balancer always sets x-forwarded-for.
  // In local dev (next dev) the header may be absent — return null
  // so we skip rate limiting rather than grouping all unknown traffic
  // into a single bucket.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return null;
}

// Periodic cleanup to prevent memory leaks from stale entries
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < WINDOW_MS) return;
  lastCleanup = now;
  for (const [key, entry] of counters) {
    if (now > entry.resetAt) counters.delete(key);
  }
}

export function middleware(request: NextRequest) {
  cleanup();

  const ip = getClientIp(request);
  if (!ip) {
    // No IP available (local dev) — skip rate limiting
    return NextResponse.next();
  }

  const now = Date.now();

  let entry = counters.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    counters.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
      },
    });
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
  response.headers.set(
    "X-RateLimit-Remaining",
    String(Math.max(0, MAX_REQUESTS - entry.count)),
  );
  response.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(entry.resetAt / 1000)),
  );
  return response;
}

export const config = {
  // Skip rate limiting for static assets, Next.js internals, and the Sentry tunnel.
  // The Sentry tunnel (/monitoring) is already rate-limited by Sentry's backend.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|monitoring).*)"],
};
