# Staging Data Audit — 2026-02-15

## Summary

The staging site (`staging.codereviewtrends.com`) is live with real BigQuery data after running `backfill`. Most chart sections render, but several show "No data" or zeros due to missing pipeline steps and code gaps.

## Data Flow Map

```
BigQuery (GH Archive)
  ├── backfill/sync ──→ review_activity        ✅ 1,715 rows (3.2M reviews)
  │                  ──→ human_review_activity  ✅ 164 weeks
  └── discover ──────→ pr_bot_events            ❌ 0 rows (not yet run)
                          │
GitHub API (enrich)       │
  ├── repos ◄─────────────┤ → repos             ❌ 0 rows
  │                       │   → repo_languages   ❌ 0 rows
  ├── pull-requests ◄─────┤ → pull_requests      ❌ 0 rows
  └── comments ◄──────────┘ → pr_comments        ❌ 0 rows

NEVER POPULATED (no pipeline writes to these):
  → review_reactions   (0 rows) — insertReactions() exists but is never called
  → repo_bot_usage     (0 rows) — insertRepoBotUsage() exists but is never called
  → org_count column   (always 0) — not in BigQuery query or ReviewActivityRow type
```

## Page-by-Page Issues

### Home Page (`/`)

| Section | Status | Details |
|---------|--------|---------|
| AI Share chart | ✅ Works | `human_review_activity` + `review_activity` |
| Review Volume by Product | ✅ Works | `review_activity` joined through `products` + `bots` |
| Leaderboard — Reviews, Comments, Repos | ✅ Works | Real numbers showing |
| Leaderboard — Orgs column | ❌ All zeros | `org_count` never populated (see Gap #1) |
| Leaderboard — Approval column | ❌ All 0% | Reads `review_reactions` table which is empty (see Gap #2) |
| Top Orgs chart | ❌ "No data" | `repos` table empty — needs `discover` + `enrich` |
| Bot Sentiment / Reaction Leaderboard | ❌ Empty | `pr_comments` table empty — needs `discover` + `enrich` |

### Bots Page (`/bots`)

| Section | Status | Details |
|---------|--------|---------|
| Bot cards grid | ✅ Works | All 23 products render |
| Card review counts | ✅ Works | Real numbers from `review_activity` |

### Bot Detail Pages (`/bots/[id]`)

Checked: coderabbit, copilot, gemini, sourcery, ellipsis — all identical pattern.

| Section | Status | Details |
|---------|--------|---------|
| Activity chart (reviews/comments) | ✅ Works | `review_activity` data |
| Stats — Reviews, Comments, Repos | ✅ Works | Real numbers |
| Stats — Organizations | ❌ Always 0 | `org_count` gap (see Gap #1) |
| Stats — Approval Rate | ❌ Always 0% | Reads `review_reactions` (empty, see Gap #2) |
| Stats — 👍 👎 ❤️ | ❌ All 0 | Reads `review_reactions` (empty, see Gap #2) |
| Languages chart | ❌ "No data" | Needs `repos.primary_language` from `enrich` |
| Comments per PR | ❌ "No data" | Needs `pr_comments` from `enrich` |
| Reactions by PR Size | ❌ "No data" | Needs `pr_comments` + `pull_requests` from `enrich` |

### Compare Page (`/compare`)

| Section | Status | Details |
|---------|--------|---------|
| Compare table | ✅ Partially works | Reviews/comments/repos populated, orgs and approval are 0 |
| Bar charts | ✅ Works | Uses `review_activity` data |
| Radar chart | ⚠️ Partial | Some axes are 0 (orgs, approval) |
| Comments per PR chart | ❌ "No data" | Needs `pr_comments` from `enrich` |

## Code Gaps (won't be fixed by running existing scripts)

### Gap #1: `org_count` is never computed

**Scope:** Affects leaderboard, bot detail stats, compare page — every "Organizations" display.

**Root cause:** The BigQuery query in `pipeline/src/bigquery.ts` → `queryBotReviewActivity()` computes `COUNT(DISTINCT repo_name) AS repo_count` but never computes org count. The pipeline type `ReviewActivityRow` in `pipeline/src/clickhouse.ts` doesn't include `org_count`. The ClickHouse column exists (`org_count UInt64` in `review_activity`) but defaults to 0 since nothing writes to it.

**Fix required:**
1. Add to the BigQuery query: `COUNT(DISTINCT SPLIT(repo_name, '/')[OFFSET(0)]) AS org_count`
2. Add `org_count: number` to `ReviewActivityRow` type in `pipeline/src/clickhouse.ts`
3. Add the mapping in `pipeline/src/sync.ts` → `fetchAndStoreChunk()`
4. Re-run `backfill --no-resume` (or just the affected chunks)

**Files to change:**
- `pipeline/src/bigquery.ts` — `queryBotReviewActivity()` SQL
- `pipeline/src/clickhouse.ts` — `ReviewActivityRow` type
- `pipeline/src/sync.ts` — mapping in `fetchAndStoreChunk()`

### Gap #2: `review_reactions` table is never populated

**Scope:** Affects approval rate, thumbs up/down/hearts in leaderboard, bot summaries, product summaries, weekly reactions chart on bot detail pages.

**Root cause:** `insertReactions()` exists in `pipeline/src/clickhouse.ts` but **nothing ever calls it**. No CLI command, no enrichment step, no aggregation job.

Meanwhile, `pr_comments` stores per-comment reaction counts (thumbs_up, thumbs_down, etc.) and IS populated by the `enrich` command. The app uses **both** tables:
- `review_reactions` → leaderboard approval, bot/product summary reactions, weekly reactions chart
- `pr_comments` → home page bot sentiment, bot detail reactions by PR size, comments per PR

**Two possible fixes:**
- **(a) Add aggregation step:** Create a pipeline command that aggregates `pr_comments` reactions into weekly `review_reactions` rows. Would need to run after each `enrich`.
- **(b) Change app queries to use `pr_comments` directly:** Simpler — rewrite `getProductSummaries()`, `getBotSummaries()`, `getProductComparisons()`, `getBotComparisons()`, `getBotReactions()`, and `getProductReactions()` to compute reactions from `pr_comments` instead of `review_reactions`. This eliminates the need for the dead table entirely.

Option (b) is recommended — it removes a table, removes dead code, and makes the data pipeline simpler.

### Gap #3: `repo_bot_usage` table is dead code

**Scope:** No impact — the app never queries this table.

**Details:** The table exists in the schema, `insertRepoBotUsage()` exists in `pipeline/src/clickhouse.ts`, but nothing calls it and no app query reads from it. Safe to remove.

## What `discover` + `enrich` WILL Fix

Once you run:
```bash
npm run pipeline -- discover --start 2023-01-01   # BigQuery, fast
npm run pipeline -- enrich --limit 500             # GitHub API, rate-limited
```

These sections will start populating:

| Section | Source Table | Populated By |
|---------|-------------|--------------|
| Top Orgs chart (home) | `repos` (owner + stars) | `enrich` → repos |
| Bot Sentiment (home) | `pr_comments` | `enrich` → comments |
| Languages chart (bot detail) | `repos.primary_language` + `pr_bot_events` | `enrich` → repos |
| Comments per PR (compare + detail) | `pr_comments` | `enrich` → comments |
| Reactions by PR Size (bot detail) | `pr_comments` + `pull_requests` | `enrich` → comments + pull-requests |

## What `discover` + `enrich` will NOT Fix

| Section | Why | Required Fix |
|---------|-----|-------------|
| Orgs = 0 everywhere | BigQuery query doesn't compute it | Code change (Gap #1) |
| Approval = 0% in leaderboard/summaries | Reads dead `review_reactions` table | Code change (Gap #2) |
| 👍 👎 ❤️ = 0 in summaries | Reads dead `review_reactions` table | Code change (Gap #2) |
| Weekly Reactions chart (bot detail) | Reads dead `review_reactions` table | Code change (Gap #2) |

## Enrichment Scale Estimate

With 3.2M total reviews, the `discover` step will find a large number of unique (repo, PR, bot) tuples. The `enrich` step makes GitHub API calls:

| Entity | API calls per item | Rate limit |
|--------|-------------------|------------|
| Repos | 2 (metadata + languages) | 5,000/hr shared |
| PRs | 1 | 5,000/hr shared |
| Comments | 1+ per PR/bot combo (paginated) | 5,000/hr shared |

At 5,000 req/hr, enriching thousands of repos + tens of thousands of PRs could take **many hours to days**. Use `--limit` to batch. The enrichment is resumable — it skips already-enriched items on subsequent runs.

## Fix Applied: Repo Enrichment Ordering

The enrichment steps now all prioritize most recent data first:

| Step | Query ordering | Status |
|------|---------------|--------|
| Repos | `ORDER BY latest_week DESC` | ✅ Fixed (was alphabetical) |
| PRs | `ORDER BY latest_week DESC` | ✅ Already correct |
| Comments | `ORDER BY latest_week DESC` | ✅ Already correct |

Changed `pipeline/src/enrichment/repos.ts` to `GROUP BY repo_name` with `max(event_week) AS latest_week` and `ORDER BY latest_week DESC` instead of `ORDER BY repo_name`. This matters because repos run first and unblock PR/comment enrichment (those skip repos with `fetch_status = 'not_found'`).

## How `discover` + `enrich` Work Together

### Step 1: `discover` (BigQuery → `pr_bot_events`)

```bash
npm run pipeline -- discover --start 2023-01-01
```

Queries GH Archive for every PR event where a tracked bot left a review or comment. Populates `pr_bot_events` with:

| Column | Example | Purpose |
|--------|---------|---------|
| `repo_name` | `facebook/react` | Full `owner/repo` — gives us `github.com/{repo_name}` |
| `pr_number` | `12345` | PR number — gives us `github.com/{repo_name}/pull/{pr_number}` |
| `bot_id` | `coderabbit` | Which bot touched this PR |
| `event_type` | `PullRequestReviewEvent` | Review or comment event |
| `event_week` | `2026-02-03` | When it happened (Monday of week) |

This is a BigQuery query — fast, no GitHub rate limits. Produces the full map of "which bot touched which PR in which repo."

### Step 2: `enrich` (GitHub API → `repos`, `pull_requests`, `pr_comments`)

```bash
export GITHUB_TOKEN=<your token>
npm run pipeline -- enrich --limit 500   # start small, newest first
```

Reads `pr_bot_events` and fetches details from GitHub API in order:

1. **Repos** (`GET /repos/{owner}/{repo}` + `/languages`) → stars, primary language, fork/archived status
2. **PRs** (`GET /repos/{owner}/{repo}/pulls/{number}`) → title, author, additions/deletions, state
3. **Comments** (`GET /repos/{owner}/{repo}/pulls/{number}/comments`) → body, reactions (👍👎❤️ etc.)

All three steps prioritize the **most recent** events first (`ORDER BY latest_week DESC`), so the newest data populates first. Each run is resumable — it skips already-enriched items, so you can run `enrich` repeatedly with `--limit` to incrementally build up coverage.

**Rate limits:** 5,000 requests/hour with a token. Repos cost ~2 calls each, PRs cost 1, comments cost 1+ (paginated). With `--limit 500`, each run processes up to 500 items per entity type before stopping.

## Recommended Action Plan

1. **Fix Gap #1** (org_count) — code change + re-backfill
2. **Fix Gap #2** (review_reactions) — change app queries to use `pr_comments`
3. **Run `discover --start 2023-01-01`** — populates `pr_bot_events` from BigQuery (fast)
4. **Run `enrich --limit 500`** — start enriching repos/PRs/comments from GitHub API
5. **Clean up dead code** — remove `review_reactions` table (if going with fix 2b), remove `repo_bot_usage` table + insert function
