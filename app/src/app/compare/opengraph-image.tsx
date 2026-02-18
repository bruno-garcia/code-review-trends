import { ImageResponse } from "next/og";
import { getProductSummaries } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";

export const runtime = "nodejs";
export const alt = "Compare AI Code Review Products";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  let topProducts: { name: string; reviews: string; color: string; rawReviews: number }[] = [];

  try {
    const summaries = await getProductSummaries();
    topProducts = summaries
      .sort((a, b) => Number(b.total_reviews) - Number(a.total_reviews))
      .slice(0, 6)
      .map((s) => ({
        name: s.name,
        reviews: formatNumber(Number(s.total_reviews)),
        color: s.brand_color || "#7c3aed",
        rawReviews: Number(s.total_reviews),
      }));
  } catch {
    // ClickHouse unavailable
  }

  const maxReviews = topProducts.length > 0
    ? Math.max(...topProducts.map((p) => p.rawReviews), 1)
    : 1;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0a0a1a 0%, #1a1040 50%, #0a0a1a 100%)",
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
          Side-by-side: volume, growth, repos, and more
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
                    width: `${Math.max((p.rawReviews / maxReviews) * 100, 5)}%`,
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
                {p.reviews}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "24px",
          }}
        >
          <div style={{ fontSize: "18px", color: "#64748b", display: "flex" }}>
            codereviewtrends.com/compare
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                display: "flex",
                background: "linear-gradient(135deg, #a78bfa, #6d28d9)",
                borderRadius: "5px",
                transform: "rotate(45deg)",
                opacity: 0.9,
              }}
            />
            <div
              style={{ fontSize: "18px", fontWeight: 700, display: "flex" }}
            >
              <span style={{ color: "#c4b5fd" }}>Code</span>
              <span style={{ color: "#a78bfa" }}>Review</span>
              <span style={{ color: "#22d3ee" }}>Trends</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
