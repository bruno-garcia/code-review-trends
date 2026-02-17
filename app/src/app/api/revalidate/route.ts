import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * POST /api/revalidate — purges the ISR cache for all pages.
 *
 * During `next build`, pages are pre-rendered with CLICKHOUSE_URL="" (no DB),
 * which bakes stale/error state into the ISR cache. The warmup script calls
 * this endpoint on the tagged revision *before* fetching pages, so that the
 * subsequent GETs trigger fresh server-side renders with real ClickHouse.
 *
 * Security: revalidatePath() only marks cached pages as stale — it doesn't
 * expose data or allow mutations. The worst case of unauthorized access is a
 * cache purge, which just causes the next request to re-render (a cache miss).
 */
export async function POST() {
  // Revalidate the root layout — this invalidates the cache for ALL pages
  // under it, including /, /bots, /bots/[id], /orgs, /compare, etc.
  revalidatePath("/", "layout");

  return NextResponse.json({
    revalidated: true,
    timestamp: Date.now(),
  });
}
