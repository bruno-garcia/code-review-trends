/**
 * Shared product utilities — safe for both server and client components.
 * No server-only imports (no @clickhouse/client, no next/server).
 */

/** Minimum reviews in the prior 12-week window for a meaningful growth percentage. */
export const GROWTH_BASELINE_THRESHOLD = 100;

type GrowthFields = {
  growth_pct: number | string;
  prev_12w_reviews: number | string;
  recent_12w_reviews: number | string;
  total_reviews: number | string;
};

/** True when a product is too new for a meaningful growth percentage.
 *  Must have recent activity but insufficient history for comparison. */
export function isNewProduct(p: GrowthFields): boolean {
  return (
    Number(p.growth_pct) === 0 &&
    Number(p.prev_12w_reviews) < GROWTH_BASELINE_THRESHOLD &&
    Number(p.recent_12w_reviews) > 0 &&
    Number(p.total_reviews) > 0
  );
}

/** True when a product has historical data but zero activity in the last 12 weeks.
 *  These are automatically detected as inactive — no manual status change needed. */
export function isDormantProduct(p: GrowthFields): boolean {
  return Number(p.recent_12w_reviews) === 0 && Number(p.total_reviews) > 0;
}
