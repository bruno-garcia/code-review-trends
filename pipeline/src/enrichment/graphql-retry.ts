/**
 * Shared retry logic for GraphQL requests.
 *
 * Wraps Octokit requests with exponential backoff for transient network
 * errors (ECONNRESET, ETIMEDOUT, etc.) that occur when idle keep-alive
 * connections are reset by GitHub's load balancers during rate-limit waits.
 *
 * Non-transient errors (GraphQL errors, rate limits, etc.) are thrown
 * immediately for module-specific error handlers.
 */

import type { Octokit } from "@octokit/rest";
import { log } from "../sentry.js";

const MAX_RETRIES = 3;

const TRANSIENT_ERROR_PATTERNS = [
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "socket hang up",
];

function isTransientNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some((pattern) => msg.includes(pattern));
}

/**
 * Execute a GraphQL request with retry for transient network errors.
 * Returns the raw Octokit response on success, throws on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function graphqlWithRetry(
  octokit: Octokit,
  query: string,
  label: string,
): Promise<{ data: { data?: Record<string, unknown>; errors?: Array<{ message?: string }> }; headers: Record<string, string> }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await octokit.request("POST /graphql", { query });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return response as any;
    } catch (err: unknown) {
      lastError = err;

      if (isTransientNetworkError(err) && attempt < MAX_RETRIES - 1) {
        const backoffMs = Math.min(1000 * 2 ** attempt, 5000);
        const errMsg = err instanceof Error ? err.message.split("\n")[0] : String(err);
        log(`[${label}] Transient network error (${errMsg}), retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      // Non-transient or exhausted retries — throw for module-specific handling
      throw err;
    }
  }

  // Should be unreachable, but TypeScript needs it
  throw lastError;
}
