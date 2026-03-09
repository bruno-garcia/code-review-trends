/**
 * Shared product utilities — safe for both server and client components.
 * No server-only imports (no @clickhouse/client, no next/server).
 */

/** Minimum reviews in the prior 12-week window for a meaningful growth percentage. */
export const GROWTH_BASELINE_THRESHOLD = 100;

/** True when a product is too new for a meaningful growth percentage. */
export function isNewProduct(p: { growth_pct: number; prev_12w_reviews: number; total_reviews: number }): boolean {
  return p.growth_pct === 0 && p.prev_12w_reviews < GROWTH_BASELINE_THRESHOLD && p.total_reviews > 0;
}
