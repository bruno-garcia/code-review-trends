import { getProductComparisons } from "@/lib/clickhouse";
import { CompareCharts } from "./compare-charts";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const products = await getProductComparisons();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold">Compare Products</h1>
        <p className="mt-2 text-gray-400">
          Side-by-side comparison of AI code review products across multiple
          dimensions.
        </p>
      </div>
      <CompareCharts products={products} />
    </div>
  );
}
