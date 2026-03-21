-- Migration 15: Add bot_id to pr_comments ORDER BY.
--
-- The pr_comments table uses ReplacingMergeTree with
-- ORDER BY (repo_name, pr_number, comment_id). When no bot comments are found
-- for a (repo, PR, bot) combo, the enrichment pipeline inserts a sentinel row
-- with comment_id=0 so the combo is marked "done".
--
-- Problem: when multiple bots review the same PR and both get sentinel rows,
-- they share the same ORDER BY key (repo_name, pr_number, 0). During merge,
-- ReplacingMergeTree keeps only the row with the latest updated_at — the other
-- bot's sentinel is silently discarded. This creates a permanent gap in the
-- status page's comments_enriched count (~2% of discovered combos).
--
-- Fix: recreate the table with ORDER BY (repo_name, pr_number, comment_id, bot_id).
-- ALTER TABLE ... MODIFY ORDER BY cannot add existing columns, so we create a new
-- table, copy data, and atomically swap. The comment_stats_weekly_mv must be
-- dropped and recreated since it reads FROM pr_comments.
--
-- After this migration, the pipeline will naturally re-process the sentinel
-- combos that were lost to deduplication (they appear as "pending").

-- 0. Clean up from any previous failed attempt
DROP TABLE IF EXISTS code_review_trends.pr_comments_old;
DROP TABLE IF EXISTS code_review_trends.pr_comments_new;

-- 1. Drop the MV that reads FROM pr_comments (must happen before the swap).
--    The target table comment_stats_weekly is preserved — only the trigger is removed.
DROP TABLE IF EXISTS code_review_trends.comment_stats_weekly_mv;

-- 2. Create the new table with bot_id in ORDER BY
CREATE TABLE code_review_trends.pr_comments_new (
    repo_name String,
    pr_number UInt32,
    comment_id UInt64,
    bot_id String,
    body_length UInt32,
    created_at DateTime,
    thumbs_up UInt32 DEFAULT 0,
    thumbs_down UInt32 DEFAULT 0,
    laugh UInt32 DEFAULT 0,
    confused UInt32 DEFAULT 0,
    heart UInt32 DEFAULT 0,
    hooray UInt32 DEFAULT 0,
    eyes UInt32 DEFAULT 0,
    rocket UInt32 DEFAULT 0,
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (repo_name, pr_number, comment_id, bot_id);

-- 3. Copy all data. FINAL deduplicates with the old ORDER BY — sentinel rows
--    that collided across bots are already lost and will be re-enriched by the
--    pipeline. Non-sentinel rows (comment_id > 0) are unaffected since
--    comment_id is globally unique on GitHub.
INSERT INTO code_review_trends.pr_comments_new
SELECT
    repo_name, pr_number, comment_id, bot_id, body_length, created_at,
    thumbs_up, thumbs_down, laugh, confused, heart, hooray, eyes, rocket,
    updated_at
FROM code_review_trends.pr_comments FINAL
SETTINGS max_execution_time = 600;

-- 4. Atomic swap — both renames happen in a single DDL operation so there is
--    no window where pr_comments doesn't exist.
RENAME TABLE
    code_review_trends.pr_comments TO code_review_trends.pr_comments_old,
    code_review_trends.pr_comments_new TO code_review_trends.pr_comments;

-- 5. Drop the old table
DROP TABLE code_review_trends.pr_comments_old;

-- 6. Recreate the MV on the new table. Definition matches 009_comment_stats_reacted_count.sql.
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.comment_stats_weekly_mv
TO code_review_trends.comment_stats_weekly
AS SELECT
    bot_id,
    toMonday(created_at) AS week,
    count() AS comment_count,
    sum(pr_comments.thumbs_up) AS thumbs_up,
    sum(pr_comments.thumbs_down) AS thumbs_down,
    sum(pr_comments.heart) AS heart,
    uniqExactState(repo_name, pr_number) AS pr_count,
    countIf(pr_comments.thumbs_up + pr_comments.thumbs_down > 0) AS reacted_comment_count
FROM code_review_trends.pr_comments
WHERE comment_id > 0
GROUP BY bot_id, week;
