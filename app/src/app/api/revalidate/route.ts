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
 * Auth: If REVALIDATE_TOKEN is set, requires `Authorization: Bearer <token>`.
 * When unset (local dev, build time), all requests are allowed.
 */
export async function POST(request: Request) {
  const expectedToken = process.env.REVALIDATE_TOKEN;
  if (expectedToken) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Revalidate the root layout — this invalidates the cache for ALL pages
  // under it, including /, /bots, /bots/[id], /orgs, /compare, etc.
  revalidatePath("/", "layout");

  return NextResponse.json({
    revalidated: true,
    timestamp: Date.now(),
  });
}
