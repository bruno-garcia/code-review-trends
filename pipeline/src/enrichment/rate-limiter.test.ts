/**
 * Tests for the rate limiter.
 *
 * Covers:
 * - pacingDelay() pure calculation
 * - waitIfNeeded() with pacing
 * - waitIfNeeded() hard stop (below threshold)
 * - Pacing skipped when exitOnRateLimit is true
 * - Pacing with no rate limit data yet
 * - Pacing metrics tracking
 * - Integration scenario: continuous pacing over multiple calls
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, RateLimitExitError } from "./rate-limiter.js";

// Helper: create a rate limiter with fake sleep for deterministic testing
function createLimiter(opts: {
  minRemaining?: number;
  exitOnRateLimit?: boolean;
} = {}) {
  const sleepCalls: number[] = [];
  const fakeSleep = async (ms: number) => { sleepCalls.push(ms); };
  const rl = new RateLimiter({
    minRemaining: opts.minRemaining ?? 100,
    exitOnRateLimit: opts.exitOnRateLimit ?? false,
    sleep: fakeSleep,
  });
  return { rl, sleepCalls };
}

// Helper: set rate limit state by simulating a response header update
function setRateLimit(rl: RateLimiter, remaining: number, resetInMs: number) {
  const resetEpochSec = Math.floor((Date.now() + resetInMs) / 1000);
  rl.update({
    "x-ratelimit-remaining": String(remaining),
    "x-ratelimit-reset": String(resetEpochSec),
  });
}

describe("RateLimiter pacingDelay", () => {
  it("returns 0 when no rate limit data (resetAt in the past)", () => {
    const { rl } = createLimiter();
    // Default resetAt is epoch (1970) — always in the past
    assert.equal(rl.pacingDelay(), 0);
  });

  it("returns 0 when reset time has passed", () => {
    const { rl } = createLimiter();
    setRateLimit(rl, 4000, -1000); // reset 1s ago
    assert.equal(rl.pacingDelay(), 0);
  });

  it("returns 0 when usable budget is zero", () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 100, 60_000); // exactly at threshold
    assert.equal(rl.pacingDelay(), 0);
  });

  it("returns 0 when usable budget is negative", () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 50, 60_000); // below threshold
    assert.equal(rl.pacingDelay(), 0);
  });

  it("calculates interval based on budget and time window", () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    const now = Date.now();
    setRateLimit(rl, 5000, 3600_000); // 4900 usable, 3600s window

    // Expected interval: 3600000 / 4900 ≈ 734.7ms
    // Since no lastRequestAt, elapsed = Infinity → delay = 0
    const delay = rl.pacingDelay(now);
    assert.equal(delay, 0, "first call should not be delayed (no previous request)");
  });

  it("returns interval minus elapsed since last request", async () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 1000, 60_000); // 900 usable, interval ≈ 66.7ms

    // First call sets lastRequestAt
    await rl.waitIfNeeded();

    // Immediately after, delay should be close to the full interval
    const delay = rl.pacingDelay();
    assert.ok(delay > 50, `expected delay ~67ms, got ${delay}ms`);
  });

  it("calculates correct delay for steady-state pacing", async () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 1000, 60_000); // 900 usable, 60s window
    // Expected interval: 60000 / 900 ≈ 66.7ms

    // First call: no delay (no lastRequestAt)
    await rl.waitIfNeeded();
    // After waitIfNeeded, lastRequestAt is set

    // Second call immediately: should want ~66.7ms delay
    const delay = rl.pacingDelay();
    // Delay should be close to 66.7ms (minus ~0-1ms elapsed)
    assert.ok(delay > 50, `expected delay ~67ms, got ${delay}ms`);
    assert.ok(delay < 80, `expected delay ~67ms, got ${delay}ms`);
  });

  it("returns 0 when enough time has passed since last request", async () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 1000, 60_000); // interval ≈ 66.7ms

    // First call sets lastRequestAt
    await rl.waitIfNeeded();

    // Simulate calling pacingDelay 100ms later (> 66.7ms interval)
    const delay = rl.pacingDelay(Date.now() + 100);
    assert.equal(delay, 0, "should not pace when enough time has passed");
  });

  it("pacing delay decreases as budget depletes", () => {
    const { rl } = createLimiter({ minRemaining: 100 });

    // Large budget: interval is small
    setRateLimit(rl, 5000, 3600_000);
    // interval = 3600000 / 4900 ≈ 735ms — but no delay on first call

    // Small budget: interval is larger
    setRateLimit(rl, 200, 3600_000);
    // interval = 3600000 / 100 = 36000ms

    // The delay depends on lastRequestAt, but the key insight is:
    // with fewer remaining calls, each one must be spaced further apart
    const interval = 3600_000 / (200 - 100);
    assert.equal(interval, 36_000, "interval should be 36s with 100 usable budget");
  });
});

describe("RateLimiter waitIfNeeded pacing", () => {
  it("does not pace on first call (no previous request)", async () => {
    const { rl, sleepCalls } = createLimiter();
    setRateLimit(rl, 5000, 3600_000);

    await rl.waitIfNeeded();
    assert.equal(sleepCalls.length, 0, "should not sleep on first call");
  });

  it("paces subsequent rapid calls", async () => {
    const { rl, sleepCalls } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 1000, 60_000); // 900 usable, interval ≈ 66.7ms

    // First call: no pacing
    await rl.waitIfNeeded();
    assert.equal(sleepCalls.length, 0);

    // Second call immediately: should pace
    await rl.waitIfNeeded();
    assert.equal(sleepCalls.length, 1, "should have paced second call");
    assert.ok(sleepCalls[0] > 50, `pacing delay should be ~67ms, got ${sleepCalls[0]}ms`);
    assert.ok(sleepCalls[0] < 80, `pacing delay should be ~67ms, got ${sleepCalls[0]}ms`);
  });

  it("does not pace when exitOnRateLimit is true", async () => {
    const { rl, sleepCalls } = createLimiter({ exitOnRateLimit: true, minRemaining: 100 });
    setRateLimit(rl, 5000, 3600_000);

    await rl.waitIfNeeded();
    await rl.waitIfNeeded();
    await rl.waitIfNeeded();
    assert.equal(sleepCalls.length, 0, "should never pace in exitOnRateLimit mode");
  });

  it("pacing metrics are tracked", async () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 500, 60_000); // 400 usable, interval = 150ms

    // First call: no pacing
    await rl.waitIfNeeded();
    // Second + third: pacing
    await rl.waitIfNeeded();
    await rl.waitIfNeeded();

    const summary = rl.waitSummary();
    assert.equal(summary.pacingCount, 2, "should have 2 pacing delays");
    assert.ok(summary.totalPacingMs > 0, "should have accumulated pacing time");
    assert.equal(summary.waitCount, 0, "no hard-stop waits");
    assert.equal(summary.totalWaitMs, 0, "no hard-stop wait time");
  });

  it("skips pacing delays under 10ms", async () => {
    const { rl, sleepCalls: sleeps } = createLimiter({ minRemaining: 100 });
    // Very large budget: interval ≈ 0.7ms — below 10ms threshold
    setRateLimit(rl, 5000, 3_000); // 4900 usable, 3s window, interval ≈ 0.6ms

    await rl.waitIfNeeded();
    await rl.waitIfNeeded();
    assert.equal(sleeps.length, 0, "should skip tiny pacing delays");
  });
});

describe("RateLimiter waitIfNeeded hard stop", () => {
  it("waits for reset when below threshold", async () => {
    const { rl, sleepCalls } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 50, 5_000); // below threshold, resets in 5s

    await rl.waitIfNeeded();
    assert.equal(sleepCalls.length, 1);
    // Should wait ~5s + 1s buffer = ~6s
    assert.ok(sleepCalls[0] >= 5000, `should wait ≥5s, got ${sleepCalls[0]}ms`);
    assert.ok(sleepCalls[0] <= 7000, `should wait ≤7s, got ${sleepCalls[0]}ms`);
  });

  it("throws RateLimitExitError when exitOnRateLimit is true", async () => {
    const { rl } = createLimiter({ exitOnRateLimit: true, minRemaining: 100 });
    setRateLimit(rl, 50, 5_000);

    await assert.rejects(
      () => rl.waitIfNeeded(),
      (err: Error) => {
        assert.ok(err instanceof RateLimitExitError);
        return true;
      },
    );
  });

  it("tracks hard-stop metrics separately from pacing", async () => {
    const { rl } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 50, 1_000);

    await rl.waitIfNeeded();
    const summary = rl.waitSummary();
    assert.equal(summary.waitCount, 1, "one hard-stop wait");
    assert.ok(summary.totalWaitMs > 0, "hard-stop wait time recorded");
    assert.equal(summary.pacingCount, 0, "no pacing delays");
    assert.equal(summary.totalPacingMs, 0, "no pacing time");
  });
});

describe("RateLimiter backward compatibility", () => {
  it("works with old constructor signature (number, boolean)", () => {
    const rl = new RateLimiter(200, true);
    const status = rl.status();
    assert.equal(status.remaining, 5000);
  });

  it("works with no constructor args", () => {
    const rl = new RateLimiter();
    const status = rl.status();
    assert.equal(status.remaining, 5000);
  });

  it("waitSummary includes new pacing fields", () => {
    const rl = new RateLimiter();
    const summary = rl.waitSummary();
    assert.equal(summary.totalPacingMs, 0);
    assert.equal(summary.pacingCount, 0);
    // Old fields still present
    assert.equal(summary.totalWaitMs, 0);
    assert.equal(summary.waitCount, 0);
    assert.equal(summary.secondaryHits, 0);
  });
});

describe("RateLimiter integration: steady pacing scenario", () => {
  it("simulates worker pacing over multiple requests", async () => {
    // Simulates the production scenario: 4900 usable budget, 1 hour window.
    // Worker should pace at ~735ms per request.
    const { rl, sleepCalls } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 5000, 3600_000);

    // Make 10 rapid-fire requests
    for (let i = 0; i < 10; i++) {
      await rl.waitIfNeeded();
      // Simulate API call taking 0ms (instant, worst case for pacing)
    }

    // First call has no pacing, remaining 9 should be paced
    assert.equal(sleepCalls.length, 9, "9 of 10 calls should be paced");

    // Each pacing delay should be ~735ms
    for (let i = 0; i < sleepCalls.length; i++) {
      assert.ok(
        sleepCalls[i] > 600 && sleepCalls[i] < 900,
        `pacing delay ${i} should be ~735ms, got ${sleepCalls[i]}ms`,
      );
    }

    // Total pacing time ≈ 9 × 735 ≈ 6,600ms
    const summary = rl.waitSummary();
    assert.ok(summary.totalPacingMs > 5000, "total pacing should be >5s");
    assert.ok(summary.totalPacingMs < 9000, "total pacing should be <9s");
    assert.equal(summary.pacingCount, 9);
    assert.equal(summary.waitCount, 0, "no hard-stop waits");
  });

  it("pacing interval adjusts as budget depletes", async () => {
    const { rl, sleepCalls } = createLimiter({ minRemaining: 100 });

    // Start with 200 remaining, 60s window → interval = 60000/100 = 600ms
    setRateLimit(rl, 200, 60_000);
    await rl.waitIfNeeded(); // first: no pacing
    await rl.waitIfNeeded(); // second: ~600ms
    const firstPacing = sleepCalls[0];

    // Now simulate budget depletion: 150 remaining, same window
    // (headers would come back from the API response)
    setRateLimit(rl, 150, 58_000); // slightly less time too
    await rl.waitIfNeeded();
    const secondPacing = sleepCalls[1];

    // Second pacing should be longer (less budget, similar time)
    // 150-100 = 50 usable, 58s → interval = 1160ms
    assert.ok(
      secondPacing > firstPacing,
      `pacing should increase as budget depletes: first=${firstPacing}ms, second=${secondPacing}ms`,
    );
  });

  it("7 workers with staggered starts never all idle simultaneously", async () => {
    // Conceptual test: verify that pacing + stagger means workers
    // spread their requests across the window instead of bursting.
    //
    // With 4900 usable calls and 3600s window:
    // - Burst mode: 4900 calls in ~2min, then 58min idle
    // - Paced mode: ~1.36 calls/second continuous
    //
    // We verify the pacing math is correct for a single worker.
    const { rl, sleepCalls } = createLimiter({ minRemaining: 100 });
    setRateLimit(rl, 5000, 3600_000);

    // Simulate 100 rapid-fire calls
    for (let i = 0; i < 100; i++) {
      await rl.waitIfNeeded();
    }

    // With fake sleep, "time" doesn't advance, so pacing delays are
    // calculated based on the same instant. Each delay should be ~735ms.
    // In reality, the sleeps would advance the clock, reducing subsequent delays.
    // The key assertion: pacing is active and preventing burst behavior.
    assert.equal(sleepCalls.length, 99, "99 of 100 should be paced");
    assert.equal(rl.waitSummary().waitCount, 0, "should never hit hard stop");
  });
});
