/**
 * Tests for shared GraphQL retry logic.
 *
 * Covers:
 * - Successful request (no retry)
 * - Retry on each transient error pattern (ECONNRESET, ETIMEDOUT, etc.)
 * - Exponential backoff timing
 * - Exhausted retries re-throw
 * - Non-transient errors throw immediately without retry
 * - isTransientNetworkError classification
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { graphqlWithRetry, isTransientNetworkError, isServerError, isRetryableError, TRANSIENT_ERROR_PATTERNS, type GraphQLResponse } from "./graphql-retry.js";
import type { Octokit } from "@octokit/rest";

/** Build a minimal Octokit-like object with a stubbed request method. */
function makeOctokit(requestFn: (...args: unknown[]) => Promise<unknown>): Octokit {
  return { request: requestFn } as unknown as Octokit;
}

const OK_RESPONSE: GraphQLResponse = {
  data: { data: { repo0: { stargazerCount: 42 } } },
  headers: { "x-ratelimit-remaining": "4999" },
};

describe("isTransientNetworkError", () => {
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    it(`detects ${pattern}`, () => {
      assert.equal(isTransientNetworkError(new Error(`request failed: ${pattern}`)), true);
    });
  }

  it("returns false for non-transient errors", () => {
    assert.equal(isTransientNetworkError(new Error("GraphQL validation error")), false);
    assert.equal(isTransientNetworkError(new Error("Bad credentials")), false);
    assert.equal(isTransientNetworkError(new Error("rate limit exceeded")), false);
  });

  it("handles non-Error values", () => {
    assert.equal(isTransientNetworkError("ECONNRESET happened"), true);
    assert.equal(isTransientNetworkError("something else"), false);
    assert.equal(isTransientNetworkError(null), false);
  });
});

describe("graphqlWithRetry", () => {
  it("returns response on first success", async () => {
    const requestFn = mock.fn(async () => OK_RESPONSE);
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query { viewer { login } }", "test");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 1);
  });

  it("retries on ECONNRESET and succeeds", async () => {
    let calls = 0;
    const requestFn = mock.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("read ECONNRESET");
      return OK_RESPONSE;
    });
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query {}", "test");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 2);
  });

  it("retries on ETIMEDOUT and succeeds", async () => {
    let calls = 0;
    const requestFn = mock.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("connect ETIMEDOUT 1.2.3.4:443");
      return OK_RESPONSE;
    });
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query {}", "test");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 2);
  });

  it("retries on socket hang up and succeeds", async () => {
    let calls = 0;
    const requestFn = mock.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("socket hang up");
      return OK_RESPONSE;
    });
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query {}", "test");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 2);
  });

  it("exhausts retries and throws on persistent transient error", async () => {
    const requestFn = mock.fn(async () => {
      throw new Error("read ECONNRESET");
    });
    const octokit = makeOctokit(requestFn);

    await assert.rejects(
      () => graphqlWithRetry(octokit, "query {}", "test"),
      (err: Error) => {
        assert.match(err.message, /ECONNRESET/);
        return true;
      },
    );

    // 3 attempts total (1 initial + 2 retries)
    assert.equal(requestFn.mock.callCount(), 3);
  });

  it("does not retry non-transient errors", async () => {
    const requestFn = mock.fn(async () => {
      throw new Error("Bad credentials");
    });
    const octokit = makeOctokit(requestFn);

    await assert.rejects(
      () => graphqlWithRetry(octokit, "query {}", "test"),
      (err: Error) => {
        assert.match(err.message, /Bad credentials/);
        return true;
      },
    );

    // Only 1 attempt — no retries for non-transient errors
    assert.equal(requestFn.mock.callCount(), 1);
  });

  it("retries up to 2 failures then succeeds on 3rd attempt", async () => {
    let calls = 0;
    const requestFn = mock.fn(async () => {
      calls++;
      if (calls <= 2) throw new Error("read ECONNRESET");
      return OK_RESPONSE;
    });
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query {}", "test");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 3);
  });

  it("retries different transient errors across attempts", async () => {
    const errors = ["ECONNRESET", "ETIMEDOUT"];
    let calls = 0;
    const requestFn = mock.fn(async () => {
      if (calls < errors.length) {
        const err = errors[calls];
        calls++;
        throw new Error(err);
      }
      return OK_RESPONSE;
    });
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query {}", "test");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 3);
  });

  it("retries on 502 server error and recovers", async () => {
    let calls = 0;
    const requestFn = mock.fn(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error("Bad Gateway") as Error & { status: number };
        err.status = 502;
        throw err;
      }
      return OK_RESPONSE;
    });
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query {}", "test-502");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 2);
  });

  it("exhausts retries on persistent 502 and throws", async () => {
    const requestFn = mock.fn(async () => {
      const err = new Error("Bad Gateway") as Error & { status: number };
      err.status = 502;
      throw err;
    });
    const octokit = makeOctokit(requestFn);

    await assert.rejects(
      () => graphqlWithRetry(octokit, "query {}", "test-502-exhaust"),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 502);
        return true;
      },
    );

    assert.equal(requestFn.mock.callCount(), 3);
  });

  it("retries on HTML error response", async () => {
    let calls = 0;
    const requestFn = mock.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("<html><body>Server Error</body></html>");
      return OK_RESPONSE;
    });
    const octokit = makeOctokit(requestFn);

    const result = await graphqlWithRetry(octokit, "query {}", "test-html");

    assert.deepStrictEqual(result.data, OK_RESPONSE.data);
    assert.equal(requestFn.mock.callCount(), 2);
  });

  it("does not retry non-retryable errors (status 400)", async () => {
    const requestFn = mock.fn(async () => {
      const err = new Error("GraphQL validation error") as Error & { status: number };
      err.status = 400;
      throw err;
    });
    const octokit = makeOctokit(requestFn);

    await assert.rejects(
      () => graphqlWithRetry(octokit, "query {}", "test-400"),
      (err: Error & { status?: number }) => {
        assert.equal(err.status, 400);
        return true;
      },
    );

    assert.equal(requestFn.mock.callCount(), 1);
  });
});

describe("isServerError", () => {
  it("detects 502 status", () => {
    const err = Object.assign(new Error("Bad Gateway"), { status: 502 });
    assert.equal(isServerError(err), true);
  });

  it("detects 503 status", () => {
    const err = Object.assign(new Error("Service Unavailable"), { status: 503 });
    assert.equal(isServerError(err), true);
  });

  it("detects status on response object", () => {
    const err = Object.assign(new Error("fail"), { response: { status: 502 } });
    assert.equal(isServerError(err), true);
  });

  it("detects HTML error message", () => {
    assert.equal(isServerError(new Error("<html><body>502</body></html>")), true);
    assert.equal(isServerError(new Error("<!DOCTYPE html>")), true);
  });

  it("detects bad gateway / service unavailable messages", () => {
    assert.equal(isServerError(new Error("Bad Gateway")), true);
    assert.equal(isServerError(new Error("Service Unavailable")), true);
  });

  it("returns false for non-server errors", () => {
    assert.equal(isServerError(new Error("Bad credentials")), false);
    assert.equal(isServerError(Object.assign(new Error("fail"), { status: 400 })), false);
  });
});

describe("isRetryableError", () => {
  it("returns true for transient network errors", () => {
    assert.equal(isRetryableError(new Error("read ECONNRESET")), true);
  });

  it("returns true for server errors", () => {
    assert.equal(isRetryableError(Object.assign(new Error("Bad Gateway"), { status: 502 })), true);
  });

  it("returns false for other errors", () => {
    assert.equal(isRetryableError(new Error("Bad credentials")), false);
  });
});
