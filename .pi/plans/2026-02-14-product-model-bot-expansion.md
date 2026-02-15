# Product Model & Bot Expansion

**Date:** 2026-02-14
**Status:** Active
**Directory:** /Users/bruno/git/code-review-trends-2

## Overview

Introduce a "Product" concept that groups related bots (e.g. Sentry owns sentry[bot], seer-by-sentry[bot], codecov-ai[bot]). Expand the bot registry from 7 bots to 28 logins across 23 products, sourcing data from the ai-devtool-leaderboard list plus manual research on renamed bots. Add brand_color and avatar_url for richer UI display.

## Goals

- Every AI code review bot with meaningful GH Archive activity is tracked
- Renamed/rebranded bots are separate entries grouped under one product
- Products have brand colors and avatars for the UI
- Pipeline handles the expanded bot set with no structural changes (just more entries)
- Seed data covers all new bots for local dev
- Existing tests and Playwright e2e still pass

## Approach

The existing multi-login support on `bots` (`github_logins: string[]`) is repurposed: each bot gets exactly one login, and a new `product_id` groups related bots. This gives granular per-bot data in the DB while presenting product-level aggregates in the UI.

### Key Decisions

- **One bot = one github_login**: Reverses the multi-login approach from PR #13. Each renamed bot (e.g. `codium-pr-agent[bot]` vs `qodo-merge-pro[bot]`) is its own bot entry. Product grouping replaces login arrays.
- **Product aggregation at query time**: No materialized views. App queries JOIN `bots.product_id` → `products.id` and GROUP BY product_id. Simple, no schema migration headaches.
- **Brand color + avatar on both product and bot**: Product has the canonical color/avatar. Individual bots can have their own (for detail views showing historical bot-level breakdown).
- **Drop kodus-ai[bot]**: 404 on GitHub API, skip it.
- **Codecov AI under Sentry product**: Sentry acquired Codecov; codecov-ai[bot] groups with sentry[bot] and seer-by-sentry[bot].
- **LinearB groups gitstream-cm[bot] + linearb[bot]**: gitStream is LinearB's product.

### Architecture

```
products table (new)
  id, name, website, description, brand_color, avatar_url

bots table (modified)
  id, name, product_id (new), website, description, brand_color (new), avatar_url (new)

bot_logins table (unchanged)
  bot_id, github_login

review_activity (unchanged)
  week, bot_id, ...
```

App queries:
- Leaderboard: `SELECT p.id, p.name, SUM(ra.review_count)... FROM review_activity ra JOIN bots b ON ra.bot_id = b.id JOIN products p ON b.product_id = p.id GROUP BY p.id`
- Product detail: same aggregate + per-bot breakdown
- Charts: GROUP BY product_id for trend lines

### Product → Bot Registry

| Product | product_id | Bots (bot_id → login) |
|---------|-----------|----------------------|
| CodeRabbit | coderabbit | coderabbit → coderabbitai[bot] |
| GitHub Copilot | copilot | copilot → copilot-pull-request-reviewer[bot] |
| CodeScene | codescene | codescene → codescene-delta-analysis[bot] |
| Sourcery | sourcery | sourcery → sourcery-ai[bot] |
| Ellipsis | ellipsis | ellipsis → ellipsis-dev[bot] |
| Qodo | qodo | codium-pr-agent → codium-pr-agent[bot], qodo-merge → qodo-merge[bot], qodo-merge-pro → qodo-merge-pro[bot] |
| Greptile | greptile | greptile → greptile-apps[bot] |
| Sentry | sentry | sentry → sentry[bot], seer-by-sentry → seer-by-sentry[bot], codecov-ai → codecov-ai[bot] |
| Baz | baz | baz → baz-reviewer[bot] |
| Graphite | graphite | graphite → graphite-app[bot] |
| CodeAnt | codeant | codeant → codeant-ai[bot] |
| Windsurf | windsurf | windsurf → windsurf-bot[bot] |
| Cubic | cubic | cubic → cubic-dev-ai[bot] |
| Cursor Bugbot | cursor | cursor → cursor[bot] |
| Gemini Code Assist | gemini | gemini → gemini-code-assist[bot] |
| Bito | bito | bito → bito-code-review[bot] |
| Korbit | korbit | korbit → korbit-ai[bot] |
| Claude | claude | claude → claude[bot] |
| OpenAI Codex | openai-codex | openai-codex → chatgpt-codex-connector[bot] |
| Jazzberry | jazzberry | jazzberry → jazzberry-ai[bot] |
| Mesa | mesa | mesa → mesa-dot-dev[bot] |
| LinearB | linearb | gitstream → gitstream-cm[bot], linearb → linearb[bot] |
| Augment Code | augment | augment → augmentcode[bot] |

