import { getBotComparisons, getAvgCommentsPerPR } from "@/lib/clickhouse";
import { CompareCharts } from "./compare-charts";
import { CommentsPerPRChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const [bots, commentsPerPR] = await Promise.all([
    getBotComparisons(),
    getAvgCommentsPerPR(),
  ]);

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

      {/* Comments per PR */}
      <section data-testid="comments-per-pr-section">
        <h2 className="text-2xl font-semibold mb-4">Comments per PR</h2>
        <p className="text-gray-400 mb-6">
          Average number of review comments each bot leaves per pull request.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <CommentsPerPRChart data={commentsPerPR} />
        </div>
      </section>
    </div>
  );
}
