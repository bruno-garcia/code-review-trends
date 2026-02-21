"use client";

import { useMemo } from "react";
import type { ProductComparison, BotCommentsPerPR, BotReactions, ProductPrCharacteristics } from "@/lib/clickhouse";
import { formatHours } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { BotRadarChart, CommentsPerPRChart, BotReactionLeaderboardChart, COLORS } from "@/components/charts";
import { useTheme } from "@/components/theme-provider";
import { getThemedBrandColor } from "@/lib/theme-overrides";
import { useProductFilter, useFilterUrl } from "@/lib/product-filter";
import { SectionHeading } from "@/components/section-heading";
import Link from "next/link";

type CompareRow = ProductComparison & {
  sampled_prs: number;
  avg_additions: number;
  avg_deletions: number;
  avg_changed_files: number;
  merge_rate_pr: number;
  avg_hours_to_merge: number | null;
};

type SortKey = keyof CompareRow;

const METRICS: {
  key: SortKey;
  label: string;
  description: string;
  format: (v: number | null) => string;
}[] = [
  {
    key: "growth_pct",
    label: "Growth",
    description: "Review growth: last 12 weeks vs. previous 12 weeks",
    format: (v) => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`,
  },
  {
    key: "total_reviews",
    label: "Total Reviews",
    description: "Total PR reviews submitted",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "total_comments",
    label: "Review Comments",
    description: "Total review comments posted",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "total_pr_comments",
    label: "PR Comments",
    description: "Total PR comments (IssueCommentEvent on pull requests)",
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
    label: "Recent Review Comments (4w)",
    description: "Review comments in the last 4 weeks",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "latest_week_pr_comments",
    label: "Recent PR Comments (4w)",
    description: "PR comments in the last 4 weeks",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "weeks_active",
    label: "Weeks Active",
    description: "Number of weeks with data",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "sampled_prs",
    label: "Sampled PRs",
    description: "Enriched PRs with metadata from GitHub API",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "avg_additions",
    label: "Avg Additions",
    description: "Average lines added per PR",
    format: (v) => `+${Number(v).toLocaleString()}`,
  },
  {
    key: "avg_deletions",
    label: "Avg Deletions",
    description: "Average lines deleted per PR",
    format: (v) => `−${Number(v).toLocaleString()}`,
  },
  {
    key: "avg_changed_files",
    label: "Avg Files",
    description: "Average files changed per PR",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "merge_rate_pr",
    label: "Merge Rate",
    description: "Percentage of reviewed PRs that were merged",
    format: (v) => `${Number(v).toFixed(1)}%`,
  },
  {
    key: "avg_hours_to_merge",
    label: "Time to Merge",
    description: "Average time from PR creation to merge",
    format: (v) => formatHours(v),
  },
];

function normalize(products: CompareRow[], key: SortKey): number[] {
  const values = products.map((p) => Number(p[key] ?? 0));
  const max = Math.max(...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => Math.round((v / max) * 100));
}

export function CompareCharts({
  products: allProducts,
  commentsPerPR: allCommentsPerPR,
  reactionLeaderboard: allReactionLeaderboard,
  prCharacteristics,
}: {
  products: ProductComparison[];
  commentsPerPR: BotCommentsPerPR[];
  reactionLeaderboard: BotReactions[];
  prCharacteristics: ProductPrCharacteristics[];
}) {
  const { selectedProductIds } = useProductFilter();
  const { resolved } = useTheme();
  const buildUrl = useFilterUrl();

  // Merge PR characteristics into product rows
  const prCharsMap = useMemo(() => {
    const m = new Map<string, ProductPrCharacteristics>();
    for (const pc of prCharacteristics) m.set(pc.product_id, pc);
    return m;
  }, [prCharacteristics]);

  const products: CompareRow[] = useMemo(
    () =>
      allProducts
        .filter((p) => selectedProductIds.includes(p.id))
        .map((p) => {
          const pc = prCharsMap.get(p.id);
          return {
            ...p,
            sampled_prs: pc?.sampled_prs ?? 0,
            avg_additions: pc?.avg_additions ?? 0,
            avg_deletions: pc?.avg_deletions ?? 0,
            avg_changed_files: pc?.avg_changed_files ?? 0,
            merge_rate_pr: pc?.merge_rate ?? 0,
            avg_hours_to_merge: pc?.avg_hours_to_merge ?? null,
          };
        }),
    [allProducts, selectedProductIds, prCharsMap],
  );
  const commentsPerPR = allCommentsPerPR.filter((c) =>
    selectedProductIds.includes(c.product_id),
  );
  const filteredReactions = allReactionLeaderboard.filter((r) =>
    selectedProductIds.includes(r.product_id),
  );

  // Table sort state (synced to URL for sharing)
  const [rawSortKey, setRawSortKey] = useUrlState("sort", "growth_pct");
  const [rawSortDir, setRawSortDir] = useUrlState("dir", "desc");

  const validSortKeys = useMemo(
    () => new Set(METRICS.map((m) => m.key)),
    [],
  );
  const sortKey: SortKey = validSortKeys.has(rawSortKey as SortKey)
    ? (rawSortKey as SortKey)
    : "growth_pct";
  const sortDir: "asc" | "desc" = rawSortDir === "asc" ? "asc" : "desc";

  const sorted = [...products].sort((a, b) => {
    const aRaw = a[sortKey];
    const bRaw = b[sortKey];
    // Push nulls to the end regardless of sort direction
    if (aRaw == null && bRaw == null) return 0;
    if (aRaw == null) return 1;
    if (bRaw == null) return -1;
    const av = Number(aRaw);
    const bv = Number(bRaw);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setRawSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setRawSortKey(key);
      setRawSortDir("desc");
    }
  }

  // Build color map — use themed brand_color from product, fall back to palette
  const productColorMap = new Map(
    products.map((p, i) => [p.id, getThemedBrandColor(p.id, p.brand_color || COLORS[i % COLORS.length], resolved)]),
  );

  // Radar chart data
  const radarDimensions = [
    { key: "total_reviews" as SortKey, label: "Reviews" },
    { key: "total_comments" as SortKey, label: "Review Comments" },
    { key: "total_pr_comments" as SortKey, label: "PR Comments" },
    { key: "total_repos" as SortKey, label: "Repos" },
    { key: "total_orgs" as SortKey, label: "Orgs" },
    { key: "approval_rate" as SortKey, label: "Approval" },
    { key: "latest_week_reviews" as SortKey, label: "Recent Activity" },
  ];

  const radarData = radarDimensions.map((dim) => {
    const normalized = normalize(products, dim.key);
    const point: Record<string, string | number> = { metric: dim.label };
    products.forEach((p, i) => {
      point[p.name] = normalized[i];
    });
    return point;
  });

  const productNames = products.map((p) => p.name);

  // Name→color map for charts that use names as series keys
  const nameColorMap: Record<string, string> = {};
  for (const p of products) {
    const i = products.indexOf(p);
    nameColorMap[p.name] = getThemedBrandColor(p.id, p.brand_color || COLORS[i % COLORS.length], resolved);
  }

  return (
    <div className="space-y-10">
      {/* Radar chart */}
      <section data-testid="radar-section" id="radar">
        <SectionHeading id="radar">Radar Overview</SectionHeading>
        <p className="text-theme-muted mb-4 text-sm">
          Each dimension normalized to 0–100 relative to the top product.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <BotRadarChart data={radarData} bots={productNames} colors={nameColorMap} />
        </div>
      </section>

      {/* Big comparison table */}
      <section data-testid="compare-table-section" id="detailed">
        <SectionHeading id="detailed">Detailed Comparison</SectionHeading>
        <div className="overflow-x-auto relative [mask-image:linear-gradient(to_right,black_calc(100%_-_10rem),transparent)] hover:[mask-image:none] focus-within:[mask-image:none]">
          <table
            className="w-full text-left text-sm"
            data-testid="compare-table"
          >
            <thead className="text-theme-muted border-b border-theme-border">
              <tr>
                <th className="pb-3 pr-4 sticky left-0 bg-theme-bg z-10 min-w-[10rem] whitespace-nowrap">
                  Product
                </th>
                {METRICS.map((m) => (
                  <th
                    key={m.key}
                    className="pb-3 px-3 text-right whitespace-nowrap"
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 cursor-pointer hover:text-theme-text transition-colors"
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
              {sorted.map((product, rowIdx) => (
                <tr
                  key={product.id}
                  className="border-b border-theme-border/50 hover:bg-theme-surface/50"
                >
                  <td className="py-3 pr-4 sticky left-0 bg-theme-bg z-10 min-w-[10rem] whitespace-nowrap">
                    <Link
                      href={buildUrl(`/bots/${product.id}`)}
                      className="font-medium hover:opacity-80 transition-colors"
                      style={{
                        color:
                          productColorMap.get(product.id) ??
                          COLORS[rowIdx % COLORS.length],
                      }}
                    >
                      {product.name}
                    </Link>
                  </td>
                  {METRICS.map((m) => {
                    const raw = product[m.key] as number | null;
                    const val = Number(raw ?? 0);
                    const allVals = sorted.map((p) => Number(p[m.key] ?? 0));
                    const max = Math.max(...allVals);
                    const isTop = raw != null && max > 0 && val === max;
                    const isGrowth = m.key === "growth_pct";
                    return (
                      <td
                        key={m.key}
                        className={`py-3 px-3 text-right tabular-nums whitespace-nowrap ${
                          isTop ? "text-theme-text font-semibold" : "text-theme-text/80"
                        } ${isGrowth && val > 0 ? "text-emerald-400" : ""} ${
                          isGrowth && val < 0 ? "text-red-400" : ""
                        }`}
                      >
                        {m.format(raw)}
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
        <p className="mt-3 text-xs text-theme-muted/70">
          Click any column header to sort. ★ marks the highest number in each column.
          <strong>Higher doesn&apos;t necessarily mean better.</strong>
        </p>
      </section>

      {/* Bar chart breakdowns */}
      <section data-testid="bar-charts-section" id="breakdowns">
        <SectionHeading id="breakdowns">Visual Breakdowns</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { key: "total_reviews" as SortKey, label: "Total Reviews" },
            { key: "total_pr_comments" as SortKey, label: "PR Comments" },
            { key: "total_repos" as SortKey, label: "Active Repos" },
            { key: "total_orgs" as SortKey, label: "Organizations" },
            { key: "avg_comments_per_review" as SortKey, label: "Avg Comments/Review" },
            { key: "approval_rate" as SortKey, label: "Approval Rate %" },
            { key: "comments_per_repo" as SortKey, label: "Comments per Repo" },
          ].map(({ key, label }) => {
            const chartData = [...products]
              .sort((a, b) => Number(b[key]) - Number(a[key]))
              .map((product) => ({
                name: product.name,
                value: Number(product[key]),
                fill:
                  productColorMap.get(product.id) ?? COLORS[0],
              }));

            return (
              <div
                key={key}
                className="bg-theme-surface rounded-xl p-5 border border-theme-border"
              >
                <h3 className="text-sm font-medium text-theme-text/80 mb-3">
                  {label}
                </h3>
                <div className="space-y-2">
                  {chartData.map((item) => {
                    const max = chartData[0].value;
                    const pct = max > 0 ? (item.value / max) * 100 : 0;
                    return (
                      <div key={item.name} className="flex items-center gap-3">
                        <span className="text-xs text-theme-muted w-28 text-right truncate">
                          {item.name}
                        </span>
                        <div className="flex-1 bg-theme-border rounded-full h-5 relative overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.max(pct, 2)}%`,
                              backgroundColor: item.fill,
                            }}
                          />
                        </div>
                        <span className="text-xs text-theme-text/80 tabular-nums w-16 text-right">
                          {METRICS.find((m) => m.key === key)?.format(item.value) ?? item.value}
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

      {/* Comments per PR */}
      <section data-testid="comments-per-pr-section" id="comments-per-pr">
        <SectionHeading id="comments-per-pr">Comments per PR</SectionHeading>
        <p className="text-theme-muted mb-6">
          Average number of review comments each bot leaves per pull request.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <CommentsPerPRChart data={commentsPerPR} />
        </div>
      </section>

      {/* Bot Sentiment */}
      <section data-testid="bot-sentiment-section" id="sentiment">
        <SectionHeading id="sentiment">Bot Sentiment</SectionHeading>
        <p className="text-theme-muted mb-6">
          How developers react to each bot&apos;s review comments — thumbs up,
          hearts, and thumbs down.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <BotReactionLeaderboardChart data={filteredReactions} />
        </div>
      </section>
    </div>
  );
}


