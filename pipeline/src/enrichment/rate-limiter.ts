/**
 * GitHub API rate limiter.
 *
 * Tracks rate-limit headers from GitHub responses and:
 * 1. **Paces requests** — spreads API calls evenly across the rate limit
 *    window to maintain continuous throughput instead of burst-then-wait.
 * 2. **Hard stops** — pauses when the remaining quota drops below a safety
 *    threshold, waiting for the window to reset.
 *
 * Pacing ensures workers with different tokens stay out of phase:
 * while one approaches its limit and slows down, others with more budget
 * continue at higher rates. The staggered starts from workers.sh amplify
 * this effect — there's always at least some workers making progress.
 *
 * Also accumulates wait-time metrics so callers can understand how much
 * time is spent blocked on rate limits vs doing real work.
 */

import { log, distributionMetric, countMetric, sentryLogger } from "../sentry.js";

/**
 * Thrown when `exitOnRateLimit` is enabled and the rate limit threshold is hit.
 * The worker should catch this and return partial results gracefully (exit 0).
 */
export class RateLimitExitError extends Error {
  constructor(remaining: number, resetAt: Date) {
    const resetIn = Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
    super(
      `Rate limit reached (${remaining} remaining, resets in ${resetIn}s). Exiting instead of waiting.`,
    );
    this.name = "RateLimitExitError";
  }
}

/** Options to inject a custom sleep for testing. */
export interface RateLimiterOptions {
  minRemaining?: number;
  exitOnRateLimit?: boolean;
  /** Override the sleep function (for testing). Default: real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export class RateLimiter {
  private remaining: number = 5000;
  private resetAt: Date = new Date(0);
  private readonly minRemaining: number;
  private readonly exitOnRateLimit: boolean;
  private lastRequestAt: number = 0;
  private readonly _sleep: (ms: number) => Promise<void>;

  // Accumulated metrics
  private _totalWaitMs: number = 0;
  private _waitCount: number = 0;
  private _secondaryHits: number = 0;
  private _totalPacingMs: number = 0;
  private _pacingCount: number = 0;

  constructor(minRemaining?: number, exitOnRateLimit?: boolean);
  constructor(options: RateLimiterOptions);
  constructor(
    minRemainingOrOptions: number | RateLimiterOptions = 100,
    exitOnRateLimit: boolean = false,
  ) {
    if (typeof minRemainingOrOptions === "object") {
      this.minRemaining = minRemainingOrOptions.minRemaining ?? 100;
      this.exitOnRateLimit = minRemainingOrOptions.exitOnRateLimit ?? false;
      this._sleep = minRemainingOrOptions.sleep ?? defaultSleep;
    } else {
      this.minRemaining = minRemainingOrOptions ?? 100;
      this.exitOnRateLimit = exitOnRateLimit ?? false;
      this._sleep = defaultSleep;
    }
  }

  /** Update state from GitHub response headers. */
  update(headers: {
    "x-ratelimit-remaining"?: string;
    "x-ratelimit-reset"?: string;
  }): void {
    if (headers["x-ratelimit-remaining"] !== undefined) {
      this.remaining = parseInt(headers["x-ratelimit-remaining"], 10);
    }
    if (headers["x-ratelimit-reset"] !== undefined) {
      this.resetAt = new Date(
        parseInt(headers["x-ratelimit-reset"], 10) * 1000,
      );
    }
  }

  /**
   * Calculate the ideal delay to pace requests across the rate limit window.
   *
   * Pure calculation — no side effects, no sleeping. Exported for testing.
   *
   * @param now - current timestamp in ms (default: Date.now())
   * @returns milliseconds to wait before the next request
   */
  pacingDelay(now?: number): number {
    const ts = now ?? Date.now();
    const msUntilReset = this.resetAt.getTime() - ts;

    // No pacing if no valid rate limit data (first request or window expired)
    if (msUntilReset <= 0) return 0;

    const usableBudget = this.remaining - this.minRemaining;
    if (usableBudget <= 0) return 0;

    // Ideal interval: spread remaining budget evenly over the window
    const intervalMs = msUntilReset / usableBudget;

    // Time since last request — if never called, treat as "long enough"
    const elapsed = this.lastRequestAt > 0 ? ts - this.lastRequestAt : Infinity;

    return Math.max(0, intervalMs - elapsed);
  }

