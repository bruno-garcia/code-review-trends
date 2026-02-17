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
} from "@/lib/clickhouse";
import { CategoriesPage } from "@/components/categories-page";

export const dynamic = "force-dynamic";

export default async function CategoriesRoute() {
  // Some category queries may fail on resource-constrained databases
  // (memory limits) or databases missing columns (review_state).
  // Gracefully degrade: the UI shows "Insufficient data" for failed queries.
  const safe = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

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
  ] = await Promise.all([
    getProductComparisons(),
    getAvgCommentsPerPR(),
    getBotsByLanguage(),
    safe(getCategoryCommentDetail()),
    safe(getCategoryStarAdoption()),
    safe(getCategoryPRSize()),
    safe(getCategoryMergeRate()),
    safe(getCategoryResponseTime()),
    safe(getCategoryControversy()),
    safe(getCategoryInlineVsSummary()),
    safe(getCategoryReviewVerdicts()),
  ]);

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-bold">Categories</h1>
        <p className="mt-2 text-theme-muted">
          Compare AI code review products across different dimensions. Find the
          right tool for what matters to you.
        </p>
      </div>
      <CategoriesPage
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
      />
    </div>
  );
}
