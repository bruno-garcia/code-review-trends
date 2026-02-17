import {
  getProductComparisons,
  getAvgCommentsPerPR,
  getBotsByLanguage,
  getCategoryCommentDetail,
  getCategoryStarAdoption,
  getCategoryPRSize,
  getCategoryMergeRate,
  getCategoryResponseTime,
  getCategoryControversy,
  getCategoryInlineVsSummary,
  getCategoryReviewVerdicts,
  getCategoryGrowth,
} from "@/lib/clickhouse";
import { RankingsPage } from "@/components/rankings-page";

export const dynamic = "force-dynamic";

/**
 * Categories that depend on enriched PRs/comments (pull_requests,
 * pr_comments tables) are only shown when enrichment coverage is
 * sufficient.  We detect this by checking how many pull_requests
 * have been enriched relative to the discovered PR count.
 *
 * Categories backed by BigQuery aggregates (review_activity) or the
 * repos table are always shown — their coverage is good enough.
 */
async function hasEnrichmentCoverage(): Promise<boolean> {
  // Quick heuristic: if we have comparisons with meaningful reaction
  // data (>1000 total reactions), enrichment is probably sufficient.
  // This avoids an extra query and works because reactions only come
  // from enriched pr_comments.
  try {
    const comparisons = await getProductComparisons();
    const totalReactions = comparisons.reduce(
      (sum, c) => sum + Number(c.thumbs_up) + Number(c.thumbs_down),
      0,
    );
    return totalReactions >= 1000;
  } catch {
    return false;
  }
}

export default async function RankingsRoute() {
  // Some ranking queries may fail on resource-constrained databases
  // (memory limits) or databases missing columns (review_state).
  // Gracefully degrade: the UI shows nothing for failed queries.
  const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

  const enriched = await hasEnrichmentCoverage();

  const [
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
    growth,
  ] = await Promise.all([
    getProductComparisons(),
    // Enrichment-dependent queries: only fetch when coverage is sufficient
    enriched ? getAvgCommentsPerPR() : Promise.resolve([]),
    getBotsByLanguage(),
    enriched ? safe(getCategoryCommentDetail()) : Promise.resolve([]),
    safe(getCategoryStarAdoption()),
    enriched ? safe(getCategoryPRSize()) : Promise.resolve([]),
    enriched ? safe(getCategoryMergeRate()) : Promise.resolve([]),
    enriched ? safe(getCategoryResponseTime()) : Promise.resolve([]),
    enriched ? safe(getCategoryControversy()) : Promise.resolve([]),
    enriched ? safe(getCategoryInlineVsSummary()) : Promise.resolve([]),
    enriched ? safe(getCategoryReviewVerdicts()) : Promise.resolve([]),
    safe(getCategoryGrowth()),
  ]);

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-bold">Rankings</h1>
        <p className="mt-2 text-theme-muted">
          Compare AI code review products across different dimensions. Find the
          right tool for what matters to you.
        </p>
      </div>
      <RankingsPage
        comparisons={comparisons}
        commentsPerPR={commentsPerPR}
        languageData={languageData}
        commentDetail={commentDetail}
        starAdoption={starAdoption}
        prSize={prSize}
        mergeRate={mergeRate}
        responseTime={responseTime}
        controversy={controversy}
        inlineVsSummary={inlineVsSummary}
        reviewVerdicts={reviewVerdicts}
        growth={growth}
        enriched={enriched}
      />
    </div>
  );
}
