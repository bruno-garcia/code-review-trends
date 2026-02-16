CREATE DATABASE IF NOT EXISTS code_review_trends;

-- Products (companies/tools that own one or more bots)
CREATE TABLE IF NOT EXISTS code_review_trends.products (
    id String,
    name String,
    website String,
    description String,
    brand_color String,
    avatar_url String
) ENGINE = ReplacingMergeTree()
ORDER BY id;

-- Bots we're tracking (display info only)
CREATE TABLE IF NOT EXISTS code_review_trends.bots (
    id String,
    name String,
    product_id String,
    brand_color String,
    avatar_url String,
    website String,
    description String
) ENGINE = ReplacingMergeTree()
ORDER BY id;

-- GitHub logins for each bot (a bot can have multiple logins, e.g. after a rename)
CREATE TABLE IF NOT EXISTS code_review_trends.bot_logins (
    bot_id String,
    github_login String
) ENGINE = ReplacingMergeTree()
ORDER BY (bot_id, github_login);

-- Weekly aggregated review counts per bot (from BigQuery / GH Archive)
CREATE TABLE IF NOT EXISTS code_review_trends.review_activity (
    week Date,
    bot_id String,
    review_count UInt64,
    review_comment_count UInt64,
    repo_count UInt64,
    org_count UInt64
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

-- Discovery table: GH Archive events where bots touched PRs
CREATE TABLE IF NOT EXISTS code_review_trends.pr_bot_events (
    repo_name String,
    pr_number UInt32,
    bot_id String,
    actor_login String,
    event_type String,
    event_week Date,
    discovered_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree()
ORDER BY (repo_name, pr_number, bot_id, event_type, event_week);

-- Repo metadata (refreshed periodically)
CREATE TABLE IF NOT EXISTS code_review_trends.repos (
    name String,
    owner String,
    stars UInt32,
    primary_language String,
    fork Bool DEFAULT false,
    archived Bool DEFAULT false,
    fetch_status String DEFAULT 'ok',
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY name;

-- Language breakdown per repo
CREATE TABLE IF NOT EXISTS code_review_trends.repo_languages (
    repo_name String,
    language String,
    bytes UInt64,
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (repo_name, language);

-- Individual PRs
CREATE TABLE IF NOT EXISTS code_review_trends.pull_requests (
    repo_name String,
    pr_number UInt32,
    title String,
    author String,
    state String,
    created_at DateTime,
    merged_at Nullable(DateTime),
    closed_at Nullable(DateTime),
    additions UInt32,
    deletions UInt32,
    changed_files UInt32,
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (repo_name, pr_number);

-- Bot review comments (direct only, no replies)
CREATE TABLE IF NOT EXISTS code_review_trends.pr_comments (
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
ORDER BY (repo_name, pr_number, comment_id);
