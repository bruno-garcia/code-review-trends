/**
 * Shared utilities for OG image generation (Satori / next/og).
 *
 * Satori constraints:
 * - Every <div> with children must have `display: "flex"`
 * - No CSS variables, no gradient IDs, limited SVG support
 * - Use inline styles only
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Standard OG image dimensions. */
export const OG_SIZE = { width: 1200, height: 630 };

/** Dark gradient background used by all OG images. */
export const OG_BG =
  "linear-gradient(135deg, #0a0a1a 0%, #1a1040 50%, #0a0a1a 100%)";

/**
 * Site logo as a base64 data URL — the actual 400x400 PNG from branding.
 * Read once at module load time (server-side only, not shipped to clients).
 *
 * Tries multiple paths because Next.js standalone output in a monorepo
 * places public/ under a different path than during development.
 */
const logoBase64 = (() => {
  const candidates = [
    join(process.cwd(), "public/branding/logo-og.png"),
    join(process.cwd(), "app/public/branding/logo-og.png"),
  ];
  for (const path of candidates) {
    try {
      const buf = readFileSync(path);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      // Try next candidate
    }
  }
  return "";
})();

/**
 * Site logo for OG images — uses the actual branding PNG.
 * Falls back to a simple purple diamond if the file isn't available.
 */
export function OgLogo({ size = 48 }: { size?: number }) {
  if (logoBase64) {
    // eslint-disable-next-line jsx-a11y/alt-text -- OG image, no alt needed
    return <img src={logoBase64} width={size} height={size} />;
  }
  // Fallback: simple diamond shape
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: "flex",
        background: "linear-gradient(135deg, #a78bfa, #6d28d9)",
        borderRadius: `${Math.round(size / 6)}px`,
        transform: "rotate(45deg)",
        opacity: 0.9,
      }}
    />
  );
}

/** Branded wordmark: "CodeReviewTrends" with color-coded segments. */
export function OgWordmark({ fontSize = 18 }: { fontSize?: number }) {
  return (
    <div style={{ fontSize, fontWeight: 700, display: "flex" }}>
      <span style={{ color: "#c4b5fd" }}>Code</span>
      <span style={{ color: "#a78bfa" }}>Review</span>
      <span style={{ color: "#22d3ee" }}>Trends</span>
    </div>
  );
}

/** Standard footer with URL on the left and logo + wordmark on the right. */
export function OgFooter({ url = "codereviewtrends.com" }: { url?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: "18px", color: "#64748b", display: "flex" }}>
        {url}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <OgLogo size={48} />
        <OgWordmark fontSize={28} />
      </div>
    </div>
  );
}

/**
 * Fallback OG image content for when data fetching fails.
 * Shows the site logo, name, and a generic tagline.
 * Optionally shows a product avatar and name if available.
 */
export function OgFallback({
  title,
  subtitle = "Tracking AI code review adoption on GitHub",
  avatarUrl,
  brandColor,
}: {
  title?: string;
  subtitle?: string;
  avatarUrl?: string;
  brandColor?: string;
}) {
  return (
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
      {/* Product avatar if available */}
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt=""
          width={80}
          height={80}
          style={{
            borderRadius: "50%",
            border: `3px solid ${brandColor || "#7c3aed"}`,
            marginBottom: "24px",
          }}
        />
      )}

      {/* Site logo */}
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

      {/* Title */}
      {title && (
        <div
          style={{
            fontSize: "52px",
            fontWeight: 800,
            color: brandColor || "#a78bfa",
            lineHeight: 1.1,
            textAlign: "center",
            display: "flex",
            marginBottom: "16px",
          }}
        >
          {title}
        </div>
      )}

      {/* Subtitle */}
      <div
        style={{
          fontSize: "24px",
          color: "#94a3b8",
          fontWeight: 500,
          display: "flex",
        }}
      >
        {subtitle}
      </div>

      {/* Bottom URL */}
      <div
        style={{
          fontSize: "18px",
          color: "#64748b",
          marginTop: "auto",
          display: "flex",
        }}
      >
        codereviewtrends.com
      </div>
    </div>
  );
}
