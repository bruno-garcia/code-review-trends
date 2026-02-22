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

// Sentry must be imported first to instrument all subsequent modules.
// This also validates --env (required) and configures Sentry environment/tags.
import { Sentry, log, withCronMonitor, countMetric, pipelineEnv } from "./sentry.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const schedules: Record<string, { cron: string; maxRuntime: number; description: string }> = require("../schedules.json");

/**
 * Expected CLI errors (bad args, missing creds, etc.).
 * These are reported to Sentry at "warning" level — not as crashes.
 */
class CliError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CliError";
  }
}

import { BOTS, BOT_LOGINS, PRODUCTS } from "./bots.js";
import {
  createCHClient,
  syncProducts,
  syncBots,
  insertReviewActivity,
  insertHumanActivity,
  optimizeTables,
} from "./clickhouse.js";
import {
  createBigQueryClient,
  queryBotReviewActivity,
  queryHumanReviewActivity,
} from "./bigquery.js";
import { backfill, syncRecent, monthlyChunks, bigQueryFetcher, mapBotActivityRows, mapHumanActivityRows } from "./sync.js";

const COMMANDS: Record<string, () => Promise<void>> = {
  "sync-bots": cmdSyncBots,
  "fetch-bigquery": cmdFetchBigQuery,
  backfill: cmdBackfill,
  sync: cmdSync,
  status: cmdStatus,
  migrate: cmdMigrate,
  discover: cmdDiscover,
  "discover-bots": cmdDiscoverBots,
  enrich: cmdEnrich,
  "enrich-status": cmdEnrichStatus,
  "validate-bq-prs": cmdValidateBqPrs,
  "generate-compare-pairs": cmdGenerateComparePairs,
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
    throw new CliError(`Unknown command: ${command}. Run with --help to see available commands.`);
  }

  const chUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
  log(`Environment: ${pipelineEnv}`);
  log(`ClickHouse:  ${chUrl}`);

  // Commands that run on a schedule get cron monitoring (from schedules.json)
  const schedule = schedules[command as keyof typeof schedules];
  const cronSlug = schedule ? `pipeline-${command}` : undefined;

  const run = async () => Sentry.startSpan(
    { op: "pipeline.command", name: `pipeline ${command}`, forceTransaction: true },
    async (span) => {
      log(`[sentry] Root span started: trace=${span.spanContext().traceId} span=${span.spanContext().spanId}`);
      await handler();
    },
  );

  if (cronSlug) {
    await withCronMonitor(cronSlug, run, { type: "crontab", value: schedule.cron }, schedule.maxRuntime);
  } else {
    await run();
  }

  // Flush all events before the process exits (10s to handle large batches of spans/errors)
  await Sentry.flush(10000);
}

