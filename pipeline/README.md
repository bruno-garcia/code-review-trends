# Pipeline

Data collection service for Code Review Trends. Pulls code review event data from [GH Archive](https://www.gharchive.org/) via BigQuery and writes weekly aggregates to ClickHouse.

## Prerequisites

- **Node.js** (see root `package.json` for version)
- **GCP credentials** with BigQuery access — `gcloud auth application-default login`
- **GCP project** — auto-detected from `gcloud config get-value project`. Override with `GCP_PROJECT_ID` env var if needed. Any project with BigQuery API enabled works (GH Archive is a public dataset).
- **ClickHouse** running locally — `npm run dev:infra` from the project root

## Commands

All commands are run from the **project root** using the `npm run pipeline` prefix:

```bash
npm run pipeline -- <command> [options]
```

### `sync-bots`

Push the bot registry (`src/bots.ts`) to ClickHouse. Run this after adding or changing bot definitions.

```bash
npm run pipeline -- sync-bots
```

### `fetch-bigquery`

Pull review data from GH Archive for a single date range. Good for testing or one-off imports.

```bash
npm run pipeline -- fetch-bigquery --start 2025-01-06 --end 2025-01-12
npm run pipeline -- fetch-bigquery --dry-run          # preview without running
```

| Option | Default | Description |
|--------|---------|-------------|
| `--start YYYY-MM-DD` | 4 weeks ago | Start date (inclusive) |
| `--end YYYY-MM-DD` | today | End date (inclusive) |
| `--dry-run` | — | Show what would be fetched without querying |

### `backfill`

Full historical import, processed in monthly chunks. Tracks progress in a `pipeline_state` table so it can resume if interrupted.

```bash
npm run pipeline -- backfill --start 2024-01-01 --end 2025-01-31
npm run pipeline -- backfill --dry-run                 # show chunks without running
npm run pipeline -- backfill --no-resume               # start over, ignore previous progress
```

| Option | Default | Description |
|--------|---------|-------------|
| `--start YYYY-MM-DD` | `2023-01-01` | Start date |
| `--end YYYY-MM-DD` | today | End date |
| `--no-resume` | — | Ignore previous progress, re-fetch everything |
| `--dry-run` | — | List chunks without executing |

### `sync`

Fetch recent weeks of data. Designed for scheduled/cron runs.

```bash
npm run pipeline -- sync              # last 2 weeks (default)
npm run pipeline -- sync --weeks 4    # last 4 weeks
```

### `migrate`

Apply schema and bot reference data to a ClickHouse instance. Reads all `db/init/*.sql` files (schema + bot data) and syncs the bot registry from `bots.ts`.

```bash
npm run pipeline -- migrate --stack staging          # staging (reads Pulumi creds)
npm run pipeline -- migrate --stack prod             # production
npm run pipeline -- migrate --local                  # local ClickHouse
npm run pipeline -- migrate --dry-run                # preview without applying
```

| Option | Default | Description |
|--------|---------|-------------|
| `--stack STACK` | `staging` | Pulumi stack name to read ClickHouse credentials from |
| `--local` | — | Use local ClickHouse (`CLICKHOUSE_URL` env var or `http://localhost:8123`) |
| `--dry-run` | — | Show statements that would be applied without executing |

Safe to re-run — all statements are idempotent (`CREATE TABLE IF NOT EXISTS` + `ReplacingMergeTree` for bot data).

### `status`

Show pipeline health, data freshness, coverage gaps, and per-bot breakdown. This is the primary way to monitor the pipeline on a server.

```bash
npm run pipeline -- status            # human-readable dashboard
npm run pipeline -- status --json     # machine-readable JSON
npm run pipeline -- status --check    # exit 1 if data is stale (for alerting)
npm run pipeline -- status --check --max-age 7  # stale threshold in days
```

| Option | Default | Description |
|--------|---------|-------------|
| `--json` | — | Output full report as JSON |
| `--check` | — | Exit code 1 if unhealthy (data stale or gaps) |
| `--max-age N` | `14` | Days before data is considered stale |

Example output:

```
✅ Pipeline Status

── Data Freshness ─────────────────────────────────
  Latest week:    2025-02-03
  Data age:       5 days ✓

── Coverage ───────────────────────────────────────
  Range:          2023-01-02 → 2025-02-03
  Weeks:          109 / 109 expected
  Missing weeks:  none ✓

── Backfill ───────────────────────────────────────
  Last chunk end: 2025-01-31
  Chunks done:    25
  Last run:       2025-02-08 14:23:01

── Bot Activity ───────────────────────────────────
  Bot                     Reviews   Weeks       Latest
  ---------------------------------------------------
  CodeRabbit                94837     109   2025-02-03
  Sourcery                  30153     109   2025-02-03
  ...
```

## Dev Tools

These run directly via workspace scripts:

```bash
# Inspect data in ClickHouse
npm run inspect                            # overview of all tables
npm run inspect -- --bot coderabbit        # data for a specific bot
npm run inspect -- --weeks 4               # last N weeks of activity
npm run inspect -- --table bots            # raw table dump
npm run inspect -- --query "SELECT ..."    # arbitrary query

# Validate ClickHouse schema
npm run validate

# Discover new bot accounts in GH Archive (requires GCP)
npm run discover-bots
npm run discover-bots -- --start 2025-01-01 --end 2025-02-01

# Pipeline status (also available as `npm run pipeline -- status`)
npm run status
```

## Running on a Server

The pipeline is designed to run as a scheduled job, not a long-running service. Use cron or systemd timers.

### Cron setup

```bash
# Weekly sync — fetch last 2 weeks of data every Monday at 6am UTC
0 6 * * 1  cd /path/to/code-review-trends && GCP_PROJECT_ID=your-project npm run pipeline -- sync >> /var/log/pipeline-sync.log 2>&1

# Health check — alert if data is stale (runs daily)
0 8 * * *  cd /path/to/code-review-trends && npm run pipeline -- status --check --max-age 14 || echo "Pipeline stale!" | mail -s "Alert" ops@example.com
```

### Monitoring

**Quick check** — is everything OK?

```bash
npm run pipeline -- status --check
# exit 0 = healthy, exit 1 = stale or has gaps
```

**Dashboard** — what's the current state?

```bash
npm run pipeline -- status
```

**Machine-readable** — for scripts, dashboards, or webhook integrations:

```bash
npm run pipeline -- status --json | jq '.healthy'
npm run pipeline -- status --json | jq '.dataAge.daysOld'
npm run pipeline -- status --json | jq '.coverage.missingWeeks | length'
```

**Inspect specific data** — drill into what's in ClickHouse:

```bash
npm run inspect -- --weeks 4           # recent data overview
npm run inspect -- --bot coderabbit    # specific bot
npm run inspect -- --query "SELECT count() FROM review_activity WHERE week >= '2025-01-01'"
```

### Backfill workflow

For initial setup or filling gaps:

```bash
# 1. Preview the chunks
npm run pipeline -- backfill --start 2023-01-01 --dry-run

# 2. Run (resumes automatically if interrupted)
npm run pipeline -- backfill --start 2023-01-01

# 3. Check the result
npm run pipeline -- status
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse HTTP endpoint |
| `CLICKHOUSE_USER` | `default` | ClickHouse user |
| `CLICKHOUSE_PASSWORD` | `dev` | ClickHouse password |
| `CLICKHOUSE_DB` | `code_review_trends` | ClickHouse database |
| `GCP_PROJECT_ID` | auto-detected from `gcloud` | GCP project for BigQuery billing (any project works) |
| `BQ_MAX_BYTES_BILLED` | `500000000000` (500GB) | Safety limit for BigQuery scans |
| `GITHUB_TOKEN` | — | GitHub PAT for API enrichment (not needed for BigQuery) |

## Database file organization

```
db/
  init/                        ← Applied to ALL environments
    001_schema.sql             — CREATE TABLE definitions
    002_bot_data.sql           — Products, bots, bot_logins (reference data)
  init-ci.sh                   — CI script: runs db/init/*.sql via HTTP
```

- **Local dev** (`docker compose up`): Runs `001_schema.sql` → `002_bot_data.sql`. Tables start empty; run the pipeline to populate.
- **CI** (`bash db/init-ci.sh`): Same schema via HTTP against the ClickHouse service container.
- **Staging/prod** (`npm run pipeline -- migrate`): Applies `db/init/*.sql` + syncs bot registry from `bots.ts`.

## Architecture

```
BigQuery (GH Archive)  →  pipeline  →  ClickHouse
                           ├── bigquery.ts    — GH Archive queries
                           ├── clickhouse.ts  — ClickHouse writer
                           ├── sync.ts        — orchestration (backfill, incremental)
                           ├── bots.ts        — canonical bot registry
                           ├── cli.ts         — CLI entry point (incl. migrate command)
                           └── tools/
                               ├── status.ts       — health & monitoring
                               ├── inspect-data.ts — data exploration
                               ├── validate-schema.ts — schema drift check
                               └── discover-bots.ts   — find new bots in GH Archive
```

The pipeline fetches two types of data per date range:

1. **Bot review activity** — weekly counts of `PullRequestReviewEvent` and `PullRequestReviewCommentEvent` per tracked bot, plus distinct repo counts.
2. **Human review activity** — same metrics for all non-bot accounts, used to calculate AI share percentages.

All writes use ClickHouse `ReplacingMergeTree` tables, making every operation idempotent. Re-running the same date range just overwrites existing rows.

## BigQuery Details

GH Archive data lives in `githubarchive.day.YYYYMMDD` tables in BigQuery. Two quirks required workarounds:

1. **`yesterday` view** — The `day` dataset contains a view called `yesterday` that breaks `githubarchive.day.*` wildcard queries. We use `githubarchive.day.2*` instead, which matches all date tables (`20YYMMDD`) but skips the view.

2. **Wildcard table pruning** — BigQuery only prunes wildcard tables when `_TABLE_SUFFIX` conditions use literal string values. Parameterized values (`@param`) cause a full scan (~100GB+). We interpolate date-derived suffix values directly into the SQL (validated as digits-only).

**Cost**: ~150MB per day scanned for bot queries. A full month costs ~4.5GB. BigQuery's free tier includes 1TB/month of query processing.

## Tracked Bots

The canonical bot list lives in `src/bots.ts`. Current bots:

| Bot | GitHub Login |
|-----|-------------|
| CodeRabbit | `coderabbitai[bot]` |
| GitHub Copilot | `copilot-pull-request-reviewer[bot]` |
| CodeScene | `codescene-delta-analysis[bot]` |
| Sourcery | `sourcery-ai[bot]` |
| Ellipsis | `ellipsis-dev[bot]` |
| Qodo | `qodo-merge-pro[bot]` |
| Greptile | `greptile-apps[bot]` |

To add a new bot:

1. Add an entry to `src/bots.ts`
2. Update `db/init/002_bot_data.sql` to match (the `bots.test.ts` validates consistency)
3. Run `npm run pipeline -- sync-bots` to push to local ClickHouse
4. For remote databases, run `npm run pipeline -- migrate --stack staging`
5. Use `npm run discover-bots` to find the correct GitHub login if unsure

## Tests

```bash
npm run test --workspace=pipeline     # requires ClickHouse running
npm run typecheck --workspace=pipeline
npm run lint --workspace=pipeline
```

Tests use a fake `DataFetcher` so they don't need BigQuery credentials, but they do write to the local ClickHouse instance to verify the full insert/query round-trip.
