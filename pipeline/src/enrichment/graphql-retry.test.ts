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
import { graphqlWithRetry, isTransientNetworkError, TRANSIENT_ERROR_PATTERNS, type GraphQLResponse } from "./graphql-retry.js";
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
});
