/**
 * Adaptive batch sizing for GraphQL enrichment requests.
 *
 * Starts at `max` and halves on server errors (floor at `min`).
 * Grows back gradually after consecutive successes so transient
 * errors cause a temporary dip, not a permanent reduction.
 */

import * as Sentry from "@sentry/node";

export interface AdaptiveBatchOptions {
  max: number;
  min: number;
  initial?: number;
  /**
   * Number of consecutive successes required before growing back.
   * Default: 3 — a short streak of good batches proves the larger
   * size is safe, without oscillating on sporadic errors.
   */
  recoveryThreshold?: number;
}

export interface AdaptiveBatchSummary {
  current: number;
  max: number;
  min: number;
  reductions: number;
  recoveries: number;
}

/** Log function signature — defaults to Sentry.logger.warn. */
type LogFn = (msg: string) => void;

export class AdaptiveBatch {
  private current: number;
  private readonly max: number;
  private readonly min: number;
  private readonly recoveryThreshold: number;
  private reductions = 0;
  private recoveries = 0;
  private consecutiveSuccesses = 0;
  private readonly log: LogFn;

  constructor(
    { max, min, initial, recoveryThreshold }: AdaptiveBatchOptions,
    log?: LogFn,
  ) {
    this.max = max;
    this.min = min;
    this.current = initial ?? max;
    this.recoveryThreshold = recoveryThreshold ?? 3;
    this.log = log ?? ((msg: string) => Sentry.logger.warn(Sentry.logger.fmt`${msg}`));
  }

  get size(): number {
    return this.current;
  }

  get minSize(): number {
    return this.min;
  }

  /**
   * Record a successful batch. After `recoveryThreshold` consecutive
   * successes, grow the batch size by 25% of max (capped at max).
   * This allows gradual recovery from transient server errors without
   * oscillating — a bad batch resets the streak to zero.
   */
  onSuccess(): void {
    if (this.current >= this.max) {
      // Already at max — no recovery needed, but keep tracking for streak reset on error
      this.consecutiveSuccesses = 0;
      return;
    }
    this.consecutiveSuccesses++;
    if (this.consecutiveSuccesses >= this.recoveryThreshold) {
      const previous = this.current;
      // Grow by 25% of max, capped at max
      const step = Math.max(1, Math.ceil(this.max * 0.25));
      this.current = Math.min(this.max, this.current + step);
      this.consecutiveSuccesses = 0;
      if (this.current > previous) {
        this.recoveries++;
        this.log(`Adaptive batch recovered from ${previous} to ${this.current} after ${this.recoveryThreshold} consecutive successes (recovery #${this.recoveries})`);
      }
    }
  }

  onServerError(): void {
    const previous = this.current;
    const newSize = Math.max(this.min, Math.floor(this.current / 2));
    // Reset consecutive successes — the error breaks the streak
    this.consecutiveSuccesses = 0;

    if (newSize < previous) {
      this.current = newSize;
      this.reductions++;
      this.log(`Adaptive batch reduced from ${previous} to ${this.current} (reduction #${this.reductions})`);
    }
  }

  summary(): AdaptiveBatchSummary {
    return {
      current: this.current,
      max: this.max,
      min: this.min,
      reductions: this.reductions,
      recoveries: this.recoveries,
    };
  }
}
