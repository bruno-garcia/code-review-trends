import { ImageResponse } from "next/og";
import * as Sentry from "@sentry/nextjs";
import { getWeeklyTotals } from "@/lib/clickhouse";
import { OG_SIZE, OG_BG, OgLogo, OgWordmark, OgFallback } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "Code Review Trends — AI Code Review Adoption on GitHub";
export const size = OG_SIZE;
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
      const step = recent.length > 1 ? sparkW / (recent.length - 1) : 0;
      sparkPath = recent
        .map((t, i) => {
          const x = recent.length > 1 ? i * step : sparkW / 2;
          const y = sparkH - (t.bot_share_pct / max) * sparkH;
          return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "opengraph-image" } });
  }

  // Fallback when no data is available
  if (!latestPct) {
    return new ImageResponse(<OgFallback title="AI Code Review Trends" />, {
      ...size,
    });
  }

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
          background: OG_BG,
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
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <OgLogo size={96} />
          <OgWordmark fontSize={48} />
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
              fontSize: "96px",
              fontWeight: 800,
              letterSpacing: "-3px",
              color: "#a78bfa",
              lineHeight: 1,
              display: "flex",
            }}
          >
            {latestPct}%
          </div>
          <div
            style={{
              fontSize: "28px",
              color: "#94a3b8",
              fontWeight: 500,
              display: "flex",
            }}
          >
            of GitHub code reviews are by AI bots
          </div>
        </div>

        {/* Sparkline */}
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
