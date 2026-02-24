/**
 * Unit tests for the sync pipeline.
 *
 * Tests pure functions (chunking, row mapping) that don't need ClickHouse.
 * Integration tests that need ClickHouse live in sync.integration.test.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  monthlyChunks,
  mapBotActivityRows,
} from "./sync.js";

// ── Pure unit tests ─────────────────────────────────────────────────────

describe("monthlyChunks", () => {
  it("single day extends to full week", () => {
    // 2025-03-15 is Saturday → extends to Mon Mar 10 – Sun Mar 16
    const chunks = monthlyChunks("2025-03-15", "2025-03-15");
    assert.deepEqual(chunks, [
      { startDate: "2025-03-10", endDate: "2025-03-16" },
    ]);
  });

  it("same month extends to full weeks at both edges", () => {
    // Jan 1 2025 = Wed → back to Mon Dec 30; Jan 31 = Fri → forward to Sun Feb 2
    const chunks = monthlyChunks("2025-01-01", "2025-01-31");
    assert.deepEqual(chunks, [
      { startDate: "2024-12-30", endDate: "2025-02-02" },
    ]);
  });

  it("two months produces two overlapping chunks", () => {
    // Jan 15 Wed → Mon Jan 13; Jan 31 Fri → Sun Feb 2
    // Feb 1 Sat → Mon Jan 27; Feb 20 Thu → Sun Feb 23
    const chunks = monthlyChunks("2025-01-15", "2025-02-20");
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].startDate, "2025-01-13");
    assert.equal(chunks[0].endDate, "2025-02-02");
    assert.equal(chunks[1].startDate, "2025-01-27");
    assert.equal(chunks[1].endDate, "2025-02-23");
  });

  it("handles year boundary", () => {
    // Dec 1 2024 = Sun → Mon Nov 25; Dec 31 = Tue → Sun Jan 5
    // Jan 1 2025 = Wed → Mon Dec 30; Jan 15 = Wed → Sun Jan 19
    const chunks = monthlyChunks("2024-12-01", "2025-01-15");
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].startDate, "2024-11-25");
    assert.equal(chunks[0].endDate, "2025-01-05");
    assert.equal(chunks[1].startDate, "2024-12-30");
    assert.equal(chunks[1].endDate, "2025-01-19");
  });

  it("full year produces 12 chunks", () => {
    // Jan 1 2024 = Mon (already aligned); Dec 31 2024 = Tue → Sun Jan 5 2025
    const chunks = monthlyChunks("2024-01-01", "2024-12-31");
    assert.equal(chunks.length, 12);
    assert.equal(chunks[0].startDate, "2024-01-01");
    assert.equal(chunks[11].endDate, "2025-01-05");
  });

  it("feb leap year boundary", () => {
    // Feb 1 2024 = Thu → Mon Jan 29; Feb 29 = Thu → Sun Mar 3
    const chunks = monthlyChunks("2024-02-01", "2024-02-29");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].startDate, "2024-01-29");
    assert.equal(chunks[0].endDate, "2024-03-03");
  });

  it("boundary weeks are fully contained in at least one chunk", () => {
    // Week of Jan 27 (Mon) → Feb 2 (Sun) 2025 spans the month boundary.
    // Both chunks must fully contain this week.
    const chunks = monthlyChunks("2025-01-01", "2025-02-28");
    assert.equal(chunks.length, 2);
    // Jan chunk must include Feb 2 (Sunday of boundary week)
    assert.ok(chunks[0].endDate >= "2025-02-02",
      `Jan chunk endDate ${chunks[0].endDate} must be >= 2025-02-02`);
    // Feb chunk must include Jan 27 (Monday of boundary week)
    assert.ok(chunks[1].startDate <= "2025-01-27",
      `Feb chunk startDate ${chunks[1].startDate} must be <= 2025-01-27`);
  });

  it("no overlap needed when month boundary is a week boundary", () => {
    // Mar 31 2024 = Sun (week end), Apr 1 = Mon (week start)
    // These chunks should abut without overlap — no week is split.
    const chunks = monthlyChunks("2024-03-01", "2024-04-30");
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].endDate, "2024-03-31"); // Sun Mar 31
    assert.equal(chunks[1].startDate, "2024-04-01"); // Mon Apr 1
  });
});

describe("mapBotActivityRows", () => {
  it("aggregates multiple logins for the same bot_id + week", () => {
    // Copilot has two logins: copilot-pull-request-reviewer[bot] and Copilot
    const rows = mapBotActivityRows([
      {
        week: "2025-01-06",
        actor_login: "copilot-pull-request-reviewer[bot]",
        review_count: 100,
        review_comment_count: 50,
        pr_comment_count: 30,
        repo_count: 10,
        org_count: 5,
      },
      {
        week: "2025-01-06",
        actor_login: "Copilot",
        review_count: 500,
        review_comment_count: 200,
        pr_comment_count: 150,
        repo_count: 40,
        org_count: 20,
      },
    ]);

    // Both logins map to bot_id "copilot" — should produce a single aggregated row
    assert.equal(rows.length, 1);
    assert.equal(rows[0].bot_id, "copilot");
    assert.equal(rows[0].week, "2025-01-06");
    assert.equal(rows[0].review_count, 600);
    assert.equal(rows[0].review_comment_count, 250);
    assert.equal(rows[0].pr_comment_count, 180);
    assert.equal(rows[0].repo_count, 50);
    assert.equal(rows[0].org_count, 25);
  });

  it("keeps separate rows for different bot_ids in the same week", () => {
    const rows = mapBotActivityRows([
      {
        week: "2025-01-06",
        actor_login: "coderabbitai[bot]",
        review_count: 200,
        review_comment_count: 100,
        pr_comment_count: 80,
        repo_count: 30,
        org_count: 15,
      },
      {
        week: "2025-01-06",
        actor_login: "copilot-pull-request-reviewer[bot]",
        review_count: 100,
        review_comment_count: 50,
        pr_comment_count: 30,
        repo_count: 10,
        org_count: 5,
      },
    ]);

    assert.equal(rows.length, 2);
    const coderabbit = rows.find((r) => r.bot_id === "coderabbit");
    const copilot = rows.find((r) => r.bot_id === "copilot");
    assert.ok(coderabbit);
    assert.ok(copilot);
    assert.equal(coderabbit.review_count, 200);
    assert.equal(copilot.review_count, 100);
  });

  it("keeps separate rows for the same bot_id in different weeks", () => {
    const rows = mapBotActivityRows([
      {
        week: "2025-01-06",
        actor_login: "copilot-pull-request-reviewer[bot]",
        review_count: 100,
        review_comment_count: 50,
        pr_comment_count: 30,
        repo_count: 10,
        org_count: 5,
      },
      {
        week: "2025-01-13",
        actor_login: "copilot-pull-request-reviewer[bot]",
        review_count: 200,
        review_comment_count: 80,
        pr_comment_count: 60,
        repo_count: 20,
        org_count: 10,
      },
    ]);

    assert.equal(rows.length, 2);
    const week1 = rows.find((r) => r.week === "2025-01-06");
    const week2 = rows.find((r) => r.week === "2025-01-13");
    assert.ok(week1);
    assert.ok(week2);
    assert.equal(week1.review_count, 100);
    assert.equal(week2.review_count, 200);
  });

  it("warns and skips unknown logins", () => {
    const warnings: string[] = [];
    const rows = mapBotActivityRows(
      [
        {
          week: "2025-01-06",
          actor_login: "unknown-bot[bot]",
          review_count: 10,
          review_comment_count: 5,
          pr_comment_count: 3,
          repo_count: 2,
          org_count: 1,
        },
      ],
      (msg) => warnings.push(msg),
    );

    assert.equal(rows.length, 0);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("unknown-bot[bot]"));
  });
});
