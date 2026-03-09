import type { ProductSummary } from "./clickhouse";

const NEW_PRODUCT_WEEKS = 12;

/**
 * Returns true if the product's first tracked activity was within the last
 * 12 weeks.  Uses the `first_seen` field from ProductSummary (a YYYY-MM-DD
 * string returned by ClickHouse).  Falls back to false for empty strings
 * (products with no activity data yet).
 *
 * This is a pure, client-safe utility — it does not call ClickHouse.
 */
export function isNewProduct(product: Pick<ProductSummary, "first_seen">): boolean {
  if (!product.first_seen) return false;
  const firstSeen = new Date(product.first_seen);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - NEW_PRODUCT_WEEKS * 7);
  return firstSeen >= cutoff;
}