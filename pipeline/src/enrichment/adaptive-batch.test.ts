/**
 * Tests for adaptive batch sizing.
 *
 * Covers:
 * - Starts at max by default
 * - Custom initial size
 * - Halves on server error
 * - Floors at min
 * - Multiple reductions tracked in summary
 * - onSuccess is a no-op
 * - Log function called on each reduction
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { AdaptiveBatch } from "./adaptive-batch.js";

describe("AdaptiveBatch", () => {
  const logFn = mock.fn<(msg: string) => void>();

  beforeEach(() => {
    logFn.mock.resetCalls();
  });

  function create(max: number, min: number, initial?: number) {
    return new AdaptiveBatch({ max, min, initial }, logFn);
  }

  it("starts at max by default", () => {
    assert.equal(create(50, 5).size, 50);
  });

  it("respects custom initial size", () => {
    assert.equal(create(50, 5, 25).size, 25);
  });

  it("halves on server error", () => {
    const batch = create(40, 5);
    batch.onServerError();
    assert.equal(batch.size, 20);
    batch.onServerError();
    assert.equal(batch.size, 10);
  });

  it("floors at min", () => {
    const batch = create(10, 3);
    batch.onServerError(); // 5
    batch.onServerError(); // 3 (floor, not 2)
    assert.equal(batch.size, 3);
    batch.onServerError(); // no-op — already at min
    assert.equal(batch.size, 3);
    // Only 2 actual reductions (third call was a no-op)
    assert.equal(batch.summary().reductions, 2);
    assert.equal(logFn.mock.callCount(), 2);
  });

  it("onSuccess does not change size", () => {
    const batch = create(50, 5);
    batch.onServerError(); // 25
    batch.onSuccess();
    assert.equal(batch.size, 25);
  });

  it("summary tracks reductions", () => {
    const batch = create(100, 10);
    batch.onServerError();
    batch.onServerError();
    assert.deepStrictEqual(batch.summary(), {
      current: 25,
      max: 100,
      min: 10,
      reductions: 2,
    });
  });

  it("logs on each reduction", () => {
    const batch = create(20, 5);
    batch.onServerError();
    batch.onServerError();
    assert.equal(logFn.mock.callCount(), 2);
    assert.match(String(logFn.mock.calls[0].arguments[0]), /reduced from 20 to 10/);
    assert.match(String(logFn.mock.calls[1].arguments[0]), /reduced from 10 to 5/);
  });
});
