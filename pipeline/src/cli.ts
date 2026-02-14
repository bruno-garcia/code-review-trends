#!/usr/bin/env tsx
/**
 * CLI entry point for the data pipeline.
 *
 * Usage:
 *   npm run cli -- <command> [options]
 *
 * Commands:
 *   sync-bots              Push bot definitions to ClickHouse
 *   fetch-bigquery         Pull review data from GH Archive via BigQuery
 *   fetch-reactions        Pull reaction data from GitHub API
 *   discover-bots          Find bot accounts doing reviews in GH Archive
 *   backfill               Run full historical backfill from BigQuery
 *
 * All commands are idempotent. Safe to re-run.
 */

import { BOTS, BOT_BY_LOGIN, BOT_LOGINS } from "./bots.js";
import {
  createCHClient,
  syncBots,
  insertReviewActivity,
  insertHumanActivity,
  type ReviewActivityRow,
  type HumanActivityRow,
} from "./clickhouse.js";
import {
  createBigQueryClient,
  queryBotReviewActivity,
  queryHumanReviewActivity,
} from "./bigquery.js";
import { backfill, syncRecent, monthlyChunks, bigQueryFetcher } from "./sync.js";

const COMMANDS: Record<string, () => Promise<void>> = {
  "sync-bots": cmdSyncBots,
  "fetch-bigquery": cmdFetchBigQuery,
  backfill: cmdBackfill,
  sync: cmdSync,
  help: cmdHelp,
};

async function main() {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    await cmdHelp();
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error(`Run with --help to see available commands.`);
    process.exit(1);
  }

  await handler();
}

async function cmdHelp() {
  console.log(`
Pipeline CLI — Code Review Trends

Usage: npm run cli -- <command>

Commands:
  sync-bots          Push bot registry to ClickHouse
  fetch-bigquery     Pull weekly review data from GH Archive (single range)
  backfill           Full historical import, month by month (resumable)
  sync               Fetch recent weeks (for scheduled/cron runs)
  help               Show this help message

Options for fetch-bigquery:
  --start YYYY-MM-DD   Start date (default: 4 weeks ago)
  --end YYYY-MM-DD     End date (default: today)
  --dry-run            Show what would be fetched without running

Options for backfill:
  --start YYYY-MM-DD   Start date (default: 2023-01-01)
  --end YYYY-MM-DD     End date (default: today)
  --no-resume          Ignore previous progress, start from scratch
  --dry-run            Show chunks without running

Options for sync:
  --weeks N            How many weeks back to fetch (default: 2)

Environment variables:
  CLICKHOUSE_URL       ClickHouse HTTP URL (default: http://localhost:8123)
  CLICKHOUSE_USER      ClickHouse user (default: default)
  CLICKHOUSE_PASSWORD  ClickHouse password (default: dev)
  CLICKHOUSE_DB        ClickHouse database (default: code_review_trends)
  GCP_PROJECT_ID       GCP project for BigQuery
  BQ_MAX_BYTES_BILLED  Max bytes BigQuery can scan (default: 10GB)
  GITHUB_TOKEN         GitHub PAT for API enrichment
  `);
}

async function cmdSyncBots() {
  console.log(`Syncing ${BOTS.length} bot definitions to ClickHouse...`);
  const client = createCHClient();
  try {
    await syncBots(client, BOTS);
    console.log(`✓ Synced ${BOTS.length} bots`);
  } finally {
    await client.close();
  }
}

async function cmdFetchBigQuery() {
  const args = parseArgs();
  const startDate =
    args["--start"] ?? formatDate(weeksAgo(4));
  const endDate = args["--end"] ?? formatDate(new Date());
  const dryRun = "--dry-run" in args;

  console.log(`Fetching BigQuery data: ${startDate} → ${endDate}`);
  if (dryRun) {
    console.log("(dry run — no data will be written)");
  }

  const logins = [...BOT_LOGINS];
  console.log(`Tracking ${logins.length} bot logins`);

  if (dryRun) {
    console.log("Would query GH Archive for:");
    console.log(`  - Bot review events for: ${logins.join(", ")}`);
    console.log(`  - Human review totals (excluding bots)`);
    return;
  }

  const bq = createBigQueryClient();
  const ch = createCHClient();

  try {
    // Fetch bot activity
    console.log("Querying bot review activity...");
    const botRows = await queryBotReviewActivity(bq, startDate, endDate, logins);
    console.log(`  Got ${botRows.length} bot activity rows`);

    // Map BigQuery results to ClickHouse rows
    const activityRows: ReviewActivityRow[] = botRows
      .map((row) => {
        const bot = BOT_BY_LOGIN.get(row.actor_login);
        if (!bot) {
          console.warn(`  Unknown bot login: ${row.actor_login}`);
          return null;
        }
        return {
          week: row.week,
          bot_id: bot.id,
          review_count: Number(row.review_count),
          review_comment_count: Number(row.review_comment_count),
          repo_count: Number(row.repo_count),
        };
      })
      .filter((r): r is ReviewActivityRow => r !== null);

    // Fetch human activity
    console.log("Querying human review activity...");
    const humanRows = await queryHumanReviewActivity(bq, startDate, endDate, logins);
    console.log(`  Got ${humanRows.length} human activity rows`);

    const humanActivityRows: HumanActivityRow[] = humanRows.map((row) => ({
      week: row.week,
      review_count: Number(row.review_count),
      review_comment_count: Number(row.review_comment_count),
      repo_count: Number(row.repo_count),
    }));

    // Write to ClickHouse
    console.log("Writing to ClickHouse...");
    await insertReviewActivity(ch, activityRows);
    console.log(`  ✓ Inserted ${activityRows.length} review_activity rows`);

    await insertHumanActivity(ch, humanActivityRows);
    console.log(`  ✓ Inserted ${humanActivityRows.length} human_review_activity rows`);

    console.log("Done!");
  } finally {
    await ch.close();
  }
}

async function cmdBackfill() {
  const args = parseArgs();
  const startDate = args["--start"] ?? "2023-01-01";
  const endDate = args["--end"] ?? formatDate(new Date());
  const noResume = "--no-resume" in args;
  const dryRun = "--dry-run" in args;

  if (dryRun) {
    const chunks = monthlyChunks(startDate, endDate);
    console.log(`Backfill: ${chunks.length} monthly chunks from ${startDate} to ${endDate}\n`);
    for (let i = 0; i < chunks.length; i++) {
      console.log(`  [${i + 1}/${chunks.length}] ${chunks[i].startDate} → ${chunks[i].endDate}`);
    }
    console.log("\n(dry run — no queries will be executed)");
    return;
  }

  const fetcher = bigQueryFetcher(createBigQueryClient());
  const ch = createCHClient();

  try {
    await backfill(fetcher, ch, {
      startDate,
      endDate,
      resume: !noResume,
    });
  } finally {
    await ch.close();
  }
}

async function cmdSync() {
  const args = parseArgs();
  const weeks = args["--weeks"] ? parseInt(args["--weeks"], 10) : 2;

  const fetcher = bigQueryFetcher(createBigQueryClient());
  const ch = createCHClient();

  try {
    const result = await syncRecent(fetcher, ch, { weeks });
    console.log(
      `\nSync complete: ${result.botRows} bot rows, ${result.humanRows} human rows`,
    );
  } finally {
    await ch.close();
  }
}

// --- Helpers ---

function parseArgs(): Record<string, string> {
  const result: Record<string, string> = {};
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const next = args[i + 1];
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

function weeksAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
