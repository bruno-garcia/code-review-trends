import type { Metadata } from "next";
import {
  getWeeklyTotals,
  getWeeklyTotalVolume,
  getTopOrgsByStars,
  getProductSummaries,
} from "@/lib/clickhouse";
import {
  BotShareChart,
  TotalVolumeChart,
  TopOrgsChart,
} from "@/components/charts";
import { SectionHeading } from "@/components/section-heading";
import { JsonLd } from "@/components/json-ld";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const products = await getProductSummaries();
  return {
    description: `Track the adoption of AI code review bots on GitHub. Trends, statistics, and per-provider profiles for ${products.length} AI code review products.`,
    alternates: { canonical: "/" },
  };
}

export default async function Home() {
  const [totals, totalVolume, topOrgs, products] = await Promise.all([
    getWeeklyTotals(),
    getWeeklyTotalVolume(),
    getTopOrgsByStars(20),
    getProductSummaries(),
  ]);

  // Compute latest AI share % for structured data
  const latestWeek = totals.length > 0 ? totals[totals.length - 1] : null;
  const latestPct = latestWeek ? latestWeek.bot_share_pct : null;

  return (
    <div className="space-y-12">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Dataset",
          name: "AI Code Review Trends on GitHub",
          description:
            latestPct != null
              ? `AI bots perform ${latestPct}% of public GitHub code reviews. Tracking adoption of ${products.length} AI code review products since January 2023.`
              : `Tracking the adoption of AI code review bots across public GitHub repositories since January 2023.`,
          url: "https://codereviewtrends.com",
          temporalCoverage: "2023-01-01/..",
          license: "https://github.com/bruno-garcia/code-review-trends",
          creator: {
            "@type": "Person",
            name: "Bruno Garcia",
            url: "https://github.com/bruno-garcia",
          },
          distribution: {
            "@type": "DataDownload",
            contentUrl: "https://codereviewtrends.com",
            encodingFormat: "text/html",
          },
        }}
      />
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
        <SectionHeading id="ai-share">AI Share of Code Reviews</SectionHeading>
        <p className="text-theme-muted mb-6">
          Percentage of pull request reviews performed by AI bots vs. humans
          over time.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <BotShareChart data={totals} />
        </div>
        <p className="mt-3 text-xs text-theme-muted/70">
          * &ldquo;Reviews&rdquo; includes all PR events (comments, approvals, and commit-triggered responses). Bots typically react to every push, inflating their share relative to humans.{" "}
          <Link href="/about#what-counts" className="underline hover:text-theme-text">See methodology.</Link>
        </p>
      </section>

      {/* Total AI Review Volume */}
      <section data-testid="total-volume-section">
        <SectionHeading id="volume">Total AI Review Volume</SectionHeading>
        <p className="text-theme-muted mb-6">
          Weekly volume of AI-generated code reviews and review comments across all bots.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <TotalVolumeChart data={totalVolume} />
        </div>
      </section>

      {/* Top Products by Growth */}
      {products.length > 0 && (
        <section data-testid="top-products-section">
          <SectionHeading id="top-products">Top Products by Growth</SectionHeading>
          <p className="text-theme-muted mb-6">
            AI code review products ranked by review growth rate.{" "}
            <Link href="/about#rankings" className="underline hover:text-theme-text">Methodology.</Link>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {products.slice(0, 10).map((product, i) => {
              const growth = Number(product.growth_pct);
              return (
                <Link
                  key={product.id}
                  href={`/products/${product.id}`}
                  className="flex items-center gap-3 bg-theme-surface rounded-xl p-4 border border-theme-border hover:border-violet-500/50 transition-colors group"
                >
                  <span className="text-theme-muted text-sm w-5 text-right shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  {product.avatar_url && (
                    <img
                      src={product.avatar_url}
                      alt={product.name}
                      width={28}
                      height={28}
                      className="rounded-full bg-theme-surface-alt border border-theme-border shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-theme-text group-hover:text-violet-400 transition-colors truncate block">
                      {product.name}
                    </span>
                    <span className={`text-xs tabular-nums ${growth >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-theme-muted">
            <Link href="/products" className="underline hover:text-theme-text">
              Explore all products →
            </Link>
          </p>
        </section>
      )}

      {/* Top Organizations — unfiltered */}
      <section data-testid="top-orgs-section">
        <SectionHeading id="top-orgs">Top Organizations</SectionHeading>
        <p className="text-theme-muted mb-6">
          Organizations with the most GitHub stars across repos where AI bots review code.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <TopOrgsChart data={topOrgs} />
        </div>
        <p className="mt-3 text-sm text-theme-muted">
          Click any row to see the organization&apos;s profile.{" "}
          <Link href="/orgs" className="underline hover:text-theme-text">
            View all organizations →
          </Link>
        </p>
      </section>


    </div>
  );
}
