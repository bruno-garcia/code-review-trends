# AGENTS.md — Code Review Trends

## Project Overview

Public website (codereviewtrends.com) tracking adoption of AI code review bots on GitHub over time. Shows trends, statistics, and per-provider profiles.

## Architecture

- **`app/`** — Next.js 16 (App Router, TypeScript, Tailwind CSS v4). Server components fetch from ClickHouse; client components render charts with Recharts.
- **`pipeline/`** — TypeScript data collection service. Pulls data from BigQuery (GH Archive) and GitHub API, writes to ClickHouse. Has CLI tools for dev.
- **`infra/`** — Pulumi (TypeScript) infrastructure-as-code for GCP. Manages ClickHouse VM, Cloud Run (Next.js app), Cloud Run Jobs (pipeline), Artifact Registry, Cloud Scheduler, Workload Identity Federation, and Secret Manager. See `infra/README.md`.
- **`db/`** — ClickHouse schema and data, split by environment:
  - `db/init/` — runs on **all** environments: numbered SQL migrations for schema, reference data, and table extensions. See `db/README.md` for the full list.
- **`coming-soon/`** — Static landing page currently live on codereviewtrends.com. Will be replaced when the full app goes to production.
- **`docker-compose.yml`** — Local dev services (ClickHouse).

## Dev Environment

Each checkout gets **isolated ports** (ClickHouse + Next.js) so multiple checkouts can run concurrently. Ports are auto-assigned and saved to `.env.local`.

```bash
# Install agent skills (required once after cloning)
npx @sentry/dotagents install

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
npm run inspect                          # overview of all tables
npm run pipeline -- help                 # show all commands
```

See [pipeline/README.md](pipeline/README.md) for full CLI documentation including all commands, options, and examples.

### Pipeline tests

The pipeline has three test tiers, each with different requirements:

```bash
# Unit tests — no external services needed, fast (~15s)
npm test --workspace=pipeline

# Integration tests — hits real GitHub API, no ClickHouse needed (~10s)
# Fails loudly if GITHUB_TOKEN is missing (prevents silent skips).
GITHUB_TOKEN=... npm run test:integration --workspace=pipeline
SKIP_GITHUB_TESTS=1 npm run test:integration --workspace=pipeline  # explicit opt-out

# Smoke tests — hits real BigQuery + GitHub API → ClickHouse (~30s)
# Validates the full pipeline: BQ queries return non-zero values,
# GitHub API responses map correctly, app queries work on real data.
GITHUB_TOKEN=... npm run test:smoke --workspace=pipeline
```

**File naming conventions:**
- `*.test.ts` — unit tests (included in `npm test`)
- `*.integration.test.ts` — integration tests (excluded from `npm test`, require `GITHUB_TOKEN`)
- `smoke.test.ts` — smoke tests (excluded from `npm test`, require GCP + `GITHUB_TOKEN` + ClickHouse)

Integration and smoke tests run in CI gated on secret availability (see `.github/workflows/ci.yml`).

## Principles

1. **Let errors crash the page — don't catch-and-render.** Server components must let query errors bubble up to the error boundary (`error.tsx`). Catching an error and rendering it inline produces an HTTP 200 that ISR caches, turning a transient failure into a long-lived outage. **The DB layer (`clickhouse.ts`) must NEVER catch errors** — it must always let them propagate. Only the calling page may catch, and only when: (a) the page is **fully functional** without the failed data (e.g., the about page without an enrichment percentage) — in which case the catch **must** call `Sentry.captureException`, or (b) OG images / sitemaps, which must return *something* and already capture with Sentry. A DB function that catches and returns a fallback value (e.g., `null`, `0`, `[]`) hides connection failures and makes the UI show **wrong information**. **No empty catch blocks, ever.** Every catch must either re-throw or call `Sentry.captureException` with relevant context (tags, route, query name).

2. **Server-first rendering.** Pages are server components that query ClickHouse directly. Only chart components are client-side (`"use client"`). No API routes unless needed by external consumers.

3. **ClickHouse for analytics.** All data lives in ClickHouse, optimized for analytical queries. Use `ReplacingMergeTree` for idempotent inserts. Design tables for the queries the UI needs.

4. **Pipeline is the only data source.** All data comes from the pipeline (BigQuery + GitHub API). The app should render gracefully with empty tables — no fake/seed data.

5. **Test with Playwright.** E2e tests in `app/e2e/` validate that pages render with data from ClickHouse. Tests run against real ClickHouse (via Docker in CI, local in dev). Use `data-testid` attributes for stable selectors.

6. **CI is the source of truth.** Every PR must pass lint, typecheck, build, and Playwright tests. See `.github/workflows/ci.yml`.