async function cmdGenerateComparePairs() {
  const { generateComparePairs } = await import("./tools/generate-compare-pairs.js");
  await generateComparePairs();
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
  discover-bots      Find new bot accounts (BigQuery + Marketplace + App verification)
  enrich             Run GitHub API enrichment (repos → PRs → comments → reactions)
  enrich-status      Show enrichment progress
  validate-bq-prs    Compare PR data from BigQuery vs GitHub API
  generate-compare-pairs  Generate compare pair metadata for the app
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

Options for discover-bots:
  --start YYYY-MM-DD   Start date (default: 30 days ago)
  --end YYYY-MM-DD     End date (default: today)
  --marketplace-only   Skip BigQuery [bot] scan
  --bigquery-only      Skip marketplace scan

Options for enrich:
  --token TOKEN        GitHub PAT (or set GITHUB_TOKEN env var)
  --worker-id N        Worker ID for partitioning (default: 0)
  --total-workers N    Total workers (default: 1)
  --limit N            Max items per entity type per run
  --priority TYPE      Start with: repos|prs|comments|reactions (default: repos)
  --stale-days N       Repo refresh threshold in days (default: 7)
  --exit-on-rate-limit Exit cleanly (exit 0) when rate-limited instead of sleeping

Options for validate-bq-prs:
  --sample N           Number of PRs to compare (default: 500)

Environment variables:
  CLICKHOUSE_URL       ClickHouse HTTP URL (default: http://localhost:8123)
  CLICKHOUSE_USER      ClickHouse user (default: default)
  CLICKHOUSE_PASSWORD  ClickHouse password (default: dev)
  CLICKHOUSE_DB        ClickHouse database (default: code_review_trends)
  GCP_PROJECT_ID       GCP project for BigQuery
  BQ_MAX_BYTES_BILLED  Max bytes BigQuery can scan (default: 15TB)
  GITHUB_TOKEN         GitHub PAT for API enrichment
  PULUMI_CONFIG_PASSPHRASE  Passphrase for Pulumi secrets (if not using interactive login)

Global options:
  --env ENV            Runtime environment: development | staging | production (REQUIRED)
                       Identifies where the pipeline is running, not which DB it talks to.
                       Falls back to NODE_ENV if set (e.g. in Cloud Run jobs).
  --no-sentry          Disable Sentry observability (tracing, crons, metrics)
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
    console.log("Optimizing tables...");
    await optimizeTables(client, ["products", "bots", "bot_logins"]);
    console.log("✓ Tables optimized");
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

    // Map BigQuery results to ClickHouse rows (aggregates multiple logins per bot_id)
    const activityRows = mapBotActivityRows(botRows, (msg) => console.warn(msg));

    // Fetch human activity
    console.log("Querying human review activity...");
    elapsed = startTimer("  Waiting for BigQuery");
    const humanRows = await queryHumanReviewActivity(bq, startDate, endDate, logins).finally(elapsed);
    console.log(`  Got ${humanRows.length} human activity rows`);

    const humanActivityRows = mapHumanActivityRows(humanRows);

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
    console.log("Optimizing tables...");
    await optimizeTables(ch, ["review_activity", "human_review_activity"]);
    console.log("✓ Tables optimized");
  } finally {
    await ch.close();
  }
}

async function cmdSync() {
  const args = parseArgs();
  const weeks = args["--weeks"] ? parseInt(args["--weeks"], 10) : 2;

  if (!Number.isFinite(weeks) || weeks < 1) {
    throw new CliError(`Invalid --weeks value: "${args["--weeks"]}". Must be a positive integer.`);
  }

  const fetcher = bigQueryFetcher(createBigQueryClient());
  const ch = createCHClient();

  try {
    const result = await syncRecent(fetcher, ch, { weeks });
    console.log(
      `\nSync complete: ${result.botRows} bot rows, ${result.humanRows} human rows`,
    );
    console.log("Optimizing tables...");
    await optimizeTables(ch, ["review_activity", "human_review_activity"]);
    console.log("✓ Tables optimized");
  } finally {
    await ch.close();
  }
}

async function cmdStatus() {
  const { runStatus } = await import("./tools/status.js");
  await runStatus(process.argv.slice(3));
}

/**
 * Schema migration versions — must match MIGRATIONS in app/src/lib/migrations.ts.
 * When adding a new migration to the app, add the corresponding entry here.
 */
const SCHEMA_MIGRATIONS: { version: number; name: string }[] = [
  { version: 1, name: "initial_schema" },
  { version: 2, name: "pr_bot_reactions" },
  { version: 3, name: "pr_bot_event_counts" },
  { version: 4, name: "drop_repo_languages" },
  { version: 5, name: "reaction_only_review_counts" },
  { version: 6, name: "comment_stats_weekly" },
  { version: 7, name: "reaction_only_repo_counts" },
  { version: 8, name: "comment_stats_reacted_count" },
  { version: 9, name: "product_status" },
  { version: 10, name: "pr_product_characteristics" },
];

