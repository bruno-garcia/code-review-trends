"use client";

import type { BotCommentsPerPR, BotReactions } from "@/lib/clickhouse";
import { CommentsPerPRChart, BotReactionLeaderboardChart } from "@/components/charts";
import { useProductFilter } from "@/lib/product-filter";
import { useUrlState } from "@/lib/use-url-state";
import { SectionHeading } from "@/components/section-heading";

/**
 * Below-fold compare charts: Comments per PR and Bot Sentiment.
 *
 * Rendered inside a Suspense boundary on the main compare page so the
 * above-fold content (trends chart + comparison table) can stream immediately
 * while these sections load. On pair pages the data is already available, so
 * no Suspense is needed.
 */
export function CompareChartsBelow({
  commentsPerPR: allCommentsPerPR,
  reactionLeaderboard: allReactionLeaderboard,
  overrideProductIds,
}: {
  commentsPerPR: BotCommentsPerPR[];
  reactionLeaderboard: BotReactions[];
  /** When set, bypass the global product filter and show exactly these products. */
  overrideProductIds?: string[];
}) {
  const { selectedProductIds: globalIds } = useProductFilter();
  const selectedProductIds = overrideProductIds ?? globalIds;

  // Hidden when the table is in expanded mode (URL state shared with above component)
  const [expanded] = useUrlState("expanded", "");
  const isExpanded = expanded === "1";

  if (isExpanded) return null;

  const commentsPerPR = allCommentsPerPR.filter((c) =>
    selectedProductIds.includes(c.product_id),
  );
  const filteredReactions = allReactionLeaderboard.filter((r) =>
    selectedProductIds.includes(r.product_id),
  );

  return (
    <>
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
    </>
  );
}
