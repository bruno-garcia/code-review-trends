-- Bot reactions on PRs (from GitHub Reactions API).
-- Tracks individual reactions left by tracked bots on PR descriptions.
-- Used to count "reaction-only" reviews (e.g., Sentry's 🎉 = "reviewed, no findings").
CREATE TABLE IF NOT EXISTS code_review_trends.pr_bot_reactions (
    repo_name String,
    pr_number UInt32,
    bot_id String,
    reaction_type String,          -- GitHub reaction content: 'hooray', '+1', etc.
    reacted_at DateTime,
    reaction_id UInt64,            -- GitHub reaction ID (for dedup)
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (repo_name, pr_number, bot_id, reaction_id);

-- Tracks which repo/PR combos have been scanned for bot reactions.
-- Sentinel rows prevent re-scanning PRs on subsequent runs.
CREATE TABLE IF NOT EXISTS code_review_trends.reaction_scan_progress (
    repo_name String,
    pr_number UInt32,
    scanned_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(scanned_at)
ORDER BY (repo_name, pr_number);
