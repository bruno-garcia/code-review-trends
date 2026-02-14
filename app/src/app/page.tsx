import {
  getWeeklyTotals,
  getWeeklyActivity,
  getBotSummaries,
} from "@/lib/clickhouse";
import { BotShareChart, ReviewVolumeChart } from "@/components/charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [totals, activity, summaries] = await Promise.all([
    getWeeklyTotals(),
    getWeeklyActivity(),
    getBotSummaries(),
  ]);

  // Pivot activity data for stacked chart: { week, BotA: count, BotB: count, ... }
  const botNames = [...new Set(activity.map((a) => a.bot_name))];
  const pivotMap: Record<string, Record<string, string | number>> = {};
  for (const row of activity) {
    if (!pivotMap[row.week]) {
      pivotMap[row.week] = { week: row.week };
    }
    pivotMap[row.week][row.bot_name] = Number(row.review_count);
  }
  const pivoted = Object.values(pivotMap);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-8" data-testid="hero">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          AI Code Review Trends
        </h1>
        <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
          Tracking the adoption of AI code review bots across public GitHub
          repositories. How is AI changing code review?
        </p>
      </section>

      {/* AI Share */}
      <section data-testid="ai-share-section">
        <h2 className="text-2xl font-semibold mb-4">
          AI Share of Code Reviews
        </h2>
        <p className="text-gray-400 mb-6">
          Percentage of pull request reviews performed by AI bots vs. humans
          over time.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <BotShareChart data={totals} />
        </div>
      </section>

      {/* Review Volume by Bot */}
      <section data-testid="volume-section">
        <h2 className="text-2xl font-semibold mb-4">
          Review Volume by Bot
        </h2>
        <p className="text-gray-400 mb-6">
          Weekly review count for each AI code review bot.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <ReviewVolumeChart data={pivoted} bots={botNames} />
        </div>
      </section>

      {/* Bot Leaderboard */}
      <section data-testid="leaderboard-section">
        <h2 className="text-2xl font-semibold mb-4">Bot Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="leaderboard-table">
            <thead className="text-gray-400 border-b border-gray-800 text-sm">
              <tr>
                <th className="pb-3 pr-4">Bot</th>
                <th className="pb-3 pr-4 text-right">Total Reviews</th>
                <th className="pb-3 pr-4 text-right">Active Repos</th>
                <th className="pb-3 pr-4 text-right">Last 4 Weeks</th>
                <th className="pb-3 text-right">Growth</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {summaries.map((bot) => (
                <tr
                  key={bot.id}
                  className="border-b border-gray-800/50 hover:bg-gray-900/50"
                >
                  <td className="py-3 pr-4">
                    <Link
                      href={`/bots/${bot.id}`}
                      className="font-medium text-indigo-400 hover:text-indigo-300"
                    >
                      {bot.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(bot.total_reviews).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(bot.total_repos).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(bot.latest_week_reviews).toLocaleString()}
                  </td>
                  <td className="py-3 text-right tabular-nums">
                    <span
                      className={
                        Number(bot.growth_pct) >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }
                    >
                      {Number(bot.growth_pct) >= 0 ? "+" : ""}
                      {Number(bot.growth_pct).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