  /**
   * Wait if needed before making an API request.
   *
   * First checks the hard stop (remaining < minRemaining), then applies
   * pacing to spread requests across the rate limit window.
   *
   * Returns total ms waited (0 if no wait needed).
   */
  async waitIfNeeded(): Promise<number> {
    // Hard stop: if below minimum threshold, wait for full reset
    if (this.remaining < this.minRemaining) {
      if (this.exitOnRateLimit) {
        throw new RateLimitExitError(this.remaining, this.resetAt);
      }

      const now = Date.now();
      const waitMs = Math.max(0, this.resetAt.getTime() - now) + 1000; // 1s buffer

      log(
        `[rate-limiter] Throttled: ${this.remaining} remaining, waiting ${Math.ceil(waitMs / 1000)}s until reset`,
      );
      sentryLogger.warn(sentryLogger.fmt`Rate limit throttle remaining=${this.remaining} waitMs=${waitMs}`);

      await this._sleep(waitMs);

      // Track metrics
      this._totalWaitMs += waitMs;
      this._waitCount++;
      distributionMetric("pipeline.ratelimit.wait", waitMs, "millisecond", { trigger: "primary" });
      countMetric("pipeline.ratelimit.pauses", 1, { trigger: "primary" });

      // Reset remaining so we don't immediately throttle again
      this.remaining = this.minRemaining;

      log(`[rate-limiter] Resuming after ${Math.ceil(waitMs / 1000)}s`);
      this.lastRequestAt = Date.now();
      return waitMs;
    }

    // Pacing: spread requests evenly across the rate limit window.
    // Skip pacing in exitOnRateLimit mode — those workers should go
    // as fast as possible within their limited runtime.
    let pacedMs = 0;
    if (!this.exitOnRateLimit) {
      const pacingMs = this.pacingDelay();
      if (pacingMs > 10) {
        await this._sleep(pacingMs);
        this._totalPacingMs += pacingMs;
        this._pacingCount++;
        pacedMs = pacingMs;
      }
    }

    this.lastRequestAt = Date.now();
    return pacedMs;
  }

  /**
   * Handle a 403 or 429 response with retry-after.
   * Sleeps for the specified duration plus exponential backoff.
   * Returns ms waited.
   */
  async handleRetryAfter(
    retryAfterSeconds: number,
    attempt: number = 0,
  ): Promise<number> {
    const backoffMs = Math.min(1000 * 2 ** attempt, 60_000);
    const waitMs = retryAfterSeconds * 1000 + backoffMs;

    log(
      `[rate-limiter] Secondary rate limit hit (attempt ${attempt + 1}), waiting ${Math.ceil(waitMs / 1000)}s`,
    );
    sentryLogger.warn(sentryLogger.fmt`Secondary rate limit hit attempt=${attempt + 1} waitMs=${waitMs}`);

    await this._sleep(waitMs);

    // Track metrics
    this._totalWaitMs += waitMs;
    this._waitCount++;
    this._secondaryHits++;
    distributionMetric("pipeline.ratelimit.wait", waitMs, "millisecond", { trigger: "secondary" });
    countMetric("pipeline.ratelimit.pauses", 1, { trigger: "secondary" });

    log(
      `[rate-limiter] Resuming after secondary rate limit pause`,
    );
    return waitMs;
  }

  /** Get current state for logging. */
  status(): { remaining: number; resetAt: Date; isThrottled: boolean } {
    return {
      remaining: this.remaining,
      resetAt: this.resetAt,
      isThrottled: this.remaining < this.minRemaining,
    };
  }

  /** Accumulated rate-limit wait summary for the lifetime of this instance. */
  waitSummary(): {
    totalWaitMs: number;
    waitCount: number;
    secondaryHits: number;
    totalPacingMs: number;
    pacingCount: number;
  } {
    return {
      totalWaitMs: this._totalWaitMs,
      waitCount: this._waitCount,
      secondaryHits: this._secondaryHits,
      totalPacingMs: this._totalPacingMs,
      pacingCount: this._pacingCount,
    };
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
