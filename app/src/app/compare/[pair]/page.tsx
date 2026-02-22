import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getProductComparisons,
  getPrCommentSyncPct,
  getAllPrCharacteristics,
  getWeeklyActivityByProduct,
  getWeeklyReactionsByProduct,
} from "@/lib/clickhouse";
import { PAIR_BY_SLUG } from "@/lib/generated/compare-pairs";
import { OG_DEFAULTS } from "@/lib/constants";
import { PrCommentSyncBanner } from "@/components/pr-comment-sync-banner";
import { CompareChartsAbove } from "../compare-charts-above";
import { CompareBelowFold, BelowFoldSkeleton } from "../compare-below-fold";
import { JsonLd } from "@/components/json-ld";
import { PairFilterSync } from "./pair-filter-sync";

type Props = {
  params: Promise<{ pair: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair: slug } = await params;
  const pair = PAIR_BY_SLUG.get(slug);
  if (!pair) return {};

  const url = `/compare/${slug}`;
  return {
    title: pair.title,
    description: pair.description,
    alternates: { canonical: url },
    openGraph: {
      ...OG_DEFAULTS,
      title: pair.title,
      description: pair.description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: pair.title,
      description: pair.description,
    },
  };
}

export default async function ComparePairPage({ params }: Props) {
  const { pair: slug } = await params;
  const pair = PAIR_BY_SLUG.get(slug);
  if (!pair) notFound();

  const ids = new Set([pair.idA, pair.idB]);
  const overrideIds: [string, string] = [pair.idA, pair.idB];

  // Critical: above-fold data
  const [allProducts, prCommentSyncPct, allCharacteristics, weeklyActivity, weeklyReactions] =
    await Promise.all([
      getProductComparisons(),
      getPrCommentSyncPct(),
      getAllPrCharacteristics(),
      getWeeklyActivityByProduct(),
      getWeeklyReactionsByProduct(),
    ]);

  const products = allProducts.filter((p) => ids.has(p.id));
  const prCharacteristics = allCharacteristics.filter((c) => ids.has(c.product_id));

  return (
    <div className="space-y-10" data-testid="compare-pair">
      <PairFilterSync productIds={overrideIds} />
      <div>
        <h1 className="text-3xl font-bold">
          {pair.nameA} vs {pair.nameB}
        </h1>
        <p className="mt-2 text-theme-muted">{pair.description}</p>
      </div>
      <PrCommentSyncBanner pct={prCommentSyncPct} />

      {/* Above fold: trends chart + table + radar + bar breakdowns */}
      <CompareChartsAbove
        products={products}
        prCharacteristics={prCharacteristics}
        weeklyActivity={weeklyActivity}
        weeklyReactions={weeklyReactions}
        overrideProductIds={overrideIds}
      />

      {/* Below fold: comments per PR + bot sentiment */}
      <Suspense fallback={<BelowFoldSkeleton />}>
        <CompareBelowFold
          since={undefined}
          overrideProductIds={overrideIds}
        />
      </Suspense>

      <div className="text-center">
        <Link
          href={`/compare?products=${pair.idA},${pair.idB}`}
          className="text-accent-primary hover:underline"
        >
          Compare with more products →
        </Link>
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: pair.title,
          description: pair.description,
          url: `https://codereviewtrends.com/compare/${slug}`,
        }}
      />
    </div>
  );
}
