import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProxyUrls, createRotatingFetch, createPinnedFetch } from "./proxy-pool.js";

describe("parseProxyUrls", () => {
  it("returns empty array for undefined", () => {
    assert.deepStrictEqual(parseProxyUrls(undefined), []);
  });

  it("returns empty array for empty string", () => {
    assert.deepStrictEqual(parseProxyUrls(""), []);
    assert.deepStrictEqual(parseProxyUrls("  "), []);
  });

  it("parses comma-separated URLs", () => {
    const result = parseProxyUrls(
      "http://10.0.0.233:8888,http://10.0.0.238:8888,http://10.0.0.239:8888",
    );
    assert.deepStrictEqual(result, [
      "http://10.0.0.233:8888",
      "http://10.0.0.238:8888",
      "http://10.0.0.239:8888",
    ]);
  });

  it("trims whitespace", () => {
    const result = parseProxyUrls(
      " http://a:8888 , http://b:8888 ",
    );
    assert.deepStrictEqual(result, ["http://a:8888", "http://b:8888"]);
  });

  it("filters empty segments", () => {
    const result = parseProxyUrls("http://a:8888,,http://b:8888,");
    assert.deepStrictEqual(result, ["http://a:8888", "http://b:8888"]);
  });
});

describe("createRotatingFetch", () => {
  it("returns undefined when no proxies configured", () => {
    assert.strictEqual(createRotatingFetch([]), undefined);
  });

  it("returns a function when proxies are configured", () => {
    const fetch = createRotatingFetch(["http://localhost:9999"]);
    assert.strictEqual(typeof fetch, "function");
  });
});

describe("createPinnedFetch", () => {
  it("returns undefined when no proxies configured", () => {
    assert.strictEqual(createPinnedFetch([], 0), undefined);
  });

  it("returns a function when proxies are configured", () => {
    const fetch = createPinnedFetch(["http://localhost:9999"], 0);
    assert.strictEqual(typeof fetch, "function");
  });

  it("pins worker 0 to direct (pathway 0)", () => {
    // With 3 proxies → 4 pathways (0=direct, 1-3=proxies)
    // Worker 0 → pathway 0 (direct)
    const fetch = createPinnedFetch(
      ["http://proxy1:8888", "http://proxy2:8888", "http://proxy3:8888"],
      0,
    );
    assert.strictEqual(typeof fetch, "function");
  });

  it("pins worker 1 to first proxy (pathway 1)", () => {
    const fetch = createPinnedFetch(
      ["http://proxy1:8888", "http://proxy2:8888", "http://proxy3:8888"],
      1,
    );
    assert.strictEqual(typeof fetch, "function");
  });

  it("wraps around: worker 4 maps to pathway 0 (direct) with 4 pathways", () => {
    // 4 pathways (direct + 3 proxies), worker 4 → 4 % 4 = 0 (direct)
    const fetch = createPinnedFetch(
      ["http://proxy1:8888", "http://proxy2:8888", "http://proxy3:8888"],
      4,
    );
    assert.strictEqual(typeof fetch, "function");
  });

  it("wraps around: worker 6 maps to pathway 2 with 4 pathways", () => {
    // worker 6 → 6 % 4 = 2 (proxy2)
    const fetch = createPinnedFetch(
      ["http://proxy1:8888", "http://proxy2:8888", "http://proxy3:8888"],
      6,
    );
    assert.strictEqual(typeof fetch, "function");
  });
});
