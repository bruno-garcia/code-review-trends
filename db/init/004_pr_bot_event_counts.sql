-- Migration 3: Materialized view for pre-aggregated pr_bot_events counts.
--
-- The raw pr_bot_events table (7.4M+ rows) is expensive to scan for every
-- org/repo page load. This creates a (repo_name, bot_id)-level summary
-- (~471K rows) that auto-updates on INSERT to pr_bot_events.
--
-- Uses AggregatingMergeTree with uniqExactState(pr_number) so that:
--   - uniqExactMerge within the same repo correctly unions PR sets across bots
--   - SUM across repos gives exact per-owner totals
--   - Product filtering works by joining bots on bot_id before merging
--
-- Reduces getOrgList memory from ~815 MiB to ~40 MiB per query.

-- Target table for the materialized view
CREATE TABLE IF NOT EXISTS code_review_trends.pr_bot_event_counts (
    repo_name String,
    bot_id String,
    pr_count AggregateFunction(uniqExact, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY (repo_name, bot_id);

-- Materialized view: auto-populates on INSERT to pr_bot_events
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.pr_bot_event_counts_mv
TO code_review_trends.pr_bot_event_counts
AS SELECT
    repo_name,
    bot_id,
    uniqExactState(pr_number) AS pr_count
FROM code_review_trends.pr_bot_events
GROUP BY repo_name, bot_id;
