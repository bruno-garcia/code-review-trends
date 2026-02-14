-- Seed bots
INSERT INTO code_review_trends.bots (id, name, github_login, website, description) VALUES
    ('coderabbit', 'CodeRabbit', 'coderabbitai[bot]', 'https://coderabbit.ai', 'AI code review agent that provides contextual feedback on pull requests.'),
    ('copilot', 'GitHub Copilot', 'copilot[bot]', 'https://github.com/features/copilot', 'GitHub''s AI pair programmer, also provides code review suggestions.'),
    ('sentry', 'Seer by Sentry', 'sentry[bot]', 'https://sentry.io', 'Sentry''s AI that reviews code for potential issues and error patterns.'),
    ('codescene', 'CodeScene', 'codescene[bot]', 'https://codescene.com', 'Behavioral code analysis and AI code review.'),
    ('sourcery', 'Sourcery', 'sourcery-ai[bot]', 'https://sourcery.ai', 'AI code reviewer focused on code quality and refactoring.'),
    ('ellipsis', 'Ellipsis', 'ellipsis-dev[bot]', 'https://ellipsis.dev', 'AI-powered code review and bug detection.'),
    ('codeium', 'Codeium / Windsurf', 'codeiumbot[bot]', 'https://codeium.com', 'AI code completion and review.'),
    ('qodo', 'Qodo (formerly CodiumAI)', 'qodo-merge-pro[bot]', 'https://www.qodo.ai', 'AI agent for code integrity — reviews, tests, and suggestions.');

-- Seed review_activity with fake weekly data (2023-01 to 2026-02)
-- We generate plausible growth curves for each bot

INSERT INTO code_review_trends.review_activity (week, bot_id, review_count, review_comment_count, repo_count)
SELECT
    toDate(arrayJoin(
        arrayMap(i -> toDate('2023-01-02') + i * 7, range(163))
    )) AS week,
    bot.1 AS bot_id,
    toUInt64(greatest(0, bot.2 * pow(1.015, rowNumberInAllBlocks() % 163) * (1 + (rand() % 40 - 20) / 100.0))) AS review_count,
    toUInt64(greatest(0, bot.3 * pow(1.015, rowNumberInAllBlocks() % 163) * (1 + (rand() % 40 - 20) / 100.0))) AS review_comment_count,
    toUInt64(greatest(1, bot.4 * pow(1.012, rowNumberInAllBlocks() % 163) * (1 + (rand() % 30 - 15) / 100.0))) AS repo_count
FROM (
    SELECT arrayJoin([
        ('coderabbit',  120, 450, 80),
        ('copilot',     80,  200, 60),
        ('sentry',      40,  150, 30),
        ('codescene',   25,  80,  20),
        ('sourcery',    60,  220, 45),
        ('ellipsis',    15,  50,  12),
        ('codeium',     30,  100, 25),
        ('qodo',        35,  130, 28)
    ]) AS bot
);

-- Seed human_review_activity
INSERT INTO code_review_trends.human_review_activity (week, review_count, review_comment_count, repo_count)
SELECT
    toDate('2023-01-02') + number * 7 AS week,
    toUInt64(500000 * (1 + number * 0.002) * (1 + (rand() % 20 - 10) / 100.0)) AS review_count,
    toUInt64(1800000 * (1 + number * 0.002) * (1 + (rand() % 20 - 10) / 100.0)) AS review_comment_count,
    toUInt64(350000 * (1 + number * 0.001) * (1 + (rand() % 15 - 7) / 100.0)) AS repo_count
FROM numbers(163);

-- Seed review_reactions
INSERT INTO code_review_trends.review_reactions (week, bot_id, thumbs_up, thumbs_down, laugh, confused, heart)
SELECT
    toDate(arrayJoin(
        arrayMap(i -> toDate('2023-01-02') + i * 7, range(163))
    )) AS week,
    bot.1 AS bot_id,
    toUInt64(greatest(0, bot.2 * pow(1.01, rowNumberInAllBlocks() % 163) * (1 + (rand() % 30 - 15) / 100.0))) AS thumbs_up,
    toUInt64(greatest(0, bot.3 * pow(1.01, rowNumberInAllBlocks() % 163) * (1 + (rand() % 30 - 15) / 100.0))) AS thumbs_down,
    toUInt64(greatest(0, bot.4 * (1 + (rand() % 50 - 25) / 100.0))) AS laugh,
    toUInt64(greatest(0, bot.5 * (1 + (rand() % 50 - 25) / 100.0))) AS confused,
    toUInt64(greatest(0, bot.6 * pow(1.01, rowNumberInAllBlocks() % 163) * (1 + (rand() % 30 - 15) / 100.0))) AS heart
FROM (
    SELECT arrayJoin([
        ('coderabbit',  30, 5,  3, 2, 8),
        ('copilot',     25, 8,  4, 3, 6),
        ('sentry',      15, 3,  2, 1, 5),
        ('codescene',   10, 2,  1, 1, 3),
        ('sourcery',    20, 4,  2, 2, 7),
        ('ellipsis',    5,  1,  1, 1, 2),
        ('codeium',     12, 3,  2, 1, 4),
        ('qodo',        14, 3,  1, 1, 5)
    ]) AS bot
);
