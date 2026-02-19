import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Replicate the escaping logic from json-ld.tsx:
//   JSON.stringify(data).replace(/</g, "\\u003c")
function escapeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

describe("JsonLd XSS escaping", () => {
  it("prevents script breakout", () => {
    const output = escapeJsonLd({
      description: '</script><img onerror=alert(1)>',
    });
    assert.ok(!output.includes("</script>"), "must not contain raw </script>");
    assert.ok(
      output.includes("\\u003c/script>"),
      "must contain escaped </script>"
    );
  });

  it("escapes all < characters", () => {
    const data = { a: "<b>", c: "<<>>" };
    const raw = JSON.stringify(data);
    const output = escapeJsonLd(data);
    const originalCount = (raw.match(/</g) || []).length;

    assert.ok(originalCount > 0, "test data must contain <");
    assert.equal((output.match(/</g) || []).length, 0, "no raw < in output");
    assert.equal(
      (output.match(/\\u003c/g) || []).length,
      originalCount,
      "all < replaced with \\u003c"
    );
  });

  it("leaves normal data unchanged", () => {
    const data = { name: "CodeRabbit", reviews: 1000 };
    assert.equal(escapeJsonLd(data), JSON.stringify(data));
  });

  it("escapes nested objects", () => {
    const output = escapeJsonLd({
      outer: { inner: "<script>alert(1)</script>" },
    });
    assert.ok(!output.includes("<"), "no raw < in nested output");
    assert.ok(output.includes("\\u003cscript>"));
  });
});
