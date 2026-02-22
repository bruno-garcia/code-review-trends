import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { resolveGitHubTokenInfo } from "./github.js";

describe("resolveGitHubTokenInfo", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns login and expiry from response", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ login: "test-user" }),
      headers: new Headers({
        "github-token-expiration": "2025-06-15 00:00:00 UTC",
      }),
    })) as unknown as typeof fetch;

    const result = await resolveGitHubTokenInfo("ghp_test123");

    assert.equal(result.login, "test-user");
    assert.ok(result.expiry instanceof Date);
    assert.equal(result.expiry!.toISOString(), "2025-06-15T00:00:00.000Z");

    // Verify the request was made correctly
    const mockFn = globalThis.fetch as unknown as ReturnType<typeof mock.fn>;
    const calls = mockFn.mock.calls;
    assert.equal(calls.length, 1);
    const [url, options] = calls[0].arguments as [string, RequestInit];
    assert.equal(url, "https://api.github.com/user");
    assert.equal((options.headers as Record<string, string>)["Authorization"], "Bearer ghp_test123");
  });

  it("returns null expiry when header is absent (non-expiring token)", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ login: "bot-account" }),
      headers: new Headers({}),
    })) as unknown as typeof fetch;

    const result = await resolveGitHubTokenInfo("ghp_noexpiry");

    assert.equal(result.login, "bot-account");
    assert.equal(result.expiry, null);
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    })) as unknown as typeof fetch;

    await assert.rejects(
      () => resolveGitHubTokenInfo("ghp_bad"),
      (err: Error) => {
        assert.match(err.message, /401/);
        assert.match(err.message, /Unauthorized/);
        return true;
      },
    );
  });
});
