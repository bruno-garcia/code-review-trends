import { getProductSummaries } from "@/lib/clickhouse";
import { FilteredBotsGrid } from "@/components/filtered-bots-grid";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const summaries = await getProductSummaries();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Code Review Products</h1>
          <p className="mt-2 text-theme-muted">
            Profiles and statistics for each AI code review product we track.
          </p>
        </div>
        <Link
          href="/compare"
          className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Compare All →
        </Link>
      </div>

      <FilteredBotsGrid summaries={summaries} />
    </div>
  );
}
