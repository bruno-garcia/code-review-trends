# AGENTS.md — Code Review Trends

## Project Overview

Public website (codereviewtrends.com) tracking adoption of AI code review bots on GitHub over time. Shows trends, statistics, and per-provider profiles.

## Architecture

- **`app/`** — Next.js 16 (App Router, TypeScript, Tailwind CSS v4). Server components fetch from ClickHouse; client components render charts with Recharts.
- **`pipeline/`** — TypeScript data collection service. Pulls data from BigQuery (GH Archive) and GitHub API, writes to ClickHouse. Has CLI tools for dev.
- **`infra/`** — Pulumi (TypeScript) infrastructure-as-code for GCP. Manages ClickHouse VM, Cloud Run (Next.js app), Cloud Run Jobs (pipeline), Artifact Registry, Cloud Scheduler, Workload Identity Federation, and Secret Manager. See `infra/README.md`.
- **`db/`** — ClickHouse schema and data, split by environment:
  - `db/init/` — runs on **all** environments: schema (`001_schema.sql`), bot reference data (`002_bot_data.sql`), and additional migrations (`003_pr_bot_reactions.sql`, `004_pr_bot_event_counts.sql`).
- **`docker-compose.yml`** — Local dev services (ClickHouse).

## Dev Environment

Each checkout gets **isolated ports** (ClickHouse + Next.js) so multiple checkouts can run concurrently. Ports are auto-assigned and saved to `.env.local`.

```bash
# Start ClickHouse + app (auto-assigns ports)
npm run dev            # or: ./dev.sh

# Or separately:
npm run dev:infra      # ClickHouse only
npm run dev:app        # Next.js only (assumes ClickHouse is running)

# Show assigned ports
./dev.sh ports

# Stop containers
npm run dev:down

# Reset ports (will be re-assigned on next start)
rm .env.local
```

Ports are printed on startup. ClickHouse defaults to `localhost:8123` / `localhost:9000` if no `.env.local` exists (e.g., in CI or manual `docker compose up`). Default credentials: `default` / `dev`, database: `code_review_trends`.

### Pipeline dev tools

```bash
# Inspect data in ClickHouse
npm run inspect                          # overview of all tables
npm run inspect -- --bot coderabbit      # show data for a specific bot
npm run inspect -- --weeks 4             # last N weeks of activity
npm run inspect -- --table bots          # raw table dump
npm run inspect -- --query "SELECT ..."  # arbitrary query

# Validate schema matches expectations
npm run validate

# Pipeline CLI
npm run pipeline -- sync-bots --env development      # push bot definitions to ClickHouse
npm run pipeline -- fetch-bigquery --env development  # pull data from GH Archive (needs GCP)
npm run pipeline -- fetch-bigquery --env development --dry-run  # preview without running
npm run pipeline -- help                              # show all commands (no --env needed)
```

### Pipeline smoke tests

```bash
# Smoke tests — hits real BigQuery + GitHub API → ClickHouse (~30s)
# Validates the full pipeline: BQ queries return non-zero values,
# GitHub API responses map correctly, app queries work on real data.
GITHUB_TOKEN=... npm run test:smoke --workspace=pipeline

# Runs in CI on every PR (inside the e2e job in .github/workflows/ci.yml, gated on secret availability)
```

## Principles

1. **Server-first rendering.** Pages are server components that query ClickHouse directly. Only chart components are client-side (`"use client"`). No API routes unless needed by external consumers.

2. **ClickHouse for analytics.** All data lives in ClickHouse, optimized for analytical queries. Use `ReplacingMergeTree` for idempotent inserts. Design tables for the queries the UI needs.

3. **Pipeline is the only data source.** All data comes from the pipeline (BigQuery + GitHub API). The app should render gracefully with empty tables — no fake/seed data.

4. **Test with Playwright.** E2e tests in `app/e2e/` validate that pages render with data from ClickHouse. Tests run against real ClickHouse (via Docker in CI, local in dev). Use `data-testid` attributes for stable selectors.

