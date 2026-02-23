-- Migration 13: Pre-aggregated per-bot comment discovery totals.
--
-- The /status page computes comments_discovered as:
--   SELECT sum(x) FROM (SELECT uniqExactMerge(pr_count) AS x
--     FROM pr_bot_event_counts GROUP BY repo_name, bot_id)
--
-- This scans 471K rows of pr_bot_event_counts, deserializing and merging
-- uniqExact aggregate states for each (repo_name, bot_id) combo — causing
-- 8-15s query times that timeout the /status page.
--
-- This table collapses across repo_name into ~20 rows (one per bot_id),
-- storing uniqExact(repo_name, pr_number). The semantics are identical:
--   sum over all bots of count(distinct (repo, pr) per bot)
-- = count(distinct (repo, pr, bot) triples)
-- = the original comments_discovered value.
--
-- Query becomes: SELECT sum(x) FROM (
--   SELECT uniqExactMerge(total_combos) AS x
--   FROM bot_comment_discovery_summary GROUP BY bot_id
-- ) — merging ~20 states instead of 471K.

CREATE TABLE IF NOT EXISTS code_review_trends.bot_comment_discovery_summary (
    bot_id String,
    total_combos AggregateFunction(uniqExact, String, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY bot_id;

CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.bot_comment_discovery_summary_mv
TO code_review_trends.bot_comment_discovery_summary
AS SELECT
    bot_id,
    uniqExactState(repo_name, pr_number) AS total_combos
FROM code_review_trends.pr_bot_events
GROUP BY bot_id;

-- Backfill from existing data
INSERT INTO code_review_trends.bot_comment_discovery_summary
SELECT
    bot_id,
    uniqExactState(repo_name, pr_number) AS total_combos
FROM code_review_trends.pr_bot_events
GROUP BY bot_id;
