-- Migration 11: Pre-aggregated owner-level PR counts from pr_bot_events.
--
-- The getOrgList query was timing out (>15s) because it needed to:
--   1. Scan pr_bot_event_counts (471K rows), GROUP BY repo_name
--   2. JOIN repos to get owner
--   3. GROUP BY owner again
--
-- This MV extracts the owner directly from repo_name (format: "owner/repo")
-- using splitByChar, eliminating the expensive repos JOIN. The aggregation
-- is pre-computed at the (owner, bot_id) level so the orgs query can simply
-- read pre-aggregated rows.
--
-- Uses AggregatingMergeTree with uniqExactState(pr_number) so that:
--   - uniqExactMerge within the same owner correctly unions PR sets across bots
--   - Product filtering works by joining bots on bot_id before merging

CREATE TABLE IF NOT EXISTS code_review_trends.org_bot_pr_counts (
    owner String,
    bot_id String,
    pr_count AggregateFunction(uniqExact, UInt32)
) ENGINE = AggregatingMergeTree()
ORDER BY (owner, bot_id);

-- Materialized view: auto-populates on INSERT to pr_bot_events.
-- Extracts owner from repo_name (e.g., "facebook/react" → "facebook")
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.org_bot_pr_counts_mv
TO code_review_trends.org_bot_pr_counts
AS SELECT
    splitByChar('/', repo_name)[1] AS owner,
    bot_id,
    uniqExactState(pr_number) AS pr_count
FROM code_review_trends.pr_bot_events
GROUP BY owner, bot_id;

-- Backfill from existing data
INSERT INTO code_review_trends.org_bot_pr_counts
SELECT
    splitByChar('/', repo_name)[1] AS owner,
    bot_id,
    uniqExactState(pr_number) AS pr_count
FROM code_review_trends.pr_bot_events
GROUP BY owner, bot_id;
