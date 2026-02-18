import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

export const alt = "Code Review Trends — AI Code Review Adoption on GitHub";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          backgroundImage: "linear-gradient(to bottom, #0a0a0f, #1e1e2e)",
          fontSize: 48,
          fontWeight: 700,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
          }}
        >
          {/* Logo placeholder - using text for simplicity */}
          <div
            style={{
              display: "flex",
              fontSize: 72,
              background: "linear-gradient(to right, #a78bfa, #6d28d9)",
              backgroundClip: "text",
              color: "transparent",
              fontWeight: 900,
            }}
          >
            📊
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 900,
              background: "linear-gradient(to right, #e0e0ef, #a78bfa, #7c5fcf)",
              backgroundClip: "text",
              color: "transparent",
              marginBottom: 20,
            }}
          >
            Code Review Trends
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              color: "#9ca3af",
              textAlign: "center",
            }}
          >
            AI Code Review Adoption on GitHub
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}