5. **CI is the source of truth.** Every PR must pass lint, typecheck, build, and Playwright tests. See `.github/workflows/ci.yml`.

6. **Keep it simple.** No ORMs, no abstraction layers over ClickHouse. Raw SQL queries in `app/src/lib/clickhouse.ts`. Parameterized queries only (`{param:Type}` syntax) — never interpolate user input into SQL.

7. **Dark theme by default.** The UI supports light and dark themes via CSS custom properties and a `ThemeToggle` component. Dark is the default. All chart colors must be legible on both light and dark backgrounds.

8. **Pipeline is idempotent.** All pipeline writes use `ReplacingMergeTree`, so re-running for the same time range just overwrites. No need for delete-before-insert patterns. Safe to retry.

9. **Bot registry is the source of truth.** The canonical list of tracked bots lives in `pipeline/src/bots.ts`. Use `npm run pipeline -- sync-bots` to push to ClickHouse.

10. **Build dev tools, not just features.** Invest in CLI tools (`inspect`, `validate`, `discover-bots`) that make development fast and reduce reliance on CI or prod for feedback.

11. **No fake data.** All data comes from the pipeline (BigQuery + GitHub API). `db/init/` contains schema and bot reference data — applied to all environments. There is no seed data; local dev and CI start with empty tables.

12. **2023-01-01 is the epoch.** AI code review became a meaningful category after this date. All pipeline imports start from 2023-01-01. No data before this date is collected or expected.

13. **Separate data sourcing from rendering.** The app reads from ClickHouse and never talks to BigQuery or GitHub directly. The pipeline writes to ClickHouse and never serves web requests. This clean boundary lets each part be developed and tested independently.

14. **Never edit existing migration files.** Files in `db/init/` that have been committed to `main` are immutable. Schema changes or new reference data must be introduced as new numbered files (e.g., `003_add_column.sql`). This ensures migrations are safe to replay and that remote databases already running earlier files aren't silently diverged.

## Key Files