**23 products, 28 bots, 28 logins**

## File Changes

### Pipeline

| File | Action | What |
|------|--------|------|
| `pipeline/src/bots.ts` | Rewrite | Add ProductDefinition type, PRODUCTS array, expand BOTS to 28 entries with product_id, brand_color, avatar_url. Change github_logins back to single github_login per bot. |
| `pipeline/src/bots.test.ts` | Update | Add product validation tests (no orphan bots, product references valid, no duplicate logins). Update seed consistency tests for new schema. |
| `pipeline/src/clickhouse.ts` | Update | Add syncProducts(), update syncBots() to write brand_color/avatar_url. Remove bot_logins multi-login handling (each bot has one login now). |
| `pipeline/src/sync.ts` | Minor | BOT_BY_LOGIN still works (unchanged pattern). |
| `pipeline/src/cli.ts` | Minor | sync-bots command now also syncs products. |
| `pipeline/src/bigquery.ts` | No change | Already takes login list dynamically. |
| `pipeline/src/tools/inspect-data.ts` | Minor | Show product info in inspect output. |
| `pipeline/src/tools/status.ts` | Minor | Show product count in status. |

### Database

| File | Action | What |
|------|--------|------|
| `db/init/001_schema.sql` | Update | Add products table. Add product_id, brand_color, avatar_url to bots table. |
| `db/init/002_seed.sql` | Rewrite | Seed all 23 products, 28 bots, review_activity/reactions for all bots. |

### App

| File | Action | What |
|------|--------|------|
| `app/src/lib/clickhouse.ts` | Update | Add Product type, getProducts(), update queries to aggregate by product_id. Add getProductById() with bot breakdown. |
| `app/src/app/page.tsx` | Update | Leaderboard shows products (aggregated), not raw bots. Use brand colors. |
| `app/src/app/bots/page.tsx` | Update | Rename to products listing or keep as bots but show product-level aggregates. |
| `app/src/app/bots/[id]/page.tsx` | Update | Show product detail with per-bot breakdown chart. |

### Tests

| File | Action | What |
|------|--------|------|
| `pipeline/src/bots.test.ts` | Update | Product reference validation, seed consistency for products table. |
| `app/e2e/home.spec.ts` | Minor | May need to update expected bot names if displayed differently. |
| `app/e2e/bots.spec.ts` | Minor | Same — product names vs bot names. |

## Risks & Open Questions

- **BigQuery validation**: Some new bots (cursor[bot], claude[bot]) are very recent and may have near-zero events. They'll show up with 0 data until backfill runs. This is fine — they exist in the registry, data will come.
- **Seed data complexity**: 28 bots with varied growth curves makes seed SQL bigger but not structurally harder.
- **Chart readability**: 23 products on one chart is a lot. The UI may need a "top N" filter or grouped display. Out of scope for this PR but worth noting.
- **Route change**: `/bots/[id]` → could become `/products/[id]`. Or keep `/bots/` as the URL but show product data. Pragmatic: keep the URL, just change what's displayed.
