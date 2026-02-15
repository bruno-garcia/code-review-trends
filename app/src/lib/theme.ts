/**
 * Site-wide theme colors. These define the background, surface, border,
 * and accent palette. Chart / bot colors must not conflict with these
 * to remain visually distinguishable.
 */
export const THEME = {
  /** Page background */
  bg: "#0a0a0f",
  /** Card / surface background */
  surface: "#12121a",
  /** Nav bar background */
  nav: "#12121a",
  /** Border color */
  border: "#1e1e2e",
  /** Grid lines in charts */
  grid: "#1e1e2e",
  /** Axis labels */
  axis: "#555555",
  /** Nav link color */
  navLink: "#9ca3af",
  /** Muted text (gray-400) */
  mutedText: "#9ca3af",
  /** Tooltip background (same as surface) */
  tooltipBg: "#12121a",
} as const;

/** All unique theme colors for conflict checking */
export const THEME_COLORS = [...new Set(Object.values(THEME))];

/**
 * Background colors that brand colors (used as text) must be readable against.
 * WCAG AA requires contrast ratio ≥ 4.5 for normal text.
 */
export const TEXT_BACKGROUND_COLORS = [
  ...new Set([THEME.bg, THEME.surface, THEME.nav]),
] as const;
