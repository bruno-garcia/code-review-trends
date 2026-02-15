#!/usr/bin/env tsx
/**
 * Pipeline status dashboard.
 *
 * Shows data freshness, backfill progress, coverage gaps, and data quality
 * at a glance. Designed to be run on the server to answer:
 *   "Is the pipeline healthy? When did it last run? Is data fresh?"
 *
 * Usage:
 *   npm run status                    # full dashboard
 *   npm run status -- --json          # machine-readable output
 *   npm run status -- --check         # exit 1 if data is stale (for alerting)
 *   npm run status -- --check --max-age 14  # stale if latest data is >14 days old
 */

import { createCHClient, query } from "../clickhouse.js";
import { BOTS } from "../bots.js";
import type { ClickHouseClient } from "@clickhouse/client";

// ── Types ───────────────────────────────────────────────────────────────

export type StatusReport = {
  healthy: boolean;
  dataAge: { latestWeek: string; daysOld: number };
  coverage: { firstWeek: string; lastWeek: string; totalWeeks: number; expectedWeeks: number; missingWeeks: string[] };
  backfill: { lastChunkEnd: string | null; completedChunks: number; lastRunAt: string | null };
  bots: { id: string; name: string; totalReviews: number; latestWeek: string; weeksWithData: number }[];
  humanActivity: { totalWeeks: number; latestWeek: string };
  tables: { name: string; rows: number }[];
};

// ── Main ────────────────────────────────────────────────────────────────

export async function runStatus(argv: string[]): Promise<void> {
  const args = parseArgv(argv);
  const isJson = "--json" in args;
  const isCheck = "--check" in args;
  let maxAgeDays = 14;
  if (args["--max-age"] !== undefined) {
    const parsed = parseInt(args["--max-age"], 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.error(`Invalid --max-age value: "${args["--max-age"]}". Must be a positive integer (days).`);
      process.exit(1);
    }
    maxAgeDays = parsed;
  }

  const client = createCHClient();

  try {
    const report = await buildReport(client, maxAgeDays);

    if (isJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report, maxAgeDays);
    }

    if (isCheck && !report.healthy) {
      process.exit(1);
    }
  } finally {
    await client.close();
  }
}

async function main() {
  await runStatus(process.argv.slice(2));
}

// ── Report builder ──────────────────────────────────────────────────────