| Path | Purpose |
|------|---------|
| `.dockerignore` | Docker build exclusions |
| `app/Dockerfile` | Multi-stage Docker build for Next.js app |
| `app/src/lib/clickhouse.ts` | ClickHouse client + all data queries (app) |
| `app/src/lib/migrations.ts` | Versioned schema migration system (auto-migrate on app start) |
| `app/src/components/charts.tsx` | Recharts chart components (client-side) |
| `app/src/components/schema-banner.tsx` | Warning banner when app/DB schema versions diverge |
| `app/src/components/theme-provider.tsx` | Light/dark theme system (CSS custom properties) |
| `app/src/components/theme-toggle.tsx` | Theme toggle UI component |
| `app/src/app/page.tsx` | Home page — AI share, volume, leaderboard |
| `app/src/app/bots/page.tsx` | Bot listing page |
| `app/src/app/bots/[id]/page.tsx` | Individual bot detail page |
| `app/src/app/about/page.tsx` | About / methodology page |
| `app/src/app/status/page.tsx` | Pipeline status page |
| `app/src/app/orgs/page.tsx` | Organization listing page |
| `app/src/app/orgs/[owner]/page.tsx` | Individual organization detail page |
| `app/src/app/compare/page.tsx` | Bot comparison page |
| `app/src/app/error.tsx` | Error boundary page |
| `app/src/middleware.ts` | Per-IP rate limiting (in-memory sliding window) |
| `app/src/app/api/revalidate/route.ts` | ISR cache revalidation endpoint |
| `app/e2e/` | Playwright e2e tests |
| `db/init/001_schema.sql` | ClickHouse table definitions (all environments) |
| `db/init/002_bot_data.sql` | Products, bots, bot_logins reference data (all environments) |
| `db/init/003_pr_bot_reactions.sql` | Bot reactions table (emoji reactions as reviews) |
| `db/init/004_pr_bot_event_counts.sql` | Materialized view for pre-aggregated event counts |
| `db/init-ci.sh` | CI init script — runs db/init/*.sql via HTTP |
| `pipeline/Dockerfile` | Multi-stage Docker build for pipeline CLI |
| `pipeline/schedules.json` | Job schedules (shared by Sentry cron + Cloud Scheduler) |
| `pipeline/src/bots.ts` | Canonical bot registry |
| `pipeline/src/clickhouse.ts` | ClickHouse writer (pipeline) |
| `pipeline/src/bigquery.ts` | GH Archive queries |
| `pipeline/src/github.ts` | GitHub API client |
| `pipeline/src/enrichment/` | GraphQL batching enrichment (repos, PRs, comments, reactions) |
| `pipeline/src/warmup.ts` | Cache warmup (called during deploy) |
| `pipeline/src/cli.ts` | Pipeline CLI entry point |
| `pipeline/src/smoke.test.ts` | Smoke tests — BigQuery + GitHub API → ClickHouse → app queries |
| `pipeline/src/tools/` | Dev inspection/validation tools |
| `infra/index.ts` | Pulumi entrypoint — wires all components |
| `infra/config.ts` | Typed Pulumi config loader |
| `infra/artifact-registry.ts` | Container image registry |
| `infra/cloud-run-app.ts` | Cloud Run service for Next.js |
| `infra/cloud-run-jobs.ts` | Cloud Run Jobs + Cloud Scheduler triggers |
| `infra/network.ts` | VPC, subnet, router, NAT, static IP |
| `infra/firewall.ts` | Firewall rules (SSH, ClickHouse) |
| `infra/clickhouse.ts` | ClickHouse VM with startup script |
| `infra/secrets.ts` | Secret Manager + random password generation |
| `infra/service-accounts.ts` | Runtime and deploy service accounts with IAM |
| `infra/workload-identity.ts` | WIF pool + provider for GitHub Actions auth |
| `infra/Pulumi.staging.yaml` | Staging stack config (GCP project, machine types) |
| `infra/tests/infra.test.ts` | Pulumi unit tests (mocked, no cloud calls) |
| `infra/test-vm.sh` | Integration test (creates real VM, validates, tears down) |

## Adding a New Bot

1. Add an entry to `pipeline/src/bots.ts`.
2. Run `npm run pipeline -- sync-bots` to push to ClickHouse.
3. Update `db/init/002_bot_data.sql` to match (validated by `bots.test.ts`).
4. The UI picks it up automatically — no code changes needed.
5. Run the pipeline to backfill data for the new bot.

## Managing Remote Databases

```bash
# Apply schema + bot data to staging (reads creds from Pulumi)
npm run pipeline -- migrate --stack staging

# Apply schema + bot data to prod
npm run pipeline -- migrate --stack prod

# Apply to local ClickHouse (uses env vars or defaults)
npm run pipeline -- migrate --local

# Preview what would be applied
npm run pipeline -- migrate --stack staging --dry-run

# Run data import pipeline against any database
CLICKHOUSE_URL=https://... CLICKHOUSE_PASSWORD=... npm run pipeline -- sync
```

## Populating Data (Staging / Prod)

The pipeline has three stages that must run in order. All are idempotent and reentrant — safe to kill and restart.

```bash
# Set target database (use migrate --stack to read creds from Pulumi)
export CLICKHOUSE_URL=https://...
export CLICKHOUSE_PASSWORD=...
export GITHUB_TOKEN=...   # GitHub PAT for enrichment

# All commands require --env (development | staging | production).
# This identifies where the code runs, not which DB it connects to.

# 1. Backfill: BigQuery → review_activity + human_review_activity
#    Aggregates weekly bot/human review counts from GH Archive.
npm run pipeline -- backfill --env staging              # resume from last checkpoint
npm run pipeline -- backfill --env staging --no-resume  # re-fetch everything
npm run pipeline -- backfill --env staging --all        # full history from 2023-01-01

# 2. Discover: BigQuery → pr_bot_events
#    Finds individual PR-level bot events (which bot touched which PR).
npm run pipeline -- discover --env staging              # last 3 months (default)
npm run pipeline -- discover --env staging --all        # full history from 2023-01-01

# 3. Enrich: GitHub API → repos, pull_requests, pr_comments
#    Fetches metadata for repos/PRs/comments found by discover.
#    Processes repos first, then PRs (need repos), then comments (need PRs).
npm run pipeline -- enrich --env staging --limit 4500   # fetch up to 4500 items per stage
npm run pipeline -- enrich-status --env staging         # show enrichment progress

# Parallel enrichment with multiple GitHub tokens (doubles throughput):
GITHUB_TOKEN=$TOKEN_A npm run pipeline -- enrich --env staging --limit 4500 --worker-id 0 --total-workers 2 &
GITHUB_TOKEN=$TOKEN_B npm run pipeline -- enrich --env staging --limit 4500 --worker-id 1 --total-workers 2 &
```

**How reentrance works:** Each stage queries ClickHouse for what's NOT yet done (e.g., repos in `pr_bot_events` but not in `repos` table). Workers partition work by hash modulo, so parallel workers don't overlap. `ReplacingMergeTree` deduplicates any accidental re-inserts.

**Rate limits:** Each GitHub token gets 5,000 API calls/hour. The enrichment worker auto-throttles when remaining calls drop below 100, waiting for the reset window. With 2 tokens you get ~10K calls/hour.

## Deployment

### Staging (automatic)
Every merge to `main` triggers the `deploy-staging` CI job:
1. Builds app + pipeline container images (tagged with git SHA)
2. Pushes to GCP Artifact Registry
3. Deploys app to Cloud Run (`crt-staging-app`)
4. Updates all 5 pipeline Cloud Run Jobs with new image

Uses Workload Identity Federation — no service account keys needed.

### Production (future — manual)
Will use `workflow_dispatch` to deploy a specific image tag.
Same infrastructure, different Pulumi stack.

### Rollback
Redeploy with an older git SHA:
```bash
gcloud run deploy crt-staging-app --image=<registry>/app:<old-sha> --region=us-central1
```

## Adding a New Chart / Metric

1. Add the query to `app/src/lib/clickhouse.ts` with proper types.
2. Add the chart component to `app/src/components/charts.tsx` (mark `"use client"`).
3. Wire it into the appropriate page (server component fetches data, passes to client chart).
4. Add `data-testid` attributes and write a Playwright test.

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a pull request. No exceptions. If you're instructed to push to main, make sure the full test suite passes.
- Branch names: `<type>/<short-description>` (e.g., `fix/clickhouse-left-join`, `feat/mobile-nav`).
- One logical change per PR. Keep PRs focused and reviewable.
- **Merges to `main` auto-deploy to staging** via the `deploy-staging` CI job.

## Conventions

- **SQL files** — numbered prefix for execution order (`001_`, `002_`, etc.).
- **TypeScript** — strict mode, no `any`. Export types from their source module.
- **Imports (app)** — use `@/*` path alias (maps to `app/src/*`).
- **Imports (pipeline)** — use `.js` extension in imports (ESM requirement).
- **Test IDs** — `data-testid="section-name"` on key sections for Playwright.
- **No `.env` in git** — use `.env.local` for local dev. CI sets env vars directly.
- **ClickHouse queries** — use `toString()` to cast `Date` columns in SELECT (not `formatDateTime`), and never alias a column with the same name as the source column when filtering on it.
- **Docker images** — tagged with git SHA, built from repo root context.
- **Secrets** — stored in GCP Secret Manager, encrypted in Pulumi config. Never in source.
- **Job schedules** — defined in `pipeline/schedules.json`, the single source of truth.
