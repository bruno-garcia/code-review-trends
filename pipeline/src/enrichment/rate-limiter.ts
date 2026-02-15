/**
 * GitHub API rate limiter.
 *
 * Tracks rate-limit headers from GitHub responses and pauses requests
 * when the remaining quota drops below a safety threshold.
 */

export class RateLimiter {
  private remaining: number = 5000;
  private resetAt: Date = new Date(0);
  private readonly minRemaining: number;

  constructor(minRemaining: number = 100) {
    this.minRemaining = minRemaining;
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

    const now = Date.now();
    const waitMs = Math.max(0, this.resetAt.getTime() - now) + 1000; // 1s buffer

    console.log(
      `[rate-limiter] Throttled: ${this.remaining} remaining, waiting ${Math.ceil(waitMs / 1000)}s until reset`,
    );

    await sleep(waitMs);

    console.log(`[rate-limiter] Resuming after ${Math.ceil(waitMs / 1000)}s`);
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

    console.log(
      `[rate-limiter] Secondary rate limit hit (attempt ${attempt + 1}), waiting ${Math.ceil(waitMs / 1000)}s`,
    );

    await sleep(waitMs);

    console.log(
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
