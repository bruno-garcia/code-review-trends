/**
 * Integration tests for the sync pipeline.
 *
 * Runs against real ClickHouse (local or CI) with a fake DataFetcher
 * so we don't need BigQuery credentials. Tests the full flow:
 * chunking, ClickHouse writes, state tracking, resume, idempotency.
 *
 * Requires: ClickHouse running on localhost:8123 (npm run dev:infra).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  backfill,
  syncRecent,
  PIPELINE_VERSION,
  type DataFetcher,
  type SyncChunk,
} from "./sync.js";
import { createCHClient, query, syncBots, assertNotLiveDatabase } from "./clickhouse.js";
import { BOTS } from "./bots.js";
import type { ClickHouseClient } from "@clickhouse/client";
import type { WeeklyBotReviewRow } from "./bigquery.js";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Suppress log output during tests */
const quiet = () => {};

/**
 * Creates a fake DataFetcher that returns deterministic data.
 * For any date range, returns one bot row and one human row
 * for the Monday of the start week.
 */
function fakeFetcher(opts?: {
  /** Track calls for assertions */
  calls?: SyncChunk[];
}): DataFetcher {
  const calls = opts?.calls ?? [];

  return {
    async fetchBotActivity(startDate, endDate, botLogins) {
      calls.push({ startDate, endDate });
      // Return one row per known bot login, for the Monday of the start week
      const monday = toMonday(startDate);
      const rows: WeeklyBotReviewRow[] = [];
      // Use first bot login only to keep it simple
      if (botLogins.length > 0) {
        rows.push({
          week: monday,
          actor_login: botLogins[0],
          review_count: 42,
          review_comment_count: 100,
          pr_comment_count: 50,
          repo_count: 10,
          org_count: 5,
        });
      }
      return rows;
    },

    async fetchHumanActivity(startDate) {
      const monday = toMonday(startDate);
      return [
        {
          week: monday,
          review_count: 5000,
          review_comment_count: 12000,
          pr_comment_count: 5000,
          repo_count: 800,
        },
      ];
    },
  };
}

/** Get the Monday of the ISO week containing a date */
function toMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

// ── Integration tests (need ClickHouse) ─────────────────────────────────

