import {
  getWeeklyTotals,
  getWeeklyActivityByProduct,
  getProductSummaries,
  getTopOrgsByStars,
  getBotReactionLeaderboard,
  getEnrichmentStats,
} from "@/lib/clickhouse";
import {
  BotShareChart,
  TopOrgsChart,
} from "@/components/charts";
import { FilteredHome } from "@/components/filtered-home";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [totals, activity, summaries, topOrgs, reactionLeaderboard, enrichmentStats] = await Promise.all([
    getWeeklyTotals(),
    getWeeklyActivityByProduct(),
    getProductSummaries(),
    getTopOrgsByStars(20),
    getBotReactionLeaderboard(),
    getEnrichmentStats(),
  ]);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-8" data-testid="hero">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          AI Code Review Trends
        </h1>
        <p className="mt-4 text-lg text-theme-muted max-w-2xl mx-auto">
          Tracking the adoption of AI code review bots across public GitHub
          repositories. How is AI changing code review?
        </p>
      </section>

      {/* AI Share — unfiltered */}
      <section data-testid="ai-share-section">
        <h2 className="text-2xl font-semibold mb-4">
          AI Share of Code Reviews
        </h2>
        <p className="text-theme-muted mb-6">
          Percentage of pull request reviews performed by AI bots vs. humans
          over time.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <BotShareChart data={totals} />
        </div>
      </section>

      {/* Filtered sections: Volume, Leaderboard, Bot Sentiment */}
      <FilteredHome
        activity={activity}
        summaries={summaries}
        reactionLeaderboard={reactionLeaderboard}
      />

      {/* Top Organizations — unfiltered */}
      <section data-testid="top-orgs-section">
        <h2 className="text-2xl font-semibold mb-4">Top Organizations</h2>
        <p className="text-theme-muted mb-6">
          Organizations with the most GitHub stars across repos where AI bots review code.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <TopOrgsChart data={topOrgs} />
        </div>
      </section>

      {/* Data Coverage — unfiltered */}
      {(enrichmentStats.enriched_repos > 0 || enrichmentStats.total_comments > 0) && (
        <section data-testid="data-coverage" className="text-center text-sm text-theme-muted/70 py-4 border-t border-theme-border">
          Tracking{" "}
          <span className="text-theme-text/80">{enrichmentStats.enriched_repos.toLocaleString()}</span> repos,{" "}
          <span className="text-theme-text/80">{enrichmentStats.enriched_prs.toLocaleString()}</span> PRs,{" "}
          <span className="text-theme-text/80">{enrichmentStats.total_comments.toLocaleString()}</span> comments
        </section>
      )}
    </div>
  );
}
