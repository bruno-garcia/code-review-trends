# App — Next.js Frontend

The web application for [codereviewtrends.com](https://codereviewtrends.com). Built with Next.js 16 (App Router), TypeScript, Tailwind CSS v4, and Recharts. Server components query ClickHouse directly; only chart components are client-side.

For project-wide architecture, conventions, and principles, see the root [AGENTS.md](../AGENTS.md).

## Quick Start

```bash
# From repo root — starts ClickHouse + Next.js with auto-assigned ports
npm run dev

# Or just the app (assumes ClickHouse is already running)
npm run dev:app

# Run tests
npm test                  # unit tests
npm run test:integration  # ClickHouse integration test
npm run test:e2e          # Playwright e2e tests
```

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | `page.tsx` | Home — AI share trend, volume chart, leaderboard |
| `/products` | `products/page.tsx` | Product listing with filter bar |
| `/products/[id]` | `products/[id]/page.tsx` | Individual bot detail (stats, charts, brand color) |
| `/repos` | `repos/page.tsx` | Repository listing |
| `/repos/[owner]/[name]` | `repos/[owner]/[name]/page.tsx` | Individual repo detail |
| `/orgs` | `orgs/page.tsx` | Organization listing |
| `/orgs/[owner]` | `orgs/[owner]/page.tsx` | Individual org detail |
| `/compare` | `compare/page.tsx` | Bot comparison overview |
| `/compare/[pair]` | `compare/[pair]/page.tsx` | Head-to-head bot comparison |
| `/about` | `about/page.tsx` | Methodology and data gaps |
| `/status` | `status/page.tsx` | Pipeline status dashboard |

Several routes also have `opengraph-image.tsx` files that dynamically generate OG images via Satori, querying ClickHouse for live stats.

## Components

**Layout & Navigation**
- `nav-links.tsx` — Main navigation links
- `navigation-progress.tsx` — Page transition progress bar
- `logo.tsx` — Site logo
- `version-stamp.tsx` — Build version display

**Theme**
- `theme-provider.tsx` — Light/dark theme via CSS custom properties
- `theme-toggle.tsx` — Theme switcher UI
- `themed-product-header.tsx` — Product header with brand color overrides

**Data Display**
- `charts.tsx` — All Recharts chart components (`"use client"`)
- `data-collection-stats.tsx` — Pipeline collection statistics
- `section-heading.tsx` — Consistent section headings
- `info-tooltip.tsx` — Hover tooltips for metrics

**Filters & Interaction**
- `product-filter-bar.tsx` — Product selection filter
- `filtered-products-page.tsx` — Page wrapper with product filter state
- `time-range-selector.tsx` — Time range picker
- `product-scoped-link.tsx` — Links that preserve filter state

**Infrastructure**
- `migration-gate.tsx` — Blocks rendering until DB schema matches app version
- `schema-banner.tsx` — Warning banner on schema version mismatch
- `pr-comment-sync-banner.tsx` — Enrichment sync status banner
- `json-ld.tsx` — Reusable JSON-LD structured data

## Lib Modules

| Module | Purpose |
|--------|---------|
| `clickhouse.ts` | ClickHouse client + all data queries |
| `migrations.ts` | Versioned schema migration system |
| `product-filter.tsx` | Product filter React context |
| `product-filter-defaults.ts` | Default filter values |
| `use-url-state.ts` | URL ↔ filter state synchronization |
| `colors.ts` | Chart color palette |
| `brand-colors.ts` | Per-product brand colors |
| `theme.ts` / `theme-overrides.ts` | Theme constants and brand color CSS overrides |
| `format.ts` | Number/date formatting utilities |
| `time-range.ts` | Time range calculation helpers |
| `constants.ts` | Shared constants |
| `og-utils.tsx` | Shared utilities for OG image generation |
| `generated/` | Auto-generated files (compare pairs, etc.) |

## Key Patterns

- **Server-first rendering** — Pages are server components that query ClickHouse. Only `charts.tsx` and filter components use `"use client"`.
- **Product filter system** — React context (`product-filter.tsx`) + URL state sync (`use-url-state.ts`) + sensible defaults. Filter state persists across navigation.
- **Theme system** — CSS custom properties with dark default. Products get brand color overrides via `theme-overrides.ts`.
- **Migration gate** — `migration-gate.tsx` checks DB schema version on load. If the app expects a newer schema than the DB has, it shows a blocking banner instead of broken data.
- **Dynamic OG images** — Generated at request time via `next/og` (Satori). Query ClickHouse for live stats — no static files or cron jobs.
- **Errors crash the page** — DB queries never catch errors. Failures bubble to `error.tsx` so ISR doesn't cache broken state. See AGENTS.md Principle #1.

## Testing

### Unit Tests
```bash
npm test
```
Runs two test runners:
- `tsx --test` for `node:test`-based files (`color-check.test.ts`, `json-ld.test.ts`)
- `vitest` for the rest (`format.test.ts`, `time-range.test.ts`, `theme-overrides.test.ts`)

### Integration Tests
```bash
npm run test:integration
```
Runs `clickhouse.integration.test.ts` — requires a running ClickHouse instance.

### E2e Tests (Playwright)
```bash
npm run test:e2e       # headless
npm run test:e2e:ui    # interactive UI mode
```
17 spec files covering pages, OG images, filters, navigation, themes, schema banner, and data integrity. Requires running app + ClickHouse.

### Other Commands
```bash
npm run build    # production build
npm run lint     # ESLint
npm run clean    # remove .next cache
```
