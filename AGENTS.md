# AGENTS.md — Code Review Trends

## Project Overview

Public website (codereviewtrends.com) tracking adoption of AI code review bots on GitHub over time. Shows trends, statistics, and per-provider profiles.

## Architecture

- **`app/`** — Next.js 16 (App Router, TypeScript, Tailwind CSS v4). Server components fetch from ClickHouse; client components render charts with Recharts.
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

## Principles

1. **Server-first rendering.** Pages are server components that query ClickHouse directly. Only chart components are client-side (`"use client"`). No API routes unless needed by external consumers.

2. **ClickHouse for analytics.** All data lives in ClickHouse, optimized for analytical queries. Use `ReplacingMergeTree` for idempotent inserts. Design tables for the queries the UI needs.

3. **Fake data first.** Seed data provides realistic growth curves for developing the UI. The data pipeline (BigQuery + GitHub API) is a separate concern — the app should never assume where data came from.

4. **Test with Playwright.** E2e tests in `app/e2e/` validate that pages render with data from ClickHouse. Tests run against real ClickHouse (via Docker in CI, local in dev). Use `data-testid` attributes for stable selectors.

5. **CI is the source of truth.** Every PR must pass lint, build, and Playwright tests. See `.github/workflows/ci.yml`.

6. **Keep it simple.** No ORMs, no abstraction layers over ClickHouse. Raw SQL queries in `app/src/lib/clickhouse.ts`. Parameterized queries only (`{param:Type}` syntax) — never interpolate user input into SQL.

7. **Dark theme by default.** The UI uses a dark color palette (`gray-950` background). All chart colors should be visible on dark backgrounds.

## Key Files

| Path | Purpose |
|------|---------|
| `app/src/lib/clickhouse.ts` | ClickHouse client + all data queries |
| `app/src/components/charts.tsx` | Recharts chart components (client-side) |
| `app/src/app/page.tsx` | Home page — AI share, volume, leaderboard |
| `app/src/app/bots/page.tsx` | Bot listing page |
| `app/src/app/bots/[id]/page.tsx` | Individual bot detail page |
| `db/init/001_schema.sql` | ClickHouse table definitions |
| `db/init/002_seed.sql` | Fake seed data for dev |
| `app/e2e/` | Playwright e2e tests |

## Adding a New Bot

1. Add a row to `db/init/002_seed.sql` in the `bots` INSERT.
2. Add corresponding rows in `review_activity` and `review_reactions` seed data.
3. The UI picks it up automatically — no code changes needed.

## Adding a New Chart / Metric

1. Add the query to `app/src/lib/clickhouse.ts` with proper types.
2. Add the chart component to `app/src/components/charts.tsx` (mark `"use client"`).
3. Wire it into the appropriate page (server component fetches data, passes to client chart).
4. Add `data-testid` attributes and write a Playwright test.

## Conventions

- **SQL files** — numbered prefix for execution order (`001_`, `002_`, etc.).
- **TypeScript** — strict mode, no `any`. Export types from `clickhouse.ts`.
- **Imports** — use `@/*` path alias (maps to `app/src/*`).
- **Test IDs** — `data-testid="section-name"` on key sections for Playwright.
- **No `.env` in git** — use `.env.local` for local dev. CI sets env vars directly.
