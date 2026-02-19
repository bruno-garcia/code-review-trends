-- Pre-aggregated reaction-only review counts per (repo_name, bot_id).
--
-- Like pr_bot_event_counts but for reaction-only reviews. Stores two counts:
--   - pr_count: PRs where this bot left a hooray reaction but has NO event
--     in pr_bot_events (per-bot NOT EXISTS). Used for product_ids and HAVING.
--   - exclusive_pr_count: subset of pr_count where the PR also has NO events
--     from ANY other bot. Safe to add to pr_bot_event_counts totals without
--     double-counting.
--
-- Enables the org listing page to include reaction-based products (like Sentry)
-- without scanning the raw pr_bot_reactions table at query time.
--
-- Uses a REFRESHABLE materialized view (every 30 min), same as
-- reaction_only_review_counts (migration 006).

-- Target table
CREATE TABLE IF NOT EXISTS code_review_trends.reaction_only_repo_counts (
    repo_name String,
    bot_id String,
    pr_count UInt64,
    exclusive_pr_count UInt64
) ENGINE = ReplacingMergeTree()
ORDER BY (repo_name, bot_id);

-- Refreshable materialized view — recomputes every 30 minutes
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.reaction_only_repo_counts_mv
REFRESH EVERY 30 MINUTE
TO code_review_trends.reaction_only_repo_counts
AS SELECT
    r.repo_name,
    r.bot_id,
    uniqExact(r.pr_number) AS pr_count,
    uniqExactIf(r.pr_number, ev.pr_number IS NULL) AS exclusive_pr_count
FROM code_review_trends.pr_bot_reactions r FINAL
LEFT JOIN (
    SELECT DISTINCT repo_name, pr_number
    FROM code_review_trends.pr_bot_events
) ev ON r.repo_name = ev.repo_name AND r.pr_number = ev.pr_number
WHERE r.reaction_type = 'hooray'
    AND NOT EXISTS (
        SELECT 1 FROM code_review_trends.pr_bot_events e
        WHERE e.repo_name = r.repo_name AND e.pr_number = r.pr_number AND e.bot_id = r.bot_id
    )
GROUP BY r.repo_name, r.bot_id;
