-- Pre-aggregated weekly reaction-only review counts per bot.
--
-- "Reaction-only review" = a PR where the bot left a :hooray: reaction on the
-- PR description, but has NO pr_bot_event (no formal PullRequestReviewEvent
-- from GH Archive). This handles bots like Sentry that "approve" PRs via
-- emoji reactions instead of GitHub review submissions.
--
-- Bucketed by ISO week (Monday start) so the data can be UNION'd into the
-- review_activity aggregation pipeline — enabling growth_pct, latest_week,
-- and time-range filters to include reaction-only reviews automatically.
--
-- Uses a REFRESHABLE materialized view (ClickHouse 23.12+) that auto-refreshes
-- every 30 minutes. Reads are instant (<200ms) vs. the raw NOT EXISTS query (3s+).

-- Target table
CREATE TABLE IF NOT EXISTS code_review_trends.reaction_only_review_counts (
    bot_id String,
    week Date,
    reaction_reviews UInt64
) ENGINE = ReplacingMergeTree()
ORDER BY (bot_id, week);

-- Refreshable materialized view — recomputes every 30 minutes
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.reaction_only_review_counts_mv
REFRESH EVERY 30 MINUTE
TO code_review_trends.reaction_only_review_counts
AS SELECT
    r.bot_id,
    toStartOfWeek(r.reacted_at, 1) AS week,
    countDistinct((r.repo_name, r.pr_number)) AS reaction_reviews
FROM code_review_trends.pr_bot_reactions r FINAL
WHERE r.reaction_type = 'hooray'
    AND NOT EXISTS (
        SELECT 1 FROM code_review_trends.pr_bot_events e
        WHERE e.repo_name = r.repo_name AND e.pr_number = r.pr_number AND e.bot_id = r.bot_id
    )
GROUP BY r.bot_id, toStartOfWeek(r.reacted_at, 1);
