"use client";

import { useEffect, useMemo } from "react";
import type { ProductComparison, ProductPrCharacteristics, WeeklyActivityByProduct, WeeklyReactionsByProduct, MonthlyReactionsByProduct } from "@/lib/clickhouse";
import { formatHours } from "@/lib/format";
import { useUrlState } from "@/lib/use-url-state";
import { BotRadarChart, CompareTrendsChart, COLORS } from "@/components/charts";
import { useTheme } from "@/components/theme-provider";
import { getThemedBrandColor } from "@/lib/theme-overrides";
import { useProductFilter, useFilterUrl } from "@/lib/product-filter";
import { SectionHeading } from "@/components/section-heading";
import Link from "next/link";

/** Minimum 👍 + 👎 reactions in a period to compute a meaningful rate. */
const MIN_REACTIONS = 30;

type CompareRow = ProductComparison & {
  sampled_prs: number;
  avg_additions: number | null;
  avg_deletions: number | null;
  avg_changed_files: number | null;
  merge_rate_pr: number | null;
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
    label: "Reviews",
    description: "Total PR reviews submitted",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "total_comments",
    label: "Rev. Cmts",
    description: "Total review comments posted",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "total_pr_comments",
    label: "PR Cmts",
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
    label: "Orgs",
    description: "Max organizations active in a single week",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "avg_comments_per_review",
    label: "Cmts/Rev",
    description: "Average comments per review",
    format: (v) => Number(v).toFixed(1),
  },
  {
    key: "comments_per_repo",
    label: "Cmts/Repo",
    description: "Total comments divided by active repos",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "reviews_per_org",
    label: "Rev/Org",
    description: "Total reviews divided by active organizations",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "thumbs_up_rate",
    label: "👍 Rate",
    description: "👍 / (👍 + 👎) on bot comments — requires ≥30 reactions, otherwise N/A",
    format: (v) => Number(v) >= 0 ? `${Number(v).toFixed(1)}%` : "—",
  },
  {
    key: "reaction_rate",
    label: "React %",
    description: "% of bot comments that received any 👍 or 👎 reaction",
    format: (v) => Number(v) >= 0 ? `${Number(v).toFixed(1)}%` : "—",
  },
  {
    key: "thumbs_up",
    label: "👍",
    description: "Total thumbs-up reactions received",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "thumbs_down",
    label: "👎",
    description: "Total thumbs-down reactions received",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "heart",
    label: "❤️",
    description: "Total heart reactions received",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "latest_week_reviews",
    label: "4w Rev",
    description: "Reviews in the last 4 weeks",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "latest_week_comments",
    label: "4w Cmts",
    description: "Review comments in the last 4 weeks",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "latest_week_pr_comments",
    label: "4w PR",
    description: "PR comments in the last 4 weeks",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "weeks_active",
    label: "Weeks",
    description: "Number of weeks with data",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "sampled_prs",
    label: "Sample",
    description: "Enriched PRs with metadata from GitHub API",
    format: (v) => Number(v).toLocaleString(),
  },
  {
    key: "avg_additions",
    label: "+Lines",
    description: "Average lines added per PR",
    format: (v) => v == null ? "—" : `+${Number(v).toLocaleString()}`,
  },
  {
    key: "avg_deletions",
    label: "−Lines",
    description: "Average lines deleted per PR",
    format: (v) => v == null ? "—" : `−${Number(v).toLocaleString()}`,
  },
  {
    key: "avg_changed_files",
    label: "Files",
    description: "Average files changed per PR",
    format: (v) => v == null ? "—" : Number(v).toLocaleString(),
  },
  {
    key: "merge_rate_pr",
    label: "Merge",
    description: "Percentage of reviewed PRs that were merged",
    format: (v) => v == null ? "—" : `${Number(v).toFixed(1)}%`,
  },
  {
    key: "avg_hours_to_merge",
    label: "TTM",
    description: "Average time from PR creation to merge",
    format: (v) => formatHours(v),
  },
];

/** Columns that use -1 as a sentinel for N/A — push to end when sorting. */
const SENTINEL_KEYS: Set<SortKey> = new Set(["thumbs_up_rate", "reaction_rate"]);

const RADAR_DIMENSIONS: { key: SortKey; label: string }[] = [
  { key: "total_reviews", label: "Reviews" },
  { key: "total_comments", label: "Review Comments" },
  { key: "total_pr_comments", label: "PR Comments" },
  { key: "total_repos", label: "Repos" },
  { key: "total_orgs", label: "Orgs" },
  { key: "latest_week_reviews", label: "Recent Activity" },
];

