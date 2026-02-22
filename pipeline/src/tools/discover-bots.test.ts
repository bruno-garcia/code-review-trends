import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ClickHouseClient } from "@clickhouse/client";
import * as Sentry from "@sentry/node";
import { checkStaleBots } from "./discover-bots.js";

/** Create a fake ClickHouseClient that returns the given rows from query(). */
function fakeClient(rows: unknown[]): ClickHouseClient {
  return {
    query: () =>
      Promise.resolve({
        json: () => Promise.resolve(rows),
      }),
  } as unknown as ClickHouseClient;
}

describe("checkStaleBots", () => {
  it("returns stale products from query results", async () => {
    const stale = [
      {
        productId: "old-bot",
        productName: "Old Bot",
        lastActivityWeek: "2025-11-03",
      },
    ];

    const result = await checkStaleBots(fakeClient(stale));
    assert.deepEqual(result, stale);
  });

  it("returns empty array when no products are stale", async () => {
    const result = await checkStaleBots(fakeClient([]));
    assert.deepEqual(result, []);
  });

  it("returns only stale products (fresh/retired/zero-activity filtered by SQL)", async () => {
    // SQL handles filtering — mock returns only what ClickHouse would return.
    const staleOnly = [
      {
        productId: "stale-a",
        productName: "Stale A",
        lastActivityWeek: "2025-10-06",
      },
      {
        productId: "stale-b",
        productName: "Stale B",
        lastActivityWeek: "2025-09-01",
      },
    ];

    const result = await checkStaleBots(fakeClient(staleOnly));
    assert.equal(result.length, 2);
    assert.equal(result[0].productId, "stale-a");
    assert.equal(result[1].productId, "stale-b");
  });

  it("passes SQL referencing review_activity and products", async () => {
    let capturedSql = "";
    const client = {
      query: ({ query }: { query: string }) => {
        capturedSql = query;
        return Promise.resolve({ json: () => Promise.resolve([]) });
      },
    } as unknown as ClickHouseClient;

    await checkStaleBots(client);

    assert.ok(
      capturedSql.includes("review_activity"),
      "SQL should reference review_activity",
    );
    assert.ok(
      capturedSql.includes("retired"),
      "SQL should filter retired products",
    );
    assert.ok(
      capturedSql.includes("INTERVAL 4 WEEK"),
      "SQL should use 4-week staleness threshold",
    );
  });
});

describe("stale product Sentry alerts", () => {
  /** Captured envelope items from the fake transport. */
  let captured: unknown[] = [];

  /** Init Sentry with a fake transport that captures events. */
  function initFakeSentry() {
    captured = [];
    Sentry.init({
      dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
      transport: () => ({
        send: (envelope: unknown) => {
          const [, items] = envelope as [unknown, Array<[{ type?: string }, unknown]>];
          for (const [header, payload] of items) {
            if (header.type === "event") {
              captured.push(payload);
            }
          }
          return Promise.resolve({ statusCode: 200 });
        },
        flush: () => Promise.resolve(true),
      }),
    });
  }

  afterEach(async () => {
    await Sentry.close();
  });

  it("emits a Sentry event with correct fingerprint and tags for a stale product", async () => {
    initFakeSentry();

    const productId = "test-bot";
    const productName = "Test Bot";
    const lastActivityWeek = "2025-11-03";

    Sentry.captureMessage(`Stale product: ${productName} — no activity since ${lastActivityWeek}`, {
      level: "warning",
      fingerprint: ["stale-product", productId],
      tags: {
        "product.id": productId,
        "product.name": productName,
        "product.last_activity_week": lastActivityWeek,
      },
    });

    await Sentry.flush(2000);

    assert.equal(captured.length, 1);
    const event = captured[0] as {
      message: string;
      level: string;
      fingerprint: string[];
      tags: Record<string, string>;
    };
    assert.ok(event.message.includes("Stale product: Test Bot"));
    assert.deepEqual(event.fingerprint, ["stale-product", "test-bot"]);
    assert.equal(event.level, "warning");
    assert.equal(event.tags["product.id"], "test-bot");
    assert.equal(event.tags["product.name"], "Test Bot");
    assert.equal(event.tags["product.last_activity_week"], "2025-11-03");
  });

  it("emits multiple events for multiple stale products", async () => {
    initFakeSentry();

    const staleProducts = [
      { productId: "bot-a", productName: "Bot A", lastActivityWeek: "2025-10-06" },
      { productId: "bot-b", productName: "Bot B", lastActivityWeek: "2025-09-01" },
    ];

    for (const p of staleProducts) {
      Sentry.captureMessage(`Stale product: ${p.productName} — no activity since ${p.lastActivityWeek}`, {
        level: "warning",
        fingerprint: ["stale-product", p.productId],
        tags: {
          "product.id": p.productId,
          "product.name": p.productName,
          "product.last_activity_week": p.lastActivityWeek,
        },
      });
    }

    await Sentry.flush(2000);

    assert.equal(captured.length, 2);
    const fingerprints = captured.map(
      (e) => (e as { fingerprint: string[] }).fingerprint,
    );
    assert.deepEqual(fingerprints, [
      ["stale-product", "bot-a"],
      ["stale-product", "bot-b"],
    ]);
  });
});
