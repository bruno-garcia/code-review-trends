"use client";

import { useMemo } from "react";
import type { BotCommentsPerPR } from "@/lib/clickhouse";
import { CommentsPerPRChart } from "@/components/charts";
import { useProductFilter } from "@/lib/product-filter";
import { useUrlState } from "@/lib/use-url-state";
import { SectionHeading } from "@/components/section-heading";

/**
 * Below-fold compare charts: Comments per PR.
 *
 * Rendered inside a Suspense boundary on the main compare page so the
 * above-fold content (trends chart + comparison table) can stream immediately
 * while this section loads.
 */
export function CompareChartsBelow({
  commentsPerPR: allCommentsPerPR,
  overrideProductIds,
}: {
  commentsPerPR: BotCommentsPerPR[];
  /** When set, bypass the global product filter and show exactly these products. */
  overrideProductIds?: string[];
}) {
  const { selectedProductIds: globalIds, allProducts } = useProductFilter();
  const selectedProductIds = overrideProductIds ?? globalIds;

  // Hidden when the table is in expanded mode (URL state shared with above component)
  const [expanded] = useUrlState("expanded", "");
  const isExpanded = expanded === "1";

  const commentsPerPR = useMemo(
    () => allCommentsPerPR.filter((c) => selectedProductIds.includes(c.product_id)),
    [allCommentsPerPR, selectedProductIds],
  );

  // Build product_id → brand_color map for chart coloring
  const productColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allProducts) m.set(p.id, p.brand_color);
    return m;
  }, [allProducts]);

  if (isExpanded) return null;

  return (
    <>
      {/* Comments per PR */}
      <section data-testid="comments-per-pr-section" id="comments-per-pr">
        <SectionHeading id="comments-per-pr">Comments per PR</SectionHeading>
        <p className="text-theme-muted mb-6">
          Average number of review comments each bot leaves per pull request.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <CommentsPerPRChart data={commentsPerPR} productColors={productColorMap} />
        </div>
      </section>
    </>
  );
}
