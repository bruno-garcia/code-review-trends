import type { ProductSummary } from "./clickhouse";

const DEFAULT_COUNT = 10;

export function getDefaultProductIds(summaries: ProductSummary[]): string[] {
  return [...summaries]
    .sort((a, b) => b.latest_week_reviews - a.latest_week_reviews)
    .slice(0, DEFAULT_COUNT)
    .map((s) => s.id);
}
