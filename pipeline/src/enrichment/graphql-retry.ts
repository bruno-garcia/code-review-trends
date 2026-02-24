/**
 * Shared retry logic for GraphQL requests.
 *
 * Wraps Octokit requests with exponential backoff for transient network
 * errors (ECONNRESET, ETIMEDOUT, etc.) that occur when idle keep-alive
 * connections are reset by GitHub's load balancers during rate-limit waits.
 *
 * Also enforces a total response timeout via AbortController. GitHub's
 * GraphQL API can stream responses slowly enough to keep the socket alive
 * (defeating idle timeouts) while taking 10–36+ minutes to complete.
 * The AbortController kills these hung requests so they can be retried
 * with a smaller batch.
 *
 * Non-transient errors (GraphQL errors, rate limits, etc.) are thrown
 * immediately for module-specific error handlers.
 *
 * Each retry attempt creates a Sentry span, and transient retries are
 * recorded via breadcrumbs + counter metrics for observability.
 */

import type { Octokit } from "@octokit/rest";
import { Sentry, log, countMetric, sentryLogger } from "../sentry.js";

const MAX_RETRIES = 3;

/**
 * Total response timeout in milliseconds. If a single GraphQL request
 * takes longer than this (wall clock), it's aborted and retried.
 *
 * Set generously: most queries complete in 1–10s. The 60s limit catches
 * hung requests that would otherwise block for 10–36+ minutes.
 */
export const RESPONSE_TIMEOUT_MS = 60_000;

export const TRANSIENT_ERROR_PATTERNS = [
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "socket hang up",
];

export function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => msg.includes(pattern));
}

const SERVER_ERROR_STATUSES = [502, 503];
const SERVER_ERROR_MESSAGE_PATTERNS = ["<html>", "<!doctype", "bad gateway", "service unavailable"];

export function isServerError(err: unknown): boolean {
  if (isAbortError(err)) return true;
  if (err && typeof err === "object") {
    const status = (err as Record<string, unknown>).status ??
      ((err as Record<string, unknown>).response as Record<string, unknown> | undefined)?.status;
    if (typeof status === "number" && SERVER_ERROR_STATUSES.includes(status)) return true;
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return SERVER_ERROR_MESSAGE_PATTERNS.some((pattern) => msg.includes(pattern));
}

/**
 * Detect AbortController timeout errors. These occur when our response
 * timeout fires because GitHub is streaming the response too slowly.
 * Treated as server errors so callers reduce batch size and retry.
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err && typeof err === "object" && "name" in err &&
      (err as { name: string }).name === "AbortError") return true;
  if (err instanceof Error && err.message.includes("aborted")) return true;
  return false;
}

export function isRetryableError(err: unknown): boolean {
  return isTransientNetworkError(err) || isServerError(err);
}

/**
 * Clean up error messages for logging. GitHub 502/503 responses often
 * contain full HTML pages with \r carriage returns that garble log output.
 */
function sanitizeErrorMessage(msg: string): string {
  // Strip HTML tags, collapse whitespace, remove carriage returns
  const cleaned = msg.replace(/<[^>]*>/g, " ").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  // Truncate to something readable
  return cleaned.length > 120 ? cleaned.slice(0, 120) + "…" : cleaned;
}

export type GraphQLResponse = {
  data: {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
  };
  headers: Record<string, string>;
};

/**
 * Execute a GraphQL request with retry for transient network errors.
 * Returns the raw Octokit response on success, throws on failure.
 *
 * Each attempt is wrapped in a Sentry span. Transient retries add
 * breadcrumbs and increment the `pipeline.graphql.retry` counter metric.
 */
export async function graphqlWithRetry(
  octokit: Octokit,
  query: string,
  label: string,
  timeoutMs: number = RESPONSE_TIMEOUT_MS,
): Promise<GraphQLResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Create per-attempt AbortController with total response timeout.
    // This catches hung requests where GitHub streams data slowly enough
    // to keep the socket alive but takes 10–36+ minutes to finish.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await Sentry.startSpan(
        {
          op: "http.client",
          name: `graphql ${label}`,
          attributes: {
            "graphql.label": label,
            "graphql.attempt": attempt + 1,
            "graphql.timeout_ms": timeoutMs,
            ...(attempt > 0 ? { "graphql.retry": true } : {}),
          },
        },
        async (span) => {
          try {
            const res = await octokit.request("POST /graphql", {
              query,
              request: { signal: controller.signal },
            });
            span.setStatus({ code: 1 }); // OK
            return res;
          } catch (err) {
            const statusMsg = isAbortError(err)
              ? `timeout after ${timeoutMs}ms`
              : (err instanceof Error ? err.message.split("\n")[0] : "unknown");
            span.setStatus({ code: 2, message: statusMsg });
            throw err;
          }
        },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return response as any;
    } catch (err: unknown) {
      lastError = err;

      if (isRetryableError(err) && attempt < MAX_RETRIES - 1) {
        const backoffMs = Math.min(1000 * 2 ** attempt, 5000);
        const isTimeout = isAbortError(err);
        const errMsg = isTimeout
          ? `Response timeout (${timeoutMs}ms)`
          : sanitizeErrorMessage(err instanceof Error ? err.message : String(err));

        // Log + breadcrumb + metric for visibility into retry behavior
        log(`[${label}] ${isTimeout ? "Response timeout" : "Transient network error"} (${errMsg}), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        sentryLogger.warn(sentryLogger.fmt`GraphQL retry label=${label} attempt=${attempt + 1} error=${errMsg} backoffMs=${backoffMs}`);
        Sentry.addBreadcrumb({
          category: "graphql.retry",
          message: `${label}: ${errMsg}`,
          level: "warning",
          data: { attempt: attempt + 1, backoffMs, label, isTimeout },
        });
        countMetric("pipeline.graphql.retry", 1, {
          label,
          error: isTimeout ? "timeout" : errMsg.split(" ")[0],
        });

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      // Exhausted retries — report to Sentry before throwing
      if (isRetryableError(err) && attempt === MAX_RETRIES - 1) {
        Sentry.captureException(err, {
          tags: { graphql_exhausted: "true", label },
          fingerprint: ["graphql-exhausted", label],
        });
        Sentry.logger.error(
          Sentry.logger.fmt`GraphQL retries exhausted for ${label} after ${MAX_RETRIES} attempts`,
        );
      }

      // Non-retryable or exhausted retries — throw for module-specific handling
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Should be unreachable, but TypeScript needs it
  throw lastError;
}
