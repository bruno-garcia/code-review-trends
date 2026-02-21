import { describe, test, expect } from "vitest";
import { parseTimeRange, computeCutoffDate, TIME_RANGE_OPTIONS } from "./time-range";

describe("parseTimeRange", () => {
  test("returns valid keys as-is", () => {
    expect(parseTimeRange("all")).toBe("all");
    expect(parseTimeRange("1m")).toBe("1m");
    expect(parseTimeRange("3m")).toBe("3m");
    expect(parseTimeRange("6m")).toBe("6m");
    expect(parseTimeRange("1y")).toBe("1y");
  });

  test("returns 'all' for invalid input", () => {
    expect(parseTimeRange("invalid")).toBe("all");
    expect(parseTimeRange("2m")).toBe("all");
    expect(parseTimeRange("")).toBe("all");
    expect(parseTimeRange("ALL")).toBe("all");
  });

  test("returns 'all' for null/undefined", () => {
    expect(parseTimeRange(null)).toBe("all");
    expect(parseTimeRange(undefined)).toBe("all");
  });
});

describe("computeCutoffDate", () => {
  test("returns null for 'all'", () => {
    expect(computeCutoffDate("all")).toBeNull();
  });

  test("returns a date string in YYYY-MM-DD format", () => {
    const result = computeCutoffDate("1m");
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("1m cutoff is ~28 days ago", () => {
    const result = computeCutoffDate("1m")!;
    const cutoff = new Date(result + "T00:00:00Z");
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    // 4 weeks = 28 days, allow 1 day tolerance
    expect(diffDays).toBeGreaterThanOrEqual(27);
    expect(diffDays).toBeLessThanOrEqual(29);
  });

  test("3m cutoff is ~91 days ago", () => {
    const result = computeCutoffDate("3m")!;
    const cutoff = new Date(result + "T00:00:00Z");
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    // 13 weeks = 91 days
    expect(diffDays).toBeGreaterThanOrEqual(90);
    expect(diffDays).toBeLessThanOrEqual(92);
  });

  test("6m cutoff is ~182 days ago", () => {
    const result = computeCutoffDate("6m")!;
    const cutoff = new Date(result + "T00:00:00Z");
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    // 26 weeks = 182 days
    expect(diffDays).toBeGreaterThanOrEqual(181);
    expect(diffDays).toBeLessThanOrEqual(183);
  });

  test("1y cutoff is ~364 days ago", () => {
    const result = computeCutoffDate("1y")!;
    const cutoff = new Date(result + "T00:00:00Z");
    const now = new Date();
    const diffDays = (now.getTime() - cutoff.getTime()) / (1000 * 60 * 60 * 24);
    // 52 weeks = 364 days
    expect(diffDays).toBeGreaterThanOrEqual(363);
    expect(diffDays).toBeLessThanOrEqual(365);
  });
});

describe("TIME_RANGE_OPTIONS", () => {
  test("contains all expected keys", () => {
    const keys = TIME_RANGE_OPTIONS.map((o) => o.key);
    expect(keys).toEqual(["all", "1m", "3m", "6m", "1y"]);
  });

  test("all option has null weeks", () => {
    const all = TIME_RANGE_OPTIONS.find((o) => o.key === "all");
    expect(all?.weeks).toBeNull();
  });

  test("every non-all option has a positive weeks value", () => {
    for (const opt of TIME_RANGE_OPTIONS) {
      if (opt.key !== "all") {
        expect(opt.weeks).toBeGreaterThan(0);
      }
    }
  });
});
