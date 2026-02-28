/**
 * Per-product theme overrides for brand colors and avatar rendering.
 *
 * Some products have logos or colors that only work on one background.
 * For example, OpenAI Codex has a black logo on a dark background — invisible
 * on dark theme. This map provides per-theme alternatives.
 *
 * Keys are product IDs (from pipeline/src/bots.ts).
 * Only products that need overrides are listed here.
 */

type ThemeOverride = {
  /** Brand color for dark theme (if different from default) */
  brand_color_dark?: string;
  /** Brand color for light theme (if different from default) */
  brand_color_light?: string;
  /** Whether to invert the avatar on dark theme (for dark-on-dark logos) */
  invert_avatar_dark?: boolean;
};

const THEME_OVERRIDES: Record<string, ThemeOverride> = {
  // ── Products that need dark-theme overrides (dark brand color on dark bg) ──
  "amazon-q": {
    // Default #232F3E (AWS navy) is invisible on dark backgrounds
    brand_color_dark: "#5da0c8",
    // AWS orange, darkened for WCAG AA contrast on white
    brand_color_light: "#7d4a00",
  },
  codacy: {
    // Default #242C33 is nearly black — invisible on dark backgrounds
    brand_color_dark: "#78a0a8",
    // Codacy teal accent, darkened to stay distinct from Windsurf
    brand_color_light: "#0e6058",
  },
  codeclimate: {
    // Default #1E293B (dark slate) is invisible on dark backgrounds
    brand_color_dark: "#6b8baf",
    // Slate blue — distinct from the raw dark navy
    brand_color_light: "#2d4a6f",
  },
  kilo: {
    // Default #000000 is pure black — invisible on dark backgrounds.
    // Warm sandy tone to stay distinct from OpenAI Codex (#b0b0b0).
    brand_color_dark: "#c4a882",
  },
  "openai-codex": {
    // Default #808080 is too muted on both themes
    brand_color_dark: "#b0b0b0",
    brand_color_light: "#343434",
    // The GitHub avatar is a dark logo on a near-black background
    invert_avatar_dark: true,
  },

  // ── Products that need light-theme overrides (bright brand color on white bg) ──
  coderabbit: {
    // Default #f97316 orange washes out on white
    brand_color_light: "#b85510",
  },
  copilot: {
    // Default #58a6ff is too bright on white
    brand_color_light: "#3e74b2",
  },
  codescene: {
    // Default #5f72ee washes out on white
    brand_color_light: "#5567d6",
  },
  sourcery: {
    // Default #65a30d green is too bright on white
    brand_color_light: "#4e7e0a",
  },
  ellipsis: {
    // Default #06b6d4 cyan is too bright on white
    brand_color_light: "#047c90",
  },
  gemini: {
    // Default #ec4899 pink washes out on white
    brand_color_light: "#c63c81",
  },
  graphite: {
    // Default #5b8ef0 blue washes out on white
    brand_color_light: "#4870be",
  },
  greptile: {
    // Default #22c55e green is too bright on white
    brand_color_light: "#16823e",
  },
  jazzberry: {
    // Default #d44d7f washes out on white
    brand_color_light: "#bf4572",
  },
  kodus: {
    // Default #6C63FF is borderline on both themes. Light shifted blue to stay distinct from Qlty (#5e61e5).
    brand_color_dark: "#6570ff",
    brand_color_light: "#5048e8",
  },
  korbit: {
    // Default #b07838 washes out on white
    brand_color_light: "#976730",
  },
  mesa: {
    // Default #c06a33 washes out on white
    brand_color_light: "#a95d2d",
  },
  qlty: {
    // Default #6366F1 lacks contrast on both themes
    brand_color_dark: "#5085fa",
    brand_color_light: "#5e61e5",
  },
  qodo: {
    // Default #9d75f8 washes out on white. Shifted magenta to stay distinct from LinearB (#7c4dbd).
    brand_color_light: "#9838a8",
  },
  windsurf: {
    // Default #0d9488 teal washes out on white
    brand_color_light: "#0b7f75",
  },
  cursor: {
    // Default #e84e4e red washes out on white
    brand_color_light: "#c84343",
  },
  codeant: {
    // Default #a855f7 purple washes out on white
    brand_color_light: "#964cdc",
  },
  claude: {
    // Default #FF9F1C orange is too bright on white
    brand_color_light: "#a16412",
  },
  sentry: {
    // Default #9589c4 is washed-out lavender — poor contrast on both themes
    brand_color_dark: "#b8a9e0",
    brand_color_light: "#6c5d99",
  },
  bito: {
    // Default #94a3b8 (slate-400) is readable on dark but too muted on light
    brand_color_light: "#546e7a",
  },
  augment: {
    // Default #968CFF is pastel purple — faded on light. Shifted to indigo to stay distinct from Kodus (#645ced).
    brand_color_light: "#5040c0",
  },
  linearb: {
    // Default #a37ce2 is light purple — faded on light
    brand_color_light: "#7c4dbd",
  },
  cubic: {
    // Default #edc00c yellow washes out on white
    brand_color_light: "#896f07",
  },
  baz: {
    // Default #39FF14 neon green is harsh on white
    brand_color_light: "#1d820a",
  },
};

/**
 * Resolve brand_color for a product given the current theme.
 */
export function getThemedBrandColor(
  productId: string,
  defaultColor: string,
  resolved: "light" | "dark",
): string {
  const override = THEME_OVERRIDES[productId];
  if (!override) return defaultColor;
  if (resolved === "dark" && override.brand_color_dark) return override.brand_color_dark;
  if (resolved === "light" && override.brand_color_light) return override.brand_color_light;
  return defaultColor;
}

/**
 * Hex alpha suffixes for brand-colored borders and backgrounds.
 * Light theme needs higher opacity because colored overlays on white wash out.
 */
export function getBrandAlpha(resolved: "light" | "dark") {
  return resolved === "light"
    ? { border: "90", bg: "20" }  // 56% / 13% — visible on white
    : { border: "60", bg: "15" }; // 38% / 8%  — subtle on dark
}

/**
 * CSS filter style to invert a dark-on-dark logo for visibility on dark backgrounds.
 * Reuse this constant instead of inline style objects in components.
 */
export const INVERT_AVATAR_STYLE: React.CSSProperties = { filter: "invert(1) hue-rotate(180deg)" };

/**
 * Check if a product's avatar should be inverted on the current theme.
 */
export function shouldInvertAvatar(
  productId: string,
  resolved: "light" | "dark",
): boolean {
  const override = THEME_OVERRIDES[productId];
  if (!override) return false;
  return resolved === "dark" && !!override.invert_avatar_dark;
}

/**
 * Returns the invert style object if the avatar needs inversion, or undefined.
 */
export function getAvatarStyle(
  productId: string,
  resolved: "light" | "dark",
): React.CSSProperties | undefined {
  return shouldInvertAvatar(productId, resolved) ? INVERT_AVATAR_STYLE : undefined;
}
