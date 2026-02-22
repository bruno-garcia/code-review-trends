import type { ProductComparison } from "@/lib/clickhouse";
import { getAvgCommentsPerPR, getBotReactionLeaderboard } from "@/lib/clickhouse";
import { CompareChartsBelow } from "./compare-charts-below";

/**
 * Async server component for below-fold compare page data.
 *
 * Fetches commentsPerPR and reactionLeaderboard, then renders the client
 * component. Intended to be wrapped in <Suspense> so the above-fold content
 * (trends chart + comparison table + radar + bar breakdowns) streams immediately.
 *
 * The two queries here operate on small pre-aggregated tables (~4,800 rows)
 * so they're fast, but deferring them still shaves ~200-400ms off the initial
 * HTML response.
 */
export async function CompareBelowFold({
  since,
  products,
  overrideProductIds,
}: {
  since: string | undefined;
  products: ProductComparison[];
  overrideProductIds?: string[];
}) {
  const [commentsPerPR, reactionLeaderboard] = await Promise.all([
    getAvgCommentsPerPR(undefined, since),
    getBotReactionLeaderboard(since),
  ]);

  // For pair pages, pre-filter to just the selected products
  const ids = overrideProductIds ? new Set(overrideProductIds) : null;
  const filteredComments = ids
    ? commentsPerPR.filter((c) => ids.has(c.product_id))
    : commentsPerPR;
  const filteredReactions = ids
    ? reactionLeaderboard.filter((r) => ids.has(r.product_id))
    : reactionLeaderboard;

  return (
    <CompareChartsBelow
      commentsPerPR={filteredComments}
      reactionLeaderboard={filteredReactions}
      overrideProductIds={overrideProductIds}
    />
  );
}

/** Loading skeleton shown while below-fold data is being fetched. */
export function BelowFoldSkeleton() {
  return (
    <div className="space-y-10 animate-pulse" data-testid="below-fold-skeleton">
      {/* Comments per PR placeholder */}
      <div>
        <div className="h-6 w-48 bg-theme-surface rounded mb-4" />
        <div className="h-4 w-80 bg-theme-surface/50 rounded mb-6" />
        <div className="h-48 bg-theme-surface rounded-xl border border-theme-border" />
      </div>
      {/* Bot Sentiment placeholder */}
      <div>
        <div className="h-6 w-40 bg-theme-surface rounded mb-4" />
        <div className="h-4 w-72 bg-theme-surface/50 rounded mb-6" />
        <div className="h-48 bg-theme-surface rounded-xl border border-theme-border" />
      </div>
    </div>
  );
}
