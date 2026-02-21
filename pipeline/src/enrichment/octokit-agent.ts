/**
 * HTTP Agent configuration for Octokit.
 *
 * Configures persistent connections with appropriate keep-alive settings
 * to prevent ECONNRESET errors during rate-limited waits between batched
 * GraphQL requests.
 */

import https from "node:https";

/**
 * Creates an HTTPS agent with optimized keep-alive settings for GitHub API.
 *
 * GitHub's load balancers may close idle connections after ~60s.
 * This agent:
 * - Enables keep-alive with frequent probes to keep connections alive
 * - Sets socket timeout to detect stale connections early
 * - Limits connection pool size to prevent resource leaks
 */
export function createOctokitAgent(): https.Agent {
  return new https.Agent({
    keepAlive: true,
    // Send keep-alive probes every 30s to keep connections alive during rate-limit waits
    keepAliveMsecs: 30_000,
    // Allow multiple concurrent requests (batching may need several sockets)
    maxSockets: 50,
    maxFreeSockets: 10,
    // Timeout idle sockets after 65s (slightly longer than GitHub's ~60s timeout)
    // to force creation of fresh connections rather than reusing potentially-stale ones
    timeout: 65_000,
    // Free sockets (in pool) should also timeout
    freeSocketTimeout: 65_000,
  });
}