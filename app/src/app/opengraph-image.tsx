import { ImageResponse } from "next/og";
import { getWeeklyTotals } from "@/lib/clickhouse";

export const runtime = "nodejs";
export const alt = "Code Review Trends — AI Code Review Adoption on GitHub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  let latestPct = "";
  let sparkPath = "";

  try {
    const totals = await getWeeklyTotals();
    if (totals.length > 0) {
      latestPct = totals[totals.length - 1].bot_share_pct.toFixed(1);
      // Last 24 weeks for mini sparkline
      const recent = totals.slice(-24);
      const max = Math.max(...recent.map((t) => t.bot_share_pct), 1);
      const sparkW = 400;
      const sparkH = 120;
      const step = sparkW / (recent.length - 1);
      sparkPath = recent
        .map((t, i) => {
          const x = i * step;
          const y = sparkH - (t.bot_share_pct / max) * sparkH;
          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
    }
  } catch {
    // ClickHouse unavailable — render without data
  }

  const headline = latestPct
    ? `${latestPct}%`
    : "AI Code Review";
  const subtitle = latestPct
    ? "of GitHub code reviews are by AI bots"
    : "Tracking adoption on GitHub";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background: "linear-gradient(135deg, #0a0a1a 0%, #1a1040 50%, #0a0a1a 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#e2e8f0",
          padding: "60px 80px",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              display: "flex",
              background: "linear-gradient(135deg, #a78bfa, #6d28d9)",
              borderRadius: "8px",
              transform: "rotate(45deg)",
              opacity: 0.9,
            }}
          />
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-0.5px",
              display: "flex",
            }}
          >
            <span style={{ color: "#c4b5fd" }}>Code</span>
            <span style={{ color: "#a78bfa" }}>Review</span>
            <span style={{ color: "#22d3ee" }}>Trends</span>
          </div>
        </div>

        {/* Main stat */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              fontSize: latestPct ? "96px" : "64px",
              fontWeight: 800,
              letterSpacing: "-3px",
              color: "#a78bfa",
              lineHeight: 1,
              display: "flex",
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontSize: "28px",
              color: "#94a3b8",
              fontWeight: 500,
              display: "flex",
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Sparkline (only if we have data) */}
        <div style={{ display: "flex", marginBottom: "32px", height: "120px" }}>
          {sparkPath ? (
            <svg width="400" height="120" viewBox="0 0 400 120">
              <path
                d={sparkPath}
                stroke="#7c3aed"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path
                d={`${sparkPath} L 400 120 L 0 120 Z`}
                fill="#7c3aed"
                opacity="0.15"
              />
            </svg>
          ) : (
            <div style={{ display: "flex", width: "400px", height: "120px" }} />
          )}
        </div>

        {/* Bottom */}
        <div
          style={{
            fontSize: "20px",
            color: "#64748b",
            display: "flex",
            gap: "8px",
          }}
        >
          <span>codereviewtrends.com</span>
          <span style={{ display: "flex" }}>·</span>
          <span>Updated weekly from GH Archive</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
