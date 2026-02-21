"use client";

import { useMemo } from "react";
import { useProductFilter, useFilterUrl } from "@/lib/product-filter";
import {
  ReviewVolumeChart,
} from "@/components/charts";
import Link from "next/link";
import type {
  WeeklyActivityByProduct,
  ProductSummary,
} from "@/lib/clickhouse";
import { useTheme } from "@/components/theme-provider";
import { getThemedBrandColor, getAvatarStyle } from "@/lib/theme-overrides";
import { SectionHeading } from "@/components/section-heading";

export function FilteredProductsPage({
  activity,
  summaries,
}: {
  activity: WeeklyActivityByProduct[];
  summaries: ProductSummary[];
}) {
  const { selectedProductIds } = useProductFilter();
  const { resolved } = useTheme();
  const buildUrl = useFilterUrl();
  const selectedSet = useMemo(
    () => new Set(selectedProductIds),
    [selectedProductIds],
  );

  // Filter summaries
  const filteredSummaries = useMemo(
    () => summaries.filter((s) => selectedSet.has(s.id)),
    [summaries, selectedSet],
  );

  // Build color map from activity
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of activity) {
      if (row.brand_color && !map[row.product_name]) {
        map[row.product_name] = row.brand_color;
      }
    }
    return map;
  }, [activity]);

  // Pivot activity data for stacked chart (filtered by product selection)
  const { pivoted, productNames } = useMemo(() => {
    const filtered = activity.filter((a) => selectedSet.has(a.product_id));
    const names = [...new Set(filtered.map((a) => a.product_name))];
    const pivotMap: Record<string, Record<string, string | number>> = {};
    for (const row of filtered) {
      if (!pivotMap[row.week]) {
        pivotMap[row.week] = { week: row.week };
      }
      pivotMap[row.week][row.product_name] =
        ((pivotMap[row.week][row.product_name] as number) ?? 0) +
        Number(row.review_count);
    }
    return { pivoted: Object.values(pivotMap), productNames: names };
  }, [activity, selectedSet]);

  return (
    <>
      {/* Review Volume by Product */}
      <section data-testid="volume-section">
        <SectionHeading id="review-volume">Review Volume by Product</SectionHeading>
        <div className="flex items-baseline justify-between mb-6">
          <p className="text-theme-muted">
            Weekly review count for each AI code review product.
            {filteredSummaries.length < summaries.length && (
              <span className="text-theme-text-secondary font-medium">
                {" "}
                Showing {filteredSummaries.length} of {summaries.length} products.
              </span>
            )}
          </p>
          <Link
            href={buildUrl("/compare")}
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors whitespace-nowrap ml-4"
          >
            Compare side by side →
          </Link>
        </div>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border relative z-10">
          <ReviewVolumeChart
            data={pivoted}
            bots={productNames}
            colors={colorMap}
          />
        </div>
      </section>

      {/* Bot Cards Grid */}
      {filteredSummaries.length === 0 ? (
        <p className="text-theme-muted text-sm" data-testid="bots-grid">No products to display.</p>
      ) : (
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        data-testid="bots-grid"
      >
        {filteredSummaries.map((product) => (
          <Link
            key={product.id}
            href={buildUrl(`/products/${product.id}`)}
            className="block bg-theme-surface rounded-xl p-6 border border-theme-border hover:border-violet-500/50 transition-colors"
            data-testid={`bot-card-${product.id}`}
          >
            <div className="flex items-center gap-3 mb-3">
              {product.avatar_url && (
                <img
                  src={product.avatar_url}
                  alt={product.name}
                  width={40}
                  height={40}
                  className="rounded-full bg-theme-surface border border-theme-border"
                  style={getAvatarStyle(product.id, resolved)}
                />
              )}
              <h2
                className="text-xl font-semibold"
                style={{ color: getThemedBrandColor(product.id, product.brand_color || "#a78bfa", resolved) }}
              >
                {product.name}
              </h2>
            </div>
            <p className="text-sm text-theme-muted line-clamp-2">
              {product.description}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-theme-muted/70">Reviews</span>
                <p className="font-medium tabular-nums">
                  {Number(product.total_reviews).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-theme-muted/70">PR Comments</span>
                <p className="font-medium tabular-nums">
                  {Number(product.total_pr_comments).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-theme-muted/70">Repos</span>
                <p className="font-medium tabular-nums">
                  {Number(product.total_repos).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-theme-muted/70">Orgs</span>
                <p className="font-medium tabular-nums">
                  {Number(product.total_orgs).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-theme-muted/70">👍 Rate</span>
                <p className="font-medium tabular-nums">
                  {Number(product.thumbs_up_rate) >= 0 ? `${Number(product.thumbs_up_rate).toFixed(0)}%` : "—"}
                </p>
              </div>
              <div>
                <span className="text-theme-muted/70">Growth</span>
                <p
                  className={`font-medium tabular-nums ${Number(product.growth_pct) >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {Number(product.growth_pct) >= 0 ? "+" : ""}
                  {Number(product.growth_pct).toFixed(1)}%
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      )}
    </>
  );
}
