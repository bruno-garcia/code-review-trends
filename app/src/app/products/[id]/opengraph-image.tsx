import { ImageResponse } from "next/og";
import * as Sentry from "@sentry/nextjs";
import { getProductById, getProductSummaries, isNewProduct, isDormantProduct } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";
import { OG_SIZE, OG_BG, OgFooter, OgFallback } from "@/lib/og-utils";

export const runtime = "nodejs";
export const alt = "AI Code Review Product Stats";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let name = "";
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
      if (isDormantProduct(summary)) {
        growth = "Inactive";
      } else if (isNewProduct(summary)) {
        growth = "New";
      } else {
        const g = Number(summary.growth_pct);
        growth = `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`;
      }
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "products/[id]/opengraph-image", productId: id },
    });
  }

  // Fallback when data fetch fails — show product avatar (if cached) and site branding
  if (!name) {
    return new ImageResponse(
      <OgFallback title={id} avatarUrl={avatarUrl} brandColor={brandColor} />,
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

        {/* Stats — 3 boxes */}
        <div
          style={{
            display: "flex",
            gap: "32px",
            marginBottom: "40px",
          }}
        >
          {[
            { label: "Reviews", value: reviews },
            { label: "Repos", value: repos },
            { label: "Growth (12w)", value: growth },
          ].map((stat) => (
            <div
              key={stat.label}
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
                {stat.label}
              </div>
              <div
                style={{
                  fontSize: "40px",
                  fontWeight: 800,
                  color: brandColor,
                  display: "flex",
                }}
              >
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <OgFooter url={`codereviewtrends.com/products/${id}`} />
      </div>
    ),
    { ...size },
  );
}