/** Query the current schema version from a ClickHouse database. Returns 0 if no migrations table. */
async function querySchemaVersion(client: import("@clickhouse/client").ClickHouseClient, database: string): Promise<{
  version: number;
  appliedVersions: { version: number; name: string; applied_at: string }[];
}> {
  try {
    const result = await client.query({
      query: `SELECT version, name, toString(applied_at) as applied_at FROM ${database}.schema_migrations ORDER BY version`,
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as { version: number; name: string; applied_at: string }[];
    const maxVersion = rows.reduce((max, r) => Math.max(max, r.version), 0);
    return { version: maxVersion, appliedVersions: rows };
  } catch (err) {
    // Table doesn't exist yet — fresh database
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNKNOWN_TABLE") || msg.includes("doesn't exist") || msg.includes("does not exist")) {
      return { version: 0, appliedVersions: [] };
    }
    throw err;
  }
}

async function cmdMigrate() {
  const args = parseArgs();
  const dryRun = "--dry-run" in args;
  const useLocal = "--local" in args;
  const stackExplicitlyProvided = "--stack" in args;
  const stack = args["--stack"] ?? "staging";

  const { readFileSync, readdirSync } = await import("fs");
  const { resolve, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const { execFileSync } = await import("child_process");

  const targetVersion = SCHEMA_MIGRATIONS[SCHEMA_MIGRATIONS.length - 1].version;

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

  // --- Resolve ClickHouse connection ---

  let clickhouseUrl: string;
  let clickhousePassword: string;

  // Default to local ClickHouse if neither --local nor --stack is explicitly provided
  if (useLocal || !stackExplicitlyProvided) {
    clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";
    clickhousePassword = process.env.CLICKHOUSE_PASSWORD ?? "dev";
    console.log(`Target: local ClickHouse (${clickhouseUrl})`);
  } else {
    // Get credentials from Pulumi stack outputs
    const infraDir = resolve(__dirname, "../../infra");
    console.log(`Target: Pulumi stack '${stack}'`);

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
      const hints = [];
      if (msg.includes("invalid_grant") || msg.includes("oauth2")) {
        hints.push("Run 'gcloud auth application-default login' to refresh GCP credentials.");
      }
      if (msg.includes("passphrase")) {
        hints.push("Set PULUMI_CONFIG_PASSPHRASE env var or run 'pulumi login'.");
      }
      hints.push(
        "Alternatively, use --local to migrate local ClickHouse, or set CLICKHOUSE_URL and CLICKHOUSE_PASSWORD env vars directly.",
      );
      throw new CliError(
        `Failed to read Pulumi outputs (stack: ${stack}, infra: ${infraDir}).\n` +
          hints.map((h) => `  Hint: ${h}`).join("\n"),
        { cause: err },
      );
    }

    // Mask the URL in logs (show host only)
    const urlObj = new URL(clickhouseUrl);
    console.log(`  ClickHouse: ${urlObj.hostname}:${urlObj.port}`);
  }

  const clickhouseUser = process.env.CLICKHOUSE_USER ?? "default";
  const clickhouseDb = process.env.CLICKHOUSE_DB ?? "code_review_trends";

  // --- Query current DB version ---

  const { createClient } = await import("@clickhouse/client");
  const client = createClient({
    url: clickhouseUrl,
    username: clickhouseUser,
    password: clickhousePassword,
  });

  try {
    const { version: currentVersion, appliedVersions } = await querySchemaVersion(client, clickhouseDb);
    const appliedSet = new Set(appliedVersions.map((v) => v.version));
    const pendingMigrations = SCHEMA_MIGRATIONS.filter((m) => !appliedSet.has(m.version));

    // --- Show version summary ---

    console.log("");
    console.log(`Schema version:  v${currentVersion} → v${targetVersion}`);
    if (currentVersion > targetVersion) {
      console.log(`Status:          ⚠ database is ahead of CLI (v${currentVersion} > v${targetVersion})`);
    } else if (currentVersion === targetVersion) {
      console.log(`Status:          ✓ up to date`);
    } else if (currentVersion === 0) {
      console.log(`Status:          fresh database (${pendingMigrations.length} migrations to record)`);
    } else {
      console.log(`Status:          ${pendingMigrations.length} migration(s) to record`);
    }

    // Show migration history
    console.log("");
    for (const m of SCHEMA_MIGRATIONS) {
      const applied = appliedVersions.find((a) => a.version === m.version);
      if (applied) {
        console.log(`  v${m.version} ${m.name} — applied ${applied.applied_at}`);
      } else {
        console.log(`  v${m.version} ${m.name} — pending`);
      }
    }

    // Show SQL files
    console.log("");
    console.log(`SQL files (${sqlFiles.length}):`);
    for (const file of sqlFiles) {
      const count = allStatements.filter((s) => s.file === file.name).length;
      console.log(`  ${file.name} (${count} statements)`);
    }

    if (dryRun) {
      console.log(`\n(dry run — showing what would be applied)\n`);
      for (const { file, sql } of allStatements) {
        const firstLine = sql.split("\n").find((l) => !l.startsWith("--") && l.trim().length > 0) ?? sql;
        console.log(`  [${file}] ${firstLine.trim().slice(0, 70)}`);
      }
      console.log(`\nWould also sync ${PRODUCTS.length} products and ${BOTS.length} bots from registry.`);
      if (pendingMigrations.length > 0) {
        console.log(`Would record ${pendingMigrations.length} migration version(s): ${pendingMigrations.map((m) => `v${m.version}`).join(", ")}`);
      }
      return;
    }

    // --- Apply SQL statements ---

    console.log(`\nApplying ${allStatements.length} SQL statements...\n`);
    let applied = 0;
    let errors = 0;

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
      database: clickhouseDb,
    });
    try {
      await syncProducts(chClient, PRODUCTS);
      console.log(`  ✓ Synced ${PRODUCTS.length} products`);
      await syncBots(chClient, BOTS);
      console.log(`  ✓ Synced ${BOTS.length} bots`);

      // Record each pending migration version in schema_migrations.
      // All SQL files are applied above (idempotent), so we just need to
      // record the versions that weren't previously tracked.
      if (pendingMigrations.length > 0) {
        console.log(`\nRecording schema version(s)...`);
        await chClient.insert({
          table: "schema_migrations",
          values: pendingMigrations.map((m) => ({ version: m.version, name: m.name })),
          format: "JSONEachRow",
        });
        for (const m of pendingMigrations) {
          console.log(`  ✓ v${m.version} ${m.name}`);
        }
      }
    } finally {
      await chClient.close();
    }

    console.log(`\nDone: ${applied} SQL statements applied, schema v${currentVersion} → v${targetVersion}.`);
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
  log(`Discovering PR bot events: ${startDate} → ${endDate}`);
  log(`Tracking ${logins.length} bot logins`);

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
    const rows = await Sentry.startSpan(
      { op: "bigquery", name: `bigquery.discover ${startDate}→${endDate}` },
      () => queryBotPREvents(bq, startDate, endDate, logins),
    ).finally(elapsed);
    log(`  Got ${rows.length} PR bot event rows`);
    countMetric("pipeline.discover.bq_rows", rows.length);

    // Map BigQuery rows to ClickHouse rows
    const { mapPrBotEventRows } = await import("./sync.js");
    const chRows = mapPrBotEventRows(rows, console.warn);

    console.log("Writing to ClickHouse...");
    const elapsedWrite = startTimer("  Inserting batches");
    await Sentry.startSpan(
      { op: "db", name: "clickhouse.insert-pr-bot-events" },
      () => insertPrBotEvents(ch, chRows),
    ).finally(elapsedWrite);
    log(`  ✓ Inserted ${chRows.length} pr_bot_events rows`);
    countMetric("pipeline.discover.ch_rows", chRows.length);
    log("Optimizing tables...");
    await optimizeTables(ch, ["pr_bot_events"]);
    log("✓ Tables optimized");
    log("Done!");
  } finally {
    await ch.close();
  }
}

