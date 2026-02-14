import { getBotComparisons } from "@/lib/clickhouse";
import { CompareCharts } from "./compare-charts";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const bots = await getBotComparisons();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold">Compare Bots</h1>
        <p className="mt-2 text-gray-400">
          Side-by-side comparison of AI code review bots across multiple
          dimensions.
        </p>
      </div>
      <CompareCharts bots={bots} />
    </div>
  );
}
