import type { ProductSummary } from "./clickhouse";

const DEFAULT_COUNT = 10;

export function getDefaultProductIds(summaries: ProductSummary[]): string[] {
  // Select top 10 by growth rate (matching the ranking order used across the site).
  return [...summaries]
    .sort((a, b) => Number(b.growth_pct) - Number(a.growth_pct))
    .slice(0, DEFAULT_COUNT)
    .map((s) => s.id);
}
