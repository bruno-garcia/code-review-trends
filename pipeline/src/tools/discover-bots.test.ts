import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ClickHouseClient } from "@clickhouse/client";
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
