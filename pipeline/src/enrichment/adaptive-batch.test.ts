/**
 * Tests for adaptive batch sizing.
 *
 * Covers:
 * - Starts at max by default
 * - Custom initial size
 * - Halves on server error
 * - Floors at min
 * - Multiple reductions tracked in summary
 * - Recovery after consecutive successes
 * - Recovery resets streak on error
 * - Recovery caps at max
 * - Recovery step is 25% of max
 * - Custom recovery threshold
 * - No recovery when already at max
 * - Summary tracks recoveries
 * - Log function called on reductions and recoveries
 * - Error-recovery-error oscillation pattern
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { AdaptiveBatch } from "./adaptive-batch.js";

describe("AdaptiveBatch", () => {
  const logFn = mock.fn<(msg: string) => void>();

  beforeEach(() => {
    logFn.mock.resetCalls();
  });

  function create(max: number, min: number, initial?: number, recoveryThreshold?: number) {
    return new AdaptiveBatch({ max, min, initial, recoveryThreshold }, logFn);
  }

  // ── Basic sizing ──────────────────────────────────────────────────────

  it("starts at max by default", () => {
    assert.equal(create(50, 5).size, 50);
  });

  it("respects custom initial size", () => {
    assert.equal(create(50, 5, 25).size, 25);
  });

  // ── Error reduction ───────────────────────────────────────────────────

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

  it("resets consecutive success streak on error", () => {
    const batch = create(100, 5, 50);
    // 2 successes (not yet at threshold of 3)
    batch.onSuccess();
    batch.onSuccess();
    // Error breaks the streak
    batch.onServerError();
    assert.equal(batch.size, 25);
    // Need 3 fresh successes now, not just 1 more
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 25, "should not recover yet — only 2 successes after error");
    batch.onSuccess();
    assert.equal(batch.size, 50, "should recover after 3 consecutive successes");
  });

  it("summary tracks reductions", () => {
    const batch = create(100, 10);
    batch.onServerError();
    batch.onServerError();
    const s = batch.summary();
    assert.equal(s.current, 25);
    assert.equal(s.max, 100);
    assert.equal(s.min, 10);
    assert.equal(s.reductions, 2);
    assert.equal(s.recoveries, 0);
  });

  it("logs on each reduction", () => {
    const batch = create(20, 5);
    batch.onServerError();
    batch.onServerError();
    assert.equal(logFn.mock.callCount(), 2);
    assert.match(String(logFn.mock.calls[0].arguments[0]), /reduced from 20 to 10/);
    assert.match(String(logFn.mock.calls[1].arguments[0]), /reduced from 10 to 5/);
  });

  // ── Recovery ──────────────────────────────────────────────────────────

  it("recovers after 3 consecutive successes (default threshold)", () => {
    const batch = create(100, 5, 25);
    batch.onSuccess(); // 1
    batch.onSuccess(); // 2
    assert.equal(batch.size, 25, "should not recover yet");
    batch.onSuccess(); // 3 — triggers recovery
    assert.equal(batch.size, 50, "should grow by 25% of max (25)");
  });

  it("recovery step is 25% of max", () => {
    const batch = create(120, 5, 30);
    // 25% of 120 = 30
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 60, "30 + 30 = 60");
  });

  it("recovery caps at max", () => {
    const batch = create(100, 5, 90);
    // 25% of 100 = 25, but 90 + 25 = 115 > 100
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 100, "should cap at max");
  });

  it("no recovery when already at max", () => {
    const batch = create(50, 5);
    assert.equal(batch.size, 50); // already at max
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 50, "should stay at max");
    assert.equal(batch.summary().recoveries, 0, "no recovery counted");
    assert.equal(logFn.mock.callCount(), 0, "no log messages");
  });

  it("multiple recovery cycles back to max", () => {
    const batch = create(100, 5, 25);
    // Recovery 1: 25 → 50
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 50);
    // Recovery 2: 50 → 75
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 75);
    // Recovery 3: 75 → 100 (capped at max)
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 100);
    assert.equal(batch.summary().recoveries, 3);
  });

  it("custom recovery threshold", () => {
    const batch = create(100, 5, 25, 5);
    // Need 5 successes, not 3
    for (let i = 0; i < 4; i++) batch.onSuccess();
    assert.equal(batch.size, 25, "should not recover yet (4/5)");
    batch.onSuccess(); // 5th
    assert.equal(batch.size, 50, "should recover at threshold=5");
  });

  it("recovery threshold of 1 recovers on every success", () => {
    const batch = create(100, 5, 25, 1);
    batch.onSuccess();
    assert.equal(batch.size, 50);
    batch.onSuccess();
    assert.equal(batch.size, 75);
    batch.onSuccess();
    assert.equal(batch.size, 100);
  });

  it("logs on each recovery", () => {
    const batch = create(100, 5, 25);
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(logFn.mock.callCount(), 1);
    assert.match(String(logFn.mock.calls[0].arguments[0]), /recovered from 25 to 50/);
    assert.match(String(logFn.mock.calls[0].arguments[0]), /3 consecutive successes/);
  });

  it("summary tracks recoveries", () => {
    const batch = create(100, 5, 25);
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    const s = batch.summary();
    assert.equal(s.recoveries, 1);
    assert.equal(s.current, 50);
  });

  // ── Error-recovery oscillation ────────────────────────────────────────

  it("handles error → recover → error → recover pattern", () => {
    const batch = create(100, 5);
    // Start at max 100
    batch.onServerError(); // 50
    batch.onServerError(); // 25
    assert.equal(batch.size, 25);

    // Recover: 25 → 50
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 50);

    // Error again: 50 → 25
    batch.onServerError();
    assert.equal(batch.size, 25);
    assert.equal(batch.summary().reductions, 3);
    assert.equal(batch.summary().recoveries, 1);

    // Recover again: 25 → 50 → 75 → 100
    for (let i = 0; i < 9; i++) batch.onSuccess();
    assert.equal(batch.size, 100);
    assert.equal(batch.summary().recoveries, 4); // 1 original + 3 more
  });

  it("error at min followed by recovery", () => {
    const batch = create(20, 5);
    // Reduce to min
    batch.onServerError(); // 10
    batch.onServerError(); // 5 (min)
    batch.onServerError(); // no-op (already at min)
    assert.equal(batch.size, 5);

    // Recover from min: 5 → 10 (25% of 20 = 5)
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 10);

    // Recover more: 10 → 15
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 15);
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it("handles max=min (no room to reduce or recover)", () => {
    const batch = create(5, 5);
    batch.onServerError();
    assert.equal(batch.size, 5, "can't go below min");
    assert.equal(batch.summary().reductions, 0, "no reduction counted (already at min=max)");
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 5, "can't go above max");
    assert.equal(batch.summary().recoveries, 0);
  });

  it("recovery step is at least 1", () => {
    // 25% of 3 = 0.75, ceil → 1
    const batch = create(3, 1, 1);
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 2, "step of 1 from 1");
    batch.onSuccess();
    batch.onSuccess();
    batch.onSuccess();
    assert.equal(batch.size, 3, "step of 1 from 2, capped at max");
  });

  // ── Integration-style: realistic enrichment scenario ──────────────────

  it("simulates realistic enrichment: transient 500 → recovery → stable", () => {
    // Simulates the exact pattern from the user's logs:
    // Start at max 60, hit server errors, reduce to 15,
    // then recover gradually over many successful batches.
    const batch = create(60, 5);
    assert.equal(batch.size, 60);

    // Two transient 500s: 60 → 30 → 15
    batch.onServerError();
    batch.onServerError();
    assert.equal(batch.size, 15);

    // Many successful batches — should recover stepwise
    // Step = ceil(60 * 0.25) = 15
    // Recovery 1: 15 → 30 after 3 successes
    for (let i = 0; i < 3; i++) batch.onSuccess();
    assert.equal(batch.size, 30);

    // Recovery 2: 30 → 45 after 3 more successes
    for (let i = 0; i < 3; i++) batch.onSuccess();
    assert.equal(batch.size, 45);

    // Recovery 3: 45 → 60 (capped at max) after 3 more successes
    for (let i = 0; i < 3; i++) batch.onSuccess();
    assert.equal(batch.size, 60);

    assert.equal(batch.summary().reductions, 2);
    assert.equal(batch.summary().recoveries, 3);
  });

  it("simulates sporadic errors preventing full recovery", () => {
    // Error every ~5 batches — should partially recover then drop again,
    // finding a stable middle ground instead of staying at min.
    const batch = create(100, 5);

    // Initial error: 100 → 50
    batch.onServerError();
    assert.equal(batch.size, 50);

    // 4 successes, then error (streak broken at 4, never hits threshold of 3... wait)
    // Actually 3 successes triggers recovery, then 1 more success, then error
    batch.onSuccess(); // streak=1
    batch.onSuccess(); // streak=2
    batch.onSuccess(); // streak=3 → recover 50 → 75
    assert.equal(batch.size, 75);
    batch.onSuccess(); // streak=1 (reset after recovery since current < max? No — current=75 < max=100)
    // Actually after recovery, consecutiveSuccesses is reset to 0, so this is streak=1
    batch.onServerError(); // 75 → 37, streak=0
    assert.equal(batch.size, 37);

    // Another 3 successes: recover 37 → 62
    for (let i = 0; i < 3; i++) batch.onSuccess();
    assert.equal(batch.size, 62);

    // The batch oscillates around a stable range instead of being stuck at 5
    assert.ok(batch.size > 30, "should maintain reasonable size despite sporadic errors");
  });
});
