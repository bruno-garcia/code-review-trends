/**
 * Shared retry logic for GraphQL requests.
 *
 * Wraps Octokit requests with exponential backoff for transient network
 * errors (ECONNRESET, ETIMEDOUT, etc.) that occur when idle keep-alive
 * connections are reset by GitHub's load balancers during rate-limit waits.
 *
 * Non-transient errors (GraphQL errors, rate limits, etc.) are thrown
 * immediately for module-specific error handlers.
 *
 * Each retry attempt creates a Sentry span, and transient retries are
 * recorded via breadcrumbs + counter metrics for observability.
 */

import type { Octokit } from "@octokit/rest";
import { Sentry, log, countMetric } from "../sentry.js";

const MAX_RETRIES = 3;

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
  if (err && typeof err === "object") {
    const status = (err as Record<string, unknown>).status ??
      ((err as Record<string, unknown>).response as Record<string, unknown> | undefined)?.status;
    if (typeof status === "number" && SERVER_ERROR_STATUSES.includes(status)) return true;
  }
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return SERVER_ERROR_MESSAGE_PATTERNS.some((pattern) => msg.includes(pattern));
}

export function isRetryableError(err: unknown): boolean {
  return isTransientNetworkError(err) || isServerError(err);
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
): Promise<GraphQLResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await Sentry.startSpan(
        {
          op: "http.client",
          name: `graphql ${label}`,
          attributes: {
            "graphql.label": label,
            "graphql.attempt": attempt + 1,
            ...(attempt > 0 ? { "graphql.retry": true } : {}),
          },
        },
        async (span) => {
          try {
            const res = await octokit.request("POST /graphql", { query });
            span.setStatus({ code: 1 }); // OK
            return res;
          } catch (err) {
            span.setStatus({ code: 2, message: err instanceof Error ? err.message.split("\n")[0] : "unknown" }); // ERROR
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
        const errMsg = err instanceof Error ? err.message.split("\n")[0] : String(err);

        // Log + breadcrumb + metric for visibility into retry behavior
        log(`[${label}] Transient network error (${errMsg}), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        Sentry.addBreadcrumb({
          category: "graphql.retry",
          message: `${label}: ${errMsg}`,
          level: "warning",
          data: { attempt: attempt + 1, backoffMs, label },
        });
        countMetric("pipeline.graphql.retry", 1, { label, error: errMsg.split(" ")[0] });

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
    }
  }

  // Should be unreachable, but TypeScript needs it
  throw lastError;
}
