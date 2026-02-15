"use client";

import { useState } from "react";
import type { BotComparison } from "@/lib/clickhouse";
import { BotRadarChart, COLORS } from "@/components/charts";
import Link from "next/link";

type SortKey = keyof BotComparison;

const METRICS: {
  key: SortKey;
  label: string;
  description: string;
  format: (v: number) => string;
}[] = [
  {
    key: "total_reviews",
    label: "Total Reviews",
    description: "Total PR reviews submitted",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "total_comments",
    label: "Total Comments",
    description: "Total review comments posted",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "total_repos",
    label: "Repos",
    description: "Max repos active in a single week",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "total_orgs",
    label: "Organizations",
    description: "Max organizations active in a single week",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "avg_comments_per_review",
    label: "Avg Comments/Review",
    description: "Average number of comments per review",
    format: (v) => Number(v).toFixed(1),
  },
  {
    key: "comments_per_repo",
    label: "Comments/Repo",
    description: "Total comments divided by active repos",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "reviews_per_org",
    label: "Reviews/Org",
    description: "Total reviews divided by active organizations",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "approval_rate",
    label: "Approval Rate",
    description: "👍 / (👍 + 👎) — how often reviews are approved",
    format: (v) => `${Number(v).toFixed(1)}%`,
  },
  {
    key: "thumbs_up",
    label: "👍 Reactions",
    description: "Total thumbs-up reactions received",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "thumbs_down",
    label: "👎 Reactions",
    description: "Total thumbs-down reactions received",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "heart",
    label: "❤️ Reactions",
    description: "Total heart reactions received",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "latest_week_reviews",
    label: "Recent Reviews (4w)",
    description: "Reviews in the last 4 weeks",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "latest_week_comments",
    label: "Recent Comments (4w)",
    description: "Comments in the last 4 weeks",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "growth_pct",
    label: "Growth",
    description: "Review growth: last 4 weeks vs. previous 4 weeks",
    format: (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`,
  },
  {
    key: "weeks_active",
    label: "Weeks Active",
    description: "Number of weeks with data",
    format: (v) => Number(v).toLocaleString(),
  },
];

function normalize(bots: BotComparison[], key: SortKey): number[] {
  const values = bots.map((b) => Number(b[key]));
  const max = Math.max(...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => Math.round((v / max) * 100));
}

export function CompareCharts({ bots }: { bots: BotComparison[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total_reviews");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...bots].sort((a, b) => {
    const av = Number(a[sortKey]);
    const bv = Number(b[sortKey]);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Radar chart data — normalize each dimension to 0-100
  const radarDimensions = [
    { key: "total_reviews" as SortKey, label: "Reviews" },
    { key: "total_comments" as SortKey, label: "Comments" },
    { key: "total_repos" as SortKey, label: "Repos" },
    { key: "total_orgs" as SortKey, label: "Orgs" },
    { key: "approval_rate" as SortKey, label: "Approval" },
    { key: "latest_week_reviews" as SortKey, label: "Recent Activity" },
  ];

  const radarData = radarDimensions.map((dim) => {
    const normalized = normalize(bots, dim.key);
    const point: Record<string, string | number> = { metric: dim.label };
    bots.forEach((bot, i) => {
      point[bot.name] = normalized[i];
    });
    return point;
  });

  const botNames = bots.map((b) => b.name);

  // Pre-compute color map for O(1) lookups in bar charts
  const botColorMap = new Map(
    bots.map((b, i) => [b.id, COLORS[i % COLORS.length]]),
  );

  return (
    <div className="space-y-10">
      {/* Radar chart */}
      <section data-testid="radar-section">
        <h2 className="text-2xl font-semibold mb-2">Radar Overview</h2>
        <p className="text-gray-400 mb-4 text-sm">
          Each dimension normalized to 0–100 relative to the top bot.
        </p>
        <div className="bg-[#12121a] rounded-xl p-6 border border-[#1e1e2e]">
          <BotRadarChart data={radarData} bots={botNames} />
        </div>
      </section>

      {/* Big comparison table */}
      <section data-testid="compare-table-section">
        <h2 className="text-2xl font-semibold mb-4">Detailed Comparison</h2>
        <div className="overflow-x-auto">
          <table
            className="w-full text-left text-sm"
            data-testid="compare-table"
          >
            <thead className="text-gray-400 border-b border-[#1e1e2e]">
              <tr>
                <th className="pb-3 pr-4 sticky left-0 bg-[#0a0a0f] z-10">
                  Bot
                </th>
                {METRICS.map((m) => (
                  <th
                    key={m.key}
                    className="pb-3 px-3 text-right whitespace-nowrap"
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort(m.key)}
                      title={m.description}
                    >
                      {m.label}
                      {sortKey === m.key && (
                        <span className="text-violet-400">
                          {sortDir === "desc" ? "↓" : "↑"}
                        </span>
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((bot, rowIdx) => (
                <tr
                  key={bot.id}
                  className="border-b border-[#1e1e2e]/50 hover:bg-[#12121a]/50"
                >
                  <td className="py-3 pr-4 sticky left-0 bg-[#0a0a0f] z-10">
                    <Link
                      href={`/bots/${bot.id}`}
                      className="font-medium hover:text-violet-300 transition-colors"
                      style={{ color: COLORS[rowIdx % COLORS.length] }}
                    >
                      {bot.name}
                    </Link>
                  </td>
                  {METRICS.map((m) => {
                    const val = Number(bot[m.key]);
                    const allVals = sorted.map((b) => Number(b[m.key]));
                    const max = Math.max(...allVals);
                    const isTop = max > 0 && val === max;
                    const isGrowth = m.key === "growth_pct";
                    return (
                      <td
                        key={m.key}
                        className={`py-3 px-3 text-right tabular-nums whitespace-nowrap ${
                          isTop ? "text-white font-semibold" : "text-gray-300"
                        } ${isGrowth && val > 0 ? "text-emerald-400" : ""} ${
                          isGrowth && val < 0 ? "text-red-400" : ""
                        }`}
                      >
                        {m.format(val)}
                        {isTop && !isGrowth && (
                          <span className="ml-1 text-xs text-violet-400">
                            ★
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Click any column header to sort. ★ marks the leader in each
          category.
        </p>
      </section>

      {/* Bar chart breakdowns */}
      <section data-testid="bar-charts-section">
        <h2 className="text-2xl font-semibold mb-4">Visual Breakdowns</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { key: "total_reviews" as SortKey, label: "Total Reviews" },
            { key: "total_repos" as SortKey, label: "Active Repos" },
            { key: "total_orgs" as SortKey, label: "Organizations" },
            { key: "avg_comments_per_review" as SortKey, label: "Avg Comments/Review" },
            { key: "approval_rate" as SortKey, label: "Approval Rate %" },
            { key: "comments_per_repo" as SortKey, label: "Comments per Repo" },
          ].map(({ key, label }) => {
            const chartData = [...bots]
              .sort((a, b) => Number(b[key]) - Number(a[key]))
              .map((bot) => ({
                name: bot.name,
                value: Number(bot[key]),
                fill: botColorMap.get(bot.id) ?? COLORS[0],
              }));

            return (
              <div
                key={key}
                className="bg-[#12121a] rounded-xl p-5 border border-[#1e1e2e]"
              >
                <h3 className="text-sm font-medium text-gray-300 mb-3">
                  {label}
                </h3>
                <div className="space-y-2">
                  {chartData.map((bot) => {
                    const max = chartData[0].value;
                    const pct = max > 0 ? (bot.value / max) * 100 : 0;
                    return (
                      <div key={bot.name} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-28 text-right truncate">
                          {bot.name}
                        </span>
                        <div className="flex-1 bg-[#1e1e2e] rounded-full h-5 relative overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(pct, 2)}%`,
                              backgroundColor: bot.fill,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-300 tabular-nums w-16 text-right">
                          {METRICS.find((m) => m.key === key)?.format(bot.value) ?? bot.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
