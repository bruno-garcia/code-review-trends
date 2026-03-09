import { ImageResponse } from "next/og";
import * as Sentry from "@sentry/nextjs";
import { getProductSummaries, isNewProduct } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";
import { PAIR_BY_SLUG } from "@/lib/generated/compare-pairs";
import { OG_SIZE, OG_BG, OgFooter, OgFallback } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "AI Code Review Comparison";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ pair: string }>;
}) {
  const { pair } = await params;
  const pairData = PAIR_BY_SLUG.get(pair);

  if (!pairData) {
    return new ImageResponse(
      <OgFallback title="Compare AI Code Review Products" />,
      { ...size },
    );
  }

  let statsA: { reviews: string; growth: string; color: string } | null = null;
  let statsB: { reviews: string; growth: string; color: string } | null = null;

  try {
    const summaries = await getProductSummaries();
    const summaryA = summaries.find((s) => s.id === pairData.idA);
    const summaryB = summaries.find((s) => s.id === pairData.idB);

    const toStats = (summary: typeof summaryA, fallbackColor: string) => {
      if (!summary) return null;
      const g = Number(summary.growth_pct);
      return {
        reviews: formatNumber(Number(summary.total_reviews)),
        growth: isNewProduct(summary) ? "New" : `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`,
        color: summary.brand_color || fallbackColor,
      };
    };

    statsA = toStats(summaryA, "#7c3aed");
    statsB = toStats(summaryB, "#22d3ee");
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "compare/[pair]/opengraph-image", pair },
    });
  }

  const colorA = statsA?.color || "#7c3aed";
  const colorB = statsB?.color || "#22d3ee";

  // Fallback when no data is available
  if (!statsA && !statsB) {
    return new ImageResponse(
      <OgFallback title={pairData.title} />,
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: OG_BG,
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#e2e8f0",
          padding: "60px 80px",
        }}
      >
        {/* Title: Name A vs Name B */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "20px",
            marginBottom: "12px",
          }}
        >
          <span style={{ fontSize: "52px", fontWeight: 800, color: colorA }}>
            {pairData.nameA}
          </span>
          <span style={{ fontSize: "36px", fontWeight: 600, color: "#64748b" }}>
            vs
          </span>
          <span style={{ fontSize: "52px", fontWeight: 800, color: colorB }}>
            {pairData.nameB}
          </span>
        </div>
        <div
          style={{
            fontSize: "22px",
            color: "#94a3b8",
            marginBottom: "auto",
            display: "flex",
          }}
        >
          AI Code Review Comparison
        </div>

        {/* Side-by-side stats */}
        <div
          style={{
            display: "flex",
            gap: "48px",
            marginBottom: "40px",
          }}
        >
          {/* Product A stats */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "28px 36px",
              borderRadius: "16px",
              border: `2px solid ${colorA}44`,
              background: "rgba(255, 255, 255, 0.03)",
            }}
          >
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: colorA,
                marginBottom: "20px",
                display: "flex",
              }}
            >
              {pairData.nameA}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "18px", color: "#94a3b8" }}>Reviews</span>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#e2e8f0" }}>
                  {statsA?.reviews ?? "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "18px", color: "#94a3b8" }}>Growth (12w)</span>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#e2e8f0" }}>
                  {statsA?.growth ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Product B stats */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "28px 36px",
              borderRadius: "16px",
              border: `2px solid ${colorB}44`,
              background: "rgba(255, 255, 255, 0.03)",
            }}
          >
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                color: colorB,
                marginBottom: "20px",
                display: "flex",
              }}
            >
              {pairData.nameB}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "18px", color: "#94a3b8" }}>Reviews</span>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#e2e8f0" }}>
                  {statsB?.reviews ?? "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "18px", color: "#94a3b8" }}>Growth (12w)</span>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#e2e8f0" }}>
                  {statsB?.growth ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex" }}>
          <OgFooter url={`codereviewtrends.com/compare/${pair}`} />
        </div>
      </div>
    ),
    { ...size },
  );
}
