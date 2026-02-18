import { ImageResponse } from "next/og";
import * as Sentry from "@sentry/nextjs";
import { getTopOrgsByStars } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";

export const runtime = "nodejs";
export const alt = "Organizations Using AI Code Review on GitHub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  let topOrgs: { owner: string; stars: string }[] = [];

  try {
    const orgs = await getTopOrgsByStars(15);
    topOrgs = orgs.map((o) => ({
      owner: o.owner,
      stars: formatNumber(Number(o.total_stars)),
    }));
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "orgs/opengraph-image" } });
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
          padding: "50px 60px",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: "44px",
            fontWeight: 800,
            marginBottom: "8px",
            display: "flex",
          }}
        >
          Organizations Using AI Code Review
        </div>
        <div
          style={{
            fontSize: "20px",
            color: "#94a3b8",
            marginBottom: "32px",
            display: "flex",
          }}
        >
          Thousands of orgs on GitHub use AI to review code
        </div>

        {/* Org grid — larger tiles, more orgs */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            flex: 1,
            alignContent: "flex-start",
          }}
        >
          {topOrgs.map((org) => (
            <div
              key={org.owner}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                borderRadius: "12px",
                border: "1px solid rgba(148, 163, 184, 0.15)",
                background: "rgba(255, 255, 255, 0.05)",
              }}
            >
              {/* eslint-disable-next-line jsx-a11y/alt-text -- OG image */}
              <img
                src={`https://github.com/${org.owner}.png?size=64`}
                width={40}
                height={40}
                style={{ borderRadius: "50%" }}
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    fontSize: "17px",
                    fontWeight: 600,
                    display: "flex",
                    lineHeight: 1.2,
                  }}
                >
                  {org.owner}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#94a3b8",
                    display: "flex",
                    lineHeight: 1.2,
                  }}
                >
                  ⭐ {org.stars}
                </div>
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
            marginTop: "16px",
          }}
        >
          <div style={{ fontSize: "18px", color: "#64748b", display: "flex" }}>
            codereviewtrends.com/orgs
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
