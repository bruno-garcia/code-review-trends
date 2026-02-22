/** Epoch: AI code review tracking starts 2023-01-01. */
export const DATA_EPOCH = "2023-01-01";

/**
 * Shared OpenGraph defaults inherited from the root layout.
 * Spread into every page's `openGraph` to ensure `og:type`, `og:site_name`,
 * and `og:locale` are always present (Next.js replaces — not merges — the
 * parent openGraph object when a child defines its own).
 */
export const OG_DEFAULTS = {
  type: "website" as const,
  siteName: "Code Review Trends",
  locale: "en_US",
};
