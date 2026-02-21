/**
 * Core sync logic — fetches data from BigQuery and writes to ClickHouse.
 *
 * Two modes:
 * - **Incremental** (`syncRecent`): fetches last N weeks, meant for scheduled runs.
 * - **Backfill** (`backfill`): fetches month-by-month from a start date,
 *   tracks progress in ClickHouse so it can resume if interrupted.
 *
 * Both are idempotent: re-running the same range just overwrites via ReplacingMergeTree.
 */

import type { BigQuery } from "@google-cloud/bigquery";
import type { ClickHouseClient } from "@clickhouse/client";
import { Sentry } from "./sentry.js";
import {
  queryBotReviewActivity,
  queryHumanReviewActivity,
  type WeeklyBotReviewRow,
  type WeeklyHumanReviewRow,
  type BotPREventRow,
} from "./bigquery.js";
import {
  insertReviewActivity,
  insertHumanActivity,
  query,
  type ReviewActivityRow,
  type HumanActivityRow,
  type PrBotEventRow,
} from "./clickhouse.js";
import { BOT_BY_LOGIN, BOT_LOGINS } from "./bots.js";
import { log as sentryLog, countMetric } from "./sentry.js";

/**
 * Pipeline version — bump this when BigQuery queries change materially.
 *
 * The backfill resume logic stores this version alongside the bot logins
 * fingerprint. When the version changes, previously-completed chunks are
 * re-fetched so the new query shape (e.g. additional event types or
 * columns) is reflected in ClickHouse.
 *
 * History:
 *   1 — initial version (PullRequestReviewEvent + PullRequestReviewCommentEvent)
 *   2 — added IssueCommentEvent tracking (pr_comment_count)
 *   3 — fixed week-boundary bug: monthlyChunks now extends to full ISO weeks
 */
export const PIPELINE_VERSION = 3;

// ── Row mappers (shared with smoke tests) ───────────────────────────────

/**
 * Map BigQuery bot activity rows to ClickHouse ReviewActivityRow format.
 *
 * When multiple GitHub logins map to the same bot_id (e.g. Copilot uses both
 * `copilot-pull-request-reviewer[bot]` and `Copilot`), their counts are
 * aggregated into a single row per (week, bot_id). Without this, only one
 * login's data survives ReplacingMergeTree deduplication.
 */
