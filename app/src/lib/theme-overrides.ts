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
    // Default #94a3b8 (slate-400) is too muted, especially on light
    brand_color_dark: "#b0bec5",
    brand_color_light: "#546e7a",
  },
  "augment-code": {
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
