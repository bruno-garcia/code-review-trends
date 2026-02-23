# <picture><source media="(prefers-color-scheme: dark)" srcset="app/public/branding/logo-readme-dark.svg"><source media="(prefers-color-scheme: light)" srcset="app/public/branding/logo-readme-light.svg"><img src="app/public/branding/logo-readme-light.svg" height="32" alt="logo"></picture> Code Review Trends

Tracking the adoption of AI code review bots on GitHub.

**https://codereviewtrends.com**

## Data & Privacy

Code Review Trends collects and publishes **aggregate statistics** about AI code review bot activity on public GitHub repositories.

- **Data source:** [GH Archive](https://www.gharchive.org/) (public GitHub events via BigQuery) and the [GitHub REST API](https://docs.github.com/en/rest) (public repository metadata).
- **No private data:** Only public repositories are included. Activity on private repos is invisible to our pipeline.
- **No personal data:** We track bot accounts (automated GitHub Apps), not human users. Human review counts are aggregated totals with no individual attribution.
- **Enrichment metadata** (repo stars, languages, comment reactions) comes from publicly accessible GitHub API endpoints for public repositories only.
- **Data retention:** All data is derived from public sources and can be independently verified via GH Archive BigQuery tables.

For methodology details, see the [About page](https://codereviewtrends.com/about).

## Project structure

| Directory | Description | Details |
|-----------|-------------|---------|
| [`app/`](app/) | Next.js web app (App Router, TypeScript, Tailwind, Recharts) | Server components query ClickHouse directly; client components render charts |
| [`pipeline/`](pipeline/) | Data collection service (TypeScript) | Pulls from BigQuery (GH Archive) and GitHub API, writes to ClickHouse. See [pipeline/README.md](pipeline/README.md) |
| [`infra/`](infra/) | Infrastructure as code (Pulumi, TypeScript, GCP) | Manages ClickHouse VM, networking, firewall, and secrets. See [infra/README.md](infra/README.md) |
| [`db/init/`](db/init/) | Schema + bot reference data | Applied to **all** environments (local, CI, staging, prod) |

## Quick start

```bash
npm install
npm run dev        # Starts ClickHouse (Docker) + Next.js dev server
```

Open http://localhost:3000.

Docker Compose runs ClickHouse and loads `db/init/` (schema + bot data) on first start. Tables start empty; run the pipeline to populate data. To reset the database:

```bash
npm run dev:down && docker volume rm code-review-trends-2_clickhouse-data
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

The `migrate` command applies all `db/init/*.sql` files (schema + bot reference data) and syncs the bot registry from `pipeline/src/bots.ts`.

## Running tests

```bash
npm test           # Unit tests (app)
npm run test:e2e   # Playwright e2e tests (needs ClickHouse running)
```

## Infrastructure

Production ClickHouse runs on a GCP VM managed by Pulumi. See [infra/README.md](infra/README.md) for setup and deployment instructions.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and security practices.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute, and [AGENTS.md](AGENTS.md) for architecture details, conventions, and guidelines.

## License

This project is licensed under the **[Functional Source License (FSL-1.1-Apache-2.0)](LICENSE)** — a source-available license, **not** an open-source license.

See [LICENSE](LICENSE) for full terms and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
