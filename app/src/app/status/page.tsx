import type { Metadata } from "next";
import { getDataCollectionStats, type DataCollectionStats } from "@/lib/clickhouse";
import { DataCollectionPanel } from "@/components/data-collection-stats";

// Status page should refresh more often than the default 300s layout revalidate.
// This is a live monitoring page — stale data (especially cached errors) is confusing.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Pipeline Status",
  description:
    "Live status of the Code Review Trends data pipelines. BigQuery import progress, GitHub API enrichment status, and data freshness.",
  alternates: { canonical: "/status" },
};

export default async function StatusPage() {
  // Let errors bubble up to the error boundary (error.tsx) instead of catching.
  // Catching and rendering inline would produce an HTTP 200 that ISR caches —
  // a transient ClickHouse timeout would then be served stale for minutes.
  // Throwing gives a 500 which ISR does NOT cache, so the next request retries.
  const stats = await getDataCollectionStats();

  return (
    <div data-testid="status-page" className="mx-auto max-w-4xl space-y-8 py-8">
      <div>
        <h1 className="text-4xl font-bold text-theme-text">Status</h1>
        <p className="mt-2 text-theme-text-secondary leading-relaxed">
          Live status of our data pipelines. The BigQuery import collects
          aggregate weekly review counts, while GitHub API enrichment fetches
          detailed metadata for individual repos, PRs, and comments.
        </p>
      </div>

      <section data-testid="data-collection-section">
        <DataCollectionPanel stats={stats} />
      </section>
    </div>
  );
}
