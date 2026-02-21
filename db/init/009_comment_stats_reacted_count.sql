-- Migration 8: Add reacted_comment_count to comment_stats_weekly.
--
-- Tracks how many comments received at least one 👍 or 👎 reaction.
-- Enables computing "reaction rate" = reacted_comment_count / comment_count,
-- which gives context to the thumbs-up rate (what % of comments even get reactions).
--
-- Requires drop + recreate of the MV and a full re-backfill since the new column
-- can't be derived from the existing aggregated data.

-- 1. Drop the MV so it doesn't interfere with the full backfill.
--    Note: this does NOT stop inserts into pr_comments; run this while ingestion
--    is paused or perform a post-migration catch-up for rows inserted in the window.
DROP TABLE IF EXISTS code_review_trends.comment_stats_weekly_mv;

-- 2. Add the new column
ALTER TABLE code_review_trends.comment_stats_weekly
    ADD COLUMN IF NOT EXISTS reacted_comment_count SimpleAggregateFunction(sum, UInt64);

-- 3. Truncate and re-backfill with the new column
TRUNCATE TABLE code_review_trends.comment_stats_weekly;

INSERT INTO code_review_trends.comment_stats_weekly
SELECT
    bot_id,
    toMonday(created_at) AS week,
    count() AS comment_count,
    sum(thumbs_up) AS thumbs_up,
    sum(thumbs_down) AS thumbs_down,
    sum(heart) AS heart,
    uniqExactState(repo_name, pr_number) AS pr_count,
    countIf(thumbs_up + thumbs_down > 0) AS reacted_comment_count
FROM code_review_trends.pr_comments FINAL
WHERE comment_id > 0
GROUP BY bot_id, week
SETTINGS max_execution_time = 300;

-- 4. Recreate MV with the new column
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.comment_stats_weekly_mv
TO code_review_trends.comment_stats_weekly
AS SELECT
    bot_id,
    toMonday(created_at) AS week,
    count() AS comment_count,
    sum(thumbs_up) AS thumbs_up,
    sum(thumbs_down) AS thumbs_down,
    sum(heart) AS heart,
    uniqExactState(repo_name, pr_number) AS pr_count,
    countIf(thumbs_up + thumbs_down > 0) AS reacted_comment_count
FROM code_review_trends.pr_comments
WHERE comment_id > 0
GROUP BY bot_id, week;
