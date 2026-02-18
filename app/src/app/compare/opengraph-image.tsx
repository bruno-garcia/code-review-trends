import { ImageResponse } from "next/og";
import * as Sentry from "@sentry/nextjs";
import { getProductSummaries } from "@/lib/clickhouse";
import { OG_SIZE, OG_BG, OgFooter, OgFallback } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "Compare AI Code Review Products";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  let topProducts: { name: string; growth: string; color: string; rawGrowth: number }[] = [];

  try {
    const summaries = await getProductSummaries();
    topProducts = summaries
      .filter((s) => Number(s.growth_pct) > 0)
      .sort((a, b) => Number(b.growth_pct) - Number(a.growth_pct))
      .slice(0, 6)
      .map((s) => {
        const g = Number(s.growth_pct);
        return {
          name: s.name,
          growth: `+${g.toFixed(1)}%`,
          color: s.brand_color || "#7c3aed",
          rawGrowth: g,
        };
      });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "compare/opengraph-image" } });
  }

  // Fallback when no data is available
  if (topProducts.length === 0) {
    return new ImageResponse(
      <OgFallback title="Compare AI Code Review Products" />,
      { ...size },
    );
  }

  const maxGrowth = Math.max(...topProducts.map((p) => p.rawGrowth), 1);

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
        {/* Title */}
        <div
          style={{
            fontSize: "48px",
            fontWeight: 800,
            marginBottom: "12px",
            display: "flex",
          }}
        >
          Compare AI Code Review Products
        </div>
        <div
          style={{
            fontSize: "22px",
            color: "#94a3b8",
            marginBottom: "40px",
            display: "flex",
          }}
        >
          Fastest growing — 12-week review volume change
        </div>

        {/* Bar chart */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            flex: 1,
          }}
        >
          {topProducts.map((p) => (
            <div
              key={p.name}
              style={{ display: "flex", alignItems: "center", gap: "16px" }}
            >
              <div
                style={{
                  width: "140px",
                  fontSize: "18px",
                  fontWeight: 600,
                  color: p.color,
                  textAlign: "right",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                {p.name}
              </div>
              <div
                style={{
                  flex: 1,
                  height: "32px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "8px",
                  overflow: "hidden",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    width: `${Math.max((p.rawGrowth / maxGrowth) * 100, 5)}%`,
                    height: "100%",
                    display: "flex",
                    background: `linear-gradient(90deg, ${p.color}cc, ${p.color}66)`,
                    borderRadius: "8px",
                  }}
                />
              </div>
              <div
                style={{
                  width: "80px",
                  fontSize: "16px",
                  color: "#94a3b8",
                  display: "flex",
                }}
              >
                {p.growth}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", marginTop: "24px" }}>
          <OgFooter url="codereviewtrends.com/compare" />
        </div>
      </div>
    ),
    { ...size },
  );
}
