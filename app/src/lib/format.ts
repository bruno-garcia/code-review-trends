/**
 * Format a number for display — compact for large values, locale-formatted otherwise.
 */
export function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Format a duration in hours to a human-readable string.
 * Returns "—" for null/NaN (e.g. no merged PRs in sample).
 */
export function formatHours(hours: number | null): string {
  if (hours == null || isNaN(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 14) return `${Math.round(days)}d`;
  return `${Math.round(days / 7)}w`;
}
