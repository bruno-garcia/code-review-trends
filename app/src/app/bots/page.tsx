import { getProductSummaries, getWeeklyActivityByProduct, getBotReactionLeaderboard } from "@/lib/clickhouse";
import { FilteredBotsPage } from "@/components/filtered-bots-page";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";
import Link from "next/link";

// Revalidate every hour — data only changes weekly via pipeline
export const revalidate = 3600;

export default async function BotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const range = parseTimeRange(params.range as string | undefined);
  const since = computeCutoffDate(range) ?? undefined;

  const [summaries, activity, reactionLeaderboard] = await Promise.all([
    getProductSummaries(since),
    getWeeklyActivityByProduct(undefined, since),
    getBotReactionLeaderboard(since),
  ]);

  return (
    <div className="space-y-12">
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
      <FilteredBotsPage activity={activity} summaries={summaries} reactionLeaderboard={reactionLeaderboard} />
    </div>
  );
}
