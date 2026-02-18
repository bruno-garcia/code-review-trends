import { ImageResponse } from "next/og";
import * as Sentry from "@sentry/nextjs";
import { getTopOrgsByStars } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";
import { OG_SIZE, OG_BG, OgFooter, OgFallback } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "Organizations Using AI Code Review on GitHub";
export const size = OG_SIZE;
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

  // Fallback when no data is available
  if (topOrgs.length === 0) {
    return new ImageResponse(
      <OgFallback title="Organizations Using AI Code Review" />,
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

        {/* Org grid */}
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
        <div style={{ display: "flex", marginTop: "16px" }}>
          <OgFooter url="codereviewtrends.com/orgs" />
        </div>
      </div>
    ),
    { ...size },
  );
}
