/**
 * Rotating proxy pool for distributing GitHub API requests across multiple IPs.
 *
 * GitHub enforces secondary rate limits per IP address. When running enrichment
 * with multiple tokens from a single VM, all requests share one outbound IP
 * and hit the secondary limit. This module creates a custom `fetch` function
 * that round-robins requests across HTTP CONNECT proxy VMs, each with a
 * different external IP.
 *
 * Architecture:
 *   migration-worker (10.0.0.234) ──→ direct (Cloud NAT IP)
 *                                  ──→ nat-proxy-1 (10.0.0.233:8888) → external IP 1
 *                                  ──→ nat-proxy-2 (10.0.0.238:8888) → external IP 2
 *                                  ──→ nat-proxy-3 (10.0.0.239:8888) → external IP 3
 *
 * Usage: Set PROXY_URLS=http://10.0.0.233:8888,http://10.0.0.238:8888,http://10.0.0.239:8888
 * The pool includes a direct (no-proxy) pathway plus one per proxy URL.
 */

import { ProxyAgent, Agent, fetch as undiciFetch, type Dispatcher } from "undici";
import { log } from "../sentry.js";

/**
 * Creates a fetch function that rotates requests across proxy URLs + a direct pathway.
 *
 * When proxyUrls is empty, returns undefined (caller should use default fetch).
 * When proxyUrls has entries, creates N+1 pathways:
 *   - Direct (no proxy, uses the VM's own outbound IP)
 *   - One pathway per proxy URL (HTTP CONNECT tunnel)
 *
 * The returned fetch is a drop-in replacement for globalThis.fetch.
 */
export function createRotatingFetch(proxyUrls: string[]): typeof globalThis.fetch | undefined {
  if (proxyUrls.length === 0) return undefined;

  const directDispatcher: Dispatcher = new Agent({
    keepAliveTimeout: 55_000,
    keepAliveMaxTimeout: 60_000,
    connections: 50,
    pipelining: 1,
  });

  const proxyDispatchers: Dispatcher[] = proxyUrls.map(
    (url) =>
      new ProxyAgent({
        uri: url,
        keepAliveTimeout: 55_000,
        keepAliveMaxTimeout: 60_000,
      }),
  );

  const dispatchers: Dispatcher[] = [directDispatcher, ...proxyDispatchers];
  const labels = ["direct", ...proxyUrls];
  let requestCount = 0;

  log(
    `[proxy-pool] Rotating fetch with ${dispatchers.length} pathways: ${labels.join(", ")}`,
  );

  const rotatingFetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const idx = requestCount % dispatchers.length;
    requestCount++;
    const dispatcher = dispatchers[idx];

    // Use undici's fetch with the dispatcher option for proxy routing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return undiciFetch(input as any, {
      ...init as Record<string, unknown>,
      dispatcher,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) as unknown as Promise<Response>;
  };

  return rotatingFetch as typeof globalThis.fetch;
}

/**
 * Parse PROXY_URLS environment variable into an array of proxy URLs.
 * Returns empty array if not set or empty.
 */
export function parseProxyUrls(envValue: string | undefined): string[] {
  if (!envValue?.trim()) return [];
  return envValue
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}