export function mapBotActivityRows(
  rows: WeeklyBotReviewRow[],
  log?: (msg: string) => void,
): ReviewActivityRow[] {
  // Phase 1: map BigQuery rows to bot_ids
  const mapped = rows
    .map((row) => {
      const bot = BOT_BY_LOGIN.get(row.actor_login);
      if (!bot) {
        log?.(`    ⚠ Unknown bot login: ${row.actor_login}`);
        return null;
      }
      return {
        week: row.week,
        bot_id: bot.id,
        review_count: Number(row.review_count),
        review_comment_count: Number(row.review_comment_count),
        pr_comment_count: Number(row.pr_comment_count),
        repo_count: Number(row.repo_count),
        org_count: Number(row.org_count),
      };
    })
    .filter((r): r is ReviewActivityRow => r !== null);

  // Phase 2: aggregate rows sharing the same (week, bot_id).
  // review/comment counts are summed; repo_count and org_count are summed
  // (slight overcount when logins overlap, but accurate for review volume).
  const aggregated = new Map<string, ReviewActivityRow>();
  for (const row of mapped) {
    const key = `${row.week}\0${row.bot_id}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.review_count += row.review_count;
      existing.review_comment_count += row.review_comment_count;
      existing.pr_comment_count += row.pr_comment_count;
      existing.repo_count += row.repo_count;
      existing.org_count += row.org_count;
    } else {
      aggregated.set(key, { ...row });
    }
  }

  return [...aggregated.values()];
}

/** Map BigQuery human activity rows to ClickHouse HumanActivityRow format. */
export function mapHumanActivityRows(rows: WeeklyHumanReviewRow[]): HumanActivityRow[] {
  return rows.map((row) => ({
    week: row.week,
    review_count: Number(row.review_count),
    review_comment_count: Number(row.review_comment_count),
    pr_comment_count: Number(row.pr_comment_count),
    repo_count: Number(row.repo_count),
  }));
}

/** Map BigQuery PR bot event rows to ClickHouse PrBotEventRow format. */
export function mapPrBotEventRows(
  rows: BotPREventRow[],
  log?: (msg: string) => void,
): PrBotEventRow[] {
  return rows
    .map((row) => {
      const bot = BOT_BY_LOGIN.get(row.actor_login);
      if (!bot) {
        log?.(`  Unknown bot login: ${row.actor_login}`);
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
    .filter((r): r is PrBotEventRow => r !== null);
}

// ── Types ───────────────────────────────────────────────────────────────

export type SyncChunk = {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string; // YYYY-MM-DD inclusive
};

export type SyncResult = {
  chunk: SyncChunk;
  botRows: number;
  humanRows: number;
};

/**
 * Abstraction over the data source (BigQuery in prod, stubs in tests).
 */
export type DataFetcher = {
  fetchBotActivity(
    startDate: string,
    endDate: string,
    botLogins: string[],
  ): Promise<WeeklyBotReviewRow[]>;

  fetchHumanActivity(
    startDate: string,
    endDate: string,
    botLogins: string[],
  ): Promise<WeeklyHumanReviewRow[]>;
};

export type BackfillOptions = {
  /** Start date, default 2023-01-01 */
  startDate?: string;
  /** End date, default today */
  endDate?: string;
  /** Resume from last completed chunk instead of starting over */
  resume?: boolean;
  /** Log function, default timestamped sentryLog */
  log?: (msg: string) => void;
};

export type SyncRecentOptions = {
  /** How many weeks back to fetch (default 2) */
  weeks?: number;
  log?: (msg: string) => void;
};

// ── BigQuery DataFetcher ────────────────────────────────────────────────

/**
 * Create a DataFetcher backed by real BigQuery queries.
 */
export function bigQueryFetcher(bq: BigQuery): DataFetcher {
  return {
    fetchBotActivity: (startDate, endDate, botLogins) =>
      queryBotReviewActivity(bq, startDate, endDate, botLogins),
    fetchHumanActivity: (startDate, endDate, botLogins) =>
      queryHumanReviewActivity(bq, startDate, endDate, botLogins),
  };
}

// ── Pipeline state table ────────────────────────────────────────────────

/**
 * Tracks which date chunks have been backfilled, which bot logins were
 * included, and the pipeline version. When new bots are added or the
 * pipeline version changes (e.g. new event types), chunks with stale
 * state are re-fetched automatically on the next backfill run.
 */
const ENSURE_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS pipeline_state (
    job_name String,
    chunk_start Date,
    chunk_end Date,
    completed_at DateTime DEFAULT now(),
    rows_written UInt64,
    bot_logins String DEFAULT '',
    pipeline_version UInt32 DEFAULT 0
) ENGINE = ReplacingMergeTree(completed_at)
ORDER BY (job_name, chunk_start)
`;

/** Canonical string key for a set of bot logins (sorted, comma-joined). */
function botLoginsKey(logins: string[]): string {
  return [...logins].sort().join(",");
}

async function ensureStateTable(ch: ClickHouseClient): Promise<void> {
  await ch.command({ query: ENSURE_STATE_TABLE });
  // Migrate: add columns if missing (table may predate these columns)
  await ch.command({
    query: `ALTER TABLE pipeline_state ADD COLUMN IF NOT EXISTS bot_logins String DEFAULT ''`,
  });
  await ch.command({
    query: `ALTER TABLE pipeline_state ADD COLUMN IF NOT EXISTS pipeline_version UInt32 DEFAULT 0`,
  });
}

type CompletedChunk = { botLogins: string; chunkEnd: string; pipelineVersion: number };

/**
 * Get all completed chunks for a job, including which bots were included,
 * what end date was covered, and which pipeline version was used.
 */
async function getCompletedChunks(
  ch: ClickHouseClient,
  jobName: string,
): Promise<Map<string, CompletedChunk>> {
  const rows = await query<{ chunk_start: string; chunk_end: string; bot_logins: string; pipeline_version: number }>(
    ch,
    `SELECT toString(chunk_start) AS chunk_start, toString(chunk_end) AS chunk_end, bot_logins, pipeline_version
     FROM pipeline_state FINAL
     WHERE job_name = {jobName:String}`,
    { jobName },
  );
  const map = new Map<string, CompletedChunk>();
  for (const row of rows) {
    map.set(row.chunk_start, {
      botLogins: row.bot_logins,
      chunkEnd: row.chunk_end,
      pipelineVersion: Number(row.pipeline_version),
    });
  }
  return map;
}

async function markChunkCompleted(
  ch: ClickHouseClient,
  jobName: string,
  chunk: SyncChunk,
  rowsWritten: number,
  logins: string[],
): Promise<void> {
  await ch.insert({
    table: "pipeline_state",
    values: [
      {
        job_name: jobName,
        chunk_start: chunk.startDate,
        chunk_end: chunk.endDate,
        rows_written: rowsWritten,
        bot_logins: botLoginsKey(logins),
        pipeline_version: PIPELINE_VERSION,
      },
    ],
    format: "JSONEachRow",
  });
}

// ── Week alignment helpers ──────────────────────────────────────────────

/** Get the Monday on or before a date (ISO week start). */
function toMondayDate(d: Date): Date {
  const result = new Date(d);
  const day = result.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  result.setUTCDate(result.getUTCDate() + diff);
  return result;
}

/** Get the Sunday on or after a date (ISO week end). */
function toSundayDate(d: Date): Date {
  const result = new Date(d);
  const day = result.getUTCDay();
  if (day !== 0) {
    result.setUTCDate(result.getUTCDate() + (7 - day));
  }
  return result;
}

// ── Chunking ────────────────────────────────────────────────────────────

/**
 * Split a date range into monthly chunks, aligned to ISO week boundaries.
 *
 * Each chunk's start is extended back to the preceding Monday and its end
 * is extended forward to the following Sunday. This ensures that weeks
 * spanning month boundaries are fully contained in at least one chunk.
 *
 * Adjacent chunks overlap by up to 6 days. BigQuery's WEEK(MONDAY)
 * aggregation returns identical full-week totals from either chunk, so
 * ReplacingMergeTree deduplication in ClickHouse is safe.
 *
 * Without this alignment, boundary weeks get split across two chunks.
 * Each chunk returns only its partial slice of the week. After
 * ReplacingMergeTree deduplication, the last-inserted partial row
 * survives — losing most of the week's data and creating a saw-tooth
 * pattern in the charts.
 */
export function monthlyChunks(startDate: string, endDate: string): SyncChunk[] {
  const chunks: SyncChunk[] = [];
  let cursor = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  while (cursor <= end) {
    // Chunk runs from cursor to end of that month (or endDate if sooner)
    const monthEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
    );
    const chunkEnd = monthEnd < end ? monthEnd : end;

    // Extend to full ISO week boundaries (Monday–Sunday) so that weeks
    // spanning month boundaries are fully contained in at least one chunk.
    chunks.push({
      startDate: fmtDate(toMondayDate(cursor)),
      endDate: fmtDate(toSundayDate(chunkEnd)),
    });

    // Move cursor to 1st of next month
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    );
  }

  return chunks;
}

