import { getDataCollectionStats } from "@/lib/clickhouse";
import { DataCollectionPanel } from "@/components/data-collection-stats";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
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
