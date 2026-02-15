# Code Review Trends

Tracking the adoption of AI code review bots on GitHub.

**https://codereviewtrends.com**

## Project structure

| Directory | Description | Details |
|-----------|-------------|---------|
| [`app/`](app/) | Next.js web app (App Router, TypeScript, Tailwind, Recharts) | Server components query ClickHouse directly; client components render charts |
| [`pipeline/`](pipeline/) | Data collection service (TypeScript) | Pulls from BigQuery (GH Archive) and GitHub API, writes to ClickHouse. See [pipeline/README.md](pipeline/README.md) |
| [`infra/`](infra/) | Infrastructure as code (Pulumi, TypeScript, GCP) | Manages ClickHouse VM, networking, firewall, and secrets. See [infra/README.md](infra/README.md) |
| [`db/init/`](db/init/) | Schema + bot reference data | Applied to **all** environments (local, CI, staging, prod) |
| [`db/seed/`](db/seed/) | Fake data for development | Applied to **local dev and CI only** — never staging/prod |

## Quick start

```bash
npm install
npm run dev        # Starts ClickHouse (Docker) + Next.js dev server
```

Open http://localhost:3000.

Docker Compose runs ClickHouse and loads `db/init/` (schema + bot data) then `db/seed/` (fake data) on first start. To reset the database:

```bash
npm run dev:down && docker volume rm code-review-trends-3_clickhouse-data
npm run dev
```

## Database management

```bash
# Apply schema + bot data to staging (reads creds from Pulumi)
npm run pipeline -- migrate --stack staging

# Apply to prod
npm run pipeline -- migrate --stack prod

# Apply to local ClickHouse
npm run pipeline -- migrate --local

# Preview what would be applied
npm run pipeline -- migrate --dry-run
```

The `migrate` command applies all `db/init/*.sql` files (schema + bot reference data) and syncs the bot registry from `pipeline/src/bots.ts`. It never applies `db/seed/` (fake data).

## Running tests

```bash
npm test           # Unit tests (app + pipeline)
npm run test:e2e   # Playwright e2e tests (needs ClickHouse running)
```

## Infrastructure

Production ClickHouse runs on a GCP VM managed by Pulumi. See [infra/README.md](infra/README.md) for setup and deployment instructions.

## Contributing

See [AGENTS.md](AGENTS.md) for architecture details, conventions, and guidelines.
