/**
 * GitHub API rate limiter.
 *
 * Tracks rate-limit headers from GitHub responses and pauses requests
 * when the remaining quota drops below a safety threshold.
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

export class RateLimiter {
  private remaining: number = 5000;
  private resetAt: Date = new Date(0);
  private readonly minRemaining: number;
  private readonly exitOnRateLimit: boolean;

  // Accumulated metrics
  private _totalWaitMs: number = 0;
  private _waitCount: number = 0;
  private _secondaryHits: number = 0;

  constructor(minRemaining: number = 100, exitOnRateLimit: boolean = false) {
    this.minRemaining = minRemaining;
    this.exitOnRateLimit = exitOnRateLimit;
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

  /** Wait if rate limit is low. Returns ms waited (0 if no wait needed). */
  async waitIfNeeded(): Promise<number> {
    if (this.remaining >= this.minRemaining) {
      return 0;
    }

    if (this.exitOnRateLimit) {
      throw new RateLimitExitError(this.remaining, this.resetAt);
    }

    const now = Date.now();
    const waitMs = Math.max(0, this.resetAt.getTime() - now) + 1000; // 1s buffer

    log(
      `[rate-limiter] Throttled: ${this.remaining} remaining, waiting ${Math.ceil(waitMs / 1000)}s until reset`,
    );
    sentryLogger.warn(sentryLogger.fmt`Rate limit throttle remaining=${this.remaining} waitMs=${waitMs}`);

    await sleep(waitMs);

    // Track metrics
    this._totalWaitMs += waitMs;
    this._waitCount++;
    distributionMetric("pipeline.ratelimit.wait", waitMs, "millisecond", { trigger: "primary" });
    countMetric("pipeline.ratelimit.pauses", 1, { trigger: "primary" });

    // Reset remaining so we don't immediately throttle again
    this.remaining = this.minRemaining;

    log(`[rate-limiter] Resuming after ${Math.ceil(waitMs / 1000)}s`);
    return waitMs;
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

    await sleep(waitMs);

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
  waitSummary(): { totalWaitMs: number; waitCount: number; secondaryHits: number } {
    return {
      totalWaitMs: this._totalWaitMs,
      waitCount: this._waitCount,
      secondaryHits: this._secondaryHits,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
