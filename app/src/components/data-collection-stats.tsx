"use client";

import { useState } from "react";
import type { DataCollectionStats } from "@/lib/clickhouse";
import { DATA_EPOCH } from "@/lib/constants";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Generate all Monday dates from epoch to today. */
function allExpectedWeeks(): string[] {
  const weeks: string[] = [];
  const d = new Date(DATA_EPOCH + "T00:00:00Z");
  // Align to first Monday on or after epoch (UTC)
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const today = new Date();
  while (d <= today) {
    weeks.push(d.toISOString().split("T")[0]);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return weeks;
}

/** Parse a ClickHouse datetime string (YYYY-MM-DD HH:MM:SS) as UTC. */
function parseUTC(dateStr: string): Date {
  // ClickHouse returns "YYYY-MM-DD HH:MM:SS". Safari requires ISO 8601
  // with a "T" separator, so replace the space before appending "Z".
  return new Date(dateStr.replace(" ", "T") + "Z");
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = parseUTC(dateStr);
  if (isNaN(d.getTime())) return "Never";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "Just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = parseUTC(dateStr);
  if (isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// ── Tooltip ──────────────────────────────────────────────────────────────

function Tooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative group/tip inline-flex items-center">
      {children}
      <span className="ml-1 text-theme-muted/50 cursor-help" aria-label={text}>
        ⓘ
      </span>
      <span
        role="tooltip"
        className="invisible group-hover/tip:visible absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-theme-text bg-theme-surface-alt border border-theme-border rounded-lg shadow-lg max-w-xs whitespace-normal"
      >
        {text}
      </span>
    </span>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────

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

// ── Week coverage heatmap ────────────────────────────────────────────────

function WeekCoverageBar({
  expected,
  present,
}: {
  expected: string[];
  present: Set<string>;
}) {
  if (expected.length === 0) return null;

  // Group weeks by year for labels
  const years = new Map<string, number>();
  expected.forEach((w, i) => {
    const y = w.slice(0, 4);
    if (!years.has(y)) years.set(y, i);
  });

  const coveredCount = expected.filter((w) => present.has(w)).length;
  const missingCount = expected.length - coveredCount;

  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <Tooltip text={`Each segment is one week (Monday). Green = data imported, red = missing. Covers ${DATA_EPOCH} to today.`}>
          <span className="text-theme-text-secondary">Week coverage</span>
        </Tooltip>
        <span className="text-theme-text/80 tabular-nums">
          {coveredCount} / {expected.length} weeks
          {missingCount > 0 && (
            <span className="text-red-400 ml-2">({missingCount} missing)</span>
          )}
        </span>
      </div>
      <div className="relative">
        <div className="flex gap-px h-4 rounded overflow-hidden">
          {expected.map((w) => (
            <div
              key={w}
              className={`flex-1 min-w-[1px] ${present.has(w) ? "bg-emerald-500" : "bg-red-500/70"}`}
              title={`${formatDate(w)}: ${present.has(w) ? "✓ imported" : "✗ missing"}`}
            />
          ))}
        </div>
        {/* Year labels */}
        <div className="relative h-4 mt-0.5">
          {Array.from(years.entries()).map(([year, idx]) => (
            <span
              key={year}
              className="absolute text-[10px] text-theme-muted/60"
              style={{ left: `${(idx / expected.length) * 100}%` }}
            >
              {year}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Stat row ─────────────────────────────────────────────────────────────

function StatRow({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string | React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div className="flex justify-between py-1.5 border-b border-theme-border/50 last:border-0">
      <span className="text-theme-text-secondary text-sm">
        {tooltip ? (
          <Tooltip text={tooltip}>{label}</Tooltip>
        ) : (
          label
        )}
      </span>
      <span className="text-theme-text/80 text-sm tabular-nums font-medium">
        {value}
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export function DataCollectionPanel({
  stats,
}: {
  stats: DataCollectionStats;
}) {
  const expected = allExpectedWeeks();
  const presentSet = new Set(stats.weeks_with_data);
  const hasData = stats.weeks_with_data.length > 0 || stats.repos_total > 0;
  const [showMissing, setShowMissing] = useState(false);

  if (!hasData) {
    return (
      <p className="text-theme-muted text-sm italic" data-testid="no-data-message">
        No data imported yet. Run the pipeline to populate.
      </p>
    );
  }

  const missingWeeks = expected.filter((w) => !presentSet.has(w));
  const reposProcessed = stats.repos_ok + stats.repos_not_found;
  const repoFailRate =
    reposProcessed > 0
      ? ((stats.repos_not_found / reposProcessed) * 100).toFixed(1)
      : "0";

  const dataRange = stats.weeks_with_data.length > 0
    ? `${formatDate(stats.weeks_with_data[0])} — ${formatDate(stats.weeks_with_data[stats.weeks_with_data.length - 1])}`
    : "—";

  return (
    <div className="space-y-8" data-testid="data-collection-stats">
      {/* BigQuery Backfill */}
      <div>
        <h3 className="text-lg font-medium text-theme-text mb-3 flex items-center gap-2">
          <span className="text-xl">📊</span> BigQuery Import
        </h3>
        <p className="text-theme-text-secondary text-sm mb-4">
          Weekly review counts from{" "}
          <a
            href="https://www.gharchive.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300"
          >
            GH Archive
          </a>
          . Tracking starts {formatDate(DATA_EPOCH)}.
        </p>

        {/* Week coverage bar */}
        <div className="bg-theme-surface rounded-lg border border-theme-border p-4 space-y-4">
          <WeekCoverageBar expected={expected} present={presentSet} />

          <div className="space-y-0">
            <StatRow
              label="Data range"
              value={dataRange}
              tooltip={`Earliest and latest weeks with imported data. Epoch is ${formatDate(DATA_EPOCH)}.`}
            />
            <StatRow
              label="Last import"
              value={
                <span>
                  {formatDateTime(stats.last_import)}
                  {stats.last_import && (
                    <span className="text-theme-muted ml-2">
                      ({relativeTime(stats.last_import)})
                    </span>
                  )}
                </span>
              }
              tooltip="When the BigQuery backfill pipeline last completed a chunk."
            />
          </div>

          {/* Missing weeks toggle */}
          {missingWeeks.length > 0 && (
            <div>
              <button
                onClick={() => setShowMissing(!showMissing)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                {showMissing ? "▲ Hide" : "▼ Show"} {missingWeeks.length} missing week{missingWeeks.length !== 1 ? "s" : ""}
              </button>
              {showMissing && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {missingWeeks.map((w) => (
                    <span
                      key={w}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 tabular-nums"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* GitHub Enrichment */}
      <div>
        <h3 className="text-lg font-medium text-theme-text mb-3 flex items-center gap-2">
          <span className="text-xl">🐙</span> GitHub API Enrichment
        </h3>
        <p className="text-theme-text-secondary text-sm mb-4">
          Metadata fetched from the GitHub REST API for repos, PRs, and
          comments discovered in GH Archive data.
        </p>

        <div className="space-y-5">
          {/* Repos */}
          <div className="bg-theme-surface rounded-lg border border-theme-border p-4 space-y-3">
            <h4 className="text-sm font-semibold text-theme-text uppercase tracking-wide">
              <Tooltip text="Repos found in GH Archive where tracked bots reviewed PRs. The total comes from the discover pipeline step, not from all of GitHub.">
                Repositories
              </Tooltip>
            </h4>
            <ProgressBar
              value={reposProcessed}
              max={stats.repos_total}
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
                  Deleted / Private
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
              <Tooltip text="Individual PRs where tracked bots left reviews. Discovered via GH Archive events, enriched via GitHub API.">
                Pull Requests
              </Tooltip>
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
              <Tooltip text="Bot review comment threads (one per repo/PR/bot combo). Fetched from GitHub API to get reaction data and comment bodies.">
                Bot Comments
              </Tooltip>
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
