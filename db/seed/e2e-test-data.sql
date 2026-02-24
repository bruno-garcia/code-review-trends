-- E2E test seed data — NOT in db/init/, so it only runs in CI and local dev.
--
-- Provides minimal, realistic-looking data to exercise code paths that are
-- unreachable with empty tables. Key scenarios covered:
--
--   1. Product detail page with product-filter JOINs (getOrgList Phase 2)
--   2. Multi-bot product (Sentry: sentry, seer-by-sentry, codecov-ai)
--   3. Reaction-only reviews (Sentry's hooray-based approval pattern)
--   4. Home page AI share chart (needs both bot + human activity)
--   5. Org/repo listing pages (needs repos + pr_bot_events)
--   6. PR characteristics (needs pull_requests + pr_bot_events)
--   7. Comment stats / reactions (needs pr_comments)
--
-- Uses two products (CodeRabbit + Sentry) and a handful of repos spread
-- across two orgs. All bot_ids and product_ids match db/init/002_bot_data.sql.

-- ============================================================
-- 1. Weekly review activity (4 weeks of data for 3 bots)
-- ============================================================
INSERT INTO code_review_trends.review_activity
    (week, bot_id, review_count, review_comment_count, pr_comment_count, repo_count, org_count)
VALUES
    -- CodeRabbit
    ('2025-01-06', 'coderabbit', 1200, 3600, 800, 150, 80),
    ('2025-01-13', 'coderabbit', 1350, 4050, 900, 160, 85),
    ('2025-01-20', 'coderabbit', 1500, 4500, 1000, 170, 90),
    ('2025-01-27', 'coderabbit', 1600, 4800, 1100, 175, 92),
    -- Sentry bot (event-based reviews)
    ('2025-01-06', 'sentry', 200, 400, 100, 30, 15),
    ('2025-01-13', 'sentry', 220, 440, 110, 32, 16),
    ('2025-01-20', 'sentry', 250, 500, 120, 35, 18),
    ('2025-01-27', 'sentry', 270, 540, 130, 37, 19),
    -- Seer by Sentry
    ('2025-01-06', 'seer-by-sentry', 80, 240, 50, 15, 10),
    ('2025-01-13', 'seer-by-sentry', 90, 270, 55, 16, 11),
    ('2025-01-20', 'seer-by-sentry', 100, 300, 60, 18, 12),
    ('2025-01-27', 'seer-by-sentry', 110, 330, 65, 19, 13);

-- Growth window: need 24 weeks of history for growth_pct calculation.
-- Add sparse earlier data so growth_pct is non-zero.
INSERT INTO code_review_trends.review_activity
    (week, bot_id, review_count, review_comment_count, pr_comment_count, repo_count, org_count)
VALUES
    ('2024-08-05', 'coderabbit', 600, 1800, 400, 80, 40),
    ('2024-08-12', 'coderabbit', 620, 1860, 410, 82, 41),
    ('2024-08-19', 'coderabbit', 640, 1920, 420, 84, 42),
    ('2024-08-26', 'coderabbit', 650, 1950, 430, 85, 43),
    ('2024-08-05', 'sentry', 100, 200, 50, 15, 8),
    ('2024-08-12', 'sentry', 105, 210, 52, 16, 8),
    ('2024-08-19', 'sentry', 110, 220, 55, 17, 9),
    ('2024-08-26', 'sentry', 115, 230, 57, 17, 9);

-- ============================================================
-- 2. Human review activity (matching weeks, for AI share)
-- ============================================================
INSERT INTO code_review_trends.human_review_activity
    (week, review_count, review_comment_count, pr_comment_count, repo_count)
VALUES
    ('2024-08-05', 50000, 120000, 30000, 10000),
    ('2024-08-12', 51000, 122000, 31000, 10200),
    ('2024-08-19', 52000, 124000, 32000, 10400),
    ('2024-08-26', 52500, 125000, 32500, 10500),
    ('2025-01-06', 55000, 130000, 35000, 11000),
    ('2025-01-13', 56000, 132000, 36000, 11200),
    ('2025-01-20', 57000, 134000, 37000, 11400),
    ('2025-01-27', 58000, 136000, 38000, 11600);

-- ============================================================
-- 3. Repos (2 orgs × 2 repos each, all with fetch_status='ok')
-- ============================================================
INSERT INTO code_review_trends.repos
    (name, owner, stars, primary_language, fork, archived, fetch_status)
VALUES
    ('test-org/frontend', 'test-org', 5200, 'TypeScript', false, false, 'ok'),
    ('test-org/backend', 'test-org', 3100, 'Python', false, false, 'ok'),
    ('acme-corp/webapp', 'acme-corp', 8500, 'TypeScript', false, false, 'ok'),
    ('acme-corp/api', 'acme-corp', 4200, 'Go', false, false, 'ok');

-- ============================================================
-- 4. PR bot events (triggers MVs: pr_bot_event_counts,
--    org_bot_pr_counts, repo_pr_summary, org_pr_summary,
--    bot_comment_discovery_summary)
-- ============================================================
INSERT INTO code_review_trends.pr_bot_events
    (repo_name, pr_number, bot_id, actor_login, event_type, event_week)
VALUES
    -- CodeRabbit reviews across both orgs
    ('test-org/frontend', 101, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-06'),
    ('test-org/frontend', 102, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-06'),
    ('test-org/frontend', 103, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-13'),
    ('test-org/backend', 201, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-13'),
    ('test-org/backend', 202, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-20'),
    ('acme-corp/webapp', 301, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-20'),
    ('acme-corp/webapp', 302, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-27'),
    ('acme-corp/api', 401, 'coderabbit', 'coderabbitai[bot]', 'PullRequestReviewEvent', '2025-01-27'),
    -- Sentry bot reviews (event-based)
    ('test-org/frontend', 104, 'sentry', 'sentry[bot]', 'PullRequestReviewEvent', '2025-01-06'),
    ('test-org/frontend', 105, 'sentry', 'sentry[bot]', 'PullRequestReviewEvent', '2025-01-13'),
    ('acme-corp/webapp', 303, 'sentry', 'sentry[bot]', 'PullRequestReviewEvent', '2025-01-20'),
    -- Seer by Sentry reviews
    ('test-org/backend', 203, 'seer-by-sentry', 'seer-by-sentry[bot]', 'PullRequestReviewEvent', '2025-01-13'),
    ('acme-corp/api', 402, 'seer-by-sentry', 'seer-by-sentry[bot]', 'PullRequestReviewEvent', '2025-01-20'),
    ('acme-corp/api', 403, 'seer-by-sentry', 'seer-by-sentry[bot]', 'PullRequestReviewEvent', '2025-01-27');

-- ============================================================
-- 5. Pull requests (triggers pr_product_characteristics MV)
-- ============================================================
INSERT INTO code_review_trends.pull_requests
    (repo_name, pr_number, title, author, state, created_at, merged_at, closed_at, additions, deletions, changed_files)
VALUES
    ('test-org/frontend', 101, 'feat: add dark mode', 'dev1', 'merged', '2025-01-05 10:00:00', '2025-01-06 14:00:00', '2025-01-06 14:00:00', 250, 30, 8),
    ('test-org/frontend', 102, 'fix: button alignment', 'dev2', 'merged', '2025-01-05 12:00:00', '2025-01-06 16:00:00', '2025-01-06 16:00:00', 15, 5, 2),
    ('test-org/frontend', 103, 'chore: update deps', 'dev1', 'merged', '2025-01-12 09:00:00', '2025-01-13 11:00:00', '2025-01-13 11:00:00', 500, 480, 3),
    ('test-org/frontend', 104, 'feat: error boundary', 'dev3', 'merged', '2025-01-05 14:00:00', '2025-01-07 10:00:00', '2025-01-07 10:00:00', 120, 10, 4),
    ('test-org/frontend', 105, 'fix: memory leak', 'dev2', 'closed', '2025-01-12 11:00:00', NULL, '2025-01-14 09:00:00', 45, 20, 3),
    ('test-org/backend', 201, 'feat: new endpoint', 'dev1', 'merged', '2025-01-12 10:00:00', '2025-01-13 15:00:00', '2025-01-13 15:00:00', 300, 20, 6),
    ('test-org/backend', 202, 'perf: query opt', 'dev3', 'merged', '2025-01-19 08:00:00', '2025-01-20 12:00:00', '2025-01-20 12:00:00', 80, 45, 4),
    ('test-org/backend', 203, 'fix: auth bypass', 'dev2', 'merged', '2025-01-12 14:00:00', '2025-01-13 18:00:00', '2025-01-13 18:00:00', 30, 5, 2),
    ('acme-corp/webapp', 301, 'feat: dashboard v2', 'dev4', 'merged', '2025-01-19 09:00:00', '2025-01-21 10:00:00', '2025-01-21 10:00:00', 800, 150, 15),
    ('acme-corp/webapp', 302, 'fix: XSS vuln', 'dev5', 'merged', '2025-01-26 10:00:00', '2025-01-27 09:00:00', '2025-01-27 09:00:00', 25, 10, 3),
    ('acme-corp/webapp', 303, 'chore: lint fixes', 'dev4', 'merged', '2025-01-19 11:00:00', '2025-01-20 14:00:00', '2025-01-20 14:00:00', 40, 35, 10),
    ('acme-corp/api', 401, 'feat: rate limiter', 'dev5', 'merged', '2025-01-26 09:00:00', '2025-01-28 11:00:00', '2025-01-28 11:00:00', 200, 15, 5),
    ('acme-corp/api', 402, 'fix: null check', 'dev4', 'merged', '2025-01-19 10:00:00', '2025-01-20 16:00:00', '2025-01-20 16:00:00', 10, 3, 1),
    ('acme-corp/api', 403, 'refactor: handlers', 'dev5', 'merged', '2025-01-26 11:00:00', '2025-01-28 09:00:00', '2025-01-28 09:00:00', 150, 120, 8);

-- ============================================================
-- 6. PR comments (triggers comment_stats_weekly MV)
--    Need bot_id to match known bots, comment_id > 0 (non-sentinel)
-- ============================================================
INSERT INTO code_review_trends.pr_comments
    (repo_name, pr_number, comment_id, bot_id, body_length, created_at, thumbs_up, thumbs_down)
VALUES
    -- CodeRabbit comments
    ('test-org/frontend', 101, 1001, 'coderabbit', 500, '2025-01-06 12:00:00', 3, 0),
    ('test-org/frontend', 101, 1002, 'coderabbit', 200, '2025-01-06 12:05:00', 1, 0),
    ('test-org/frontend', 102, 1003, 'coderabbit', 150, '2025-01-06 14:00:00', 0, 1),
    ('test-org/frontend', 103, 1004, 'coderabbit', 300, '2025-01-13 10:00:00', 2, 0),
    ('test-org/backend', 201, 1005, 'coderabbit', 400, '2025-01-13 12:00:00', 1, 0),
    ('test-org/backend', 202, 1006, 'coderabbit', 250, '2025-01-20 10:00:00', 0, 0),
    ('acme-corp/webapp', 301, 1007, 'coderabbit', 600, '2025-01-20 11:00:00', 4, 0),
    ('acme-corp/webapp', 302, 1008, 'coderabbit', 180, '2025-01-27 08:00:00', 1, 1),
    ('acme-corp/api', 401, 1009, 'coderabbit', 350, '2025-01-27 10:00:00', 2, 0),
    -- Sentry bot comments
    ('test-org/frontend', 104, 1010, 'sentry', 100, '2025-01-06 15:00:00', 1, 0),
    ('test-org/frontend', 105, 1011, 'sentry', 120, '2025-01-13 14:00:00', 0, 0),
    ('acme-corp/webapp', 303, 1012, 'sentry', 90, '2025-01-20 15:00:00', 1, 0),
    -- Seer by Sentry comments
    ('test-org/backend', 203, 1013, 'seer-by-sentry', 200, '2025-01-13 16:00:00', 0, 0),
    ('acme-corp/api', 402, 1014, 'seer-by-sentry', 180, '2025-01-20 17:00:00', 1, 0),
    ('acme-corp/api', 403, 1015, 'seer-by-sentry', 250, '2025-01-27 12:00:00', 0, 1);

-- ============================================================
-- 7. Reaction-only review counts (direct insert — the refreshable
--    MV won't run during CI; needed for Sentry's hooray-based reviews)
-- ============================================================
INSERT INTO code_review_trends.reaction_only_review_counts
    (bot_id, week, reaction_reviews)
VALUES
    ('sentry', '2025-01-06', 50),
    ('sentry', '2025-01-13', 55),
    ('sentry', '2025-01-20', 60),
    ('sentry', '2025-01-27', 65);

-- ============================================================
-- 8. Reaction-only repo counts (direct insert — same reason as above)
-- ============================================================
INSERT INTO code_review_trends.reaction_only_repo_counts
    (repo_name, bot_id, pr_count, exclusive_pr_count)
VALUES
    ('test-org/frontend', 'sentry', 8, 5),
    ('test-org/backend', 'sentry', 4, 3),
    ('acme-corp/webapp', 'sentry', 6, 4);
