/**
 * Shared utilities for OG image generation (Satori / next/og).
 *
 * Satori constraints:
 * - Every <div> with children must have `display: "flex"`
 * - No CSS variables, no gradient IDs, limited SVG support
 * - Use inline styles only
 */

/** Standard OG image dimensions. */
export const OG_SIZE = { width: 1200, height: 630 };

/** Dark gradient background used by all OG images. */
export const OG_BG =
  "linear-gradient(135deg, #0a0a1a 0%, #1a1040 50%, #0a0a1a 100%)";

/**
 * Site logo SVG for OG images — simplified version of the favicon logo.
 * Uses no gradient IDs or CSS variables (Satori-safe).
 */
export function OgLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
    >
      <rect
        x="26"
        y="2"
        width="33.94"
        height="33.94"
        rx="7"
        transform="rotate(45 26 2)"
        fill="#7c3aed"
        opacity="0.25"
      />
      <line
        x1="22"
        y1="14"
        x2="22"
        y2="40"
        stroke="#a78bfa"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M22 20 C23 20, 25 18, 29 15"
        stroke="#a78bfa"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="22" cy="14" r="5" fill="#c4b5fd" />
      <circle cx="22" cy="40" r="5" fill="#7c3aed" />
      <circle cx="30" cy="14" r="4.5" fill="#a78bfa" />
      <polyline
        points="31,36 36,29 44,23"
        stroke="#22d3ee"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
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
        <OgLogo size={28} />
        <OgWordmark />
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
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <OgLogo size={48} />
        <OgWordmark fontSize={28} />
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
