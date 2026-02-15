# AGENTS.md — Code Review Trends

## Project Overview

Public website (codereviewtrends.com) tracking adoption of AI code review bots on GitHub over time. Shows trends, statistics, and per-provider profiles.

## Architecture

- **`app/`** — Next.js 16 (App Router, TypeScript, Tailwind CSS v4). Server components fetch from ClickHouse; client components render charts with Recharts.
- **`pipeline/`** — TypeScript data collection service. Pulls data from BigQuery (GH Archive) and GitHub API, writes to ClickHouse. Has CLI tools for dev.
- **`infra/`** — Pulumi (TypeScript) infrastructure-as-code for GCP. Manages the production ClickHouse VM, networking, and firewall rules. See `infra/README.md`.
- **`db/`** — ClickHouse schema (`db/init/001_schema.sql`) and seed data (`db/init/002_seed.sql`). Init scripts run automatically when ClickHouse container starts.
- **`docker-compose.yml`** — Local dev services (ClickHouse).

## Dev Environment

```bash
# Start ClickHouse + app
npm run dev

# Or separately:
npm run dev:infra      # docker compose up -d
npm run dev:app        # next dev (port 3000)

# Stop containers
npm run dev:down
```

ClickHouse is available at `localhost:8123` (HTTP) and `localhost:9000` (native). Default credentials: `default` / `dev`, database: `code_review_trends`.

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
npm run pipeline -- sync-bots            # push bot definitions to ClickHouse
npm run pipeline -- fetch-bigquery       # pull data from GH Archive (needs GCP)
npm run pipeline -- fetch-bigquery --dry-run  # preview without running
npm run pipeline -- help                 # show all commands
```

## Principles

1. **Server-first rendering.** Pages are server components that query ClickHouse directly. Only chart components are client-side (`"use client"`). No API routes unless needed by external consumers.

2. **ClickHouse for analytics.** All data lives in ClickHouse, optimized for analytical queries. Use `ReplacingMergeTree` for idempotent inserts. Design tables for the queries the UI needs.

3. **Fake data first.** Seed data provides realistic growth curves for developing the UI. The data pipeline (BigQuery + GitHub API) is a separate concern — the app should never assume where data came from.

4. **Test with Playwright.** E2e tests in `app/e2e/` validate that pages render with data from ClickHouse. Tests run against real ClickHouse (via Docker in CI, local in dev). Use `data-testid` attributes for stable selectors.

5. **CI is the source of truth.** Every PR must pass lint, typecheck, build, and Playwright tests. See `.github/workflows/ci.yml`.

6. **Keep it simple.** No ORMs, no abstraction layers over ClickHouse. Raw SQL queries in `app/src/lib/clickhouse.ts`. Parameterized queries only (`{param:Type}` syntax) — never interpolate user input into SQL.

7. **Dark theme by default.** The UI uses a dark color palette (`gray-950` background). All chart colors should be visible on dark backgrounds.

8. **Pipeline is idempotent.** All pipeline writes use `ReplacingMergeTree`, so re-running for the same time range just overwrites. No need for delete-before-insert patterns. Safe to retry.

9. **Bot registry is the source of truth.** The canonical list of tracked bots lives in `pipeline/src/bots.ts`. Use `npm run pipeline -- sync-bots` to push to ClickHouse. Seed data is for dev only.

10. **Build dev tools, not just features.** Invest in CLI tools (`inspect`, `validate`, `discover-bots`) that make development fast and reduce reliance on CI or prod for feedback.

11. **Separate data sourcing from rendering.** The app reads from ClickHouse and never talks to BigQuery or GitHub directly. The pipeline writes to ClickHouse and never serves web requests. This clean boundary lets each part be developed and tested independently.

## Key Files

| Path | Purpose |
|------|---------|
| `app/src/lib/clickhouse.ts` | ClickHouse client + all data queries (app) |
| `app/src/components/charts.tsx` | Recharts chart components (client-side) |
| `app/src/app/page.tsx` | Home page — AI share, volume, leaderboard |
| `app/src/app/bots/page.tsx` | Bot listing page |
| `app/src/app/bots/[id]/page.tsx` | Individual bot detail page |
| `db/init/001_schema.sql` | ClickHouse table definitions |
| `db/init/002_seed.sql` | Fake seed data for dev |
| `app/e2e/` | Playwright e2e tests |
| `pipeline/src/bots.ts` | Canonical bot registry |
| `pipeline/src/clickhouse.ts` | ClickHouse writer (pipeline) |
| `pipeline/src/bigquery.ts` | GH Archive queries |
| `pipeline/src/github.ts` | GitHub API enrichment |
| `pipeline/src/cli.ts` | Pipeline CLI entry point |
| `pipeline/src/tools/` | Dev inspection/validation tools |
| `infra/index.ts` | Pulumi entrypoint — wires all components |
| `infra/config.ts` | Typed Pulumi config loader |
| `infra/network.ts` | VPC, subnet, router, NAT, static IP |
| `infra/firewall.ts` | Firewall rules (SSH, ClickHouse) |
| `infra/clickhouse.ts` | ClickHouse VM with startup script |
| `infra/secrets.ts` | Secret Manager + random password generation |
| `infra/Pulumi.staging.yaml` | Staging stack config (GCP project, machine types) |
| `infra/tests/infra.test.ts` | Pulumi unit tests (mocked, no cloud calls) |
| `infra/test-vm.sh` | Integration test (creates real VM, validates, tears down) |

## Adding a New Bot

1. Add an entry to `pipeline/src/bots.ts`.
2. Run `npm run pipeline -- sync-bots` to push to ClickHouse.
3. The UI picks it up automatically — no code changes needed.
4. Optionally add seed data in `db/init/002_seed.sql` for dev.

## Adding a New Chart / Metric

1. Add the query to `app/src/lib/clickhouse.ts` with proper types.
2. Add the chart component to `app/src/components/charts.tsx` (mark `"use client"`).
3. Wire it into the appropriate page (server component fetches data, passes to client chart).
4. Add `data-testid` attributes and write a Playwright test.

## Conventions

- **SQL files** — numbered prefix for execution order (`001_`, `002_`, etc.).
- **TypeScript** — strict mode, no `any`. Export types from their source module.
- **Imports (app)** — use `@/*` path alias (maps to `app/src/*`).
- **Imports (pipeline)** — use `.js` extension in imports (ESM requirement).
- **Test IDs** — `data-testid="section-name"` on key sections for Playwright.
- **No `.env` in git** — use `.env.local` for local dev. CI sets env vars directly.
- **ClickHouse queries** — use `toString()` to cast `Date` columns in SELECT (not `formatDateTime`), and never alias a column with the same name as the source column when filtering on it.
