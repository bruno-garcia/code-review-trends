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
| `--start YYYY-MM-DD` | 3 months ago | Start date (inclusive) |
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
| `--start YYYY-MM-DD` | 3 months ago | Start date |
| `--end YYYY-MM-DD` | today | End date |
| `--all` | — | Full history from 2023-01-01 |
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

### `discover`

Find individual PR-level bot events from BigQuery and write them to `pr_bot_events`. Used by the enrichment stage to know which repos/PRs to fetch metadata for.

```bash
npm run pipeline -- discover              # last 3 months (default)
npm run pipeline -- discover --all        # full history from 2023-01-01
npm run pipeline -- discover --dry-run    # preview without running
```

| Option | Default | Description |
|--------|---------|-------------|
| `--start YYYY-MM-DD` | 3 months ago | Start date |
| `--end YYYY-MM-DD` | today | End date |
| `--all` | — | Discover full history from 2023-01-01 |
| `--dry-run` | — | Show what would be fetched without running |

### `enrich`

Fetch metadata from GitHub's GraphQL API for repos, PRs, comments, and reactions found by `discover`. Processes in order: repos → PRs → comments → reactions.

```bash
npm run pipeline -- enrich --limit 4500                    # fetch up to 4500 items per type
npm run pipeline -- enrich --exit-on-rate-limit            # exit cleanly when rate-limited
npm run pipeline -- enrich --priority prs                  # start with PRs instead of repos
```

| Option | Default | Description |
|--------|---------|-------------|
| `--token TOKEN` | `$GITHUB_TOKEN` | GitHub PAT (or set env var) |
| `--worker-id N` | `0` | Worker ID for hash-based partitioning |
| `--total-workers N` | `1` | Total parallel workers |
| `--limit N` | — | Max items per entity type per run |
| `--priority TYPE` | `repos` | Start with: `repos`, `prs`, `comments`, or `reactions` |
| `--stale-days N` | `7` | Repo refresh threshold in days |
| `--exit-on-rate-limit` | — | Exit cleanly (exit 0) when rate-limited instead of sleeping |

Parallel enrichment with multiple GitHub tokens:

```bash
GITHUB_TOKEN=$TOKEN_A npm run pipeline -- enrich --limit 4500 --worker-id 0 --total-workers 2 &
GITHUB_TOKEN=$TOKEN_B npm run pipeline -- enrich --limit 4500 --worker-id 1 --total-workers 2 &
```

### `enrich-status`

Show enrichment progress — how many repos, PRs, comments, and reactions have been fetched vs. pending.

```bash
npm run pipeline -- enrich-status
```

### `discover-bots`

Find new bot accounts in GH Archive and the GitHub Marketplace. Used to identify bots to add to the registry.

```bash
npm run pipeline -- discover-bots
npm run pipeline -- discover-bots --start 2025-01-01 --end 2025-02-01
npm run pipeline -- discover-bots --marketplace-only
```

| Option | Default | Description |
|--------|---------|-------------|
| `--start YYYY-MM-DD` | 30 days ago | Start date |
| `--end YYYY-MM-DD` | today | End date |
| `--marketplace-only` | — | Skip BigQuery `[bot]` scan |
| `--bigquery-only` | — | Skip marketplace scan |

### `validate-bq-prs`

Compare PR data from BigQuery against GitHub's API to detect discrepancies. Useful for validating pipeline accuracy.

```bash
npm run pipeline -- validate-bq-prs
npm run pipeline -- validate-bq-prs --sample 1000
```

| Option | Default | Description |
|--------|---------|-------------|
| `--sample N` | `500` | Number of PRs to compare |

### `generate-compare-pairs`

Generate compare pair metadata for the app's comparison page. Run this after adding new bots.

```bash
npm run pipeline -- generate-compare-pairs
```

## Global Options

These options apply to all commands:

| Option | Default | Description |
|--------|---------|-------------|
| `--env ENV` | — | Runtime environment: `development`, `staging`, or `production` (**required**) |
| `--no-sentry` | — | Disable Sentry observability (tracing, crons, metrics) |
| `--clickhouse-url URL` | `http://localhost:8123` | ClickHouse HTTP URL (env: `CLICKHOUSE_URL`) |
| `--clickhouse-password PW` | `dev` | ClickHouse password (env: `CLICKHOUSE_PASSWORD`) |

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

Actual schedules are defined in `pipeline/schedules.json` and used by both Cloud Scheduler and Sentry cron monitors:

```bash
# Daily sync — fetch recent BigQuery data (6am UTC daily)
0 6 * * *  npm run pipeline -- sync --env production

# Weekly backfill — historical import (2am UTC Mondays)
0 2 * * 1  npm run pipeline -- backfill --env production

# Daily discover — find PR bot events (4am UTC daily)
0 4 * * *  npm run pipeline -- discover --env production

# Hourly enrich — GitHub API enrichment (5 min past every hour)
5 * * * *  npm run pipeline -- enrich --env production

# Monthly discover-bots — find new bot accounts (3am UTC, 1st of month)
0 3 1 * *  npm run pipeline -- discover-bots --env production
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
    003_pr_bot_reactions.sql   — Bot reactions table
    004_pr_bot_event_counts.sql — Materialized view for pre-aggregated counts
  init-ci.sh                   — CI script: runs db/init/*.sql via HTTP
```