const BAR_CHART_METRICS: { key: SortKey; label: string }[] = [
  { key: "total_reviews", label: "Total Reviews" },
  { key: "total_pr_comments", label: "PR Comments" },
  { key: "total_repos", label: "Active Repos" },
  { key: "total_orgs", label: "Organizations" },
  { key: "avg_comments_per_review", label: "Avg Comments/Review" },
  { key: "thumbs_up_rate", label: "👍 Rate %" },
  { key: "reaction_rate", label: "Reaction Rate %" },
  { key: "comments_per_repo", label: "Comments per Repo" },
];

function normalize(products: CompareRow[], key: SortKey): number[] {
  const values = products.map((p) => Number(p[key] ?? 0));
  const max = Math.max(...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => Math.round((v / max) * 100));
}

export function CompareChartsAbove({
  products: allProducts,
  prCharacteristics,
  weeklyActivity,
  weeklyReactions,
  monthlyReactions,
  overrideProductIds,
}: {
  products: ProductComparison[];
  prCharacteristics: ProductPrCharacteristics[];
  weeklyActivity: WeeklyActivityByProduct[];
  weeklyReactions: WeeklyReactionsByProduct[];
  monthlyReactions: MonthlyReactionsByProduct[];
  /** When set, bypass the global product filter and show exactly these products. */
  overrideProductIds?: string[];
}) {
  const { selectedProductIds: globalIds } = useProductFilter();
  const selectedProductIds = overrideProductIds ?? globalIds;
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
            avg_additions: pc?.avg_additions ?? null,
            avg_deletions: pc?.avg_deletions ?? null,
            avg_changed_files: pc?.avg_changed_files ?? null,
            merge_rate_pr: pc?.merge_rate ?? null,
            avg_hours_to_merge: pc?.avg_hours_to_merge ?? null,
          };
        }),
    [allProducts, selectedProductIds, prCharsMap],
  );

  // Table sort state (synced to URL for sharing)
  const [rawSortKey, setRawSortKey] = useUrlState("sort", "growth_pct");
  const [rawSortDir, setRawSortDir] = useUrlState("dir", "desc");

  // Expanded mode — full-width table, other sections hidden
  const [expanded, setExpanded] = useUrlState("expanded", "");
  const isExpanded = expanded === "1";

  // Escape key closes expanded mode
  useEffect(() => {
    if (!isExpanded) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded("");
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, setExpanded]);

  const validSortKeys = useMemo(
    () => new Set(METRICS.map((m) => m.key)),
    [],
  );
  const sortKey: SortKey = validSortKeys.has(rawSortKey as SortKey)
    ? (rawSortKey as SortKey)
    : "growth_pct";
  const sortDir: "asc" | "desc" = rawSortDir === "asc" ? "asc" : "desc";

  // Columns that use -1 as a sentinel for N/A — push to end.
  // (static Set defined at module level to avoid re-creation on every render)

  const sorted = [...products].sort((a, b) => {
    const aRaw = a[sortKey];
    const bRaw = b[sortKey];
    if (aRaw == null && bRaw == null) return 0;
    if (aRaw == null) return 1;
    if (bRaw == null) return -1;
    const av = Number(aRaw);
    const bv = Number(bRaw);
    if (SENTINEL_KEYS.has(sortKey)) {
      const aNA = av < 0;
      const bNA = bv < 0;
      if (aNA && bNA) return 0;
      if (aNA) return 1;
      if (bNA) return -1;
    }
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

  // --- Trends chart data ---

  const idToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allProducts) m.set(p.id, p.name);
    return m;
  }, [allProducts]);

  const trendData = useMemo(() => {
    const selectedSet = new Set(selectedProductIds);

    type ReactionRow = { thumbs_up: number; thumbs_down: number; comment_count: number; reacted_comment_count: number; pr_count: number };
    const reactionIndex = new Map<string, ReactionRow>();
    for (const r of weeklyReactions) {
      if (!selectedSet.has(r.product_id)) continue;
      const key = `${r.week}|${r.product_id}`;
      const existing = reactionIndex.get(key);
      if (existing) {
        existing.thumbs_up += Number(r.thumbs_up);
        existing.thumbs_down += Number(r.thumbs_down);
        existing.comment_count += Number(r.comment_count);
        existing.reacted_comment_count += Number(r.reacted_comment_count);
        existing.pr_count += Number(r.pr_count);
      } else {
        reactionIndex.set(key, {
          thumbs_up: Number(r.thumbs_up),
          thumbs_down: Number(r.thumbs_down),
          comment_count: Number(r.comment_count),
          reacted_comment_count: Number(r.reacted_comment_count),
          pr_count: Number(r.pr_count),
        });
      }
    }

    const allWeeks = new Set<string>();
    const activityByWeek = new Map<string, Map<string, WeeklyActivityByProduct>>();

    for (const row of weeklyActivity) {
      if (!selectedSet.has(row.product_id)) continue;
      allWeeks.add(row.week);
      let weekMap = activityByWeek.get(row.week);
      if (!weekMap) {
        weekMap = new Map();
        activityByWeek.set(row.week, weekMap);
      }
      weekMap.set(row.product_id, row);
    }
    for (const r of weeklyReactions) {
      if (!selectedSet.has(r.product_id)) continue;
      allWeeks.add(r.week);
    }

    const sortedWeeks = [...allWeeks].sort();

    // Weekly metrics (all except thumbs_up_rate, which uses monthly aggregation)
    const weeklyMetrics: Record<string, Record<string, Record<string, string | number>>> = {
      reviews: {},
      review_comments: {},
      pr_comments: {},
      repos: {},
      orgs: {},
      comments_per_pr: {},
    };

    for (const week of sortedWeeks) {
      for (const key of Object.keys(weeklyMetrics)) {
        weeklyMetrics[key][week] = { week };
      }
    }

    for (const week of sortedWeeks) {
      const weekMap = activityByWeek.get(week);
      for (const pid of selectedProductIds) {
        const name = idToName.get(pid);
        if (!name) continue;
        const act = weekMap?.get(pid);
        if (act) {
          weeklyMetrics.reviews[week][name] = Number(act.review_count);
          weeklyMetrics.review_comments[week][name] = Number(act.review_comment_count);
          weeklyMetrics.pr_comments[week][name] = Number(act.pr_comment_count);
          weeklyMetrics.repos[week][name] = Number(act.repo_count);
          weeklyMetrics.orgs[week][name] = Number(act.org_count);
        }

        const rKey = `${week}|${pid}`;
        const rx = reactionIndex.get(rKey);
        if (rx) {
          weeklyMetrics.comments_per_pr[week][name] = rx.pr_count > 0
            ? Math.round(rx.comment_count * 100 / rx.pr_count) / 100
            : 0;
        }
      }
    }

    return weeklyMetrics;
  }, [weeklyActivity, weeklyReactions, selectedProductIds, idToName]);

  // thumbs_up_rate uses server-side monthly aggregation (ClickHouse groups
  // weekly reactions into calendar months for larger sample sizes / less noise).
  const thumbsUpRateData = useMemo(() => {
    const selectedSet = new Set(selectedProductIds);

    // Index monthly reactions by month|product_id
    const monthIndex = new Map<string, { thumbs_up: number; thumbs_down: number }>();
    for (const r of monthlyReactions) {
      if (!selectedSet.has(r.product_id)) continue;
      const key = `${r.month}|${r.product_id}`;
      const existing = monthIndex.get(key);
      if (existing) {
        existing.thumbs_up += Number(r.thumbs_up);
        existing.thumbs_down += Number(r.thumbs_down);
      } else {
        monthIndex.set(key, { thumbs_up: Number(r.thumbs_up), thumbs_down: Number(r.thumbs_down) });
      }
    }

    const allMonths = new Set<string>();
    for (const key of monthIndex.keys()) {
      allMonths.add(key.split("|")[0]);
    }
    const sortedMonths = [...allMonths].sort();

    const thumbsUpRate: Record<string, Record<string, string | number>> = {};
    for (const month of sortedMonths) {
      thumbsUpRate[month] = { week: month }; // "week" key kept for chart compatibility
    }
    for (const month of sortedMonths) {
      for (const pid of selectedProductIds) {
        const name = idToName.get(pid);
        if (!name) continue;
        const mKey = `${month}|${pid}`;
        const rx = monthIndex.get(mKey);
        if (rx) {
          const total = rx.thumbs_up + rx.thumbs_down;
          if (total >= MIN_REACTIONS) {
            thumbsUpRate[month][name] = Math.round(rx.thumbs_up * 1000 / total) / 10;
          }
        }
      }
    }

    return thumbsUpRate;
  }, [monthlyReactions, selectedProductIds, idToName]);

  // Combine weekly metrics + monthly thumbs_up_rate into a single object for the chart
  const allTrendData = useMemo(() => ({
    ...trendData,
    thumbs_up_rate: thumbsUpRateData,
  }), [trendData, thumbsUpRateData]);

  const productNames = products.map((p) => p.name);

  const nameColorMap: Record<string, string> = {};
  for (const p of products) {
    const i = products.indexOf(p);
    nameColorMap[p.name] = getThemedBrandColor(p.id, p.brand_color || COLORS[i % COLORS.length], resolved);
  }

  // --- Radar chart data ---

  const radarData = RADAR_DIMENSIONS.map((dim) => {
    const normalized = normalize(products, dim.key);
    const point: Record<string, string | number> = { metric: dim.label };
    products.forEach((p, i) => {
      point[p.name] = normalized[i];
    });
    return point;
  });

  // --- Bar chart breakdowns ---

  // --- Table section ---

  const tableSection = (
      <section
        data-testid="compare-table-section"
        className={isExpanded ? "mx-[calc(-50vw+50%)] w-screen px-4 sm:px-6 lg:px-8" : undefined}
      >
        <div className="flex items-center gap-3 mb-4">
          <h2
            id="detailed"
            className="text-2xl font-semibold scroll-mt-40 group"
          >
            <a href="#detailed" className="hover:text-violet-400 transition-colors">
              Detailed Comparison
              <span className="ml-2 opacity-0 group-hover:opacity-50 transition-opacity text-theme-muted text-lg">#</span>
            </a>
          </h2>
          <div className="flex-1" />
          {isExpanded ? (
            <button
              type="button"
              data-testid="collapse-table-x"
              onClick={() => setExpanded("")}
              title="Close expanded view (Escape)"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-theme-surface border border-theme-border hover:bg-theme-border transition-colors text-theme-muted hover:text-theme-text text-base leading-none"
            >
              ✕
            </button>
          ) : (
            <button
              type="button"
              data-testid="expand-table-btn"
              onClick={() => setExpanded("1")}
              title="Expand table to full width"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-theme-surface border border-theme-border hover:bg-theme-border transition-colors text-theme-muted hover:text-theme-text text-base leading-none"
            >
              ⤢
            </button>
          )}
        </div>
        <div className={`overflow-x-auto relative ${isExpanded ? "" : "[mask-image:linear-gradient(to_right,black_calc(100%_-_10rem),transparent)] hover:[mask-image:none] focus-within:[mask-image:none]"}`}>
          <table
            className="w-full text-left text-sm"
            data-testid="compare-table"
          >
            <thead className="text-theme-muted border-b border-theme-border">
              <tr>
                <th className="pb-3 pr-4 sticky left-0 bg-theme-bg z-10 min-w-[10rem] whitespace-nowrap" title="AI code review product name">
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
                      href={buildUrl(`/products/${product.id}`)}
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
                        title={m.description}
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
        <p className="mt-3 text-sm text-theme-muted/70">
          Click any column header to sort. ★ marks the highest number in each column. <strong>Higher doesn&apos;t necessarily mean better.</strong> <Link href="/about" className="text-violet-400/70 hover:text-violet-400 underline underline-offset-2">Methodology</Link>.{" "}
          {isExpanded && (
            <span className="text-theme-muted/50">Press Escape or click ✕ to collapse.</span>
          )}
        </p>
      </section>
  );

  return (
    <div className="space-y-10">
      {/* Trends over time — hero section, hidden when table is expanded */}
      {!isExpanded && (
      <section data-testid="trends-section" id="trends">
        <SectionHeading id="trends">Trends Over Time</SectionHeading>
        <p className="text-theme-muted mb-4 text-sm">
          Compare how products evolve week by week. Pick a metric to explore.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <CompareTrendsChart dataByMetric={allTrendData} products={productNames} colors={nameColorMap} />
        </div>
      </section>
      )}

      {/* Big comparison table — always visible */}
      {tableSection}

      {/* Radar chart — hidden when table is expanded */}
      {!isExpanded && (
      <section data-testid="radar-section" id="radar">
        <SectionHeading id="radar">Radar Overview</SectionHeading>
        <p className="text-theme-muted mb-4 text-sm">
          Each dimension normalized to 0–100 relative to the top product.
        </p>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <BotRadarChart data={radarData} bots={productNames} colors={nameColorMap} />
        </div>
      </section>
      )}

      {/* Bar chart breakdowns — hidden when table is expanded */}
      {!isExpanded && (
      <section data-testid="bar-charts-section" id="breakdowns">
        <SectionHeading id="breakdowns">Visual Breakdowns</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {BAR_CHART_METRICS.map(({ key, label }) => {
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
                    const isNA = item.value < 0;
                    const max = chartData[0].value;
                    const pct = !isNA && max > 0 ? (item.value / max) * 100 : 0;
                    return (
                      <div key={item.name} className="flex items-center gap-3">
                        <span className="text-xs text-theme-muted w-28 text-right truncate">
                          {item.name}
                        </span>
                        <div className="flex-1 bg-theme-border rounded-full h-5 relative overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: isNA ? "0%" : `${Math.max(pct, 2)}%`,
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
      )}
    </div>
  );
}
