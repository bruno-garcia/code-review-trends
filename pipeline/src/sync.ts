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
import {
  queryBotReviewActivity,
  queryHumanReviewActivity,
  type WeeklyBotReviewRow,
  type WeeklyHumanReviewRow,
} from "./bigquery.js";
import {
  insertReviewActivity,
  insertHumanActivity,
  query,
  type ReviewActivityRow,
  type HumanActivityRow,
} from "./clickhouse.js";
import { BOT_BY_LOGIN, BOT_LOGINS } from "./bots.js";

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
  /** Log function, default console.log */
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
 * Tracks which date chunks have been backfilled and which bot logins were
 * included. When new bots are added, chunks with a stale `bot_logins` set
 * are re-fetched automatically on the next backfill run.
 */
const ENSURE_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS pipeline_state (
    job_name String,
    chunk_start Date,
    chunk_end Date,
    completed_at DateTime DEFAULT now(),
    rows_written UInt64,
    bot_logins String DEFAULT ''
) ENGINE = ReplacingMergeTree(completed_at)
ORDER BY (job_name, chunk_start)
`;

/** Canonical string key for a set of bot logins (sorted, comma-joined). */
function botLoginsKey(logins: string[]): string {
  return [...logins].sort().join(",");
}

async function ensureStateTable(ch: ClickHouseClient): Promise<void> {
  await ch.command({ query: ENSURE_STATE_TABLE });
  // Migrate: add bot_logins column if missing (table may predate this column)
  await ch.command({
    query: `ALTER TABLE pipeline_state ADD COLUMN IF NOT EXISTS bot_logins String DEFAULT ''`,
  });
}

type CompletedChunk = { botLogins: string; chunkEnd: string };

/**
 * Get all completed chunks for a job, including which bots were included
 * and what end date was covered.
 */
async function getCompletedChunks(
  ch: ClickHouseClient,
  jobName: string,
): Promise<Map<string, CompletedChunk>> {
  const rows = await query<{ chunk_start: string; chunk_end: string; bot_logins: string }>(
    ch,
    `SELECT toString(chunk_start) AS chunk_start, toString(chunk_end) AS chunk_end, bot_logins
     FROM pipeline_state FINAL
     WHERE job_name = {jobName:String}`,
    { jobName },
  );
  const map = new Map<string, CompletedChunk>();
  for (const row of rows) {
    map.set(row.chunk_start, { botLogins: row.bot_logins, chunkEnd: row.chunk_end });
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
      },
    ],
    format: "JSONEachRow",
  });
}

// ── Chunking ────────────────────────────────────────────────────────────

/**
 * Split a date range into monthly chunks.
 * Each chunk covers the 1st to the last day of a month,
 * except the first/last which may be partial.
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

    chunks.push({
      startDate: fmtDate(cursor),
      endDate: fmtDate(chunkEnd),
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
  const botRaw = await fetcher.fetchBotActivity(
    chunk.startDate,
    chunk.endDate,
    logins,
  );

  const activityRows: ReviewActivityRow[] = botRaw
    .map((row) => {
      const bot = BOT_BY_LOGIN.get(row.actor_login);
      if (!bot) {
        log(`    ⚠ Unknown bot login: ${row.actor_login}`);
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

  log(`  Querying human activity ${chunk.startDate} → ${chunk.endDate}...`);
  const humanRaw = await fetcher.fetchHumanActivity(
    chunk.startDate,
    chunk.endDate,
    logins,
  );

  const humanRows: HumanActivityRow[] = humanRaw.map((row) => ({
    week: row.week,
    review_count: Number(row.review_count),
    review_comment_count: Number(row.review_comment_count),
    repo_count: Number(row.repo_count),
  }));

  // Write to ClickHouse (independent inserts, run in parallel)
  await Promise.all([
    insertReviewActivity(ch, activityRows),
    insertHumanActivity(ch, humanRows),
  ]);

  log(
    `  ✓ ${activityRows.length} bot rows, ${humanRows.length} human rows`,
  );

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
  const log = opts?.log ?? console.log;
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
      // Re-fetch if bot set changed or chunk_end grew (partial month extended)
      return stored.botLogins !== currentLoginsKey || stored.chunkEnd < chunk.endDate;
    });

    const skipped = allChunks.length - chunksToProcess.length;
    if (skipped > 0) {
      log(`Skipping ${skipped} already-completed chunks (bot set unchanged)`);
    }
    if (chunksToProcess.length === 0) {
      log(`Backfill already complete for ${startDate} → ${endDate} with current bot set`);
      return [];
    }

    // Log stale chunks separately for visibility
    const staleChunks = chunksToProcess.filter((chunk) => {
      const stored = completed.get(chunk.startDate);
      return stored !== undefined;
    });
    if (staleChunks.length > 0) {
      log(`Re-fetching ${staleChunks.length} chunks (bot set or date range changed)`);
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

    const result = await fetchAndStoreChunk(fetcher, ch, chunk, logins, log);
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
  const log = opts?.log ?? console.log;
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
