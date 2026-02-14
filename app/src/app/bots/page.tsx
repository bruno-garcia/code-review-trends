import { getBotSummaries } from "@/lib/clickhouse";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const summaries = await getBotSummaries();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">AI Code Review Bots</h1>
        <p className="mt-2 text-gray-400">
          Profiles and statistics for each AI code review bot we track.
        </p>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        data-testid="bots-grid"
      >
        {summaries.map((bot) => (
          <Link
            key={bot.id}
            href={`/bots/${bot.id}`}
            className="block bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-indigo-500/50 transition-colors"
            data-testid={`bot-card-${bot.id}`}
          >
            <h2 className="text-xl font-semibold text-indigo-400">
              {bot.name}
            </h2>
            <p className="mt-2 text-sm text-gray-400 line-clamp-2">
              {bot.description}
            </p>
            <div className="mt-4 flex gap-4 text-sm">
              <div>
                <span className="text-gray-500">Reviews</span>
                <p className="font-medium tabular-nums">
                  {Number(bot.total_reviews).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Repos</span>
                <p className="font-medium tabular-nums">
                  {Number(bot.total_repos).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Growth</span>
                <p
                  className={`font-medium tabular-nums ${Number(bot.growth_pct) >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {Number(bot.growth_pct) >= 0 ? "+" : ""}
                  {Number(bot.growth_pct).toFixed(1)}%
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
