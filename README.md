# Code Review Trends

Tracking the adoption of AI code review bots on GitHub.

**https://codereviewtrends.com**

## Project structure

| Directory | Description | Details |
|-----------|-------------|---------|
| [`app/`](app/) | Next.js web app (App Router, TypeScript, Tailwind, Recharts) | Server components query ClickHouse directly; client components render charts |
| [`pipeline/`](pipeline/) | Data collection service (TypeScript) | Pulls from BigQuery (GH Archive) and GitHub API, writes to ClickHouse |
| [`infra/`](infra/) | Infrastructure as code (Pulumi, TypeScript, GCP) | Manages ClickHouse VM, networking, firewall, and secrets. See [infra/README.md](infra/README.md) |
| [`db/`](db/) | ClickHouse schema and seed data | `001_schema.sql` for tables, `002_seed.sql` for local dev data |

## Quick start

```bash
npm install
npm run dev        # Starts ClickHouse (Docker) + Next.js dev server
```

Open http://localhost:3000.

## Running tests

```bash
npm run test:e2e   # Playwright e2e tests (needs ClickHouse running)
```

## Infrastructure

Production ClickHouse runs on a GCP VM managed by Pulumi. See [infra/README.md](infra/README.md) for setup and deployment instructions.

## Contributing

See [AGENTS.md](AGENTS.md) for architecture details, conventions, and guidelines.
