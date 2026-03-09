import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { streamBotPREvents, type BotPREventRow } from "./bigquery.js";
import type { BigQuery } from "@google-cloud/bigquery";
import { Readable } from "node:stream";

/**
 * Create a fake BigQuery client whose createQueryStream returns
 * an async-iterable Readable stream of the given rows.
 */
function fakeBQ(rows: BotPREventRow[]): BigQuery {
  return {
    createQueryStream: () => Readable.from(rows),
  } as unknown as BigQuery;
}

describe("streamBotPREvents", () => {
  const makeRow = (i: number): BotPREventRow => ({
    repo_name: `owner/repo-${i}`,
    pr_number: i,
    actor_login: "testbot[bot]",
    event_type: "PullRequestReviewEvent",
    week: "2026-03-03",
  });

  it("returns 0 for empty bot logins", async () => {
    const batches: BotPREventRow[][] = [];
    const total = await streamBotPREvents(
      fakeBQ([makeRow(1)]),
      "2026-01-01",
      "2026-03-01",
      [], // empty logins → early return
      async (batch) => { batches.push(batch); },
    );
    assert.equal(total, 0);
    assert.equal(batches.length, 0);
  });

  it("calls onBatch with correct chunk sizes", async () => {
    const rows = Array.from({ length: 7 }, (_, i) => makeRow(i));
    const batches: BotPREventRow[][] = [];

    const total = await streamBotPREvents(
      fakeBQ(rows),
      "2026-01-01",
      "2026-03-01",
      ["testbot[bot]"],
      async (batch) => { batches.push([...batch]); },
      3, // batchSize = 3
    );

    assert.equal(total, 7);
    assert.equal(batches.length, 3); // 3 + 3 + 1
    assert.equal(batches[0].length, 3);
    assert.equal(batches[1].length, 3);
    assert.equal(batches[2].length, 1);
  });

  it("flushes remaining rows when total is not a multiple of batchSize", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i));
    const batches: BotPREventRow[][] = [];

    const total = await streamBotPREvents(
      fakeBQ(rows),
      "2026-01-01",
      "2026-03-01",
      ["testbot[bot]"],
      async (batch) => { batches.push([...batch]); },
      10, // batchSize larger than total rows
    );

    assert.equal(total, 5);
    assert.equal(batches.length, 1); // all flushed at end
    assert.equal(batches[0].length, 5);
  });

  it("handles exactly one batch worth of rows", async () => {
    const rows = Array.from({ length: 4 }, (_, i) => makeRow(i));
    const batches: BotPREventRow[][] = [];

    const total = await streamBotPREvents(
      fakeBQ(rows),
      "2026-01-01",
      "2026-03-01",
      ["testbot[bot]"],
      async (batch) => { batches.push([...batch]); },
      4,
    );

    assert.equal(total, 4);
    assert.equal(batches.length, 1); // exactly one full batch
    assert.equal(batches[0].length, 4);
  });

  it("handles zero rows from stream", async () => {
    const batches: BotPREventRow[][] = [];

    const total = await streamBotPREvents(
      fakeBQ([]),
      "2026-01-01",
      "2026-03-01",
      ["testbot[bot]"],
      async (batch) => { batches.push(batch); },
    );

    assert.equal(total, 0);
    assert.equal(batches.length, 0);
  });

  it("propagates onBatch errors", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => makeRow(i));

    await assert.rejects(
      () => streamBotPREvents(
        fakeBQ(rows),
        "2026-01-01",
        "2026-03-01",
        ["testbot[bot]"],
        async () => { throw new Error("insert failed"); },
        2,
      ),
      { message: "insert failed" },
    );
  });
});