async function cmdDiscoverBots() {
  const args = parseArgs();
  const endDate = args["--end"] ?? new Date().toISOString().split("T")[0];
  const startDate =
    args["--start"] ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
  const marketplaceOnly = "--marketplace-only" in args;
  const bigqueryOnly = "--bigquery-only" in args;
  if (marketplaceOnly && bigqueryOnly) {
    throw new CliError("Flags --marketplace-only and --bigquery-only are mutually exclusive.");
  }

  const { discoverBots } = await import("./tools/discover-bots.js");

  const summary = await Sentry.startSpan(
    { op: "pipeline.discover-bots", name: `discover-bots ${startDate}→${endDate}` },
    () => discoverBots({ startDate, endDate, marketplaceOnly, bigqueryOnly }),
  );

  // Emit metrics
  countMetric("pipeline.discover_bots.total_found", summary.total_found);
  countMetric("pipeline.discover_bots.already_tracked", summary.already_tracked);
  countMetric("pipeline.discover_bots.ignored", summary.ignored);
  countMetric("pipeline.discover_bots.new_with_app", summary.new_with_app);
  countMetric("pipeline.discover_bots.new_without_app", summary.new_without_app);
  countMetric("pipeline.discover_bots.from_bigquery", summary.from_bigquery);
  countMetric("pipeline.discover_bots.from_marketplace", summary.from_marketplace);
  countMetric("pipeline.discover_bots.apps_verified", summary.apps_verified);
  countMetric("pipeline.discover_bots.apps_not_found", summary.apps_not_found);

  // Alert: capture one Sentry event per new bot (fingerprinted by login)
  if (summary.new_bots.length > 0) {
    for (const bot of summary.new_bots) {
      Sentry.captureMessage(`New bot discovered: ${bot.login}`, {
        level: "info",
        fingerprint: ["discover-bots-new", bot.login],
        tags: {
          "discover_bots.login": bot.login,
          "discover_bots.source": bot.source,
        },
        contexts: {
          bot: {
            login: bot.login,
            name: bot.marketplace_name ?? "",
            event_count: bot.event_count,
            repo_count: bot.repo_count,
            source: bot.source,
            github_app_url: bot.github_app_url ?? "",
          },
        },
      });
    }
    log(`Sent ${summary.new_bots.length} Sentry alert(s) for new bot(s)`);
  }

  // Check for stale products (no recent activity).
  // Wrapped in try/catch so a ClickHouse failure doesn't block the primary
  // purpose of discover-bots (new bot discovery + alerting).
  const { checkStaleBots } = await import("./tools/discover-bots.js");
  const ch = createCHClient();
  try {
    const staleProducts = await checkStaleBots(ch);
    if (staleProducts.length > 0) {
      log(`Found ${staleProducts.length} stale product(s):`);
      for (const p of staleProducts) {
        log(`  - ${p.productName} (${p.productId}): no activity since ${p.lastActivityWeek}`);
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
    } else {
      log("No stale products found.");
    }
    countMetric("pipeline.discover_bots.stale_products", staleProducts.length);
  } catch (err) {
    log(`⚠ Stale product check failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    Sentry.captureException(err, {
      fingerprint: ["discover-bots-stale-check"],
      tags: { phase: "stale-product-check" },
    });
    countMetric("pipeline.discover_bots.stale_check_error");
  } finally {
    await ch.close();
  }
}

async function cmdEnrich() {
  const args = parseArgs();
  const token = args["--token"] ?? process.env.GITHUB_TOKEN;

  if (!token) {
    throw new CliError("GitHub token required. Use --token or set GITHUB_TOKEN env var.");
  }

  const { runEnrichment } = await import("./enrichment/worker.js");

  function parseIntArg(name: string, value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0) {
      throw new CliError(`${name} must be a non-negative integer, got "${value}"`);
    }
    return n;
  }

  const result = await runEnrichment({
    githubToken: token,
    workerId: parseIntArg("--worker-id", args["--worker-id"]),
    totalWorkers: parseIntArg("--total-workers", args["--total-workers"]),
    limit: parseIntArg("--limit", args["--limit"]),
    staleDays: parseIntArg("--stale-days", args["--stale-days"]),
    priority: args["--priority"] as "repos" | "prs" | "comments" | "reactions" | undefined,
    exitOnRateLimit: args["--exit-on-rate-limit"] !== undefined,
  });

  log("\n=== Enrichment Summary ===");
  log(`Repos:     ${result.repos.fetched} fetched, ${result.repos.skipped} skipped, ${result.repos.errors} errors`);
  log(`PRs:       ${result.pullRequests.fetched} fetched, ${result.pullRequests.skipped} skipped, ${result.pullRequests.errors} errors`);
  log(`Comments:  ${result.comments.fetched} fetched, ${result.comments.skipped} skipped, ${result.comments.replies_filtered} replies filtered, ${result.comments.errors} errors`);
  log(`Reactions: ${result.reactions.fetched} PRs with bot reactions, ${result.reactions.scanned} scanned, ${result.reactions.skipped} skipped, ${result.reactions.errors} errors`);
  log(`Stale repos refreshed: ${result.reposRefreshed}`);
  log(`Duration: ${Math.ceil(result.duration / 1000)}s`);

  log("\nOptimizing tables...");
  const ch = createCHClient();
  try {
    await optimizeTables(ch, ["repos", "pull_requests", "pr_comments", "pr_bot_reactions", "reaction_scan_progress", "pr_product_characteristics"]);
    log("✓ Tables optimized");
  } finally {
    await ch.close();
  }
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

    // Pace: repos enriched in last 1h / 24h (based on updated_at)
    const pace1h = (await query<{ cnt: string }>(
      ch,
      `SELECT count() as cnt FROM repos WHERE updated_at > now() - toIntervalHour(1)`,
    ))[0] ?? { cnt: "0" };
    const pace24h = (await query<{ cnt: string }>(
      ch,
      `SELECT count() as cnt FROM repos WHERE updated_at > now() - toIntervalDay(1)`,
    ))[0] ?? { cnt: "0" };

    const reposPerHour = Number(pace1h.cnt) || (Number(pace24h.cnt) / 24);
    const etaReposHours = reposPerHour > 0 ? repoPending / reposPerHour : null;

    // Reaction scan stats
    const [reactionStats] = await query<{
      total: string;
      scanned: string;
      with_reactions: string;
    }>(
      ch,
      `SELECT
        (SELECT count(DISTINCT (repo_name, pr_number)) FROM pr_bot_events) as total,
        (SELECT count() FROM reaction_scan_progress) as scanned,
        (SELECT count(DISTINCT (repo_name, pr_number)) FROM pr_bot_reactions) as with_reactions`,
    ).catch(() => [{ total: "0", scanned: "0", with_reactions: "0" }]);
    const reactionPending = Number(reactionStats.total) - Number(reactionStats.scanned);

    console.log("=== Enrichment Status ===");
    console.log(`\nDiscovered events: ${total_events}`);
    console.log(`\nRepos:     ${repoStats.enriched} enriched / ${repoStats.not_found} not found / ${repoPending} pending (${repoStats.total} total)`);
    console.log(`PRs:       ${prStats.enriched} enriched / ${prPending} pending (${prStats.total} total)`);
    console.log(`Comments:  ${commentStats.enriched} enriched / ${commentPending} pending (${commentStats.total} total)`);
    console.log(`Reactions: ${reactionStats.scanned} scanned / ${reactionStats.with_reactions} with bot reactions / ${reactionPending} pending (${reactionStats.total} total)`);

    // Completion percentages
    const repoPct = Number(repoStats.total) > 0
      ? (((Number(repoStats.enriched) + Number(repoStats.not_found)) / Number(repoStats.total)) * 100).toFixed(1) : "0";
    const prPct = Number(prStats.total) > 0
      ? ((Number(prStats.enriched) / Number(prStats.total)) * 100).toFixed(1) : "0";
    const commentPct = Number(commentStats.total) > 0
      ? ((Number(commentStats.enriched) / Number(commentStats.total)) * 100).toFixed(1) : "0";

    const reactionPct = Number(reactionStats.total) > 0
      ? ((Number(reactionStats.scanned) / Number(reactionStats.total)) * 100).toFixed(1) : "0";

    console.log(`\n=== Progress ===`);
    console.log(`Repos:     ${repoPct}% complete`);
    console.log(`PRs:       ${prPct}% complete`);
    console.log(`Comments:  ${commentPct}% complete`);
    console.log(`Reactions: ${reactionPct}% complete`);

    // Pace section — repos + reactions
    const reactionPace1h = (await query<{ cnt: string }>(
      ch,
      `SELECT count() as cnt FROM reaction_scan_progress WHERE scanned_at > now() - toIntervalHour(1)`,
    ).catch(() => [{ cnt: "0" }]))[0] ?? { cnt: "0" };
    const reactionPace24h = (await query<{ cnt: string }>(
      ch,
      `SELECT count() as cnt FROM reaction_scan_progress WHERE scanned_at > now() - toIntervalDay(1)`,
    ).catch(() => [{ cnt: "0" }]))[0] ?? { cnt: "0" };

    const reactionsPerHour = Number(reactionPace1h.cnt) || (Number(reactionPace24h.cnt) / 24);
    const etaReactionsHours = reactionsPerHour > 0 && reactionPending > 0 ? reactionPending / reactionsPerHour : null;

    console.log(`\n=== Pace ===`);
    if (reposPerHour > 0) {
      console.log(`Repos enriched (last 1h):  ${pace1h.cnt}`);
      console.log(`Repos enriched (last 24h): ${pace24h.cnt}`);
      console.log(`Effective rate: ~${Math.round(reposPerHour)} repos/hour`);
      if (etaReposHours !== null && repoPending > 0) {
        if (etaReposHours < 1) {
          console.log(`ETA (repos): ~${Math.round(etaReposHours * 60)} minutes`);
        } else if (etaReposHours < 48) {
          console.log(`ETA (repos): ~${etaReposHours.toFixed(1)} hours`);
        } else {
          console.log(`ETA (repos): ~${(etaReposHours / 24).toFixed(1)} days`);
        }
      }
    }
    if (reactionsPerHour > 0) {
      console.log(`Reactions scanned (last 1h):  ${reactionPace1h.cnt}`);
      console.log(`Reactions scanned (last 24h): ${reactionPace24h.cnt}`);
      console.log(`Effective rate: ~${Math.round(reactionsPerHour)} PRs/hour`);
      if (etaReactionsHours !== null) {
        if (etaReactionsHours < 1) {
          console.log(`ETA (reactions): ~${Math.round(etaReactionsHours * 60)} minutes`);
        } else if (etaReactionsHours < 48) {
          console.log(`ETA (reactions): ~${etaReactionsHours.toFixed(1)} hours`);
        } else {
          console.log(`ETA (reactions): ~${(etaReactionsHours / 24).toFixed(1)} days`);
        }
      }
    }
    if (reposPerHour === 0 && reactionsPerHour === 0) {
      console.log("No recent enrichment activity detected.");
    }

    // Reaction breakdown by bot
    const reactionsByBot = await query<{
      bot_id: string;
      reaction_count: string;
      pr_count: string;
    }>(
      ch,
      `SELECT
         bot_id,
         count() AS reaction_count,
         countDistinct((repo_name, pr_number)) AS pr_count
       FROM pr_bot_reactions
       GROUP BY bot_id
       ORDER BY pr_count DESC`,
    ).catch(() => []);

    if (reactionsByBot.length > 0) {
      console.log(`\n=== Bot Reactions Found ===`);
      console.log(`${"Bot".padEnd(25)} ${"PRs".padStart(8)} ${"Reactions".padStart(12)}`);
      console.log("-".repeat(47));
      for (const row of reactionsByBot) {
        console.log(`${row.bot_id.padEnd(25)} ${String(row.pr_count).padStart(8)} ${String(row.reaction_count).padStart(12)}`);
      }
    }

    // Top repos with bot reactions
    const topReactionRepos = await query<{
      repo_name: string;
      bot_id: string;
      pr_count: string;
    }>(
      ch,
      `SELECT
         repo_name,
         bot_id,
         countDistinct(pr_number) AS pr_count
       FROM pr_bot_reactions
       GROUP BY repo_name, bot_id
       ORDER BY pr_count DESC
       LIMIT 10`,
    ).catch(() => []);

    if (topReactionRepos.length > 0) {
      console.log(`\n=== Top Repos with Bot Reactions ===`);
      console.log(`${"Repo".padEnd(45)} ${"Bot".padEnd(20)} ${"PRs".padStart(6)}`);
      console.log("-".repeat(73));
      for (const row of topReactionRepos) {
        console.log(`${row.repo_name.padEnd(45)} ${row.bot_id.padEnd(20)} ${String(row.pr_count).padStart(6)}`);
      }
    }
  } finally {
    await ch.close();
  }
}

async function cmdValidateBqPrs() {
  const args = parseArgs();
  const { validateBigQueryPRData } = await import("./tools/validate-bq-prs.js");

  const sampleVal = args["--sample"];
  let sample = 500;
  if (sampleVal !== undefined) {
    sample = parseInt(sampleVal, 10);
    if (isNaN(sample) || sample < 1) {
      throw new CliError(`--sample must be a positive integer, got "${sampleVal}"`);
    }
  }

  const result = await validateBigQueryPRData({ sampleSize: sample });

  console.log(`\n=== BigQuery PR Data Validation ===`);
  console.log(`Sample size: ${result.sample_size}`);
  console.log(`Found in BigQuery: ${result.matched} (${result.sample_size > 0 ? ((result.matched / result.sample_size) * 100).toFixed(1) : 0}%)`);
  console.log(`\nField comparison (against ${result.matched} matched PRs):`);
  console.log(`${"Field".padEnd(15)} ${"Match".padStart(8)} ${"Mismatch".padStart(10)} ${"Missing".padStart(9)} ${"Match %".padStart(9)}`);
  console.log("-".repeat(55));

  for (const [field, stats] of Object.entries(result.fields)) {
    const total = stats.match + stats.mismatch;
    const pct = total > 0 ? ((stats.match / total) * 100).toFixed(1) : "N/A";
    console.log(
      `${field.padEnd(15)} ${String(stats.match).padStart(8)} ${String(stats.mismatch).padStart(10)} ${String(stats.missing).padStart(9)} ${String(pct + "%").padStart(9)}`
    );
    if (stats.examples.length > 0) {
      for (const ex of stats.examples) {
        console.log(`  → ${ex}`);
      }
    }
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

/** Redact known sensitive flags from CLI args before sending to Sentry. */
function redactArgs(args: string): string {
  return args.replace(/(--token\s+)\S+/g, "$1[REDACTED]");
}

/** Strip credentials from a URL (user:pass in authority). */
function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return url;
  }
}

main().catch(async (err) => {
  const command = process.argv[2] ?? "unknown";
  const cliArgs = process.argv.slice(3).join(" ");
  const isCliError = err instanceof CliError;
  const chUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123 (default)";

  const eventId = Sentry.captureException(err, {
    level: isCliError ? "warning" : "error",
    contexts: {
      pipeline: {
        command,
        args: redactArgs(cliArgs),
        clickhouse_url: redactUrl(chUrl),
      },
    },
  });

  if (isCliError) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error("Fatal error:", err);
  }
  if (eventId) {
    console.error(`Sentry event: ${eventId}`);
  }
  // Flush Sentry events before exiting (match success-path timeout)
  await Sentry.flush(10000);
  process.exit(1);
});