describe("backfill integration", () => {
  let ch: ClickHouseClient;

  before(async () => {
    assertNotLiveDatabase();
    ch = createCHClient();
    // Ensure bots exist (needed for login → id mapping)
    await syncBots(ch, BOTS);
    // Ensure pipeline_state table exists (normally created by backfill itself)
    await ch.command({
      query: `CREATE TABLE IF NOT EXISTS pipeline_state (
        job_name String,
        chunk_start Date,
        chunk_end Date,
        completed_at DateTime DEFAULT now(),
        rows_written UInt64,
        bot_logins String DEFAULT '',
        pipeline_version UInt32 DEFAULT 0
      ) ENGINE = ReplacingMergeTree(completed_at)
      ORDER BY (job_name, chunk_start)`,
    });
    // Clean up test state from previous runs
    await ch.command({
      query: `DELETE FROM pipeline_state WHERE job_name = 'backfill'`,
    });
  });

  after(async () => {
    // Clean up test rows — especially those with far-future completed_at
    // (e.g. 2100-01-01) that pollute the status page's max(completed_at) query.
    await ch.command({
      query: `DELETE FROM pipeline_state WHERE job_name = 'backfill'`,
    });
    await ch.close();
  });

  it("backfills a single-month range and writes to ClickHouse", async () => {
    // Use a distinctive date range that won't collide with seed data.
    // The fake fetcher returns data for the Monday of the start week,
    // which may fall before the calendar month boundary.
    const start = "2019-03-01";
    const end = "2019-03-31";

    const calls: SyncChunk[] = [];
    const fetcher = fakeFetcher({ calls });

    const results = await backfill(fetcher, ch, {
      startDate: start,
      endDate: end,
      resume: false,
      log: quiet,
    });

    // Should have processed exactly 1 chunk (one month, week-aligned)
    // Mar 1 2019 = Fri → Mon Feb 25; Mar 31 = Sun (already aligned)
    assert.equal(results.length, 1);
    assert.equal(results[0].chunk.startDate, "2019-02-25");
    assert.equal(results[0].chunk.endDate, "2019-03-31");
    assert.equal(results[0].botRows, 1);
    assert.equal(results[0].humanRows, 1);

    // Verify the fetcher was called with week-aligned range
    assert.equal(calls.length, 1);
    assert.equal(calls[0].startDate, "2019-02-25");

    // The fake fetcher returns data for the Monday of the chunk start,
    // which is 2019-02-25 (already Monday after alignment)
    const expectedWeek = toMonday(calls[0].startDate);

    // Verify data landed in ClickHouse (query by the actual week Monday)
    const botData = await query<{ cnt: string }>(
      ch,
      `SELECT count() AS cnt FROM review_activity
       WHERE bot_id = 'coderabbit' AND week = {week:Date}`,
      { week: expectedWeek },
    );
    assert.ok(Number(botData[0].cnt) >= 1, "Expected bot activity rows in ClickHouse");

    const humanData = await query<{ cnt: string }>(
      ch,
      `SELECT count() AS cnt FROM human_review_activity
       WHERE week = {week:Date}`,
      { week: expectedWeek },
    );
    assert.ok(Number(humanData[0].cnt) >= 1, "Expected human activity rows in ClickHouse");
  });

  it("backfills multiple months and creates correct week-aligned chunks", async () => {
    const calls: SyncChunk[] = [];
    const fetcher = fakeFetcher({ calls });

    const results = await backfill(fetcher, ch, {
      startDate: "2019-06-15",
      endDate: "2019-08-10",
      resume: false,
      log: quiet,
    });

    // June partial, July full, August partial = 3 chunks (week-aligned)
    // Jun 15 Sat → Mon Jun 10; Jun 30 Sun → Sun Jun 30
    // Jul 1 Mon → Mon Jul 1; Jul 31 Wed → Sun Aug 4
    // Aug 1 Thu → Mon Jul 29; Aug 10 Sat → Sun Aug 11
    assert.equal(results.length, 3);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].startDate, "2019-06-10");
    assert.equal(calls[0].endDate, "2019-06-30");
    assert.equal(calls[1].startDate, "2019-07-01");
    assert.equal(calls[1].endDate, "2019-08-04");
    assert.equal(calls[2].startDate, "2019-07-29");
    assert.equal(calls[2].endDate, "2019-08-11");
  });

  it("resumes from last completed chunk", async () => {
    // Clean state
    await ch.command({
      query: `DELETE FROM pipeline_state WHERE job_name = 'backfill'`,
    });

    const calls1: SyncChunk[] = [];
    const fetcher1 = fakeFetcher({ calls: calls1 });

    // First run: backfill Jan–Mar 2019 (3 months)
    // Jan 1 2019 = Tue → Mon Dec 31 2018; Mar 31 = Sun → Sun Mar 31
    await backfill(fetcher1, ch, {
      startDate: "2019-01-01",
      endDate: "2019-03-31",
      resume: true,
      log: quiet,
    });
    assert.equal(calls1.length, 3); // Jan, Feb, Mar

    // Second run: same range with resume — should skip all
    const calls2: SyncChunk[] = [];
    const fetcher2 = fakeFetcher({ calls: calls2 });
    const results2 = await backfill(fetcher2, ch, {
      startDate: "2019-01-01",
      endDate: "2019-03-31",
      resume: true,
      log: quiet,
    });
    assert.equal(results2.length, 0, "Should skip already-completed range");
    assert.equal(calls2.length, 0, "Should not call fetcher for completed range");

    // Third run: extend to April — should only fetch April
    // Apr 1 2019 = Mon (already aligned); Apr 30 = Tue → Sun May 5
    const calls3: SyncChunk[] = [];
    const fetcher3 = fakeFetcher({ calls: calls3 });
    const results3 = await backfill(fetcher3, ch, {
      startDate: "2019-01-01",
      endDate: "2019-04-30",
      resume: true,
      log: quiet,
    });
    assert.equal(results3.length, 1, "Should only process April");
    assert.equal(calls3[0].startDate, "2019-04-01");
  });

  it("re-fetches chunks when bot set changes", async () => {
    // Clean state
    await ch.command({
      query: `DELETE FROM pipeline_state WHERE job_name = 'backfill'`,
    });

    const calls1: SyncChunk[] = [];
    const fetcher1 = fakeFetcher({ calls: calls1 });

    // First run: backfill Jan–Feb 2019
    // Jan 1 2019 = Tue → week-aligned chunk_start = Mon Dec 31 2018
    // Feb 1 2019 = Fri → week-aligned chunk_start = Mon Jan 28
    await backfill(fetcher1, ch, {
      startDate: "2019-01-01",
      endDate: "2019-02-28",
      resume: true,
      log: quiet,
    });
    assert.equal(calls1.length, 2, "Should process Jan and Feb");

    // Simulate a bot set change by overwriting the stored bot_logins
    // with a different (older) set for January only.
    // Use the week-aligned chunk_start (Mon Dec 31 2018).
    await ch.insert({
      table: "pipeline_state",
      values: [{
        job_name: "backfill",
        chunk_start: "2018-12-31",
        chunk_end: "2019-02-03",
        rows_written: 10,
        bot_logins: "old-bot[bot]",
        // Explicit future timestamp so this row wins in ReplacingMergeTree
        completed_at: "2100-01-01 00:00:00",
      }],
      format: "JSONEachRow",
    });
    // Merge so ReplacingMergeTree picks the latest row
    await ch.command({ query: `OPTIMIZE TABLE pipeline_state FINAL` });

    // Second run: same range with resume — should re-fetch Jan (stale bot set), skip Feb
    const calls2: SyncChunk[] = [];
    const fetcher2 = fakeFetcher({ calls: calls2 });
    const results2 = await backfill(fetcher2, ch, {
      startDate: "2019-01-01",
      endDate: "2019-02-28",
      resume: true,
      log: quiet,
    });
    assert.equal(results2.length, 1, "Should only re-fetch January (stale bot set)");
    assert.equal(calls2[0].startDate, "2018-12-31");
  });

  it("re-fetches chunks when pipeline version changes", async () => {
    // Clean state
    await ch.command({
      query: `DELETE FROM pipeline_state WHERE job_name = 'backfill'`,
    });

    const calls1: SyncChunk[] = [];
    const fetcher1 = fakeFetcher({ calls: calls1 });

    // First run: backfill Jan–Feb 2019
    // Jan chunk_start (week-aligned) = Mon Dec 31 2018
    await backfill(fetcher1, ch, {
      startDate: "2019-01-01",
      endDate: "2019-02-28",
      resume: true,
      log: quiet,
    });
    assert.equal(calls1.length, 2, "Should process Jan and Feb");

    // Read current bot_logins for January so we only change the version.
    // Use the week-aligned chunk_start (Mon Dec 31 2018).
    const [janState] = await query<{ bot_logins: string }>(
      ch,
      `SELECT bot_logins FROM pipeline_state FINAL
       WHERE job_name = 'backfill' AND chunk_start = '2018-12-31'`,
    );

    // Simulate an older pipeline version by overwriting January's state
    // with the same bot_logins but a lower version
    await ch.insert({
      table: "pipeline_state",
      values: [{
        job_name: "backfill",
        chunk_start: "2018-12-31",
        chunk_end: "2019-02-03",
        rows_written: 10,
        bot_logins: janState.bot_logins,
        pipeline_version: PIPELINE_VERSION - 1,
        // Explicit future timestamp so this row wins in ReplacingMergeTree
        completed_at: "2100-01-01 00:00:00",
      }],
      format: "JSONEachRow",
    });
    await ch.command({ query: `OPTIMIZE TABLE pipeline_state FINAL` });

    // Second run: same range with resume — should re-fetch Jan (stale version), skip Feb
    const calls2: SyncChunk[] = [];
    const fetcher2 = fakeFetcher({ calls: calls2 });
    const results2 = await backfill(fetcher2, ch, {
      startDate: "2019-01-01",
      endDate: "2019-02-28",
      resume: true,
      log: quiet,
    });
    assert.equal(results2.length, 1, "Should only re-fetch January (stale pipeline version)");
    assert.equal(calls2[0].startDate, "2018-12-31");
  });

  it("is idempotent — re-running same range overwrites without error", async () => {
    const fetcher = fakeFetcher();

    // Run twice with resume=false (forces re-run)
    const r1 = await backfill(fetcher, ch, {
      startDate: "2019-09-01",
      endDate: "2019-09-30",
      resume: false,
      log: quiet,
    });
    const r2 = await backfill(fetcher, ch, {
      startDate: "2019-09-01",
      endDate: "2019-09-30",
      resume: false,
      log: quiet,
    });

    assert.equal(r1.length, 1);
    assert.equal(r2.length, 1);
    // Both should succeed — ReplacingMergeTree handles duplicates
  });
});

describe("syncRecent integration", () => {
  let ch: ClickHouseClient;

  before(async () => {
    assertNotLiveDatabase();
    ch = createCHClient();
    await syncBots(ch, BOTS);
  });

  after(async () => {
    await ch.close();
  });

  it("fetches recent weeks and writes to ClickHouse", async () => {
    const calls: SyncChunk[] = [];
    const fetcher = fakeFetcher({ calls });

    const result = await syncRecent(fetcher, ch, {
      weeks: 1,
      log: quiet,
    });

    assert.equal(calls.length, 1);
    assert.equal(result.botRows, 1);
    assert.equal(result.humanRows, 1);

    // Verify the date range is approximately 1 week back
    const start = new Date(calls[0].startDate);
    const end = new Date(calls[0].endDate);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    assert.ok(diffDays >= 6 && diffDays <= 8, `Expected ~7 day range, got ${diffDays}`);
  });
});
