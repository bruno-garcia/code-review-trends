-- Migration 12: Pre-aggregated PR count summary tables.
--
-- The /repos and /orgs pages time out (>15s) when sorting by "Reviewed PRs"
-- because the query must compute PR counts for ALL repos/orgs (200K+) to
-- determine sort order, requiring expensive JOINs across pr_bot_event_counts
-- (471K rows) × repos × bots.
--
-- These summary tables collapse across bot_id, giving a single total_prs
-- per repo_name or owner. Phase 1 of the two-phase query pattern scans
-- only the summary table (~200K rows, 2 columns, no JOINs) to paginate,
-- then Phase 2 enriches just the 50 displayed items.
--
-- repo_pr_summary: uses uniqExact(UInt32) because pr_number is unique
--   within a repo — no cross-repo collision when grouped by repo_name.
--
-- org_pr_summary: uses uniqExact(String, UInt32) because PR numbers
--   collide across repos within the same owner — needs (repo_name, pr_number).

-- Per-repo PR count summary (collapses across bot_id)
CREATE TABLE IF NOT EXISTS code_review_trends.repo_pr_summary (
    repo_name String,
    total_prs AggregateFunction(uniqExact, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY repo_name;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.repo_pr_summary_mv
TO code_review_trends.repo_pr_summary
AS SELECT
    repo_name,
    uniqExactState(pr_number) AS total_prs
FROM code_review_trends.pr_bot_events
GROUP BY repo_name;

-- Backfill from existing data
INSERT INTO code_review_trends.repo_pr_summary
SELECT
    repo_name,
    uniqExactState(pr_number) AS total_prs
FROM code_review_trends.pr_bot_events
GROUP BY repo_name;

-- Per-owner PR count summary (collapses across bot_id and repo)
CREATE TABLE IF NOT EXISTS code_review_trends.org_pr_summary (
    owner String,
    total_prs AggregateFunction(uniqExact, String, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY owner;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.org_pr_summary_mv
TO code_review_trends.org_pr_summary
AS SELECT
    splitByChar('/', repo_name)[1] AS owner,
    uniqExactState(repo_name, pr_number) AS total_prs
FROM code_review_trends.pr_bot_events
GROUP BY owner;

-- Backfill from existing data
INSERT INTO code_review_trends.org_pr_summary
SELECT
    splitByChar('/', repo_name)[1] AS owner,
    uniqExactState(repo_name, pr_number) AS total_prs
FROM code_review_trends.pr_bot_events
GROUP BY splitByChar('/', repo_name)[1];
