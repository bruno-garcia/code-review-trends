-- Migration: pr_product_characteristics
--
-- Pre-joins pull_requests with pr_bot_events + bots so that per-product PR
-- characteristic queries (avg additions, merge rate, time-to-merge) no longer
-- need a DISTINCT over 5.6M+ pr_bot_events rows at query time.
--
-- The MV fires on INSERT to pull_requests (the enrichment step). At that point,
-- pr_bot_events already exist for the PR (discover runs before enrich).
-- ReplacingMergeTree deduplicates (product_id, repo_name, pr_number) so
-- multiple events for the same PR/product don't cause double-counting.
--
-- Query cost drops from:
--   DISTINCT(5.6M pr_bot_events) JOIN bots JOIN pull_requests → GROUP BY
-- To:
--   SELECT from ~750K pre-joined rows → GROUP BY

CREATE TABLE IF NOT EXISTS code_review_trends.pr_product_characteristics (
    product_id String,
    repo_name String,
    pr_number UInt32,
    additions UInt32,
    deletions UInt32,
    changed_files UInt32,
    state String,
    created_at DateTime,
    merged_at Nullable(DateTime)
) ENGINE = ReplacingMergeTree()
ORDER BY (product_id, repo_name, pr_number);

-- Materialized view: auto-populates on INSERT to pull_requests.
-- Joins against pr_bot_events (to find which bots touched the PR) and bots
-- (to resolve product_id). Multiple events for the same PR produce multiple
-- rows; ReplacingMergeTree deduplicates at merge time.
CREATE MATERIALIZED VIEW IF NOT EXISTS code_review_trends.pr_product_characteristics_mv
TO code_review_trends.pr_product_characteristics
AS SELECT
    b.product_id AS product_id,
    p.repo_name AS repo_name,
    p.pr_number AS pr_number,
    p.additions AS additions,
    p.deletions AS deletions,
    p.changed_files AS changed_files,
    p.state AS state,
    p.created_at AS created_at,
    p.merged_at AS merged_at
FROM code_review_trends.pull_requests AS p
INNER JOIN code_review_trends.pr_bot_events AS e
    ON p.repo_name = e.repo_name AND p.pr_number = e.pr_number
INNER JOIN code_review_trends.bots AS b
    ON e.bot_id = b.id;

-- Backfill from existing data (one-time cost during migration).
INSERT INTO code_review_trends.pr_product_characteristics
SELECT
    b.product_id AS product_id,
    p.repo_name AS repo_name,
    p.pr_number AS pr_number,
    p.additions AS additions,
    p.deletions AS deletions,
    p.changed_files AS changed_files,
    p.state AS state,
    p.created_at AS created_at,
    p.merged_at AS merged_at
FROM code_review_trends.pull_requests AS p
INNER JOIN code_review_trends.pr_bot_events AS e
    ON p.repo_name = e.repo_name AND p.pr_number = e.pr_number
INNER JOIN code_review_trends.bots AS b
    ON e.bot_id = b.id;
