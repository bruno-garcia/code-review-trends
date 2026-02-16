/**
 * Shared time-range definitions (importable from server and client code).
 */

export type TimeRangeKey = "all" | "1m" | "3m" | "6m" | "1y";

export type TimeRangeOption = {
  key: TimeRangeKey;
  label: string;
  weeks: number | null; // null = all time
};

export const TIME_RANGE_OPTIONS: TimeRangeOption[] = [
  { key: "all", label: "All Time", weeks: null },
  { key: "1m", label: "1M", weeks: 4 },
  { key: "3m", label: "3M", weeks: 13 },
  { key: "6m", label: "6M", weeks: 26 },
  { key: "1y", label: "1Y", weeks: 52 },
];

const VALID_KEYS = new Set<string>(TIME_RANGE_OPTIONS.map((o) => o.key));

/** Parse and validate a range key from URL search params. */
export function parseTimeRange(raw: string | undefined | null): TimeRangeKey {
  if (raw && VALID_KEYS.has(raw)) return raw as TimeRangeKey;
  return "all";
}

/**
 * Compute a cutoff date string (YYYY-MM-DD) for a given range key.
 * Returns null for "all" (no filtering).
 */
export function computeCutoffDate(range: TimeRangeKey): string | null {
  const option = TIME_RANGE_OPTIONS.find((o) => o.key === range);
  if (!option?.weeks) return null;
  const d = new Date();
  d.setDate(d.getDate() - option.weeks * 7);
  return d.toISOString().slice(0, 10);
}
