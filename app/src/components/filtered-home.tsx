"use client";

import { useMemo } from "react";
import { useProductFilter } from "@/lib/product-filter";
import {
  ReviewVolumeChart,
  BotReactionLeaderboardChart,
} from "@/components/charts";
import Link from "next/link";
import type {
  WeeklyActivityByProduct,
  ProductSummary,
  BotReactions,
} from "@/lib/clickhouse";

export function FilteredHome({
  activity,
  summaries,
  reactionLeaderboard,
}: {
  activity: WeeklyActivityByProduct[];
  summaries: ProductSummary[];
  reactionLeaderboard: BotReactions[];
}) {
  const { selectedProductIds } = useProductFilter();
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

  // Pivot activity data for stacked chart (filtered only)
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

  // Filter reaction leaderboard
  const filteredReactions = useMemo(
    () => reactionLeaderboard.filter((r) => selectedSet.has(r.product_id)),
    [reactionLeaderboard, selectedSet],
  );

  return (
    <>
      {/* Review Volume by Product */}
      <section data-testid="volume-section">
        <h2 className="text-2xl font-semibold mb-4">
          Review Volume by Product
        </h2>
        <p className="text-gray-400 mb-6">
          Weekly review count for each AI code review product.
          {filteredSummaries.length < summaries.length && (
            <span className="text-gray-500">
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
          <h2 className="text-2xl font-semibold">Leaderboard</h2>
          <Link
            href="/compare"
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            Full comparison →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="leaderboard-table">
            <thead className="text-gray-400 border-b border-theme-border text-sm">
              <tr>
                <th className="pb-3 pr-4">Product</th>
                <th className="pb-3 pr-4 text-right">Reviews</th>
                <th className="pb-3 pr-4 text-right">Comments</th>
                <th className="pb-3 pr-4 text-right">Repos</th>
                <th className="pb-3 pr-4 text-right">Orgs</th>
                <th className="pb-3 pr-4 text-right">Avg Comments/Review</th>
                <th className="pb-3 pr-4 text-right">Approval</th>
                <th className="pb-3 text-right">Growth</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredSummaries.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-theme-border/50 hover:bg-theme-surface/50"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/bots/${product.id}`}
                      className="font-medium hover:opacity-80 flex items-center gap-2"
                    >
                      {product.avatar_url && (
                        <img
                          src={product.avatar_url}
                          alt={product.name}
                          width={20}
                          height={20}
                          className="rounded-full bg-gray-800 border border-gray-700"
                        />
                      )}
                      <span
                        style={{
                          color: product.brand_color || "#818cf8",
                        }}
                      >
                        {product.name}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.total_reviews).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(product.total_comments).toLocaleString()}
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
                    {Number(product.approval_rate).toFixed(0)}%
                  </td>
                  <td className="py-3 text-right tabular-nums">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bot Sentiment */}
      <section data-testid="bot-sentiment-section">
        <h2 className="text-2xl font-semibold mb-4">Bot Sentiment</h2>
        <p className="text-gray-400 mb-6">
          How developers react to each bot&apos;s review comments — thumbs up,
          hearts, and thumbs down.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <BotReactionLeaderboardChart data={filteredReactions} />
        </div>
      </section>
    </>
  );
}
