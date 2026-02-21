import type { ProductSummary } from "./clickhouse";

export function getDefaultProductIds(summaries: ProductSummary[]): string[] {
  // Default to all products — users can narrow down via the filter bar.
  return summaries.map((s) => s.id);
}
