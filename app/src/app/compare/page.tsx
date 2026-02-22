import { Suspense } from "react";
import type { Metadata } from "next";
import { getProductComparisons, getPrCommentSyncPct, getAllPrCharacteristics, getWeeklyActivityByProduct, getWeeklyReactionsByProduct } from "@/lib/clickhouse";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";
import { PrCommentSyncBanner } from "@/components/pr-comment-sync-banner";
import { CompareChartsAbove } from "./compare-charts-above";
import { CompareBelowFold, BelowFoldSkeleton } from "./compare-below-fold";
import { PAIR_BY_IDS } from "@/lib/generated/compare-pairs";

const DEFAULT_TITLE = "Compare AI Code Review Products";
const DEFAULT_DESCRIPTION =
  "Side-by-side comparison of AI code review tools by volume, growth rate, repos, organizations, and reaction sentiment. Updated weekly.";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const raw = params.products;
  const ids =
    typeof raw === "string"
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (ids.length === 2) {
    const sorted = [...ids].sort();
    const pair = PAIR_BY_IDS.get(`${sorted[0]}:${sorted[1]}`);
    if (pair) {
      return {
        title: pair.title,
        description: pair.description,
        alternates: { canonical: `/compare/${pair.slug}` },
        openGraph: { title: pair.title, description: pair.description },
        twitter: { title: pair.title, description: pair.description },
      };
    }
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    alternates: { canonical: "/compare" },
    openGraph: { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
    twitter: { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = parseTimeRange(params.range as string | undefined);
  const since = computeCutoffDate(range) ?? undefined;

  // Critical data: above-fold content (trends chart, comparison table, radar, bar charts).
  // These block the initial HTML response but use fast pre-aggregated tables.
  // getAllPrCharacteristics uses the pr_product_characteristics MV — no more
  // DISTINCT over millions of pr_bot_events rows.
  const [products, prCommentSyncPct, prCharacteristics, weeklyActivity, weeklyReactions] = await Promise.all([
    getProductComparisons(since),
    getPrCommentSyncPct(),
    getAllPrCharacteristics(since),
    getWeeklyActivityByProduct(undefined, since),
    getWeeklyReactionsByProduct(since),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold">Compare Products</h1>
        <p className="mt-2 text-theme-muted">
          Side-by-side comparison of AI code review products across multiple
          dimensions.
        </p>
      </div>
      <PrCommentSyncBanner pct={prCommentSyncPct} />

      {/* Above fold: trends chart + table + radar + bar breakdowns */}
      <CompareChartsAbove
        products={products}
        prCharacteristics={prCharacteristics}
        weeklyActivity={weeklyActivity}
        weeklyReactions={weeklyReactions}
      />

      {/* Below fold: comments per PR + bot sentiment — streamed via Suspense */}
      <Suspense fallback={<BelowFoldSkeleton />}>
        <CompareBelowFold since={since} products={products} />
      </Suspense>
    </div>
  );
}
