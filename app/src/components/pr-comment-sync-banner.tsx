import Link from "next/link";

const SYNC_BANNER_THRESHOLD_PCT = 80;

/**
 * Banner shown when PR comment data collection is incomplete (<80%).
 * Rendered server-side — accepts the sync percentage as a prop.
 */
export function PrCommentSyncBanner({
  pct,
}: {
  pct: number | null;
}) {
  if (pct === null || pct >= SYNC_BANNER_THRESHOLD_PCT) return null;

  return (
    <div
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400"
      data-testid="pr-comment-sync-warning"
    >
      <strong>Note:</strong> PR comment data collection is in progress (
      {pct.toFixed(0)}% of weeks synced). Some PR comment counts may be
      incomplete.{" "}
      <Link
        href="/status"
        className="text-amber-300 hover:text-amber-200 underline"
      >
        View status →
      </Link>
    </div>
  );
}
