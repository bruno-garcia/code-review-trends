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

// Sentry must be imported first to instrument all subsequent modules
import { Sentry } from "./sentry.js";

import { BOTS, BOT_BY_LOGIN, BOT_LOGINS, PRODUCTS } from "./bots.js";
import {
  createCHClient,
  syncProducts,
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
  status: cmdStatus,
  migrate: cmdMigrate,
  discover: cmdDiscover,
  enrich: cmdEnrich,
  "enrich-status": cmdEnrichStatus,
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

  const chUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
  console.log(`ClickHouse: ${chUrl}`);

  await Sentry.startSpan(
    {
      op: "pipeline.command",
      name: `pipeline ${command}`,
    },
    async () => {
      await handler();
    },
  );

  // Flush all events before the process exits
  await Sentry.flush(5000);
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
  status             Show pipeline health, data freshness, and coverage
  migrate            Apply schema + bot data to ClickHouse (staging/prod/local)
  discover           Discover PR bot events from BigQuery into pr_bot_events
  enrich             Run GitHub API enrichment (repos → PRs → comments)
  enrich-status      Show enrichment progress
  help               Show this help message

Options for fetch-bigquery:
  --start YYYY-MM-DD   Start date (default: 3 months ago)
  --end YYYY-MM-DD     End date (default: today)
  --all                Fetch full history from 2023-01-01
  --dry-run            Show what would be fetched without running

Options for backfill:
  --start YYYY-MM-DD   Start date (default: 3 months ago)
  --end YYYY-MM-DD     End date (default: today)
  --all                Backfill full history from 2023-01-01
  --no-resume          Ignore previous progress, start from scratch
  --dry-run            Show chunks without running

Options for sync:
  --weeks N            How many weeks back to fetch (default: 2)

Options for status:
  --json               Output machine-readable JSON
  --check              Exit 1 if data is stale (for monitoring/alerting)
  --max-age N          Days before data is considered stale (default: 14)

Options for migrate:
  --stack STACK        Pulumi stack name (default: staging)
  --dry-run            Show what would be applied without running
  --local              Use local ClickHouse instead of Pulumi creds

  Applies all db/init/*.sql files (schema + bot data) and syncs the bot
  registry from bots.ts. Does NOT apply db/seed/ (fake data).
  Safe to re-run — schema uses IF NOT EXISTS, bot data uses TRUNCATE+INSERT.

Options for discover:
  --start YYYY-MM-DD   Start date (default: 3 months ago)
  --end YYYY-MM-DD     End date (default: today)
  --all                Discover full history from 2023-01-01
  --dry-run            Show what would be fetched without running

Options for enrich:
  --token TOKEN        GitHub PAT (or set GITHUB_TOKEN env var)
  --worker-id N        Worker ID for partitioning (default: 0)
  --total-workers N    Total workers (default: 1)
  --limit N            Max items per entity type per run
  --priority TYPE      Start with: repos|prs|comments (default: repos)
  --stale-days N       Repo refresh threshold in days (default: 7)

Environment variables:
  CLICKHOUSE_URL       ClickHouse HTTP URL (default: http://localhost:8123)
  CLICKHOUSE_USER      ClickHouse user (default: default)
  CLICKHOUSE_PASSWORD  ClickHouse password (default: dev)
  CLICKHOUSE_DB        ClickHouse database (default: code_review_trends)
  GCP_PROJECT_ID       GCP project for BigQuery
  BQ_MAX_BYTES_BILLED  Max bytes BigQuery can scan (default: 15TB)
  GITHUB_TOKEN         GitHub PAT for API enrichment
  PULUMI_CONFIG_PASSPHRASE  Passphrase for Pulumi secrets (if not using interactive login)
  `);
}

async function cmdSyncBots() {
  console.log(`Syncing ${PRODUCTS.length} products and ${BOTS.length} bots to ClickHouse...`);
  const client = createCHClient();
  try {
    await syncProducts(client, PRODUCTS);
    console.log(`✓ Synced ${PRODUCTS.length} products`);
    await syncBots(client, BOTS);
    console.log(`✓ Synced ${BOTS.length} bots`);
  } finally {
    await client.close();
  }
}

async function cmdFetchBigQuery() {
  const args = parseArgs();
  const all = "--all" in args;
  const startDate = args["--start"] ?? (all ? FULL_HISTORY_START : defaultStart());
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
    let elapsed = startTimer("  Waiting for BigQuery");
    const botRows = await queryBotReviewActivity(bq, startDate, endDate, logins).finally(elapsed);
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
          org_count: Number(row.org_count),
        };
      })
      .filter((r): r is ReviewActivityRow => r !== null);

    // Fetch human activity
    console.log("Querying human review activity...");
    elapsed = startTimer("  Waiting for BigQuery");
    const humanRows = await queryHumanReviewActivity(bq, startDate, endDate, logins).finally(elapsed);
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
  const all = "--all" in args;
  const startDate = args["--start"] ?? (all ? FULL_HISTORY_START : defaultStart());
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

  if (!Number.isFinite(weeks) || weeks < 1) {
    console.error(`Invalid --weeks value: "${args["--weeks"]}". Must be a positive integer.`);
    process.exit(1);
  }

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

async function cmdStatus() {
  const { runStatus } = await import("./tools/status.js");
  await runStatus(process.argv.slice(3));
}

async function cmdMigrate() {
  const args = parseArgs();
  const dryRun = "--dry-run" in args;
  const useLocal = "--local" in args;
  const stack = args["--stack"] ?? "staging";

  const { readFileSync, readdirSync } = await import("fs");
  const { resolve, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const { execFileSync } = await import("child_process");

  // Find all SQL files in db/init/ (schema + bot data), sorted by name
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const initDir = resolve(__dirname, "../../db/init");
  const sqlFiles = readdirSync(initDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      name: f,
      path: resolve(initDir, f),
      content: readFileSync(resolve(initDir, f), "utf-8"),
    }));

  // Collect all statements from all SQL files
  const allStatements: { file: string; sql: string }[] = [];
  for (const file of sqlFiles) {
    const stmts = file.content
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const sql of stmts) {
      allStatements.push({ file: file.name, sql });
    }
  }

  console.log(`Found ${sqlFiles.length} SQL files in db/init/:`);
  for (const file of sqlFiles) {
    const count = allStatements.filter((s) => s.file === file.name).length;
    console.log(`  ${file.name} (${count} statements)`);
  }
  console.log(`Total: ${allStatements.length} statements`);

  if (dryRun) {
    console.log("\n(dry run — showing statements that would be applied)\n");
    for (const { file, sql } of allStatements) {
      const firstLine = sql.split("\n").find((l) => !l.startsWith("--") && l.trim().length > 0) ?? sql;
      console.log(`  [${file}] ${firstLine.trim().slice(0, 70)}`);
    }
    console.log(`\nWould also sync ${PRODUCTS.length} products and ${BOTS.length} bots from registry.`);
    return;
  }

  let clickhouseUrl: string;
  let clickhousePassword: string;

  if (useLocal) {
    clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
    clickhousePassword = process.env.CLICKHOUSE_PASSWORD ?? "dev";
    console.log(`\nUsing local ClickHouse: ${clickhouseUrl}`);
  } else {
    // Get credentials from Pulumi stack outputs
    const infraDir = resolve(__dirname, "../../infra");
    console.log(`\nReading credentials from Pulumi stack '${stack}'...`);

    try {
      clickhouseUrl = execFileSync(
        "pulumi",
        ["stack", "output", "clickhouseUrl", "--stack", stack, "--show-secrets"],
        { cwd: infraDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      clickhousePassword = execFileSync(
        "pulumi",
        ["stack", "output", "clickhousePassword", "--stack", stack, "--show-secrets"],
        { cwd: infraDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\nFailed to read Pulumi outputs. Make sure you're authenticated.`);
      console.error(`  Stack: ${stack}`);
      console.error(`  Infra dir: ${infraDir}`);
      if (msg.includes("invalid_grant") || msg.includes("oauth2")) {
        console.error(`\nHint: Run 'gcloud auth application-default login' to refresh GCP credentials.`);
      }
      if (msg.includes("passphrase")) {
        console.error(`\nHint: Set PULUMI_CONFIG_PASSPHRASE env var or run 'pulumi login'.`);
      }
      console.error(`\nAlternatively, use --local to migrate local ClickHouse,`);
      console.error(`or set CLICKHOUSE_URL and CLICKHOUSE_PASSWORD env vars directly.`);
      process.exit(1);
    }

    // Mask the URL in logs (show host only)
    const urlObj = new URL(clickhouseUrl);
    console.log(`  ClickHouse: ${urlObj.hostname}:${urlObj.port}`);
  }

  const clickhouseUser = process.env.CLICKHOUSE_USER ?? "default";

  // Apply SQL statements
  console.log(`\nApplying ${allStatements.length} SQL statements...\n`);
  let applied = 0;
  let errors = 0;

  const { createClient } = await import("@clickhouse/client");
  const client = createClient({
    url: clickhouseUrl,
    username: clickhouseUser,
    password: clickhousePassword,
  });

  try {
    for (const { file, sql } of allStatements) {
      const firstLine = sql.split("\n").find((l) => !l.startsWith("--") && l.trim().length > 0) ?? sql;
      const preview = firstLine.trim().slice(0, 70);

      try {
        await client.command({ query: sql });
        console.log(`  ✓ [${file}] ${preview}`);
        applied++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ [${file}] ${preview}`);
        console.error(`    Error: ${msg.split("\n")[0]}`);
        errors++;
      }
    }

    if (errors > 0) {
      console.error(`\n${errors} SQL statement(s) failed. Aborting before bot registry sync.`);
      process.exitCode = 1;
      return;
    }

    // Sync bot registry from bots.ts (source of truth)
    console.log(`\nSyncing bot registry...`);
    const chClient = createCHClient({
      url: clickhouseUrl,
      username: clickhouseUser,
      password: clickhousePassword,
      database: process.env.CLICKHOUSE_DB ?? "code_review_trends",
    });
    try {
      await syncProducts(chClient, PRODUCTS);
      console.log(`  ✓ Synced ${PRODUCTS.length} products`);
      await syncBots(chClient, BOTS);
      console.log(`  ✓ Synced ${BOTS.length} bots`);
    } finally {
      await chClient.close();
    }

    console.log(`\nDone: ${applied} SQL statements applied, ${PRODUCTS.length} products and ${BOTS.length} bots synced.`);
  } finally {
    await client.close();
  }
}

async function cmdDiscover() {
  const args = parseArgs();
  const all = "--all" in args;
  const startDate = args["--start"] ?? (all ? FULL_HISTORY_START : defaultStart());
  const endDate = args["--end"] ?? formatDate(new Date());
  const dryRun = "--dry-run" in args;

  const logins = [...BOT_LOGINS];
  console.log(`Discovering PR bot events: ${startDate} → ${endDate}`);
  console.log(`Tracking ${logins.length} bot logins`);

  if (dryRun) {
    console.log("Would query GH Archive for PR-level bot events");
    console.log(`  Bot logins: ${logins.join(", ")}`);
    console.log("(dry run — no data will be written)");
    return;
  }

  const { queryBotPREvents } = await import("./bigquery.js");
  const { insertPrBotEvents } = await import("./clickhouse.js");

  const bq = createBigQueryClient();
  const ch = createCHClient();

  try {
    console.log("Querying BigQuery for PR bot events...");
    const elapsed = startTimer("  Waiting for BigQuery");
    const rows = await queryBotPREvents(bq, startDate, endDate, logins).finally(elapsed);
    console.log(`  Got ${rows.length} PR bot event rows`);

    // Map BigQuery rows to ClickHouse rows
    const chRows = rows
      .map((row) => {
        const bot = BOT_BY_LOGIN.get(row.actor_login);
        if (!bot) {
          console.warn(`  Unknown bot login: ${row.actor_login}`);
          return null;
        }
        return {
          repo_name: row.repo_name,
          pr_number: Number(row.pr_number),
          bot_id: bot.id,
          actor_login: row.actor_login,
          event_type: row.event_type,
          event_week: row.week,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    console.log("Writing to ClickHouse...");
    const elapsedWrite = startTimer("  Inserting batches");
    await insertPrBotEvents(ch, chRows).finally(elapsedWrite);
    console.log(`  ✓ Inserted ${chRows.length} pr_bot_events rows`);
    console.log("Done!");
  } finally {
    await ch.close();
  }
}

async function cmdEnrich() {
  const args = parseArgs();
  const token = args["--token"] ?? process.env.GITHUB_TOKEN;

  if (!token) {
    console.error("Error: GitHub token required. Use --token or set GITHUB_TOKEN env var.");
    process.exit(1);
  }

  const { runEnrichment } = await import("./enrichment/worker.js");

  function parseIntArg(name: string, value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0) {
      console.error(`Error: ${name} must be a non-negative integer, got "${value}"`);
      process.exit(1);
    }
    return n;
  }

  const result = await runEnrichment({
    githubToken: token,
    workerId: parseIntArg("--worker-id", args["--worker-id"]),
    totalWorkers: parseIntArg("--total-workers", args["--total-workers"]),
    limit: parseIntArg("--limit", args["--limit"]),
    staleDays: parseIntArg("--stale-days", args["--stale-days"]),
    priority: args["--priority"] as "repos" | "prs" | "comments" | undefined,
  });

  console.log("\n=== Enrichment Summary ===");
  console.log(`Repos:     ${result.repos.fetched} fetched, ${result.repos.skipped} skipped, ${result.repos.errors} errors`);
  console.log(`PRs:       ${result.pullRequests.fetched} fetched, ${result.pullRequests.skipped} skipped, ${result.pullRequests.errors} errors`);
  console.log(`Comments:  ${result.comments.fetched} fetched, ${result.comments.skipped} skipped, ${result.comments.replies_filtered} replies filtered, ${result.comments.errors} errors`);
  console.log(`Stale repos refreshed: ${result.reposRefreshed}`);
  console.log(`Duration: ${Math.ceil(result.duration / 1000)}s`);
}

async function cmdEnrichStatus() {
  const { query } = await import("./clickhouse.js");
  const ch = createCHClient();

  try {
    // Total discovered events
    const [{ total_events }] = await query<{ total_events: string }>(
      ch,
      "SELECT count() as total_events FROM pr_bot_events",
    );

    // Repo stats
    const [repoStats] = await query<{
      total: string;
      enriched: string;
      not_found: string;
    }>(
      ch,
      `SELECT
        countDistinct(e.repo_name) as total,
        countDistinctIf(e.repo_name, r.fetch_status = 'ok') as enriched,
        countDistinctIf(e.repo_name, r.fetch_status = 'not_found') as not_found
      FROM pr_bot_events AS e
      LEFT JOIN repos AS r ON e.repo_name = r.name`,
    );
    const repoPending = Number(repoStats.total) - Number(repoStats.enriched) - Number(repoStats.not_found);

    // PR stats
    const [prStats] = await query<{
      total: string;
      enriched: string;
    }>(
      ch,
      `SELECT
        (SELECT count(DISTINCT (repo_name, pr_number)) FROM pr_bot_events) as total,
        (SELECT count() FROM pull_requests) as enriched`,
    );
    const prPending = Number(prStats.total) - Number(prStats.enriched);

    // Comment stats
    const [commentStats] = await query<{
      total: string;
      enriched: string;
    }>(
      ch,
      `SELECT
        (SELECT count(DISTINCT (repo_name, pr_number, bot_id)) FROM pr_bot_events) as total,
        (SELECT count(DISTINCT (repo_name, pr_number, bot_id)) FROM pr_comments) as enriched`,
    );
    const commentPending = Number(commentStats.total) - Number(commentStats.enriched);

    console.log("=== Enrichment Status ===");
    console.log(`\nDiscovered events: ${total_events}`);
    console.log(`\nRepos:    ${repoStats.enriched} enriched / ${repoStats.not_found} not found / ${repoPending} pending (${repoStats.total} total)`);
    console.log(`PRs:      ${prStats.enriched} enriched / ${prPending} pending (${prStats.total} total)`);
    console.log(`Comments: ${commentStats.enriched} enriched / ${commentPending} pending (${commentStats.total} total)`);
  } finally {
    await ch.close();
  }
}

// --- Helpers ---

/**
 * Start a timer that prints elapsed seconds to stderr every interval.
 * Returns a stop function that clears the timer and prints the final time.
 */
function startTimer(label: string, intervalSecs = 15): () => void {
  const start = Date.now();
  const interval = setInterval(() => {
    const secs = Math.round((Date.now() - start) / 1000);
    process.stderr.write(`\r${label}... ${secs}s`);
  }, intervalSecs * 1000);
  return () => {
    clearInterval(interval);
    const secs = Math.round((Date.now() - start) / 1000);
    process.stderr.write(`\r${label}... done (${secs}s)\n`);
  };
}

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

/** Full historical start date for --all imports. */
const FULL_HISTORY_START = "2023-01-01";

/** Default start date: 3 months ago (1st of that month to avoid day-overflow). */
function defaultStart(): string {
  const d = new Date();
  d.setDate(1); // avoid setMonth overflow (e.g. May 31 → Mar 3)
  d.setMonth(d.getMonth() - 3);
  return formatDate(d);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

main().catch(async (err) => {
  const command = process.argv[2] ?? "unknown";
  const args = process.argv.slice(3).join(" ");

  Sentry.captureException(err, {
    contexts: {
      pipeline: {
        command,
        args,
        argv: process.argv.join(" "),
        clickhouse_url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123 (default)",
      },
    },
  });

  console.error("Fatal error:", err);
  // Flush Sentry events before exiting
  await Sentry.flush(5000);
  process.exit(1);
});