// ── Fetch a single chunk ────────────────────────────────────────────────

async function fetchAndStoreChunk(
  fetcher: DataFetcher,
  ch: ClickHouseClient,
  chunk: SyncChunk,
  logins: string[],
  log: (msg: string) => void,
): Promise<SyncResult> {

  log(`  Querying bot activity ${chunk.startDate} → ${chunk.endDate}...`);
  const botRaw = await Sentry.startSpan(
    { op: "bigquery", name: `bigquery.bot-activity ${chunk.startDate}→${chunk.endDate}` },
    () => fetcher.fetchBotActivity(chunk.startDate, chunk.endDate, logins),
  );

  const activityRows = mapBotActivityRows(botRaw, log);

  log(`  Querying human activity ${chunk.startDate} → ${chunk.endDate}...`);
  const humanRaw = await Sentry.startSpan(
    { op: "bigquery", name: `bigquery.human-activity ${chunk.startDate}→${chunk.endDate}` },
    () => fetcher.fetchHumanActivity(chunk.startDate, chunk.endDate, logins),
  );

  const humanRows = mapHumanActivityRows(humanRaw);

  // Write to ClickHouse (independent inserts, run in parallel)
  await Sentry.startSpan(
    { op: "db", name: "clickhouse.insert-activity" },
    () => Promise.all([
      insertReviewActivity(ch, activityRows),
      insertHumanActivity(ch, humanRows),
    ]),
  );

  log(`  ✓ ${activityRows.length} bot rows, ${humanRows.length} human rows`);

  countMetric("pipeline.backfill.bot_rows", activityRows.length, { chunk: chunk.startDate });
  countMetric("pipeline.backfill.human_rows", humanRows.length, { chunk: chunk.startDate });

  return {
    chunk,
    botRows: activityRows.length,
    humanRows: humanRows.length,
  };
}

