import {
  getWeeklyTotals,
  getWeeklyActivity,
  getBotSummaries,
  getTopOrgsByStars,
  getBotReactionLeaderboard,
  getEnrichmentStats,
} from "@/lib/clickhouse";
import {
  BotShareChart,
  ReviewVolumeChart,
  TopOrgsChart,
  BotReactionLeaderboardChart,
} from "@/components/charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [totals, activity, summaries, topOrgs, reactionLeaderboard, enrichmentStats] = await Promise.all([
    getWeeklyTotals(),
    getWeeklyActivity(),
    getBotSummaries(),
    getTopOrgsByStars(20),
    getBotReactionLeaderboard(),
    getEnrichmentStats(),
  ]);

  // Pivot activity data for stacked chart
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
        <h2 className="text-2xl font-semibold mb-4">Review Volume by Bot</h2>
        <p className="text-gray-400 mb-6">
          Weekly review count for each AI code review bot.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <ReviewVolumeChart data={pivoted} bots={botNames} />
        </div>
      </section>

      {/* Bot Leaderboard */}
      <section data-testid="leaderboard-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Bot Leaderboard</h2>
          <Link
            href="/compare"
            className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Full comparison →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left" data-testid="leaderboard-table">
            <thead className="text-gray-400 border-b border-gray-800 text-sm">
              <tr>
                <th className="pb-3 pr-4">Bot</th>
                <th className="pb-3 pr-4 text-right">Reviews</th>
                <th className="pb-3 pr-4 text-right">Comments</th>
                <th className="pb-3 pr-4 text-right">Repos</th>
                <th className="pb-3 pr-4 text-right">Orgs</th>
                <th className="pb-3 pr-4 text-right">Avg Comments/Review</th>
                <th className="pb-3 pr-4 text-right">Approval</th>
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
                    {Number(bot.total_comments).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(bot.total_repos).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(bot.total_orgs).toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(bot.avg_comments_per_review).toFixed(1)}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {Number(bot.approval_rate).toFixed(0)}%
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

      {/* Top Organizations */}
      <section data-testid="top-orgs-section">
        <h2 className="text-2xl font-semibold mb-4">Top Organizations</h2>
        <p className="text-gray-400 mb-6">
          Organizations with the most GitHub stars across repos where AI bots review code.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <TopOrgsChart data={topOrgs} />
        </div>
      </section>

      {/* Bot Sentiment */}
      <section data-testid="bot-sentiment-section">
        <h2 className="text-2xl font-semibold mb-4">Bot Sentiment</h2>
        <p className="text-gray-400 mb-6">
          How developers react to each bot&apos;s review comments — thumbs up, hearts, and thumbs down.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <BotReactionLeaderboardChart data={reactionLeaderboard} />
        </div>
      </section>

      {/* Data Coverage */}
      {(enrichmentStats.enriched_repos > 0 || enrichmentStats.total_comments > 0) && (
        <section data-testid="data-coverage" className="text-center text-sm text-gray-500 py-4 border-t border-gray-800">
          Tracking{" "}
          <span className="text-gray-300">{enrichmentStats.enriched_repos.toLocaleString()}</span> repos,{" "}
          <span className="text-gray-300">{enrichmentStats.enriched_prs.toLocaleString()}</span> PRs,{" "}
          <span className="text-gray-300">{enrichmentStats.total_comments.toLocaleString()}</span> comments
        </section>
      )}
    </div>
  );
}
