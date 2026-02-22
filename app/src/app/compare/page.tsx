import type { Metadata } from "next";
import { getProductComparisons, getAvgCommentsPerPR, getBotReactionLeaderboard, getPrCommentSyncPct, getAllPrCharacteristics, getWeeklyActivityByProduct, getWeeklyReactionsByProduct } from "@/lib/clickhouse";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";
import { PrCommentSyncBanner } from "@/components/pr-comment-sync-banner";
import { CompareCharts } from "./compare-charts";
import { PAIR_BY_SLUG } from "@/lib/generated/compare-pairs";

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
    const slug = `${sorted[0]}-vs-${sorted[1]}`;
    const pair = PAIR_BY_SLUG.get(slug);
    if (pair) {
      return {
        title: pair.title,
        description: pair.description,
        alternates: { canonical: `/compare/${slug}` },
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

  const [products, commentsPerPR, reactionLeaderboard, prCommentSyncPct, prCharacteristics, weeklyActivity, weeklyReactions] = await Promise.all([
    getProductComparisons(since),
    getAvgCommentsPerPR(undefined, since),
    getBotReactionLeaderboard(since),
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
      <CompareCharts products={products} commentsPerPR={commentsPerPR} reactionLeaderboard={reactionLeaderboard} prCharacteristics={prCharacteristics} weeklyActivity={weeklyActivity} weeklyReactions={weeklyReactions} />
    </div>
  );
}