export async function buildReport(client: ClickHouseClient, maxAgeDays: number): Promise<StatusReport> {
  // Table row counts
  const tableNames = ["bots", "review_activity", "human_review_activity", "review_reactions", "repo_bot_usage", "pipeline_state"];
  const tables: { name: string; rows: number }[] = [];
  for (const name of tableNames) {
    try {
      const rows = await query<{ cnt: string }>(client, `SELECT count() AS cnt FROM ${name}`);
      tables.push({ name, rows: Number(rows[0]?.cnt ?? 0) });
    } catch {
      tables.push({ name, rows: -1 }); // table doesn't exist
    }
  }

  // Data freshness — bot activity
  const botRange = await query<{ min_week: string; max_week: string; total_weeks: string }>(
    client,
    `SELECT
       toString(min(week)) AS min_week,
       toString(max(week)) AS max_week,
       uniqExact(week) AS total_weeks
     FROM review_activity`,
  );
  const latestWeek = botRange[0]?.max_week ?? "1970-01-01";
  const firstWeek = botRange[0]?.min_week ?? "1970-01-01";
  const totalWeeks = Number(botRange[0]?.total_weeks ?? 0);

  // How old is the latest data?
  const latestDate = new Date(latestWeek + "T00:00:00Z");
  const now = new Date();
  const daysOld = Math.floor((now.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

  // Expected weeks (Mondays between first and last)
  const expectedWeeks = countMondaysBetween(firstWeek, latestWeek);

  // Find gaps — weeks present in the range that are missing
  const allWeeks = await query<{ week_str: string }>(
    client,
    `SELECT DISTINCT toString(week) AS week_str FROM review_activity ORDER BY week_str`,
  );
  const presentWeeks = new Set(allWeeks.map((r) => r.week_str));
  const missingWeeks = findMissingMondays(firstWeek, latestWeek, presentWeeks);

  // Per-bot summary
  const botStats = await query<{
    bot_id: string;
    total_reviews: string;
    latest_week: string;
    weeks_with_data: string;
  }>(
    client,
    `SELECT
       bot_id,
       sum(review_count) AS total_reviews,
       toString(max(week)) AS latest_week,
       uniqExact(week) AS weeks_with_data
     FROM review_activity
     GROUP BY bot_id
     ORDER BY total_reviews DESC`,
  );

  const botMap = new Map(BOTS.map((b) => [b.id, b]));
  const bots = botStats.map((row) => ({
    id: row.bot_id,
    name: botMap.get(row.bot_id)?.name ?? row.bot_id,
    totalReviews: Number(row.total_reviews),
    latestWeek: row.latest_week,
    weeksWithData: Number(row.weeks_with_data),
  }));

  // Human activity
  const humanRange = await query<{ total_weeks: string; max_week: string }>(
    client,
    `SELECT uniqExact(week) AS total_weeks, toString(max(week)) AS max_week FROM human_review_activity`,
  );

  // Backfill state
  let backfill: StatusReport["backfill"] = { lastChunkEnd: null, completedChunks: 0, lastRunAt: null };
  try {
    const state = await query<{ last_end: string; chunks: string; last_run: string }>(
      client,
      `SELECT
         toString(max(chunk_end)) AS last_end,
         count() AS chunks,
         toString(max(completed_at)) AS last_run
       FROM pipeline_state FINAL
       WHERE job_name = 'backfill'`,
    );
    if (state[0] && state[0].last_end !== "1970-01-01") {
      backfill = {
        lastChunkEnd: state[0].last_end,
        completedChunks: Number(state[0].chunks),
        lastRunAt: state[0].last_run,
      };
    }
  } catch {
    // pipeline_state table may not exist yet
  }

  const healthy = daysOld <= maxAgeDays && missingWeeks.length === 0;

  return {
    healthy,
    dataAge: { latestWeek, daysOld },
    coverage: { firstWeek, lastWeek: latestWeek, totalWeeks, expectedWeeks, missingWeeks },
    backfill,
    bots,
    humanActivity: {
      totalWeeks: Number(humanRange[0]?.total_weeks ?? 0),
      latestWeek: humanRange[0]?.max_week ?? "N/A",
    },
    tables,
  };
}

// ── Pretty printer ──────────────────────────────────────────────────────

function printReport(r: StatusReport, maxAgeDays: number): void {
  // Detail sections first (scroll past these)

  console.log("\n── Coverage ───────────────────────────────────────");
  console.log(`  Range:          ${r.coverage.firstWeek} → ${r.coverage.lastWeek}`);
  console.log(`  Weeks:          ${r.coverage.totalWeeks} / ${r.coverage.expectedWeeks} expected`);
  if (r.coverage.missingWeeks.length > 0) {
    console.log(`  Gaps:           ${r.coverage.missingWeeks.length} missing weeks`);
    for (const w of r.coverage.missingWeeks.slice(0, 5)) {
      console.log(`                  ${w}`);
    }
    if (r.coverage.missingWeeks.length > 5) {
      console.log(`                  ... and ${r.coverage.missingWeeks.length - 5} more`);
    }
  }

  console.log("\n── Bots ───────────────────────────────────────────");
  console.log(`  ${"Bot".padEnd(26)} ${"Reviews".padStart(10)} ${"Latest".padStart(12)}`);
  console.log(`  ${"-".repeat(50)}`);
  for (const bot of r.bots) {
    console.log(
      `  ${bot.name.padEnd(26)} ${String(bot.totalReviews).padStart(10)} ${bot.latestWeek.padStart(12)}`,
    );
  }

  // TL;DR at the bottom — the thing you actually want to see
  const icon = r.healthy ? "✅" : "❌";
  const stale = r.dataAge.daysOld > maxAgeDays;
  const gaps = r.coverage.missingWeeks.length;

  console.log("\n───────────────────────────────────────────────────");
  console.log(`  ${icon} ${r.healthy ? "Healthy" : "UNHEALTHY"}`);
  console.log(`  Latest data:  ${r.dataAge.latestWeek} (${r.dataAge.daysOld}d ago${stale ? " ⚠️ STALE" : ""})`)
  if (r.backfill.lastRunAt) {
    console.log(`  Last run:     ${r.backfill.lastRunAt} (backfill through ${r.backfill.lastChunkEnd})`);
  } else {
    console.log(`  Last run:     never`);
  }
  if (gaps > 0) {
    console.log(`  Gaps:         ${gaps} missing weeks`);
  }
  console.log("");
}

// ── Helpers ─────────────────────────────────────────────────────────────

export function countMondaysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  let count = 0;
  const cursor = new Date(s);
  // Advance to first Monday
  while (cursor.getUTCDay() !== 1 && cursor <= e) cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= e) {
    count++;
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return count;
}

export function findMissingMondays(start: string, end: string, present: Set<string>): string[] {
  const missing: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const cursor = new Date(s);
  // Advance to first Monday
  while (cursor.getUTCDay() !== 1 && cursor <= e) cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= e) {
    const dateStr = cursor.toISOString().split("T")[0];
    if (!present.has(dateStr)) {
      missing.push(dateStr);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return missing;
}

function parseArgv(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        result[arg] = next;
        i++;
      } else {
        result[arg] = "true";
      }
    }
  }
  return result;
}

// Only run when executed directly (not when imported by cli.ts)
const isDirectRun = process.argv[1]?.endsWith("status.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
