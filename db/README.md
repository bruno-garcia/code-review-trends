# Database — ClickHouse Schema Migrations

ClickHouse schema is managed through numbered SQL migration files in `db/init/`. All files run on all environments (local dev, CI, staging, prod).

## How Migrations Run

| Context | Mechanism |
|---------|-----------|
| **Docker / CI** | `db/init-ci.sh` — splits each `*.sql` file on semicolons and executes statements via the ClickHouse HTTP API, in sorted filename order. Records `EXPECTED_SCHEMA_VERSION` from `app/src/lib/migrations.ts` into `schema_migrations`. |
| **App startup** | `app/src/lib/migrations.ts` — checks current DB schema version against `EXPECTED_SCHEMA_VERSION`. Applies any missing migrations sequentially, then records the new version. Shows a warning banner if versions diverge. |
| **Remote DBs** | `npm run pipeline -- migrate --stack staging` (or `--stack prod`, `--local`) — applies migrations to remote ClickHouse instances using credentials from Pulumi config. |

## Migration Inventory

| File | Purpose |
|------|---------|
| `001_schema.sql` | Core tables: `products`, `bots`, `bot_logins`, `review_activity`, `human_review_activity`, `pr_bot_events`, `repos`, `pull_requests`, `pr_comments`, `schema_migrations`. Adds columns for existing databases. |
| `002_bot_data.sql` | Reference data for all tracked products, bots, and bot logins. Truncates and re-inserts for idempotency. Must match `pipeline/src/bots.ts`. |
| `003_pr_bot_reactions.sql` | `pr_bot_reactions` and `pr_bot_reactions_scanned` tables for tracking emoji-based reviews. |
| `004_pr_bot_event_counts.sql` | Materialized view pre-aggregating `pr_bot_events` by (repo_name, bot_id). Reduces org/repo page query cost. |
| `005_drop_repo_languages.sql` | Drops orphaned `repo_languages` table (replaced by `repos.primary_language`). |
| `006_reaction_only_review_counts.sql` | Refreshable MV for weekly reaction-only review counts per bot (e.g., Sentry's hooray reactions). |
| `007_comment_stats.sql` | `comment_stats_weekly` MV pre-aggregating `pr_comments` by (bot_id, week) for fast reaction/comment queries. |
| `008_reaction_only_repo_counts.sql` | Refreshable MV for reaction-only review counts per (repo_name, bot_id). Enables org listing to include reaction-based products. |
| `009_comment_stats_reacted_count.sql` | Adds `reacted_comment_count` to `comment_stats_weekly`. Drops and recreates the MV for re-backfill. |
| `010_kodus_bot.sql` | Adds Kodus (Kody AI) product, bot, and bot login. |
| `011_pr_product_characteristics.sql` | MV pre-joining `pull_requests` with `pr_bot_events` + `bots` for per-product PR characteristic queries. |
| `012_org_pr_counts.sql` | MV pre-aggregating owner-level PR counts, extracting owner from repo_name to eliminate expensive repos JOIN. |
| `013_pr_summary_tables.sql` | Summary tables for total PR counts per repo and per owner. Enables fast pagination on /repos and /orgs pages. |
| `014_bot_comment_discovery_summary.sql` | Pre-aggregated per-bot comment discovery totals. Collapses 471K rows into ~20 rows for fast status page queries. |
| `014_product_status.sql` | Adds `status` column to `products` (active/retired). Marks Korbit as retired. |
| `015_reaction_scan_status.sql` | Adds `scan_status` column to `reaction_scan_progress`. |
| `016_pr_comments_bot_id_ordering.sql` | Adds `bot_id` to `pr_comments` ORDER BY to prevent sentinel row deduplication across bots. |

## Adding a New Migration

1. **Pick the next number.** Check existing files and use the next available 3-digit prefix (e.g., `015_`).
2. **Create the file:** `db/init/NNN_descriptive_name.sql`
3. **Write idempotent SQL.** Use `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `DROP TABLE IF EXISTS`, etc. Migrations may be re-run.
4. **Update `app/src/lib/migrations.ts` (schema changes only).** If your migration creates or alters tables/columns/views, increment `EXPECTED_SCHEMA_VERSION` and add the migration to the version list so the app applies it on startup. Data-only migrations (e.g., `INSERT` statements for a new bot) do not need a `migrations.ts` entry.
5. **Test locally.** Run `npm run dev:infra` to start ClickHouse, then verify your migration applies cleanly.

## Naming Convention

- **Prefix:** 3-digit zero-padded number (`001`, `002`, ..., `014`)
- **Name:** lowercase with underscores, descriptive of what it does
- **Example:** `015_add_review_sources.sql`
- Each number must be unique

## Seed Data (`db/seed/`)

Test data for CI and local development lives in `db/seed/`. Unlike `db/init/`, seed files are **never applied to staging or production** — they only run via `db/init-ci.sh` (CI) or manually during local dev.

| File | Purpose |
|------|---------|
| `e2e-test-data.sql` | Minimal data for 2 products (CodeRabbit + Sentry), 4 repos across 2 orgs, with review activity, PR events, comments, and reaction-only reviews. Exercises code paths unreachable with empty tables (e.g., product-filter JOINs, multi-bot product pages, org/repo listings). |

Seed data is **idempotent** — safe to re-run. Each seed file truncates its target tables (including MV targets) before inserting, preventing double-counting in AggregatingMergeTree tables.

To run locally after `npm run dev:infra`:
```bash
CLICKHOUSE_URL=http://localhost:$PORT CLICKHOUSE_PASSWORD=dev bash db/init-ci.sh
```

## Important Rules

- **Never edit existing migration files.** Files committed to `main` are immutable. Make schema changes in new numbered files. (See Principle #15 in AGENTS.md.)
- **SQL must be idempotent.** Every migration may run multiple times across different environments.
- **All migrations run on all environments.** There is no env-specific gating — `db/init/` is the single source of truth.
- **Reference data uses TRUNCATE + INSERT.** Small lookup tables (products, bots, bot_logins) are fully replaced for idempotency rather than using upsert patterns.
