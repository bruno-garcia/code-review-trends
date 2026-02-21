"use client";

import { useMemo } from "react";
import { useProductFilter, useFilterUrl } from "@/lib/product-filter";
import { useUrlState } from "@/lib/use-url-state";
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

type LeaderboardSortKey =
  | "total_reviews"
  | "total_comments"
  | "total_pr_comments"
  | "total_repos"
  | "total_orgs"
  | "avg_comments_per_review"
  | "thumbs_up_rate"
  | "reaction_rate"
  | "growth_pct";

const LEADERBOARD_COLUMNS: { key: LeaderboardSortKey; label: string; title: string }[] = [
  { key: "growth_pct", label: "Growth", title: "Sort by review growth rate" },
  { key: "total_reviews", label: "Reviews", title: "Sort by total PR reviews submitted" },
  { key: "total_comments", label: "Review Comments", title: "Sort by total review comments posted" },
  { key: "total_pr_comments", label: "PR Comments", title: "Sort by total PR comments" },
  { key: "total_repos", label: "Repos", title: "Sort by max repos active in a single week" },
  { key: "total_orgs", label: "Orgs", title: "Sort by max organizations active in a single week" },
  { key: "avg_comments_per_review", label: "Avg C/R", title: "Sort by average comments per review" },
  { key: "thumbs_up_rate", label: "👍 Rate", title: "Sort by thumbs-up rate — % of 👍 vs 👎 reactions on bot comments (≥30 reactions required)" },
  { key: "reaction_rate", label: "Rxn Rate", title: "Sort by reaction rate — % of bot comments that received any 👍 or 👎" },
];

export function FilteredBotsPage({
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

  // Leaderboard sort state (synced to URL for sharing)
  const [rawSortKey, setRawSortKey] = useUrlState("sort", "growth_pct");
  const [rawSortDir, setRawSortDir] = useUrlState("dir", "desc");

  const validSortKeys = useMemo(
    () => new Set(LEADERBOARD_COLUMNS.map((c) => c.key)),
    [],
  );
  const sortKey: LeaderboardSortKey = validSortKeys.has(rawSortKey as LeaderboardSortKey)
    ? (rawSortKey as LeaderboardSortKey)
    : "growth_pct";
  const sortDir: "asc" | "desc" = rawSortDir === "asc" ? "asc" : "desc";

  function handleSort(key: LeaderboardSortKey) {
    if (key === sortKey) {
      setRawSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setRawSortKey(key);
      setRawSortDir("desc");
    }
  }

  // Filter summaries
  const filteredSummaries = useMemo(
    () => summaries.filter((s) => selectedSet.has(s.id)),
    [summaries, selectedSet],
  );

  // Sort summaries — push sentinel -1 (N/A) to the end, but only for columns
  // that use -1 as a sentinel. Other columns (e.g. growth_pct) have legitimate negatives.
  const sortedSummaries = useMemo(() => {
    const sentinelKeys: Set<LeaderboardSortKey> = new Set(["thumbs_up_rate", "reaction_rate"]);
    const usesSentinel = sentinelKeys.has(sortKey);
    return [...filteredSummaries].sort((a, b) => {
      const av = Number(a[sortKey]);
      const bv = Number(b[sortKey]);
      if (usesSentinel) {
        const aNA = av < 0;
        const bNA = bv < 0;
        if (aNA && bNA) return 0;
        if (aNA) return 1;
        if (bNA) return -1;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filteredSummaries, sortKey, sortDir]);

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
        <p className="text-theme-muted mb-6">
          Weekly review count for each AI code review product.
          {filteredSummaries.length < summaries.length && (
            <span className="text-theme-text-secondary font-medium">
              {" "}
              Showing {filteredSummaries.length} of {summaries.length} products.
            </span>
          )}
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border relative z-10">
          <ReviewVolumeChart
            data={pivoted}
            bots={productNames}
            colors={colorMap}
          />
        </div>
      </section>

      {/* Product Leaderboard */}
      <section data-testid="leaderboard-section">
        <div className="flex items-center justify-between mb-4">
          <SectionHeading id="leaderboard">Leaderboard</SectionHeading>
          <Link
            href={buildUrl("/compare")}
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Full comparison →
          </Link>
        </div>
        <div className="overflow-x-auto">
          {filteredSummaries.length === 0 ? (
            <p className="text-theme-muted text-sm">No products match the current filter.</p>
          ) : (
          <table className="w-full text-left" data-testid="leaderboard-table">
            <thead className="text-theme-muted border-b border-theme-border text-sm">
              <tr>
                <th className="pb-3 pr-4">Product</th>
                {LEADERBOARD_COLUMNS.map(({ key, label, title }) => (
                  <th key={key} className="pb-3 pr-4 text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-theme-text transition-colors"
                      onClick={() => handleSort(key)}
                      title={title}
                    >
                      {label}
                      {sortKey === key && (
                        <span className="text-violet-400">
                          {sortDir === "desc" ? "↓" : "↑"}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedSummaries.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-theme-border/50 hover:bg-theme-surface/50"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={buildUrl(`/bots/${product.id}`)}
                      className="font-medium hover:opacity-80 flex items-center gap-2"
                    >
                      {product.avatar_url && (
                        <img
                          src={product.avatar_url}
                          alt={product.name}
                          width={20}
                          height={20}
                          className="rounded-full bg-theme-surface-alt border border-theme-border"
                          style={getAvatarStyle(product.id, resolved)}
                        />
                      )}
                      <span
                        style={{
                          color: getThemedBrandColor(product.id, product.brand_color || "#818cf8", resolved),
                        }}
                      >
                        {product.name}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    <span
                      className={
                        Number(product.growth_pct) >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {Number(product.growth_pct) >= 0 ? "+" : ""}
                      {Number(product.growth_pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.total_reviews).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.total_comments).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.total_pr_comments).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.total_repos).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.total_orgs).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.avg_comments_per_review).toFixed(1)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.thumbs_up_rate) >= 0 ? `${Number(product.thumbs_up_rate).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.reaction_rate) >= 0 ? `${Number(product.reaction_rate).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
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
            href={buildUrl(`/bots/${product.id}`)}
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
