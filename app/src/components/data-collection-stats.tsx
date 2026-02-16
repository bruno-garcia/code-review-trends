"use client";

import type { DataCollectionStats } from "@/lib/clickhouse";

function ProgressBar({
  value,
  max,
  label,
  color = "bg-blue-500",
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-theme-text-secondary">{label}</span>
        <span className="text-theme-text/80 tabular-nums">
          {value.toLocaleString()} / {max.toLocaleString()}{" "}
          <span className="text-theme-muted">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-theme-surface-alt overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex justify-between py-1.5 border-b border-theme-border/50 last:border-0">
      <span className="text-theme-text-secondary text-sm">{label}</span>
      <span className="text-theme-text/80 text-sm tabular-nums font-medium">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr || dateStr === "1970-01-01" || dateStr === "1970-01-01 00:00:00")
    return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr || dateStr === "1970-01-01 00:00:00") return "Never";
  const d = new Date(dateStr + "Z"); // assume UTC
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function DataCollectionPanel({
  stats,
}: {
  stats: DataCollectionStats;
}) {
  const hasData =
    stats.bigquery_total_weeks > 0 || stats.repos_total > 0;

  if (!hasData) {
    return (
      <div className="text-theme-muted text-sm italic">
        No data collection stats available yet.
      </div>
    );
  }

  const reposEnrichable = stats.repos_total;
  const reposProcessed = stats.repos_ok + stats.repos_not_found;
  const repoFailRate =
    reposProcessed > 0
      ? ((stats.repos_not_found / reposProcessed) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-8" data-testid="data-collection-stats">
      {/* BigQuery Backfill */}
      <div>
        <h3 className="text-lg font-medium text-theme-text mb-3 flex items-center gap-2">
          <span className="text-xl">📊</span> BigQuery Backfill
        </h3>
        <p className="text-theme-text-secondary text-sm mb-4">
          Weekly aggregated review counts from{" "}
          <a
            href="https://www.gharchive.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            GH Archive
          </a>
          . Powers the trend charts on the home page.
        </p>
        <div className="bg-theme-surface rounded-lg border border-theme-border p-4 space-y-1">
          <StatRow label="Date range" value={
            stats.bigquery_first_week && stats.bigquery_last_week
              ? `${formatDate(stats.bigquery_first_week)} — ${formatDate(stats.bigquery_last_week)}`
              : "—"
          } />
          <StatRow label="Weeks covered" value={stats.bigquery_total_weeks} />
          <StatRow label="Last import" value={formatDateTime(stats.bigquery_last_run)} />
          <StatRow label="Chunks processed" value={stats.bigquery_completed_chunks} />
        </div>
      </div>

      {/* GitHub Enrichment */}
      <div>
        <h3 className="text-lg font-medium text-theme-text mb-3 flex items-center gap-2">
          <span className="text-xl">🐙</span> GitHub API Enrichment
        </h3>
        <p className="text-theme-text-secondary text-sm mb-4">
          Metadata fetched from the GitHub REST API: repo details, PR metadata,
          and bot comment content with reactions.
        </p>

        <div className="space-y-5">
          {/* Repos */}
          <div className="bg-theme-surface rounded-lg border border-theme-border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-theme-text uppercase tracking-wide">
              Repositories
            </h4>
            <ProgressBar
              value={reposProcessed}
              max={reposEnrichable}
              label="Fetched from GitHub"
              color="bg-emerald-500"
            />
            <div className="grid grid-cols-3 gap-3 text-center mt-2">
              <div>
                <div className="text-lg font-semibold text-emerald-400 tabular-nums">
                  {stats.repos_ok.toLocaleString()}
                </div>
                <div className="text-xs text-theme-muted">Success</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-400 tabular-nums">
                  {stats.repos_not_found.toLocaleString()}
                </div>
                <div className="text-xs text-theme-muted">
                  Not Found / Deleted
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-yellow-400 tabular-nums">
                  {stats.repos_pending.toLocaleString()}
                </div>
                <div className="text-xs text-theme-muted">Pending</div>
              </div>
            </div>
            <p className="text-xs text-theme-muted mt-1">
              {repoFailRate}% of processed repos were deleted or inaccessible.
            </p>
          </div>

          {/* PRs */}
          <div className="bg-theme-surface rounded-lg border border-theme-border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-theme-text uppercase tracking-wide">
              Pull Requests
            </h4>
            <ProgressBar
              value={stats.prs_enriched}
              max={stats.prs_discovered}
              label="PR metadata fetched"
              color="bg-blue-500"
            />
          </div>

          {/* Comments */}
          <div className="bg-theme-surface rounded-lg border border-theme-border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-theme-text uppercase tracking-wide">
              Bot Comments
            </h4>
            <ProgressBar
              value={stats.comments_enriched}
              max={stats.comments_discovered}
              label="Comment threads fetched"
              color="bg-orange-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
