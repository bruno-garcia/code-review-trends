import { getAvgCommentsPerPR } from "@/lib/clickhouse";
import { CompareChartsBelow } from "./compare-charts-below";

/**
 * Async server component for below-fold compare page data.
 *
 * Fetches commentsPerPR, then renders the client component.
 * Intended to be wrapped in <Suspense> so the above-fold content
 * (trends chart + comparison table) streams immediately.
 */
export async function CompareBelowFold({
  since,
  overrideProductIds,
}: {
  since: string | undefined;
  overrideProductIds?: string[];
}) {
  const commentsPerPR = await getAvgCommentsPerPR(undefined, since);

  // For pair pages, pre-filter to just the selected products
  const ids = overrideProductIds ? new Set(overrideProductIds) : null;
  const filteredComments = ids
    ? commentsPerPR.filter((c) => ids.has(c.product_id))
    : commentsPerPR;

  return (
    <CompareChartsBelow
      commentsPerPR={filteredComments}
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
    </div>
  );
}
