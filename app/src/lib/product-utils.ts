/**
 * Shared product utilities — safe for both server and client components.
 * No server-only imports (no @clickhouse/client, no next/server).
 */

/** Minimum reviews in the prior 12-week window for a meaningful growth percentage. */
export const GROWTH_BASELINE_THRESHOLD = 100;

/** True when a product is too new for a meaningful growth percentage.
 *  Uses Number() coercion because ClickHouse JSONEachRow may return numeric
 *  fields as strings depending on driver version. */
export function isNewProduct(p: { growth_pct: number | string; prev_12w_reviews: number | string; total_reviews: number | string }): boolean {
  return Number(p.growth_pct) === 0 && Number(p.prev_12w_reviews) < GROWTH_BASELINE_THRESHOLD && Number(p.total_reviews) > 0;
}
