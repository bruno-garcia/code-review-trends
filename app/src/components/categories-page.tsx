"use client";

import { useMemo } from "react";
import { useProductFilter } from "@/lib/product-filter";
import type {
  ProductComparison,
  BotCommentsPerPR,
  BotByLanguage,
  CategoryCommentDetail,
  CategoryStarAdoption,
  CategoryPRSize,
  CategoryMergeRate,
  CategoryResponseTime,
  CategoryControversy,
  CategoryInlineVsSummary,
  CategoryReviewVerdicts,
} from "@/lib/clickhouse";

type BarItem = { name: string; value: number; color: string };

function CategorySection({
  id,
  title,
  description,
  data,
  formatValue,
  lowerIsBetter = false,
}: {
  id: string;
  title: string;
  description: string;
  data: BarItem[];
  formatValue: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const sorted = [...data].sort((a, b) =>
    lowerIsBetter ? a.value - b.value : b.value - a.value,
  );
  // For lowerIsBetter, invert bars so the best (lowest) gets the longest bar
  const refValue = sorted[0]?.value ?? 0;

  return (
    <div
      data-testid={`category-${id}`}
      className="bg-theme-surface rounded-xl p-5 border border-theme-border"
    >
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-theme-muted mb-4">{description}</p>
      {sorted.length === 0 ? (
        <p className="text-sm text-theme-muted/70">Insufficient data</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((item, i) => {
            let pct: number;
            if (lowerIsBetter) {
              // Lowest value = longest bar. Use ratio: best / current * 100
              pct = item.value > 0 ? (refValue / item.value) * 100 : 0;
            } else {
              pct = refValue > 0 ? (item.value / refValue) * 100 : 0;
            }
            return (
              <div key={item.name} className="flex items-center gap-3">
                <span
                  className="text-xs text-theme-muted w-28 text-right truncate"
                  title={item.name}
                >
                  {item.name}
                </span>
                <div className="flex-1 bg-theme-border rounded-full h-5 relative overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <span className="text-xs text-theme-text/80 tabular-nums w-20 text-right">
                  {i === 0 && (
                    <span className="text-violet-400 mr-1">★</span>
                  )}
                  {formatValue(item.value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatMinutes(v: number): string {
  if (v < 60) return `${Math.round(v)}m`;
  if (v < 1440) return `${(v / 60).toFixed(1)}h`;
  return `${(v / 1440).toFixed(1)}d`;
}

const GROUPS = [
  { id: "signal-quality", label: "Signal Quality" },
  { id: "review-style", label: "Review Style" },
  { id: "adoption-trust", label: "Adoption & Trust" },
  { id: "effectiveness", label: "Effectiveness" },
  { id: "specialization", label: "Specialization" },
] as const;

export function CategoriesPage({
  comparisons,
  commentsPerPR,
  languageData,
  commentDetail,
  starAdoption,
  prSize,
  mergeRate,
  responseTime,
  controversy,
  inlineVsSummary,
  reviewVerdicts,
}: {
  comparisons: ProductComparison[];
  commentsPerPR: BotCommentsPerPR[];
  languageData: BotByLanguage[];
  commentDetail: CategoryCommentDetail[];
  starAdoption: CategoryStarAdoption[];
  prSize: CategoryPRSize[];
  mergeRate: CategoryMergeRate[];
  responseTime: CategoryResponseTime[];
  controversy: CategoryControversy[];
  inlineVsSummary: CategoryInlineVsSummary[];
  reviewVerdicts: CategoryReviewVerdicts[];
}) {
  const { selectedProductIds } = useProductFilter();
  const selectedSet = useMemo(
    () => new Set(selectedProductIds),
    [selectedProductIds],
  );

  // Filter comparisons by product
  const fc = useMemo(
    () => comparisons.filter((c) => selectedSet.has(c.id)),
    [comparisons, selectedSet],
  );

  // Helper to filter datasets with product_id field
  const filterByProduct = <T extends { product_id: string }>(data: T[]) =>
    data.filter((d) => selectedSet.has(d.product_id));

  // Build product color map from comparisons
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of comparisons) {
      map[c.id] = c.brand_color || "#818cf8";
    }
    return map;
  }, [comparisons]);

  // --- Signal Quality ---
  const mostLovedData: BarItem[] = useMemo(
    () =>
      fc.map((c) => ({
        name: c.name,
        value: Number(c.approval_rate),
        color: c.brand_color || "#818cf8",
      })),
    [fc],
  );

  const controversyData: BarItem[] = useMemo(
    () =>
      filterByProduct(controversy).map((c) => ({
        name: c.product_name,
        value: Number(c.controversy_score),
        color: c.brand_color || "#818cf8",
      })),
    [controversy, selectedSet],
  );

  const lessChattyData: BarItem[] = useMemo(() => {
    const filtered = filterByProduct(commentsPerPR);
    // Aggregate bot-level data to product-level
    const byProduct = new Map<string, { totalComments: number; totalPrs: number }>();
    for (const c of filtered) {
      const existing = byProduct.get(c.product_id);
      if (existing) {
        existing.totalComments += Number(c.total_comments);
        existing.totalPrs += Number(c.total_prs);
      } else {
        byProduct.set(c.product_id, {
          totalComments: Number(c.total_comments),
          totalPrs: Number(c.total_prs),
        });
      }
    }
    return Array.from(byProduct.entries()).map(([productId, agg]) => {
      const product = comparisons.find((p) => p.id === productId);
      return {
        name: product?.name ?? productId,
        value: agg.totalPrs > 0 ? agg.totalComments / agg.totalPrs : 0,
        color: colorMap[productId] || "#818cf8",
      };
    });
  }, [commentsPerPR, selectedSet, colorMap, comparisons]);

  const mostDetailedData: BarItem[] = useMemo(
    () =>
      filterByProduct(commentDetail).map((c) => ({
        name: c.product_name,
        value: Number(c.avg_body_length),
        color: c.brand_color || "#818cf8",
      })),
    [commentDetail, selectedSet],
  );

  // --- Review Style ---
  const inlineData: BarItem[] = useMemo(
    () =>
      filterByProduct(inlineVsSummary).map((c) => ({
        name: c.product_name,
        value: Number(c.inline_pct),
        color: c.brand_color || "#818cf8",
      })),
    [inlineVsSummary, selectedSet],
  );

  const verdictsData: BarItem[] = useMemo(
    () =>
      filterByProduct(reviewVerdicts).map((c) => ({
        name: c.product_name,
        value: Number(c.approval_pct),
        color: c.brand_color || "#818cf8",
      })),
    [reviewVerdicts, selectedSet],
  );

  const bigPRsData: BarItem[] = useMemo(
    () =>
      filterByProduct(prSize).map((c) => ({
        name: c.product_name,
        value: Number(c.avg_pr_size),
        color: c.brand_color || "#818cf8",
      })),
    [prSize, selectedSet],
  );

  // --- Adoption & Trust ---
  const bigProjectsData: BarItem[] = useMemo(
    () =>
      filterByProduct(starAdoption).map((c) => ({
        name: c.product_name,
        value: Number(c.avg_repo_stars),
        color: c.brand_color || "#818cf8",
      })),
    [starAdoption, selectedSet],
  );

  const enterpriseData: BarItem[] = useMemo(
    () =>
      fc.map((c) => ({
        name: c.name,
        value: Number(c.total_orgs),
        color: c.brand_color || "#818cf8",
      })),
    [fc],
  );

  const battleTestedData: BarItem[] = useMemo(
    () =>
      fc.map((c) => ({
        name: c.name,
        value: Number(c.weeks_active),
        color: c.brand_color || "#818cf8",
      })),
    [fc],
  );

  const growthData: BarItem[] = useMemo(
    () =>
      fc.map((c) => ({
        name: c.name,
        value: Number(c.growth_pct),
        color: c.brand_color || "#818cf8",
      })),
    [fc],
  );

  // --- Effectiveness ---
  const mergeData: BarItem[] = useMemo(
    () =>
      filterByProduct(mergeRate).map((c) => ({
        name: c.product_name,
        value: Number(c.merge_rate),
        color: c.brand_color || "#818cf8",
      })),
    [mergeRate, selectedSet],
  );

  const responseData: BarItem[] = useMemo(
    () =>
      filterByProduct(responseTime).map((c) => ({
        name: c.product_name,
        value: Number(c.median_response_minutes),
        color: c.brand_color || "#818cf8",
      })),
    [responseTime, selectedSet],
  );

  // Build bot_id → product_id mapping from commentsPerPR (which has both)
  const botToProduct = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of commentsPerPR) {
      map[c.bot_id] = c.product_id;
    }
    return map;
  }, [commentsPerPR]);

  // --- Specialization: Language data ---
  const languageGrid = useMemo(() => {
    const filtered = languageData.filter((d) => {
      const productId = botToProduct[d.bot_id];
      return productId ? selectedSet.has(productId) : false;
    });
    // Group by language, sum pr_count per bot
    const byLang: Record<
      string,
      { name: string; value: number; color: string }[]
    > = {};
    for (const row of filtered) {
      const productId = botToProduct[row.bot_id] || row.bot_id;
      if (!byLang[row.language]) byLang[row.language] = [];
      byLang[row.language].push({
        name: row.bot_name,
        value: Number(row.pr_count),
        color: colorMap[productId] || "#818cf8",
      });
    }
    // Sort languages by total PRs, take top 5
    return Object.entries(byLang)
      .map(([lang, items]) => ({
        language: lang,
        total: items.reduce((s, i) => s + i.value, 0),
        items: items.sort((a, b) => b.value - a.value).slice(0, 5),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [languageData, selectedSet, colorMap, botToProduct]);

  return (
    <div data-testid="categories-page">
      {/* Jump links nav */}
      <nav
        data-testid="categories-nav"
        className="sticky top-0 z-20 bg-theme-bg/95 backdrop-blur border-b border-theme-border py-3 flex gap-4 overflow-x-auto"
      >
        {GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="text-sm text-theme-muted hover:text-theme-text whitespace-nowrap transition-colors"
          >
            {g.label}
          </a>
        ))}
      </nav>

      {/* Signal Quality */}
      <section
        id="signal-quality"
        data-testid="category-group-signal-quality"
        className="mt-10 space-y-6"
      >
        <h2 className="text-2xl font-semibold">Signal Quality</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CategorySection
            id="most-loved"
            title="Most Loved"
            description="Highest approval rate (👍 / (👍 + 👎)) across all review comments."
            data={mostLovedData}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
          <CategorySection
            id="most-controversial"
            title="Most Controversial"
            description="Highest mix of positive and negative reactions — polarizing reviews."
            data={controversyData}
            formatValue={(v) => `${(v * 100).toFixed(0)}%`}
          />
          <CategorySection
            id="less-chatty"
            title="Less Chatty"
            description="Fewest comments per pull request — concise and focused reviews."
            data={lessChattyData}
            formatValue={(v) => `${v.toFixed(2)}/PR`}
            lowerIsBetter
          />
          <CategorySection
            id="most-detailed"
            title="Most Detailed"
            description="Longest average comment body — thorough, detailed feedback."
            data={mostDetailedData}
            formatValue={(v) => `${v.toLocaleString()} chars`}
          />
        </div>
      </section>

      {/* Review Style */}
      <section
        id="review-style"
        data-testid="category-group-review-style"
        className="mt-10 space-y-6"
      >
        <h2 className="text-2xl font-semibold">Review Style</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CategorySection
            id="inline-vs-summary"
            title="Inline vs Summary"
            description="Percentage of comments that are inline code review comments vs PR-level."
            data={inlineData}
            formatValue={(v) => `${v.toFixed(1)}% inline`}
          />
          <CategorySection
            id="review-verdicts"
            title="Approve vs Request Changes"
            description="How often the bot approves PRs vs requesting changes."
            data={verdictsData}
            formatValue={(v) => `${v.toFixed(1)}% approve`}
          />
          <CategorySection
            id="handles-big-prs"
            title="Handles Big PRs"
            description="Average PR size (additions + deletions) reviewed by each product."
            data={bigPRsData}
            formatValue={(v) => `${v.toLocaleString()} lines`}
          />
        </div>
      </section>

      {/* Adoption & Trust */}
      <section
        id="adoption-trust"
        data-testid="category-group-adoption-trust"
        className="mt-10 space-y-6"
      >
        <h2 className="text-2xl font-semibold">Adoption & Trust</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CategorySection
            id="big-projects"
            title="Popular with Big Projects"
            description="Average GitHub stars of repos using each product."
            data={bigProjectsData}
            formatValue={(v) => `${v.toLocaleString()} ★ avg`}
          />
          <CategorySection
            id="enterprise-ready"
            title="Enterprise-Ready"
            description="Number of distinct organizations using the product."
            data={enterpriseData}
            formatValue={(v) => `${v.toLocaleString()} orgs`}
          />
          <CategorySection
            id="battle-tested"
            title="Battle-Tested"
            description="How many weeks the product has been active in the dataset."
            data={battleTestedData}
            formatValue={(v) => `${v} weeks`}
          />
          <CategorySection
            id="fastest-growing"
            title="Fastest Growing"
            description="Review growth: last 4 weeks vs previous 4 weeks."
            data={growthData}
            formatValue={(v) =>
              `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
            }
          />
        </div>
      </section>

      {/* Effectiveness */}
      <section
        id="effectiveness"
        data-testid="category-group-effectiveness"
        className="mt-10 space-y-6"
      >
        <h2 className="text-2xl font-semibold">Effectiveness</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CategorySection
            id="merge-correlation"
            title="Merge Correlation"
            description="Percentage of bot-reviewed PRs that get merged."
            data={mergeData}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
          <CategorySection
            id="response-time"
            title="Response Time"
            description="Median time from PR creation to first bot comment."
            data={responseData}
            formatValue={formatMinutes}
            lowerIsBetter
          />
        </div>
      </section>

      {/* Specialization */}
      <section
        id="specialization"
        data-testid="category-group-specialization"
        className="mt-10 space-y-6"
      >
        <h2 className="text-2xl font-semibold">Specialization</h2>
        <div
          data-testid="category-language-specialist"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {languageGrid.length === 0 ? (
            <p className="text-sm text-theme-muted/70">
              Insufficient data
            </p>
          ) : (
            languageGrid.map((lang) => {
              const maxVal = lang.items[0]?.value ?? 0;
              return (
                <div
                  key={lang.language}
                  className="bg-theme-surface rounded-xl p-5 border border-theme-border"
                >
                  <h3 className="text-lg font-semibold mb-3">
                    {lang.language}
                  </h3>
                  <div className="space-y-2">
                    {lang.items.map((item, i) => {
                      const pct =
                        maxVal > 0 ? (item.value / maxVal) * 100 : 0;
                      return (
                        <div
                          key={item.name}
                          className="flex items-center gap-3"
                        >
                          <span className="text-xs text-theme-muted w-24 text-right truncate" title={item.name}>
                            {item.name}
                          </span>
                          <div className="flex-1 bg-theme-border rounded-full h-4 relative overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.max(pct, 2)}%`,
                                backgroundColor: item.color,
                              }}
                            />
                          </div>
                          <span className="text-xs text-theme-text/80 tabular-nums w-16 text-right">
                            {i === 0 && (
                              <span className="text-violet-400 mr-1">
                                ★
                              </span>
                            )}
                            {item.value.toLocaleString()} PRs
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
