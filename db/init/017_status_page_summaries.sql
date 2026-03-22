-- Migration 17: Pre-aggregate expensive status page queries (app schema version 16).
--
-- The status page runs 5 parallel queries. Sentry traces show ALL of them take
-- 10-17s when run concurrently, saturating the ClickHouse VM. Root causes:
--
--   Query 2: repo_pr_summary GROUP BY + uniqExactMerge for every repo (14s)
--   Query 3: count() on pull_requests with state filter (10s)
--   Query 4: countDistinct(bot_id) GROUP BY (repo_name, pr_number) on pr_comments (15s)
--   Query 5: count() on reaction_scan_progress with NOT IN + uniq on pr_bot_reactions (12s)
--
-- Solution: Create materialized views that maintain running aggregates,
-- turning full table scans and expensive merges into small MV reads.
--
-- Backfill notes:
--   - uniqExactState backfills are idempotent (duplicates merge via set union)
--   - countState backfills use TRUNCATE first to ensure idempotency
--   - All backfills use max_execution_time = 300 (app client defaults to 15s)

-- ---------------------------------------------------------------------------
-- 1. pr_discovery_global_summary
--    Global counts of distinct repos and PRs from pr_bot_events.
--    Replaces: SELECT count(), sum(prs) FROM (
--      SELECT uniqExactMerge(total_prs) AS prs FROM repo_pr_summary GROUP BY repo_name)
--    which merges uniqExact states for every repo — slow with 50K+ repos.
-- ---------------------------------------------------------------------------

