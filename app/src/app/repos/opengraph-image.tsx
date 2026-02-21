import { ImageResponse } from "next/og";
import * as Sentry from "@sentry/nextjs";
import { getRepoList } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";
import { OG_SIZE, OG_BG, OgFooter, OgFallback } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "Repositories Using AI Code Review on GitHub";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  let topRepos: {
    name: string;
    owner: string;
    stars: string;
    language: string;
  }[] = [];

  try {
    const result = await getRepoList({ sort: "stars", limit: 12, offset: 0 });
    topRepos = result.repos.map((r) => ({
      name: r.name,
      owner: r.owner,
      stars: formatNumber(Number(r.stars)),
      language: r.primary_language || "",
    }));
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "repos/opengraph-image" },
    });
  }

  if (topRepos.length === 0) {
    return new ImageResponse(
      <OgFallback title="Repositories Using AI Code Review" />,
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
          Repositories Using AI Code Review
        </div>
        <div
          style={{
            fontSize: "20px",
            color: "#94a3b8",
            marginBottom: "32px",
            display: "flex",
          }}
        >
          Top open-source repositories reviewed by AI bots on GitHub
        </div>

        {/* Repo grid */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            flex: 1,
            alignContent: "flex-start",
          }}
        >
          {topRepos.map((repo) => (
            <div
              key={repo.name}
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
                src={`https://github.com/${repo.owner}.png?size=64`}
                width={36}
                height={36}
                style={{ borderRadius: "50%" }}
              />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    display: "flex",
                    lineHeight: 1.2,
                  }}
                >
                  {repo.name.length > 28
                    ? repo.name.slice(0, 28) + "…"
                    : repo.name}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8",
                    display: "flex",
                    gap: "8px",
                    lineHeight: 1.2,
                  }}
                >
                  <span>⭐ {repo.stars}</span>
                  {repo.language && <span>{repo.language}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", marginTop: "16px" }}>
          <OgFooter url="codereviewtrends.com/repos" />
        </div>
      </div>
    ),
    { ...size },
  );
}
