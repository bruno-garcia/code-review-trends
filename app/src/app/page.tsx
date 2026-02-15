import {
  getWeeklyTotals,
  getWeeklyActivityByProduct,
  getProductSummaries,
} from "@/lib/clickhouse";
import { BotShareChart, ReviewVolumeChart } from "@/components/charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

const TOP_N_CHART = 10;

export default async function Home() {
  const [totals, activity, summaries] = await Promise.all([
    getWeeklyTotals(),
    getWeeklyActivityByProduct(),
    getProductSummaries(),
  ]);

  // Build brand color map from activity data
  const colorMap: Record<string, string> = {};
  for (const row of activity) {
    if (row.brand_color && !colorMap[row.product_name]) {
      colorMap[row.product_name] = row.brand_color;
    }
  }

  // Get top N products by total reviews for the chart
  const topProductIds = new Set(
    summaries.slice(0, TOP_N_CHART).map((s) => s.id),
  );

  // Pivot activity data for stacked chart (top N only)
  const productNames = [
    ...new Set(
      activity
        .filter((a) => topProductIds.has(a.product_id))
        .map((a) => a.product_name),
    ),
  ];
  const pivotMap: Record<string, Record<string, string | number>> = {};
  for (const row of activity) {
    if (!topProductIds.has(row.product_id)) continue;
    if (!pivotMap[row.week]) {
      pivotMap[row.week] = { week: row.week };
    }
    pivotMap[row.week][row.product_name] =
      (pivotMap[row.week][row.product_name] as number ?? 0) +
      Number(row.review_count);
  }
  const pivoted = Object.values(pivotMap);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-8" data-testid="hero">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          AI Code Review Trends
        </h1>
        <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
          Tracking the adoption of AI code review bots across public GitHub
          repositories. How is AI changing code review?
        </p>
      </section>

      {/* AI Share */}
      <section data-testid="ai-share-section">
        <h2 className="text-2xl font-semibold mb-4">
          AI Share of Code Reviews
        </h2>
        <p className="text-gray-400 mb-6">
          Percentage of pull request reviews performed by AI bots vs. humans
          over time.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <BotShareChart data={totals} />
        </div>
      </section>

      {/* Review Volume by Product */}
      <section data-testid="volume-section">
        <h2 className="text-2xl font-semibold mb-4">
          Review Volume by Product
        </h2>
        <p className="text-gray-400 mb-6">
          Weekly review count for each AI code review product.
          {summaries.length > TOP_N_CHART && (
            <span className="text-gray-500">
              {" "}
              Showing top {TOP_N_CHART} of {summaries.length} products.
            </span>
          )}
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
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
              {summaries.map((product) => (
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
                          alt=""
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
    </div>
  );
}