-- Uses a dummy _key column because AggregatingMergeTree rejects ORDER BY tuple()
-- (empty sorting key) — unlike plain MergeTree, it requires a non-empty key.
CREATE TABLE IF NOT EXISTS code_review_trends.pr_discovery_global_summary (
    _key UInt8 DEFAULT 0,
    total_repos AggregateFunction(uniqExact, String),
    total_prs AggregateFunction(uniqExact, String, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY _key;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.pr_discovery_global_summary_mv
TO code_review_trends.pr_discovery_global_summary
AS SELECT
    0 AS _key,
    uniqExactState(repo_name) AS total_repos,
    uniqExactState(repo_name, pr_number) AS total_prs
FROM code_review_trends.pr_bot_events;

-- Backfill (uniqExactState is idempotent — duplicates merge correctly)
INSERT INTO code_review_trends.pr_discovery_global_summary (_key, total_repos, total_prs)
SELECT
    0 AS _key,
    uniqExactState(repo_name) AS total_repos,
    uniqExactState(repo_name, pr_number) AS total_prs
FROM code_review_trends.pr_bot_events
SETTINGS max_execution_time = 300;

-- ---------------------------------------------------------------------------
-- 2. pull_requests_enrichment_summary
--    Pre-aggregates enriched pull request counts by repo_name, enabling fast
--    filtered counts without scanning the full pull_requests table.
--    Replaces: SELECT count() FROM pull_requests WHERE state NOT IN (...)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS code_review_trends.pull_requests_enrichment_summary (
    repo_name String,
    pr_count AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
ORDER BY repo_name;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.pull_requests_enrichment_summary_mv
TO code_review_trends.pull_requests_enrichment_summary
AS SELECT
    repo_name,
    countState() AS pr_count
FROM code_review_trends.pull_requests
WHERE state NOT IN ('not_found', 'forbidden')
GROUP BY repo_name;

-- Backfill (TRUNCATE first — countState is NOT idempotent, re-run would double-count)
TRUNCATE TABLE IF EXISTS code_review_trends.pull_requests_enrichment_summary;
INSERT INTO code_review_trends.pull_requests_enrichment_summary (repo_name, pr_count)
SELECT
    repo_name,
    countState() AS pr_count
FROM code_review_trends.pull_requests
WHERE state NOT IN ('not_found', 'forbidden')
GROUP BY repo_name
SETTINGS max_execution_time = 300;

-- ---------------------------------------------------------------------------
-- 3. pr_comments_repo_bot_combos
--    Pre-aggregates distinct (pr_number, bot_id) combos per repo_name.
--    The status page needs: total enriched combos excluding unreachable repos.
--    With this MV, the query merges small per-repo states instead of scanning
--    the entire pr_comments table.
--
--    Replaces: SELECT sum(distinct_bots) FROM (
--      SELECT countDistinct(bot_id) FROM pr_comments
--      WHERE repo_name NOT IN (...) GROUP BY repo_name, pr_number)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS code_review_trends.pr_comments_repo_bot_combos (
    repo_name String,
    total_combos AggregateFunction(uniqExact, UInt32, String)
) ENGINE = AggregatingMergeTree()
ORDER BY repo_name;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.pr_comments_repo_bot_combos_mv
TO code_review_trends.pr_comments_repo_bot_combos
AS SELECT
    repo_name,
    uniqExactState(pr_number, bot_id) AS total_combos
FROM code_review_trends.pr_comments
GROUP BY repo_name;

-- Backfill (uniqExactState is idempotent — duplicates merge correctly)
INSERT INTO code_review_trends.pr_comments_repo_bot_combos (repo_name, total_combos)
SELECT
    repo_name,
    uniqExactState(pr_number, bot_id) AS total_combos
FROM code_review_trends.pr_comments
GROUP BY repo_name
SETTINGS max_execution_time = 300;

-- ---------------------------------------------------------------------------
-- 4. reaction_scan_repo_summary
--    Pre-aggregates reaction_scan_progress counts per repo_name.
--    Replaces: SELECT count() FROM reaction_scan_progress
--      WHERE repo_name NOT IN (SELECT name FROM repos WHERE ...)
--    which scans the entire table with a NOT IN filter.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS code_review_trends.reaction_scan_repo_summary (
    repo_name String,
    pr_count AggregateFunction(count)
) ENGINE = AggregatingMergeTree()
ORDER BY repo_name;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.reaction_scan_repo_summary_mv
TO code_review_trends.reaction_scan_repo_summary
AS SELECT
    repo_name,
    countState() AS pr_count
FROM code_review_trends.reaction_scan_progress
GROUP BY repo_name;

-- Backfill (TRUNCATE first — countState is NOT idempotent, re-run would double-count)
TRUNCATE TABLE IF EXISTS code_review_trends.reaction_scan_repo_summary;
INSERT INTO code_review_trends.reaction_scan_repo_summary (repo_name, pr_count)
SELECT
    repo_name,
    countState() AS pr_count
FROM code_review_trends.reaction_scan_progress
GROUP BY repo_name
SETTINGS max_execution_time = 300;

-- ---------------------------------------------------------------------------
-- 5. pr_bot_reactions_pr_summary
--    Pre-aggregates distinct (repo_name, pr_number) from pr_bot_reactions.
--    Replaces: SELECT uniq(repo_name, pr_number) FROM pr_bot_reactions
-- ---------------------------------------------------------------------------

-- Uses a dummy _key column because AggregatingMergeTree rejects ORDER BY tuple().
CREATE TABLE IF NOT EXISTS code_review_trends.pr_bot_reactions_pr_summary (
    _key UInt8 DEFAULT 0,
    total_prs AggregateFunction(uniqExact, String, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY _key;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.pr_bot_reactions_pr_summary_mv
TO code_review_trends.pr_bot_reactions_pr_summary
AS SELECT
    0 AS _key,
    uniqExactState(repo_name, pr_number) AS total_prs
FROM code_review_trends.pr_bot_reactions;

-- Backfill (uniqExactState is idempotent — duplicates merge correctly)
INSERT INTO code_review_trends.pr_bot_reactions_pr_summary (_key, total_prs)
SELECT
    0 AS _key,
    uniqExactState(repo_name, pr_number) AS total_prs
FROM code_review_trends.pr_bot_reactions
SETTINGS max_execution_time = 300;
