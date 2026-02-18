import { ImageResponse } from "next/og";
import { getProductById, getProductSummaries } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";

export const runtime = "nodejs";
export const alt = "AI Code Review Product Stats";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let name = id;
  let description = "";
  let brandColor = "#7c3aed";
  let avatarUrl = "";
  let reviews = "—";
  let repos = "—";
  let growth = "—";

  try {
    const [product, summaries] = await Promise.all([
      getProductById(id),
      getProductSummaries(),
    ]);
    if (product) {
      name = product.name;
      description = product.description;
      brandColor = product.brand_color || "#7c3aed";
      avatarUrl = product.avatar_url;
    }
    const summary = summaries.find((s) => s.id === id);
    if (summary) {
      reviews = formatNumber(Number(summary.total_reviews));
      repos = formatNumber(Number(summary.total_repos));
      const g = Number(summary.growth_pct);
      growth = `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`;
    }
  } catch {
    // ClickHouse unavailable
  }

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
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
            marginBottom: "32px",
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              width={80}
              height={80}
              style={{
                borderRadius: "50%",
                border: `3px solid ${brandColor}`,
              }}
            />
          ) : (
            <div
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: brandColor,
                display: "flex",
              }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "52px",
                fontWeight: 800,
                color: brandColor,
                lineHeight: 1.1,
                display: "flex",
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: "20px",
                color: "#94a3b8",
                marginTop: "4px",
                display: "flex",
              }}
            >
              AI Code Review
            </div>
          </div>
        </div>

        {/* Description — full text, up to 4 lines */}
        <div
          style={{
            fontSize: "24px",
            color: "#cbd5e1",
            lineHeight: 1.5,
            marginBottom: "auto",
            display: "flex",
          }}
        >
          {description || "AI code review product"}
        </div>

        {/* Stats — 3 boxes, no rank */}
        <div
          style={{
            display: "flex",
            gap: "32px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "20px 36px",
              borderRadius: "16px",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              background: "rgba(255, 255, 255, 0.05)",
            }}
          >
            <div style={{ fontSize: "16px", color: "#94a3b8", display: "flex" }}>
              Reviews
            </div>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 800,
                color: brandColor,
                display: "flex",
              }}
            >
              {reviews}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "20px 36px",
              borderRadius: "16px",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              background: "rgba(255, 255, 255, 0.05)",
            }}
          >
            <div style={{ fontSize: "16px", color: "#94a3b8", display: "flex" }}>
              Repos
            </div>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 800,
                color: brandColor,
                display: "flex",
              }}
            >
              {repos}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "20px 36px",
              borderRadius: "16px",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              background: "rgba(255, 255, 255, 0.05)",
            }}
          >
            <div style={{ fontSize: "16px", color: "#94a3b8", display: "flex" }}>
              Growth (12w)
            </div>
            <div
              style={{
                fontSize: "40px",
                fontWeight: 800,
                color: brandColor,
                display: "flex",
              }}
            >
              {growth}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "18px", color: "#64748b", display: "flex" }}>
            codereviewtrends.com
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
              style={{
                fontSize: "18px",
                fontWeight: 700,
                display: "flex",
              }}
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
