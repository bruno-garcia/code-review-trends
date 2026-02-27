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
  "amazon-q": {
    // Default #232F3E (AWS navy) is invisible on dark backgrounds
    brand_color_dark: "#5da0c8",
  },
  codacy: {
    // Default #242C33 is nearly black — invisible on dark backgrounds
    brand_color_dark: "#78a0a8",
  },
  codeclimate: {
    // Default #1E293B (dark slate) is invisible on dark backgrounds
    brand_color_dark: "#6b8baf",
  },
  kilo: {
    // Default #000000 is pure black — invisible on dark backgrounds.
    // Warm sandy tone to stay distinct from OpenAI Codex (#b0b0b0).
    brand_color_dark: "#c4a882",
  },
  kodus: {
    // Default #6C63FF is borderline readable on dark backgrounds
    brand_color_dark: "#6570ff",
  },
  qlty: {
    // Default #6366F1 lacks contrast on dark backgrounds
    brand_color_dark: "#5085fa",
  },
  copilot: {
    // DB may still have old #e5e7eb (invisible on white). Force GitHub blue on light.
    brand_color_light: "#58a6ff",
  },
  "openai-codex": {
    // Default #808080 is too muted on both themes
    brand_color_dark: "#b0b0b0",
    brand_color_light: "#343434",
    // The GitHub avatar is a dark logo on a near-black background
    invert_avatar_dark: true,
  },
  sentry: {
    // Default #9589c4 is a washed-out lavender — poor contrast on both themes
    brand_color_dark: "#b8a9e0",
    brand_color_light: "#6c5d99",
  },
  bito: {
    // Default #94a3b8 (slate-400) is readable on dark but too muted on light
    brand_color_light: "#546e7a",
  },
  augment: {
    // Default #968CFF is pastel purple — faded on light
    brand_color_light: "#6c5ce7",
  },
  linearb: {
    // Default #a37ce2 is light purple — faded on light
    brand_color_light: "#7c4dbd",
  },
  cubic: {
    // Default #edc00c yellow is harsh on white — darken for light
    brand_color_light: "#b8960a",
  },
  baz: {
    // Default #39FF14 neon green is harsh on white
    brand_color_light: "#1a8f0a",
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
