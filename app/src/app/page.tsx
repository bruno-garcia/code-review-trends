import {
  getWeeklyTotals,
  getWeeklyTotalVolume,
  getTopOrgsByStars,
} from "@/lib/clickhouse";
import {
  BotShareChart,
  TotalVolumeChart,
  TopOrgsChart,
} from "@/components/charts";


export const dynamic = "force-dynamic";

export default async function Home() {
  const [totals, totalVolume, topOrgs] = await Promise.all([
    getWeeklyTotals(),
    getWeeklyTotalVolume(),
    getTopOrgsByStars(20),
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

      {/* Total AI Review Volume */}
      <section data-testid="total-volume-section">
        <h2 className="text-2xl font-semibold mb-4">
          Total AI Review Volume
        </h2>
        <p className="text-theme-muted mb-6">
          Weekly volume of AI-generated code reviews, comments, and PR comments across all bots.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <TotalVolumeChart data={totalVolume} />
        </div>
      </section>

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


    </div>
  );
}
