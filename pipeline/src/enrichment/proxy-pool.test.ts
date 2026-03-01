import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProxyUrls, createRotatingFetch } from "./proxy-pool.js";

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
