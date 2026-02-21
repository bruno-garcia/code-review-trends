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
    // Timeout idle sockets after 55s (slightly shorter than GitHub's ~60s timeout)
    // to proactively destroy stale sockets before GitHub's load balancers close them
    timeout: 55_000,
  });
}