- **Local dev** (`docker compose up`): Runs `001_schema.sql` → `002_bot_data.sql`. Tables start empty; run the pipeline to populate.
- **CI** (`bash db/init-ci.sh`): Same schema via HTTP against the ClickHouse service container.
- **Staging/prod** (`npm run pipeline -- migrate`): Applies `db/init/*.sql` + syncs bot registry from `bots.ts`.

## Architecture

```
BigQuery (GH Archive)  →  pipeline  →  ClickHouse
GitHub API            ─┘
                           ├── bigquery.ts    — GH Archive queries
                           ├── clickhouse.ts  — ClickHouse writer
                           ├── github.ts      — GitHub API client
                           ├── sync.ts        — orchestration (backfill, incremental)
                           ├── bots.ts        — canonical bot registry
                           ├── cli.ts         — CLI entry point (incl. migrate command)
                           ├── warmup.ts      — cache warmup (called during deploy)
                           ├── enrichment/
                           │   ├── worker.ts           — enrichment orchestrator
                           │   ├── repos.ts            — repo metadata enrichment
                           │   ├── pull-requests.ts    — PR metadata enrichment
                           │   ├── comments.ts         — PR comment enrichment
                           │   ├── reactions.ts        — bot emoji reaction enrichment
                           │   ├── graphql-repos.ts    — GraphQL batch fetcher (repos)
                           │   ├── graphql-pull-requests.ts — GraphQL batch fetcher (PRs)
                           │   ├── graphql-comments.ts — GraphQL batch fetcher (comments)
                           │   ├── graphql-reactions.ts — GraphQL batch fetcher (reactions)
                           │   ├── rate-limiter.ts     — GitHub API rate limit handling
                           │   ├── partitioner.ts      — hash-based work partitioning
                           │   └── summary.ts          — enrichment progress reporting
                           └── tools/
                               ├── status.ts       — health & monitoring
                               ├── inspect-data.ts — data exploration
                               ├── validate-schema.ts — schema drift check
                               └── discover-bots.ts   — find new bots in GH Archive
```

The pipeline has three stages:

1. **Backfill / Sync** (BigQuery → `review_activity` + `human_review_activity`) — weekly counts of `PullRequestReviewEvent` and `PullRequestReviewCommentEvent` per tracked bot, plus distinct repo counts. Human review activity provides the same metrics for non-bot accounts, used to calculate AI share percentages.
2. **Discover** (BigQuery → `pr_bot_events`) — individual PR-level bot events (which bot touched which PR).
3. **Enrich** (GitHub API → `repos`, `pull_requests`, `pr_comments`, `pr_bot_reactions`) — fetches metadata via GraphQL batching for repos/PRs/comments/reactions found by discover. Uses hash-based partitioning for parallel workers.

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
| Qodo (CodiumAI PR Agent) | `codium-pr-agent[bot]` |
| Qodo Merge | `qodo-merge[bot]` |
| Qodo Merge Pro | `qodo-merge-pro[bot]` |
| Qodo AI | `qodo-ai[bot]` |
| Greptile | `greptile-apps[bot]` |
| Sentry | `sentry[bot]` |
| Seer by Sentry | `seer-by-sentry[bot]` |
| Codecov AI | `codecov-ai[bot]` |
| Baz | `baz-reviewer[bot]` |
| Graphite | `graphite-app[bot]` |
| CodeAnt | `codeant-ai[bot]` |
| Windsurf | `windsurf-bot[bot]` |
| Cubic | `cubic-dev-ai[bot]` |
| Cursor Bugbot | `cursor[bot]` |
| Gemini Code Assist | `gemini-code-assist[bot]` |
| Bito | `bito-code-review[bot]` |
| Korbit | `korbit-ai[bot]` |
| Claude | `claude[bot]` |
| OpenAI Codex | `chatgpt-codex-connector[bot]` |
| Mesa | `mesa-dot-dev[bot]` |
| gitStream | `gitstream-cm[bot]` |
| LinearB | `linearb[bot]` |
| Augment Code | `augmentcode[bot]` |
| Kodus | `kody-ai[bot]` |

To add a new bot:

1. Add an entry to `src/bots.ts`
2. Add a new migration file in `db/init/` (e.g., `015_new_bot.sql`) with the product, bot, and bot_login INSERT statements — never edit existing migration files (see Principle #15 in AGENTS.md)
3. Run `npm run pipeline -- sync-bots` to push to local ClickHouse
4. Run `npm run pipeline -- generate-compare-pairs` to regenerate pair comparisons
5. For remote databases, run `npm run pipeline -- migrate --stack staging`
6. Use `npm run discover-bots` to find the correct GitHub login if unsure

## Tests

```bash
npm run test --workspace=pipeline     # requires ClickHouse running
npm run typecheck --workspace=pipeline
npm run lint --workspace=pipeline
```

Tests use a fake `DataFetcher` so they don't need BigQuery credentials, but they do write to the local ClickHouse instance to verify the full insert/query round-trip.
