import { describe, test, expect } from "vitest";
import { formatHours, formatNumber } from "./format";

describe("formatNumber", () => {
  test("formats small numbers with locale", () => {
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(999)).toBe("999");
  });

  test("formats thousands with K suffix", () => {
    expect(formatNumber(1_000)).toBe("1.0K");
    expect(formatNumber(1_500)).toBe("1.5K");
    expect(formatNumber(999_999)).toBe("1000.0K");
  });

  test("formats millions with M suffix", () => {
    expect(formatNumber(1_000_000)).toBe("1.0M");
    expect(formatNumber(2_500_000)).toBe("2.5M");
  });
});

describe("formatHours", () => {
  test("returns — for null", () => {
    expect(formatHours(null)).toBe("—");
  });

  test("returns — for NaN", () => {
    expect(formatHours(NaN)).toBe("—");
  });

  test("formats sub-hour as minutes", () => {
    expect(formatHours(0.5)).toBe("30m");
    expect(formatHours(0.25)).toBe("15m");
  });

  test("formats hours under 48 as hours", () => {
    expect(formatHours(1)).toBe("1h");
    expect(formatHours(24)).toBe("24h");
    expect(formatHours(47)).toBe("47h");
  });

  test("formats 48h+ as days", () => {
    expect(formatHours(48)).toBe("2d");
    expect(formatHours(72)).toBe("3d");
    expect(formatHours(240)).toBe("10d");
  });

  test("formats 14d+ as weeks", () => {
    expect(formatHours(14 * 24)).toBe("2w");
    expect(formatHours(21 * 24)).toBe("3w");
  });

  test("edge: zero hours shows 0m", () => {
    expect(formatHours(0)).toBe("0m");
  });
});
