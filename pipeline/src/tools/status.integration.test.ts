/**
 * Integration tests for the pipeline status tool.
 *
 * Runs buildReport against real ClickHouse to catch schema drift.
 *
 * Requires: ClickHouse running on localhost:8123 (npm run dev:infra).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
} from "./status.js";
import {
  createCHClient,
  syncBots,
  insertReviewActivity,
  insertHumanActivity,
  assertNotLiveDatabase,
} from "../clickhouse.js";
import { BOTS } from "../bots.js";
import type { ClickHouseClient } from "@clickhouse/client";

// ── Integration tests (need ClickHouse) ─────────────────────────────────

describe("buildReport integration", () => {
  let ch: ClickHouseClient;

  before(async () => {
    assertNotLiveDatabase();
    ch = createCHClient();

    // Ensure bots exist
    await syncBots(ch, BOTS);

    // Ensure pipeline_state table exists
    await ch.command({
      query: `CREATE TABLE IF NOT EXISTS pipeline_state (
        job_name String,
        chunk_start Date,
        chunk_end Date,
        completed_at DateTime DEFAULT now(),
        rows_written UInt64,
        bot_logins String DEFAULT ''
      ) ENGINE = ReplacingMergeTree(completed_at)
      ORDER BY (job_name, chunk_start)`,
    });
  });

  after(async () => {
    await ch.close();
  });

  it("returns a complete report without errors", async () => {
    const report = await buildReport(ch, 14);

    // Report structure is complete
    assert.ok(report.healthy !== undefined, "should have healthy field");
    assert.ok(report.dataAge.latestWeek, "should have latestWeek");
    assert.ok(typeof report.dataAge.daysOld === "number", "daysOld should be a number");
    assert.ok(report.coverage.totalWeeks >= 0, "totalWeeks should be >= 0");
    assert.ok(report.coverage.expectedWeeks >= 0, "expectedWeeks should be >= 0");
    assert.ok(Array.isArray(report.coverage.missingWeeks), "missingWeeks should be an array");
    assert.ok(Array.isArray(report.bots), "bots should be an array");
    assert.ok(Array.isArray(report.tables), "tables should be an array");
    assert.ok(typeof report.humanActivity.totalWeeks === "number", "humanActivity.totalWeeks should be a number");
  });

  it("reports table row counts for all expected tables", async () => {
    const report = await buildReport(ch, 14);

    const tableNames = report.tables.map((t) => t.name);
    assert.ok(tableNames.includes("bots"), "should include bots table");
    assert.ok(tableNames.includes("review_activity"), "should include review_activity table");
    assert.ok(tableNames.includes("human_review_activity"), "should include human_review_activity table");
    assert.ok(tableNames.includes("pipeline_state"), "should include pipeline_state table");

    // bots table should have rows (we synced them in before())
    const botsTable = report.tables.find((t) => t.name === "bots");
    assert.ok(botsTable && botsTable.rows > 0, "bots table should have rows");
  });

  it("reports per-bot activity with correct fields", async () => {
    const report = await buildReport(ch, 14);

    // There should be at least some bot data (seed data or real imports)
    if (report.bots.length > 0) {
      const bot = report.bots[0];
      assert.ok(bot.id, "bot should have id");
      assert.ok(bot.name, "bot should have name");
      assert.ok(typeof bot.totalReviews === "number", "totalReviews should be a number");
      assert.ok(bot.latestWeek, "bot should have latestWeek");
      assert.ok(typeof bot.weeksWithData === "number", "weeksWithData should be a number");
    }
  });

  it("detects freshness based on max-age threshold", async () => {
    // With a very generous max-age, should be healthy (assuming any data exists)
    const lenient = await buildReport(ch, 99999);

    // With max-age=0, data is always stale (unless inserted this instant)
    const strict = await buildReport(ch, 0);

    if (lenient.coverage.totalWeeks > 0) {
      // lenient: only unhealthy if there are gaps
      // strict: always unhealthy because daysOld > 0
      assert.equal(strict.healthy, false, "max-age=0 should be unhealthy");
    }
  });

  it("survives when pipeline_state is empty", async () => {
    // buildReport should handle empty pipeline_state gracefully
    const report = await buildReport(ch, 14);

    // backfill fields should exist and be sensible
    assert.ok(typeof report.backfill.completedChunks === "number");
    // lastChunkEnd is null if no backfill has run, or a date string
    assert.ok(
      report.backfill.lastChunkEnd === null || typeof report.backfill.lastChunkEnd === "string",
    );
  });

  it("reflects data written by the pipeline", async () => {
    // Write a known row to a distinctive week that won't collide with seed data
    const testWeek = "2018-01-01"; // Monday, way before any real data
    await insertReviewActivity(ch, [
      { week: testWeek, bot_id: BOTS[0].id, review_count: 7, review_comment_count: 3, pr_comment_count: 1, repo_count: 2, org_count: 1 },
    ]);
    await insertHumanActivity(ch, [
      { week: testWeek, review_count: 100, review_comment_count: 50, pr_comment_count: 20, repo_count: 10 },
    ]);

    const report = await buildReport(ch, 99999);

    // The test week should appear in coverage
    assert.ok(
      report.coverage.firstWeek <= testWeek,
      `firstWeek (${report.coverage.firstWeek}) should be <= ${testWeek}`,
    );

    // The bot should appear in the bot list with at least our test data
    const bot = report.bots.find((b) => b.id === BOTS[0].id);
    assert.ok(bot, `bot ${BOTS[0].id} should appear in report`);
    assert.ok(bot.totalReviews >= 7, "should include our test data in totalReviews");

    // Human activity should be present
    assert.ok(report.humanActivity.totalWeeks > 0, "should have human activity weeks");
  });
});
