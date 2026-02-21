import type { Metadata } from "next";
import { getProductComparisons, getAvgCommentsPerPR, getBotReactionLeaderboard, getPrCommentSyncPct, getAllPrCharacteristics } from "@/lib/clickhouse";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";
import { PrCommentSyncBanner } from "@/components/pr-comment-sync-banner";
import { CompareCharts } from "./compare-charts";

export const metadata: Metadata = {
  title: "Compare AI Code Review Products",
  description:
    "Side-by-side comparison of AI code review tools by volume, growth rate, repos, organizations, and reaction sentiment. Updated weekly.",
  alternates: { canonical: "/compare" },
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = parseTimeRange(params.range as string | undefined);
  const since = computeCutoffDate(range) ?? undefined;

  const [products, commentsPerPR, reactionLeaderboard, prCommentSyncPct, prCharacteristics] = await Promise.all([
    getProductComparisons(since),
    getAvgCommentsPerPR(undefined, since),
    getBotReactionLeaderboard(since),
    getPrCommentSyncPct(),
    getAllPrCharacteristics(since),
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
      <CompareCharts products={products} commentsPerPR={commentsPerPR} reactionLeaderboard={reactionLeaderboard} prCharacteristics={prCharacteristics} />
    </div>
  );
}
