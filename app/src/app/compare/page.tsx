import { getProductComparisons, getAvgCommentsPerPR } from "@/lib/clickhouse";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";
import { CompareCharts } from "./compare-charts";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = parseTimeRange(params.range as string | undefined);
  const since = computeCutoffDate(range) ?? undefined;

  const [products, commentsPerPR] = await Promise.all([
    getProductComparisons(since),
    getAvgCommentsPerPR(undefined, since),
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
      <CompareCharts products={products} commentsPerPR={commentsPerPR} />
    </div>
  );
}
