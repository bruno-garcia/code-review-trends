/**
 * Adaptive batch sizing for GraphQL enrichment requests.
 *
 * Starts at `max` and halves on server errors (floor at `min`).
 * Never grows back automatically — manual restart resets to max.
 */

import * as Sentry from "@sentry/node";

export interface AdaptiveBatchOptions {
  max: number;
  min: number;
  initial?: number;
}

export interface AdaptiveBatchSummary {
  current: number;
  max: number;
  min: number;
  reductions: number;
}

/** Log function signature — defaults to Sentry.logger.warn. */
type LogFn = (msg: string) => void;

export class AdaptiveBatch {
  private current: number;
  private readonly max: number;
  private readonly min: number;
  private reductions = 0;
  private readonly log: LogFn;

  constructor(
    { max, min, initial }: AdaptiveBatchOptions,
    log?: LogFn,
  ) {
    this.max = max;
    this.min = min;
    this.current = initial ?? max;
    this.log = log ?? ((msg: string) => Sentry.logger.warn(Sentry.logger.fmt`${msg}`));
  }

  get size(): number {
    return this.current;
  }

  get minSize(): number {
    return this.min;
  }

  onSuccess(): void {
    // No-op — don't grow back automatically.
  }

  onServerError(): void {
    const previous = this.current;
    const newSize = Math.max(this.min, Math.floor(this.current / 2));

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
    };
  }
}
