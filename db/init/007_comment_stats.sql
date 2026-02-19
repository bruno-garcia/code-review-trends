-- Migration 6: Comment statistics materialized view.
--
-- Pre-aggregates pr_comments by (bot_id, week) for fast reaction/comment queries.
-- The raw pr_comments table (millions of rows) is expensive to scan with FINAL
-- on every page load. This creates a ~9K row summary that auto-updates on INSERT.
--
-- Uses AggregatingMergeTree so that:
--   - SimpleAggregateFunction(sum) columns sum automatically during merge
--   - AggregateFunction(uniqExact) correctly unions PR sets across weeks
--   - Reaction totals, comment counts, and distinct PR counts per bot are instant
--
-- Replaces the `reaction_agg` CTE pattern and `getAvgCommentsPerPR` full scans
-- across getProductSummaries, getProductComparisons, getBotSummaries,
-- getBotComparisons, getBotReactionLeaderboard, and getAvgCommentsPerPR.

-- Target table for the materialized view
CREATE TABLE IF NOT EXISTS code_review_trends.comment_stats_weekly (
    bot_id String,
    week Date,
    comment_count SimpleAggregateFunction(sum, UInt64),
    thumbs_up SimpleAggregateFunction(sum, UInt64),
    thumbs_down SimpleAggregateFunction(sum, UInt64),
    heart SimpleAggregateFunction(sum, UInt64),
    pr_count AggregateFunction(uniqExact, String, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY (bot_id, week);

-- Backfill BEFORE creating the MV to avoid double-counting: if the MV
-- exists during the backfill, concurrent pr_comments inserts would be
-- counted by both the MV trigger and the backfill's FINAL scan.
INSERT INTO code_review_trends.comment_stats_weekly
SELECT
    bot_id,
    toMonday(created_at) AS week,
    count() AS comment_count,
    sum(thumbs_up) AS thumbs_up,
    sum(thumbs_down) AS thumbs_down,
    sum(heart) AS heart,
    uniqExactState(repo_name, pr_number) AS pr_count
FROM code_review_trends.pr_comments FINAL
WHERE comment_id > 0
GROUP BY bot_id, week
SETTINGS max_execution_time = 300;

-- Materialized view: auto-populates on INSERT to pr_comments
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.comment_stats_weekly_mv
TO code_review_trends.comment_stats_weekly
AS SELECT
    bot_id,
    toMonday(created_at) AS week,
    count() AS comment_count,
    sum(thumbs_up) AS thumbs_up,
    sum(thumbs_down) AS thumbs_down,
    sum(heart) AS heart,
    uniqExactState(repo_name, pr_number) AS pr_count
FROM code_review_trends.pr_comments
WHERE comment_id > 0
GROUP BY bot_id, week;
