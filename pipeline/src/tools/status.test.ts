/**
 * Unit tests for the pipeline status tool.
 *
 * Pure unit tests for helper functions that don't need ClickHouse.
 * Integration tests that need ClickHouse live in status.integration.test.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countMondaysBetween,
  findMissingMondays,
} from "./status.js";

// ── Pure unit tests ─────────────────────────────────────────────────────

describe("countMondaysBetween", () => {
  it("counts a single Monday", () => {
    assert.equal(countMondaysBetween("2025-01-06", "2025-01-06"), 1);
  });

  it("counts Mondays in a full week", () => {
    // Mon Jan 6 → Sun Jan 12 = 1 Monday
    assert.equal(countMondaysBetween("2025-01-06", "2025-01-12"), 1);
  });

  it("counts Mondays across two weeks", () => {
    // Mon Jan 6 → Mon Jan 13 = 2 Mondays
    assert.equal(countMondaysBetween("2025-01-06", "2025-01-13"), 2);
  });

  it("counts Mondays in a full month", () => {
    // Jan 2025 has Mondays on 6, 13, 20, 27
    assert.equal(countMondaysBetween("2025-01-06", "2025-01-27"), 4);
  });

  it("returns 0 when range has no Monday", () => {
    // Tue Jan 7 → Thu Jan 9 = no Monday
    assert.equal(countMondaysBetween("2025-01-07", "2025-01-09"), 0);
  });

  it("handles start on non-Monday", () => {
    // Wed Jan 1 → Mon Jan 13 = 2 Mondays (Jan 6, Jan 13)
    assert.equal(countMondaysBetween("2025-01-01", "2025-01-13"), 2);
  });
});

describe("findMissingMondays", () => {
  it("returns empty when all Mondays present", () => {
    const present = new Set(["2025-01-06", "2025-01-13", "2025-01-20"]);
    const missing = findMissingMondays("2025-01-06", "2025-01-20", present);
    assert.deepEqual(missing, []);
  });

  it("finds a gap in the middle", () => {
    const present = new Set(["2025-01-06", "2025-01-20"]);
    const missing = findMissingMondays("2025-01-06", "2025-01-20", present);
    assert.deepEqual(missing, ["2025-01-13"]);
  });

  it("finds multiple gaps", () => {
    const present = new Set(["2025-01-06"]);
    const missing = findMissingMondays("2025-01-06", "2025-01-27", present);
    assert.deepEqual(missing, ["2025-01-13", "2025-01-20", "2025-01-27"]);
  });

  it("handles range starting on non-Monday", () => {
    const present = new Set(["2025-01-06", "2025-01-13"]);
    const missing = findMissingMondays("2025-01-01", "2025-01-13", present);
    assert.deepEqual(missing, []);
  });

  it("returns empty for empty range", () => {
    const missing = findMissingMondays("2025-01-07", "2025-01-09", new Set());
    assert.deepEqual(missing, []);
  });
});
