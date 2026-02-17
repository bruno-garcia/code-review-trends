import { getDataCollectionStats, type DataCollectionStats } from "@/lib/clickhouse";
import { DataCollectionPanel } from "@/components/data-collection-stats";

// Revalidate every hour — data only changes weekly via pipeline

export default async function StatusPage() {
  let stats: DataCollectionStats;
  let error: string | null = null;
  try {
    stats = await getDataCollectionStats();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    stats = {
      weeks_with_data: [],
      last_import: null,
      repos_total: 0,
      repos_ok: 0,
      repos_not_found: 0,
      repos_pending: 0,
      prs_discovered: 0,
      prs_enriched: 0,
      comments_discovered: 0,
      comments_enriched: 0,
      reactions_total: 0,
      reactions_scanned: 0,
      reactions_found: 0,
    };
  }

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

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400" data-testid="status-error">
          <strong>Error connecting to database:</strong> {error}
        </div>
      )}

      <section data-testid="data-collection-section">
        <DataCollectionPanel stats={stats} />
      </section>
    </div>
  );
}