// ── Public: backfill ────────────────────────────────────────────────────

const BACKFILL_JOB = "backfill";

/**
 * Run a full historical backfill, month by month.
 *
 * Tracks progress in pipeline_state per chunk, including which bot logins
 * were fetched. On resume:
 * - Chunks already completed with the current bot set are skipped.
 * - Chunks completed with a different (older) bot set are re-fetched,
 *   so newly added bots get backfilled without re-downloading everything.
 * - New chunks (date range extended) are fetched normally.
 */
export async function backfill(
  fetcher: DataFetcher,
  ch: ClickHouseClient,
  opts?: BackfillOptions,
): Promise<SyncResult[]> {
  const log = opts?.log ?? sentryLog;
  const startDate = opts?.startDate ?? "2023-01-01";
  const endDate = opts?.endDate ?? fmtDate(new Date());
  const resume = opts?.resume ?? true;

  await ensureStateTable(ch);

  const allChunks = monthlyChunks(startDate, endDate);
  const currentLoginsKey = botLoginsKey([...BOT_LOGINS]);

  // Determine which chunks need processing
  let chunksToProcess: SyncChunk[];

  if (resume) {
    const completed = await getCompletedChunks(ch, BACKFILL_JOB);
    chunksToProcess = allChunks.filter((chunk) => {
      const stored = completed.get(chunk.startDate);
      if (stored === undefined) return true; // never completed
      // Re-fetch if bot set changed, pipeline version changed, or chunk_end grew
      return (
        stored.botLogins !== currentLoginsKey ||
        stored.pipelineVersion !== PIPELINE_VERSION ||
        stored.chunkEnd < chunk.endDate
      );
    });

    const skipped = allChunks.length - chunksToProcess.length;
    if (skipped > 0) {
      log(`Skipping ${skipped} already-completed chunks (bot set and pipeline version unchanged)`);
    }
    if (chunksToProcess.length === 0) {
      log(`Backfill already complete for ${startDate} → ${endDate} with current bot set and pipeline v${PIPELINE_VERSION}`);
      return [];
    }

    // Log stale chunks separately for visibility
    const staleChunks = chunksToProcess.filter((chunk) => {
      const stored = completed.get(chunk.startDate);
      return stored !== undefined;
    });
    if (staleChunks.length > 0) {
      log(`Re-fetching ${staleChunks.length} chunks (bot set, pipeline version, or date range changed)`);
    }
  } else {
    chunksToProcess = allChunks;
  }

  log(
    `Backfill: ${chunksToProcess.length} chunks to process (${startDate} → ${endDate})`,
  );

  const results: SyncResult[] = [];
  const logins = [...BOT_LOGINS];

  for (let i = 0; i < chunksToProcess.length; i++) {
    const chunk = chunksToProcess[i];
    log(`\n[${i + 1}/${chunksToProcess.length}] ${chunk.startDate} → ${chunk.endDate}`);

    const result = await Sentry.startSpan(
      { op: "backfill.chunk", name: `backfill ${chunk.startDate}→${chunk.endDate}` },
      () => fetchAndStoreChunk(fetcher, ch, chunk, logins, log),
    );
    await markChunkCompleted(
      ch,
      BACKFILL_JOB,
      chunk,
      result.botRows + result.humanRows,
      logins,
    );
    results.push(result);
  }

  log(`\nBackfill complete: ${results.length} chunks processed`);
  return results;
}

// ── Public: sync recent ─────────────────────────────────────────────────

/**
 * Fetch recent data (last N weeks). Designed for scheduled runs.
 * No state tracking — just overwrites recent weeks idempotently.
 */
export async function syncRecent(
  fetcher: DataFetcher,
  ch: ClickHouseClient,
  opts?: SyncRecentOptions,
): Promise<SyncResult> {
  const log = opts?.log ?? sentryLog;
  const weeks = opts?.weeks ?? 2;

  if (!Number.isFinite(weeks) || weeks < 1) {
    throw new Error(`Invalid weeks value: ${weeks}. Must be a finite integer >= 1.`);
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - weeks * 7);

  const chunk: SyncChunk = {
    startDate: fmtDate(start),
    endDate: fmtDate(end),
  };

  log(`Syncing recent data: ${chunk.startDate} → ${chunk.endDate} (${weeks} weeks)`);
  return fetchAndStoreChunk(fetcher, ch, chunk, [...BOT_LOGINS], log);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}
