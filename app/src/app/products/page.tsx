import type { Metadata } from "next";
import { getProductSummaries, getWeeklyActivityByProduct, getPrCommentSyncPct } from "@/lib/clickhouse";
import { FilteredProductsPage } from "@/components/filtered-products-page";
import { PrCommentSyncBanner } from "@/components/pr-comment-sync-banner";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";

export async function generateMetadata(): Promise<Metadata> {
  const summaries = await getProductSummaries();
  const count = summaries.length;
  return {
    title: "AI Code Review Products",
    description: `Profiles, stats, and weekly trends for ${count} AI code review products on GitHub. Compare CodeRabbit, Copilot, Sentry, Cursor, and more.`,
    alternates: { canonical: "/products" },
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = parseTimeRange(params.range as string | undefined);
  const since = computeCutoffDate(range) ?? undefined;

  const [summaries, activity, prCommentSyncPct] = await Promise.all([
    getProductSummaries(since),
    getWeeklyActivityByProduct(undefined, since),
    getPrCommentSyncPct(),
  ]);

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-bold">AI Code Review Products</h1>
        <p className="mt-2 text-theme-muted">
          Profiles and statistics for each AI code review product we track.
        </p>
      </div>
      <PrCommentSyncBanner pct={prCommentSyncPct} />
      <FilteredProductsPage activity={activity} summaries={summaries} />
    </div>
  );
}
