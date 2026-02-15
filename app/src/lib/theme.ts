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
  /** Border color */
  border: "#1e1e2e",
  /** Grid lines in charts */
  grid: "#1e1e2e",
  /** Axis labels */
  axis: "#555555",
  /** Muted text (gray-400) */
  mutedText: "#9ca3af",
  /** Tooltip background (same as surface) */
  tooltipBg: "#12121a",
} as const;

/** All theme colors as an array for conflict checking */
export const THEME_COLORS = Object.values(THEME);
