import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getProductComparisons,
  getAvgCommentsPerPR,
  getBotReactionLeaderboard,
  getPrCommentSyncPct,
  getAllPrCharacteristics,
} from "@/lib/clickhouse";
import { COMPARE_PAIRS, PAIR_BY_SLUG } from "@/lib/generated/compare-pairs";
import { PrCommentSyncBanner } from "@/components/pr-comment-sync-banner";
import { CompareCharts } from "../compare-charts";
import { JsonLd } from "@/components/json-ld";

type Props = {
  params: Promise<{ pair: string }>;
};

export async function generateStaticParams() {
  return COMPARE_PAIRS.map((p) => ({ pair: p.slug }));
}

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

  const [allProducts, allCommentsPerPR, allReactions, prCommentSyncPct, allCharacteristics] =
    await Promise.all([
      getProductComparisons(),
      getAvgCommentsPerPR(),
      getBotReactionLeaderboard(),
      getPrCommentSyncPct(),
      getAllPrCharacteristics(),
    ]);

  const products = allProducts.filter((p) => ids.has(p.id));
  const commentsPerPR = allCommentsPerPR.filter((c) => ids.has(c.product_id));
  const reactionLeaderboard = allReactions.filter((r) => ids.has(r.product_id));
  const prCharacteristics = allCharacteristics.filter((c) => ids.has(c.product_id));

  return (
    <div className="space-y-10" data-testid="compare-pair">
      <div>
        <h1 className="text-3xl font-bold">
          {pair.nameA} vs {pair.nameB}
        </h1>
        <p className="mt-2 text-theme-muted">{pair.description}</p>
      </div>
      <PrCommentSyncBanner pct={prCommentSyncPct} />
      <CompareCharts
        products={products}
        commentsPerPR={commentsPerPR}
        reactionLeaderboard={reactionLeaderboard}
        prCharacteristics={prCharacteristics}
      />
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