7. **Keep it simple.** No ORMs, no abstraction layers over ClickHouse. Raw SQL queries in `app/src/lib/clickhouse.ts`. Parameterized queries only (`{param:Type}` syntax) — never interpolate user input into SQL.

8. **Dark theme by default.** The UI supports light and dark themes via CSS custom properties and a `ThemeToggle` component. Dark is the default. All chart colors must be legible on both light and dark backgrounds.

9. **Pipeline is idempotent.** All pipeline writes use `ReplacingMergeTree`, so re-running for the same time range just overwrites. No need for delete-before-insert patterns. Safe to retry.

10. **Bot registry is the source of truth.** The canonical list of tracked bots lives in `pipeline/src/bots.ts`. Use `npm run pipeline -- sync-bots` to push to ClickHouse.

11. **Build dev tools, not just features.** Invest in CLI tools (`inspect`, `validate`, `discover-bots`) that make development fast and reduce reliance on CI or prod for feedback.

12. **No fake data.** All data comes from the pipeline (BigQuery + GitHub API). `db/init/` contains schema and bot reference data — applied to all environments. There is no seed data; local dev and CI start with empty tables.

13. **2023-01-01 is the epoch.** AI code review became a meaningful category after this date. All pipeline imports start from 2023-01-01. No data before this date is collected or expected.

14. **Separate data sourcing from rendering.** The app reads from ClickHouse and never talks to BigQuery or GitHub directly. The pipeline writes to ClickHouse and never serves web requests. This clean boundary lets each part be developed and tested independently.

15. **Never edit existing migration files.** Files in `db/init/` that have been committed to `main` are immutable. Schema changes or new reference data must be introduced as new numbered files (e.g., `003_add_column.sql`). This ensures migrations are safe to replay and that remote databases already running earlier files aren't silently diverged. **One exception:** `002_bot_data.sql` uses TRUNCATE + INSERT and is designed to be edited in place when adding new bots — it's reference data, not a schema migration.

