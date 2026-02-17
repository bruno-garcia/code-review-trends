/**
 * Tests for the cache warmup script.
 *
 * Tests the pure logic: arg parsing, fetch-with-retry, and the
 * warmup orchestrator. No Sentry, no real HTTP, no process.exit.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  fetchPage,
  warmup,
  PAGES,
  PAGE_NAMES,
  type FetchFn,
} from "./warmup.js";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Suppress console output during tests. */
const quiet = () => {};

/** Create a mock Response object. */
function mockResponse(status: number, body = ""): Response {
  return new Response(body, { status, headers: {} });
}

/** Create a FetchFn that returns the given status for every request. */
function staticFetch(status: number): FetchFn {
  return async () => mockResponse(status, "<html>ok</html>");
}

/** Create a FetchFn that returns different statuses per call. */
function sequenceFetch(statuses: number[]): FetchFn {
  let i = 0;
  return async () => {
    const status = statuses[i] ?? statuses[statuses.length - 1];
    i++;
    return mockResponse(status, "<html>ok</html>");
  };
}

/** Create a FetchFn that throws on the first N calls, then succeeds. */
function failThenSucceed(failures: number, error = "ECONNREFUSED"): FetchFn {
  let i = 0;
  return async () => {
    i++;
    if (i <= failures) throw new Error(error);
    return mockResponse(200, "<html>ok</html>");
  };
}

/** Create a FetchFn that records all requested URLs. */
function recordingFetch(urls: string[], status = 200): FetchFn {
  return async (url: string) => {
    urls.push(url);
    return mockResponse(status, "<html>ok</html>");
  };
}

// ── parseArgs ───────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("parses a bare URL", () => {
    const result = parseArgs(["https://example.com"]);
    assert.deepEqual(result, {
      baseUrl: "https://example.com",
      timeout: 30_000,
      retries: 2,
    });
  });

  it("strips trailing slash from URL", () => {
    const result = parseArgs(["https://example.com/"]);
    assert.equal(result?.baseUrl, "https://example.com");
  });

  it("parses --timeout", () => {
    const result = parseArgs(["https://example.com", "--timeout", "5000"]);
    assert.equal(result?.timeout, 5000);
  });

  it("parses --retries", () => {
    const result = parseArgs(["https://example.com", "--retries", "5"]);
    assert.equal(result?.retries, 5);
  });

  it("parses all options together", () => {
    const result = parseArgs(["--timeout", "10000", "https://example.com", "--retries", "3"]);
    assert.deepEqual(result, {
      baseUrl: "https://example.com",
      timeout: 10_000,
      retries: 3,
    });
  });

  it("returns null when no URL is provided", () => {
    assert.equal(parseArgs([]), null);
    assert.equal(parseArgs(["--timeout", "5000"]), null);
  });

  it("returns null for non-numeric timeout", () => {
    assert.equal(parseArgs(["https://example.com", "--timeout", "abc"]), null);
  });

  it("returns null for non-numeric retries", () => {
    assert.equal(parseArgs(["https://example.com", "--retries", "xyz"]), null);
  });

  it("returns null for negative timeout", () => {
    assert.equal(parseArgs(["https://example.com", "--timeout", "-100"]), null);
  });

  it("returns null for negative retries", () => {
    assert.equal(parseArgs(["https://example.com", "--retries", "-1"]), null);
  });

  it("accepts zero retries", () => {
    const result = parseArgs(["https://example.com", "--retries", "0"]);
    assert.equal(result?.retries, 0);
  });
});

// ── fetchPage ───────────────────────────────────────────────────────────

