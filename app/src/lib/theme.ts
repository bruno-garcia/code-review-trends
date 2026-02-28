/**
 * Site-wide theme colors for charts (Recharts).
 *
 * Uses CSS custom properties so charts automatically adapt to light/dark.
 * These are resolved at runtime via getComputedStyle. For Recharts props
 * that need a concrete string, call getChartTheme() inside a useEffect or
 * event handler (client-side only).
 */

/** CSS variable references — works directly in inline styles */
export const THEME_VARS = {
  bg: "var(--color-theme-bg)",
  surface: "var(--color-theme-surface)",
  border: "var(--color-theme-border)",
  grid: "var(--color-theme-chart-grid)",
  axis: "var(--color-theme-chart-axis)",
  mutedText: "var(--color-theme-muted)",
  tooltipBg: "var(--color-theme-tooltip-bg)",
  tooltipBorder: "var(--color-theme-tooltip-border)",
} as const;

/**
 * Resolve the current theme CSS variables to concrete hex values.
 * Must be called client-side only.
 */
export function getChartTheme() {
  if (typeof window === "undefined") {
    // SSR fallback — dark theme values
    return {
      bg: "#0a0a0f",
      surface: "#12121a",
      border: "#1e1e2e",
      grid: "#1e1e2e",
      axis: "#555555",
      mutedText: "#9ca3af",
      tooltipBg: "#12121a",
      tooltipBorder: "#1e1e2e",
    };
  }
  const s = getComputedStyle(document.documentElement);
  return {
    bg: s.getPropertyValue("--color-theme-bg").trim(),
    surface: s.getPropertyValue("--color-theme-surface").trim(),
    border: s.getPropertyValue("--color-theme-border").trim(),
    grid: s.getPropertyValue("--color-theme-chart-grid").trim(),
    axis: s.getPropertyValue("--color-theme-chart-axis").trim(),
    mutedText: s.getPropertyValue("--color-theme-muted").trim(),
    tooltipBg: s.getPropertyValue("--color-theme-tooltip-bg").trim(),
    tooltipBorder: s.getPropertyValue("--color-theme-tooltip-border").trim(),
  };
}

/**
 * Static theme values for the color-conflict test.
 * These are the dark-theme values that chart colors must contrast against.
 */
export const THEME = {
  bg: "#0a0a0f",
  surface: "#12121a",
  /** Nav bar background */
  nav: "#12121a",
  border: "#1e1e2e",
  grid: "#1e1e2e",
  axis: "#555555",
  /** Nav link color */
  navLink: "#9ca3af",
  mutedText: "#9ca3af",
  tooltipBg: "#12121a",
} as const;

/** All unique theme colors for conflict checking */
export const THEME_COLORS = [...new Set(Object.values(THEME))];

/** Light theme background values (from globals.css :root) */
export const LIGHT_THEME = {
  bg: "#ffffff",
  surface: "#f9fafb",
  nav: "#f9fafb",
} as const;

/**
 * Background colors that brand colors (used as text) must be readable against.
 * Includes both dark and light theme backgrounds with their theme name,
 * so the test can apply the correct getThemedBrandColor override per theme.
 */
export const TEXT_BACKGROUND_COLORS: { color: string; theme: "dark" | "light" }[] = [
  ...([...new Set([THEME.bg, THEME.surface, THEME.nav])] as string[]).map(
    (color) => ({ color, theme: "dark" as const }),
  ),
  ...([...new Set([LIGHT_THEME.bg, LIGHT_THEME.surface, LIGHT_THEME.nav])] as string[]).map(
    (color) => ({ color, theme: "light" as const }),
  ),
];