16. **GH Archive has known data gaps.** Two upstream issues affect our data: (a) Since May 24, 2025, GH Archive captures ~35% fewer events due to a server-side change at GitHub ([gharchive.org#310](https://github.com/igrigorik/gharchive.org/issues/310), open). (b) Oct 9–14, 2025 was a near-total outage (~99% event loss) caused by a GitHub Events API caching bug ([gharchive.org#312](https://github.com/igrigorik/gharchive.org/issues/312), closed). Both affect bot and human counts proportionally, so AI Share percentages remain approximately correct, but absolute volume charts show visible dips. We do not interpolate or estimate missing data. See the [Methodology page](/about#data-gaps) for details.

17. **Beware sentinel rows masking bugs.** The enrichment pipeline inserts sentinel rows (`comment_id=0`) to mark "enriched, nothing found." If a code bug silently discards all results (e.g., a login filter that never matches), the sentinel makes the combo look "done" and it's never reprocessed. When adding sentinel/marker patterns, ensure the "nothing found" path is covered by integration tests that verify real data against known-good targets. Silent success with empty data is worse than a crash — it produces wrong information that looks correct.

18. **Materialized views can silently change query semantics.** When a MV pre-joins data for performance, it may drop columns from the source tables (e.g., `event_week`). If the app query previously filtered on that column, switching to the MV silently changes what the filter means. Always check that existing filter semantics are preserved. When the MV lacks a needed column, fall back to the original query for that code path rather than substituting a different column.

19. **New ReplacingMergeTree tables must be added to `optimizeTables`.** Without periodic `OPTIMIZE TABLE`, deduplication only happens at merge time, so `FINAL` queries must scan all duplicate parts at read time. When adding a new table or MV target that uses ReplacingMergeTree, add it to the relevant `optimizeTables` call in `pipeline/src/cli.ts`.

20. **Explicit configuration — no silent fallbacks.** Configuration values that affect observability, routing, or identity (e.g., Sentry environment, DSNs, database URLs) must be passed explicitly. Never fall back to generic variables like `NODE_ENV` — Next.js inlines it at build time, making runtime overrides impossible. If a required value is missing, the process must crash at startup with a clear error message. A wrong-but-working default (like `NODE_ENV=production` silently becoming the Sentry environment) is worse than a crash — it pollutes dashboards and hides misconfigurations for weeks. Use dedicated env vars (`SENTRY_ENVIRONMENT`, not `NODE_ENV`) and validate them at init time. When adding a new deployment environment, follow the full checklist in `infra/README.md` § "Adding a new environment" — every layer (Pulumi, CI, DNS, Sentry) must be configured explicitly.

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
| `app/src/app/products/page.tsx` | Product listing page |
| `app/src/app/products/[id]/page.tsx` | Individual bot detail page |
| `app/src/app/about/page.tsx` | About / methodology page |
| `app/src/app/status/page.tsx` | Pipeline status page |
| `app/src/app/orgs/page.tsx` | Organization listing page |
| `app/src/app/orgs/[owner]/page.tsx` | Individual organization detail page |
| `app/src/app/repos/page.tsx` | Repository listing page |
| `app/src/app/repos/[owner]/[name]/page.tsx` | Individual repository detail page |
| `app/src/app/repos/opengraph-image.tsx` | Repos OG image |
| `app/src/app/compare/page.tsx` | Bot comparison page |
| `app/src/app/compare/[pair]/page.tsx` | Bot comparison pair page |
| `app/src/app/compare/[pair]/opengraph-image.tsx` | Compare pair OG image |
| `app/src/app/layout.tsx` | Root layout (nav, theme, metadata) |
| `app/src/app/error.tsx` | Error boundary page |
| `app/src/app/global-error.tsx` | Global error boundary |
| `app/src/app/opengraph-image.tsx` | Homepage OG image (dynamic, queries ClickHouse) |
| `app/src/app/products/[id]/opengraph-image.tsx` | Per-product OG image (avatar, stats, brand color) |
| `app/src/app/compare/opengraph-image.tsx` | Compare page OG image (top products bar chart) |
| `app/src/app/orgs/opengraph-image.tsx` | Orgs listing OG image (top org avatars) |
| `app/src/app/sitemap.ts` | Dynamic sitemap (static pages + products + top orgs) |
| `app/src/app/robots.ts` | robots.txt generation |
| `app/src/components/json-ld.tsx` | Reusable JSON-LD structured data component |
| `app/e2e/` | Playwright e2e tests |
| `db/init/*.sql` | ClickHouse schema migrations — numbered for execution order (see `db/README.md`) |
| `db/init-ci.sh` | CI init script — runs all db/init/*.sql via HTTP |
| `pipeline/Dockerfile` | Multi-stage Docker build for pipeline CLI |
| `pipeline/schedules.json` | Job schedules (shared by Sentry cron + Cloud Scheduler) |
| `pipeline/src/bots.ts` | Canonical bot registry |
| `pipeline/src/clickhouse.ts` | ClickHouse writer (pipeline) |
| `pipeline/src/bigquery.ts` | GH Archive queries |
| `pipeline/src/github.ts` | GitHub API client |
| `pipeline/src/enrichment/` | GraphQL batching enrichment (repos, PRs, comments, reactions) |
| `pipeline/src/enrichment/graphql-retry.ts` | Shared retry wrapper for all GraphQL requests (transient error handling) |
| `pipeline/src/enrichment/octokit-agent.ts` | Custom HTTPS agent for Octokit (keep-alive, connection management) |
| `pipeline/src/enrichment/graphql-resilience.integration.test.ts` | Integration tests hitting real GitHub API with known bot-reviewed PRs |
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
| `infra/backups.ts` | Weekly ClickHouse disk snapshots (prod only) |
| `infra/monitoring.ts` | Disk usage alerting (log-based metric → email) |
| `infra/firewall.ts` | Firewall rules (SSH, ClickHouse) |
| `infra/clickhouse.ts` | ClickHouse VM with startup script |
| `infra/secrets.ts` | Secret Manager + random password generation |
| `infra/service-accounts.ts` | Runtime and deploy service accounts with IAM |
| `infra/workload-identity.ts` | WIF pool + provider for GitHub Actions auth |
| `infra/Pulumi.staging.yaml` | Staging stack config (GCP project, machine types) |
| `infra/tests/infra.test.ts` | Pulumi unit tests (mocked, no cloud calls) |
| `infra/test-vm.sh` | Integration test (creates real VM, validates, tears down) |

## Adding a New Bot

### Research
1. **Verify activity in BigQuery.** Use `queryReviewActivityByLogins` or `discover-bots` to confirm the bot has meaningful review activity in GH Archive. Check monthly trends to see if activity is growing or declining.
2. **Research the product.** Visit the product website and docs. Write descriptions based on what makes the product's approach to code review distinctive (see the About page — descriptions are AI-generated based on public research).
3. **Get GitHub bot details.** Use `gh api /users/<login>` to get the `id`, `login`, and `avatar_url`. For GitHub Apps, the avatar URL format is `https://avatars.githubusercontent.com/in/<app_id>?v=4`.

### Code changes (all must stay in sync — the test suite validates consistency)
4. **Add product + bot entries to `pipeline/src/bots.ts`.** This is the source of truth. Add a `ProductDefinition` (if new product) and `BotDefinition`. For products with multiple bot accounts, add multiple bot entries with the same `product_id`, or use `additional_logins` for alternate logins of the same bot.
5. **Add `PRODUCT_FOCUS` entry in `pipeline/src/tools/generate-compare-pairs.ts`.** A concise phrase (not a sentence) describing what makes this product's code review approach distinctive. Required for every product — the generator validates this.
6. **Update `db/init/002_bot_data.sql`.** Add the new product/bot/bot_login INSERT rows. This file uses TRUNCATE + INSERT so it's idempotent. Must exactly match `bots.ts` — the test suite checks this.
7. **Update test assertions in `pipeline/src/bots.test.ts`.** Update the bot count (`has N bots`), product count (`has N products`), and if applicable, multi-bot product counts.

### Generate, sync, and verify
8. **Generate compare pairs:** `npm run pipeline -- generate-compare-pairs` — regenerates `app/src/lib/generated/compare-pairs.ts` with all C(n,2) product pair combinations.
9. **Run tests:** `npm test --workspace=pipeline` — validates bots.ts ↔ SQL consistency, compare pairs, and registry integrity.
10. **Sync to local ClickHouse:** `npm run pipeline -- sync-bots` — pushes product/bot/bot_login data to your local DB.

### Data population
11. **Backfill historical data:** `npm run pipeline -- backfill` — fetches weekly review counts from BigQuery.
12. **Discover PR events:** `npm run pipeline -- discover` — finds individual PRs the bot touched.
13. **Enrich metadata:** `npm run pipeline -- enrich` — fetches repo/PR/comment details from GitHub API.
14. **For remote databases:** `npm run pipeline -- migrate --stack staging` (or `--stack prod`).

### What's automatic (no manual steps needed)
- **OG images** — dynamically generated at request time from ClickHouse data. New products get OG images automatically once data exists.
- **Sitemap** — auto-generates from products table.
- **Product pages** — rendered from ClickHouse, no app code changes needed.
- **Compare pages** — all pairs generated in step 8.

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

Full command reference in [pipeline/README.md](pipeline/README.md).

The pipeline has three stages that must run in order: **backfill** (BigQuery → review counts), **discover** (BigQuery → PR-level events), and **enrich** (GitHub API → repo/PR/comment metadata). All are idempotent and reentrant — safe to kill and restart.

```bash
export CLICKHOUSE_URL=https://...
export CLICKHOUSE_PASSWORD=...
export GITHUB_TOKEN=...

npm run pipeline -- backfill --env staging
npm run pipeline -- discover --env staging
npm run pipeline -- enrich --env staging --limit 4500
```

## Deployment

### Staging (automatic)
Every merge to `main` triggers the `deploy-staging` CI job:
1. Builds app + pipeline container images (tagged with git SHA)
2. Pushes to GCP Artifact Registry
3. Deploys app to Cloud Run (`crt-staging-app`)
4. Updates all 5 pipeline Cloud Run Jobs with new image

Uses Workload Identity Federation — no service account keys needed.

### Production (not yet set up)
Will use `workflow_dispatch` to deploy a specific image tag.
Same infrastructure, different Pulumi stack. Currently the `coming-soon/` static page is live on codereviewtrends.com.

### Rollback
Redeploy with an older git SHA:
```bash
gcloud run deploy crt-staging-app --image=<registry>/app:<old-sha> --region=us-central1
```

## OG Images & SEO

OG images are dynamically generated at request time by Next.js using `next/og` (Satori). They query ClickHouse for live data — no static files, no cron jobs, no manual regeneration. When bot descriptions or stats change, OG images automatically reflect current data on the next request.

Key SEO files:
- **OG images:** `opengraph-image.tsx` in route directories (homepage, bots/[id], compare, orgs)
- **Sitemap:** `app/src/app/sitemap.ts` — auto-generates from products + top orgs
- **Robots:** `app/src/app/robots.ts`
- **Structured data:** `JsonLd` component in `app/src/components/json-ld.tsx`
- **Per-page metadata:** `generateMetadata` or static `metadata` export on every page

OG image routes are tested in Playwright (`app/e2e/og-images.spec.ts`) — CI verifies they return 200 with valid PNG content.

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
- **No empty catch blocks.** See Principle #1. Every catch must re-throw or call `Sentry.captureException(err)` with context tags.
- **GitHub GraphQL strips `[bot]` from logins.** The GraphQL API returns Bot authors as `coderabbitai`, not `coderabbitai[bot]`. The REST API returns the full `[bot]` suffix. Any code matching bot logins against GraphQL responses must check both forms. See `graphql-comments.ts` `parseResults` for the pattern.
- **All GraphQL requests use `graphqlWithRetry`.** GitHub's load balancers reset idle connections after ~60s, causing `ECONNRESET` during rate-limit waits. The shared retry wrapper in `pipeline/src/enrichment/graphql-retry.ts` handles this with exponential backoff. Never call `octokit.request("POST /graphql")` directly — always use `graphqlWithRetry`.