describe("fetchPage", () => {
  it("returns ok for 200 response", async () => {
    const result = await fetchPage(
      "https://example.com", "/", 5000, 0, staticFetch(200), quiet,
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.page, "/");
    assert.equal(result.attempts, 1);
  });

  it("returns ok for 301 redirect", async () => {
    const result = await fetchPage(
      "https://example.com", "/bots", 5000, 0, staticFetch(301), quiet,
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, 301);
  });

  it("returns failure for 500 with no retries", async () => {
    const result = await fetchPage(
      "https://example.com", "/status", 5000, 0, staticFetch(500), quiet,
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.equal(result.error, "HTTP 500");
    assert.equal(result.attempts, 1);
  });

  it("returns failure for 404", async () => {
    const result = await fetchPage(
      "https://example.com", "/missing", 5000, 0, staticFetch(404), quiet,
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  });

  it("retries on failure and eventually succeeds", async () => {
    // First call: 500, second call: 200
    const result = await fetchPage(
      "https://example.com", "/", 5000, 2,
      sequenceFetch([500, 200]), quiet,
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.attempts, 2);
  });

  it("retries on network error and eventually succeeds", async () => {
    // First call throws, second call succeeds
    const result = await fetchPage(
      "https://example.com", "/", 5000, 2,
      failThenSucceed(1, "ECONNREFUSED"), quiet,
    );
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });

  it("exhausts all retries and returns failure", async () => {
    const result = await fetchPage(
      "https://example.com", "/", 5000, 2, staticFetch(503), quiet,
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.attempts, 3); // 1 initial + 2 retries
  });

  it("captures network errors with status 0", async () => {
    const result = await fetchPage(
      "https://example.com", "/", 5000, 0,
      async () => { throw new Error("ECONNREFUSED"); }, quiet,
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.equal(result.error, "ECONNREFUSED");
  });

  it("accumulates duration across retries on success", async () => {
    let callCount = 0;
    const slowThenFast: FetchFn = async () => {
      callCount++;
      // Simulate some minimal time passing
      await new Promise((r) => setTimeout(r, 10));
      if (callCount <= 1) return mockResponse(500);
      return mockResponse(200);
    };

    const result = await fetchPage(
      "https://example.com", "/", 5000, 1,
      slowThenFast, quiet,
    );
    assert.equal(result.ok, true);
    // Duration should include both attempts (not just the successful one)
    assert.ok(result.duration_ms >= 10, `Expected duration >= 10ms (both attempts), got ${result.duration_ms}ms`);
  });

  it("clears timeout timer on fetch error", async () => {
    // If the timer leaks, the test runner would hang or warn about open handles.
    // This test verifies the fetch completes promptly despite the throw.
    const result = await fetchPage(
      "https://example.com", "/", 60_000, 0,
      async () => { throw new Error("network down"); }, quiet,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, "network down");
  });
});

// ── warmup orchestrator ─────────────────────────────────────────────────

describe("warmup", () => {
  it("warms all default pages", async () => {
    const urls: string[] = [];
    const summary = await warmup({
      baseUrl: "https://example.com",
      timeout: 5000,
      retries: 0,
      fetchFn: recordingFetch(urls),
      log: quiet,
    });

    assert.equal(summary.succeeded, PAGES.length);
    assert.equal(summary.failed, 0);
    assert.equal(summary.results.length, PAGES.length);

    // Verify all pages were requested
    for (const page of PAGES) {
      assert.ok(
        urls.includes(`https://example.com${page}`),
        `Expected request to ${page}`,
      );
    }
  });

  it("accepts a custom page list", async () => {
    const urls: string[] = [];
    const summary = await warmup({
      baseUrl: "https://example.com",
      timeout: 5000,
      retries: 0,
      pages: ["/custom", "/test"],
      fetchFn: recordingFetch(urls),
      log: quiet,
    });

    assert.equal(summary.results.length, 2);
    assert.deepEqual(urls, [
      "https://example.com/custom",
      "https://example.com/test",
    ]);
  });

  it("reports mixed success and failure", async () => {
    let callIdx = 0;
    const mixedFetch: FetchFn = async () => {
      const status = callIdx % 2 === 0 ? 200 : 500;
      callIdx++;
      return mockResponse(status);
    };

    const summary = await warmup({
      baseUrl: "https://example.com",
      timeout: 5000,
      retries: 0,
      pages: ["/a", "/b", "/c", "/d"],
      fetchFn: mixedFetch,
      log: quiet,
    });

    assert.equal(summary.succeeded, 2);
    assert.equal(summary.failed, 2);
    assert.equal(summary.results[0].ok, true);
    assert.equal(summary.results[1].ok, false);
    assert.equal(summary.results[2].ok, true);
    assert.equal(summary.results[3].ok, false);
  });

  it("computes total duration from individual results", async () => {
    const summary = await warmup({
      baseUrl: "https://example.com",
      timeout: 5000,
      retries: 0,
      pages: ["/a", "/b"],
      fetchFn: staticFetch(200),
      log: quiet,
    });

    const expectedTotal = summary.results.reduce((s, r) => s + r.duration_ms, 0);
    assert.equal(summary.totalDuration, expectedTotal);
  });

  it("works with zero pages", async () => {
    const summary = await warmup({
      baseUrl: "https://example.com",
      timeout: 5000,
      retries: 0,
      pages: [],
      fetchFn: staticFetch(200),
      log: quiet,
    });

    assert.equal(summary.succeeded, 0);
    assert.equal(summary.failed, 0);
    assert.equal(summary.results.length, 0);
    assert.equal(summary.totalDuration, 0);
  });

});

// ── Constants ───────────────────────────────────────────────────────────

describe("constants", () => {
  it("PAGES has all expected routes", () => {
    assert.ok(PAGES.includes("/"));
    assert.ok(PAGES.includes("/bots"));
    assert.ok(PAGES.includes("/orgs"));
    assert.ok(PAGES.includes("/compare"));
    assert.ok(PAGES.includes("/about"));
    assert.ok(PAGES.includes("/status"));
    assert.equal(PAGES.length, 6);
  });

  it("PAGE_NAMES maps every page", () => {
    for (const page of PAGES) {
      assert.ok(PAGE_NAMES[page], `Missing PAGE_NAMES entry for ${page}`);
    }
  });
});
