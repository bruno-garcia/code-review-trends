CREATE DATABASE IF NOT EXISTS code_review_trends;

-- Bots we're tracking
CREATE TABLE IF NOT EXISTS code_review_trends.bots (
    id String,
    name String,
    github_login String,
    website String,
    description String
) ENGINE = ReplacingMergeTree()
ORDER BY id;

-- Weekly aggregated review counts per bot (from BigQuery / GH Archive)
CREATE TABLE IF NOT EXISTS code_review_trends.review_activity (
    week Date,
    bot_id String,
    review_count UInt64,
    review_comment_count UInt64,
    repo_count UInt64
) ENGINE = ReplacingMergeTree()
ORDER BY (week, bot_id);

-- Weekly total human review activity (for proportion calculations)
CREATE TABLE IF NOT EXISTS code_review_trends.human_review_activity (
    week Date,
    review_count UInt64,
    review_comment_count UInt64,
    repo_count UInt64
) ENGINE = ReplacingMergeTree()
ORDER BY week;

-- Per-repo bot adoption (enrichment from GitHub API)
CREATE TABLE IF NOT EXISTS code_review_trends.repo_bot_usage (
    repo_full_name String,
    bot_id String,
    first_seen Date,
    last_seen Date,
    total_reviews UInt64,
    stars UInt32
) ENGINE = ReplacingMergeTree()
ORDER BY (repo_full_name, bot_id);

-- Reactions / sentiment on bot reviews (from GitHub API)
CREATE TABLE IF NOT EXISTS code_review_trends.review_reactions (
    week Date,
    bot_id String,
    thumbs_up UInt64,
    thumbs_down UInt64,
    laugh UInt64,
    confused UInt64,
    heart UInt64
) ENGINE = ReplacingMergeTree()
ORDER BY (week, bot_id);
