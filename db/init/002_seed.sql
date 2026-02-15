-- Seed products — must match pipeline/src/bots.ts PRODUCTS array
INSERT INTO code_review_trends.products (id, name, website, description, brand_color, avatar_url) VALUES
    ('coderabbit', 'CodeRabbit', 'https://coderabbit.ai', 'AI code review agent that provides contextual feedback on pull requests.', '#f97316', 'https://avatars.githubusercontent.com/in/347564?v=4'),
    ('copilot', 'GitHub Copilot', 'https://github.com/features/copilot', 'GitHub''s AI pair programmer, also provides code review suggestions.', '#1f2937', 'https://avatars.githubusercontent.com/in/946600?v=4'),
    ('codescene', 'CodeScene', 'https://codescene.com', 'Behavioral code analysis and AI code review.', '#4f46e5', 'https://avatars.githubusercontent.com/u/38929568?v=4'),
    ('sourcery', 'Sourcery', 'https://sourcery.ai', 'AI code reviewer focused on code quality and refactoring.', '#65a30d', 'https://avatars.githubusercontent.com/in/48477?v=4'),
    ('ellipsis', 'Ellipsis', 'https://ellipsis.dev', 'AI-powered code review and bug detection.', '#06b6d4', 'https://avatars.githubusercontent.com/in/64358?v=4'),
    ('qodo', 'Qodo', 'https://qodo.ai', 'AI agent for code integrity — reviews, tests, and suggestions.', '#8b5cf6', 'https://avatars.githubusercontent.com/in/484649?v=4'),
    ('greptile', 'Greptile', 'https://greptile.com', 'AI code review that understands your entire codebase.', '#22c55e', 'https://avatars.githubusercontent.com/in/867647?v=4'),
    ('sentry', 'Sentry', 'https://sentry.io', 'Application monitoring platform with AI-powered code review and error tracking.', '#362d59', 'https://avatars.githubusercontent.com/u/1396951?v=4'),
    ('baz', 'Baz', 'https://baz.co', 'AI code reviewer for fast, actionable pull request feedback.', '#39FF14', 'https://avatars.githubusercontent.com/in/933528?s=60&v=4'),
    ('graphite', 'Graphite', 'https://graphite.dev', 'Developer productivity platform with AI-assisted code review.', '#2563eb', 'https://avatars.githubusercontent.com/in/158384?v=4'),
    ('codeant', 'CodeAnt', 'https://codeant.ai', 'AI code review tool that catches bugs and anti-patterns.', '#a855f7', 'https://avatars.githubusercontent.com/in/646884?v=4'),
    ('windsurf', 'Windsurf', 'https://windsurf.com', 'AI-powered code review with deep codebase understanding.', '#0d9488', 'https://avatars.githubusercontent.com/in/1066231?v=4'),
    ('cubic', 'Cubic', 'https://cubic.dev', 'AI development assistant with automated code review.', '#edc00c', 'https://avatars.githubusercontent.com/in/1082092?v=4'),
    ('cursor', 'Cursor Bugbot', 'https://cursor.com', 'AI code editor with automated bug detection on pull requests.', '#dc2626', 'https://avatars.githubusercontent.com/in/1210556?v=4'),
    ('gemini', 'Gemini Code Assist', 'https://cloud.google.com/gemini/docs/codeassist/overview', 'Google''s AI code assistant with automated pull request reviews.', '#ec4899', 'https://avatars.githubusercontent.com/in/956858?v=4'),
    ('bito', 'Bito', 'https://bito.ai', 'AI code review assistant powered by large language models.', '#94a3b8', 'https://avatars.githubusercontent.com/in/1061978?v=4'),
    ('korbit', 'Korbit', 'https://korbit.ai', 'AI code review mentor that helps teams improve code quality.', '#854d0e', 'https://avatars.githubusercontent.com/in/322216?v=4'),
    ('claude', 'Claude', 'https://claude.ai', 'Anthropic''s AI assistant with code review capabilities on GitHub.', '#FF9F1C', 'https://avatars.githubusercontent.com/in/1236702?v=4'),
    ('openai-codex', 'OpenAI Codex', 'https://openai.com/codex', 'OpenAI''s coding agent with automated pull request reviews.', '#808080', 'https://avatars.githubusercontent.com/in/1144995?s=60&v=4'),
    ('jazzberry', 'Jazzberry', 'https://jazzberry.ai', 'AI code review tool for automated feedback on pull requests.', '#bd0048', 'https://avatars.githubusercontent.com/in/1231820?v=4'),
    ('mesa', 'Mesa', 'https://mesa.dev', 'AI-powered development workflow with code review automation.', '#973c00', 'https://avatars.githubusercontent.com/in/1050077?v=4'),
    ('linearb', 'LinearB', 'https://linearb.io', 'Dev workflow platform with gitStream automation and AI-powered code review.', '#6366f1', 'https://avatars.githubusercontent.com/in/1658443?v=4'),
    ('augment', 'Augment Code', 'https://augmentcode.com', 'AI coding assistant with automated code review on pull requests.', '#968CFF', 'https://avatars.githubusercontent.com/in/1027498?v=4');

-- Seed bots — must match pipeline/src/bots.ts BOTS array
INSERT INTO code_review_trends.bots (id, name, product_id, website, description, brand_color, avatar_url) VALUES
    ('coderabbit', 'CodeRabbit', 'coderabbit', 'https://coderabbit.ai', 'AI code review agent that provides contextual feedback on pull requests.', '#f97316', 'https://avatars.githubusercontent.com/in/347564?v=4'),
    ('copilot', 'GitHub Copilot', 'copilot', 'https://github.com/features/copilot', 'GitHub''s AI pair programmer, also provides code review suggestions.', '#1f2937', 'https://avatars.githubusercontent.com/in/946600?v=4'),
    ('codescene', 'CodeScene', 'codescene', 'https://codescene.com', 'Behavioral code analysis and AI code review.', '#4f46e5', 'https://avatars.githubusercontent.com/u/38929568?v=4'),
    ('sourcery', 'Sourcery', 'sourcery', 'https://sourcery.ai', 'AI code reviewer focused on code quality and refactoring.', '#65a30d', 'https://avatars.githubusercontent.com/in/48477?v=4'),
    ('ellipsis', 'Ellipsis', 'ellipsis', 'https://ellipsis.dev', 'AI-powered code review and bug detection.', '#06b6d4', 'https://avatars.githubusercontent.com/in/64358?v=4'),
    ('codium-pr-agent', 'Qodo (CodiumAI PR Agent)', 'qodo', 'https://qodo.ai', 'Legacy CodiumAI PR agent, now part of Qodo''s code review suite.', '#8b5cf6', 'https://avatars.githubusercontent.com/u/54746889?v=4'),
    ('qodo-merge', 'Qodo Merge', 'qodo', 'https://qodo.ai', 'Qodo''s AI-powered pull request merge assistant.', '#8b5cf6', 'https://avatars.githubusercontent.com/u/104026966?v=4'),
    ('qodo-merge-pro', 'Qodo Merge Pro', 'qodo', 'https://qodo.ai', 'AI agent for code integrity — reviews, tests, and suggestions.', '#8b5cf6', 'https://avatars.githubusercontent.com/in/484649?v=4'),
    ('greptile', 'Greptile', 'greptile', 'https://greptile.com', 'AI code review that understands your entire codebase.', '#22c55e', 'https://avatars.githubusercontent.com/in/867647?v=4'),
    ('sentry', 'Sentry', 'sentry', 'https://sentry.io', 'Sentry''s GitHub bot for issue linking, code review, and error tracking.', '#362d59', 'https://avatars.githubusercontent.com/u/1396951?v=4'),
    ('seer-by-sentry', 'Seer by Sentry', 'sentry', 'https://sentry.io', 'Sentry''s AI agent for automated root cause analysis.', '#362d59', 'https://avatars.githubusercontent.com/in/801464?v=4'),
    ('codecov-ai', 'Codecov AI', 'sentry', 'https://codecov.io', 'Codecov''s AI-powered code review for test coverage insights.', '#362d59', 'https://avatars.githubusercontent.com/in/797565?v=4'),
    ('baz', 'Baz', 'baz', 'https://baz.co', 'AI code reviewer for fast, actionable pull request feedback.', '#39FF14', 'https://avatars.githubusercontent.com/in/933528?s=60&v=4'),
    ('graphite', 'Graphite', 'graphite', 'https://graphite.dev', 'Developer productivity platform with AI-assisted code review.', '#2563eb', 'https://avatars.githubusercontent.com/in/158384?v=4'),
    ('codeant', 'CodeAnt', 'codeant', 'https://codeant.ai', 'AI code review tool that catches bugs and anti-patterns.', '#a855f7', 'https://avatars.githubusercontent.com/in/646884?v=4'),
    ('windsurf', 'Windsurf', 'windsurf', 'https://windsurf.com', 'AI-powered code review with deep codebase understanding.', '#0d9488', 'https://avatars.githubusercontent.com/in/1066231?v=4'),
    ('cubic', 'Cubic', 'cubic', 'https://cubic.dev', 'AI development assistant with automated code review.', '#edc00c', 'https://avatars.githubusercontent.com/in/1082092?v=4'),
    ('cursor', 'Cursor Bugbot', 'cursor', 'https://cursor.com', 'AI code editor with automated bug detection on pull requests.', '#dc2626', 'https://avatars.githubusercontent.com/in/1210556?v=4'),
    ('gemini', 'Gemini Code Assist', 'gemini', 'https://cloud.google.com/gemini/docs/codeassist/overview', 'Google''s AI code assistant with automated pull request reviews.', '#ec4899', 'https://avatars.githubusercontent.com/in/956858?v=4'),
    ('bito', 'Bito', 'bito', 'https://bito.ai', 'AI code review assistant powered by large language models.', '#94a3b8', 'https://avatars.githubusercontent.com/in/1061978?v=4'),
    ('korbit', 'Korbit', 'korbit', 'https://korbit.ai', 'AI code review mentor that helps teams improve code quality.', '#854d0e', 'https://avatars.githubusercontent.com/in/322216?v=4'),
    ('claude', 'Claude', 'claude', 'https://claude.ai', 'Anthropic''s AI assistant with code review capabilities on GitHub.', '#FF9F1C', 'https://avatars.githubusercontent.com/in/1236702?v=4'),
    ('openai-codex', 'OpenAI Codex', 'openai-codex', 'https://openai.com/codex', 'OpenAI''s coding agent with automated pull request reviews.', '#808080', 'https://avatars.githubusercontent.com/in/1144995?s=60&v=4'),
    ('jazzberry', 'Jazzberry', 'jazzberry', 'https://jazzberry.ai', 'AI code review tool for automated feedback on pull requests.', '#bd0048', 'https://avatars.githubusercontent.com/in/1231820?v=4'),
    ('mesa', 'Mesa', 'mesa', 'https://mesa.dev', 'AI-powered development workflow with code review automation.', '#973c00', 'https://avatars.githubusercontent.com/in/1050077?v=4'),
    ('gitstream', 'gitStream', 'linearb', 'https://linearb.io', 'LinearB''s workflow automation bot for continuous merge management.', '#6366f1', 'https://avatars.githubusercontent.com/ml/13414?v=4'),
    ('linearb', 'LinearB', 'linearb', 'https://linearb.io', 'LinearB''s GitHub bot for dev workflow insights and code review.', '#6366f1', 'https://avatars.githubusercontent.com/in/1658443?v=4'),
    ('augment', 'Augment Code', 'augment', 'https://augmentcode.com', 'AI coding assistant with automated code review on pull requests.', '#968CFF', 'https://avatars.githubusercontent.com/in/1027498?v=4');

-- Seed bot logins — must match pipeline/src/bots.ts BOTS array
INSERT INTO code_review_trends.bot_logins (bot_id, github_login) VALUES
    ('coderabbit', 'coderabbitai[bot]'),
    ('copilot', 'copilot-pull-request-reviewer[bot]'),
    ('codescene', 'codescene-delta-analysis[bot]'),
    ('sourcery', 'sourcery-ai[bot]'),
    ('ellipsis', 'ellipsis-dev[bot]'),
    ('codium-pr-agent', 'codium-pr-agent[bot]'),
    ('qodo-merge', 'qodo-merge[bot]'),
    ('qodo-merge-pro', 'qodo-merge-pro[bot]'),
    ('greptile', 'greptile-apps[bot]'),
    ('sentry', 'sentry[bot]'),
    ('seer-by-sentry', 'seer-by-sentry[bot]'),
    ('codecov-ai', 'codecov-ai[bot]'),
    ('baz', 'baz-reviewer[bot]'),
    ('graphite', 'graphite-app[bot]'),
    ('codeant', 'codeant-ai[bot]'),
    ('windsurf', 'windsurf-bot[bot]'),
    ('cubic', 'cubic-dev-ai[bot]'),
    ('cursor', 'cursor[bot]'),
    ('gemini', 'gemini-code-assist[bot]'),
    ('bito', 'bito-code-review[bot]'),
    ('korbit', 'korbit-ai[bot]'),
    ('claude', 'claude[bot]'),
    ('openai-codex', 'chatgpt-codex-connector[bot]'),
    ('jazzberry', 'jazzberry-ai[bot]'),
    ('mesa', 'mesa-dot-dev[bot]'),
    ('gitstream', 'gitstream-cm[bot]'),
    ('linearb', 'linearb[bot]'),
    ('augment', 'augmentcode[bot]');

-- Seed review_activity with fake weekly data (2023-01 to 2026-02)
-- 163 weeks total. Bots start at different weeks to simulate real adoption timelines.
-- start_week: 0 = 2023-01-02. week_idx = rowNumberInAllBlocks() % 163.
-- Pattern: if(week_idx >= start_week, base * growth * noise, 0)

INSERT INTO code_review_trends.review_activity (week, bot_id, review_count, review_comment_count, repo_count, org_count)
SELECT
    toDate(arrayJoin(
        arrayMap(i -> toDate('2023-01-02') + i * 7, range(163))
    )) AS week,
    bot.1 AS bot_id,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.6,
        greatest(0, bot.2 * pow(1.015, (rowNumberInAllBlocks() % 163) - bot.6) * (1 + (rand() % 40 - 20) / 100.0)),
        0)) AS review_count,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.6,
        greatest(0, bot.3 * pow(1.015, (rowNumberInAllBlocks() % 163) - bot.6) * (1 + (rand() % 40 - 20) / 100.0)),
        0)) AS review_comment_count,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.6,
        greatest(1, bot.4 * pow(1.012, (rowNumberInAllBlocks() % 163) - bot.6) * (1 + (rand() % 30 - 15) / 100.0)),
        0)) AS repo_count,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.6,
        greatest(1, bot.5 * pow(1.010, (rowNumberInAllBlocks() % 163) - bot.6) * (1 + (rand() % 25 - 12) / 100.0)),
        0)) AS org_count
FROM (
    SELECT arrayJoin([
        -- (bot_id, base_reviews, base_comments, base_repos, base_orgs, start_week)
        -- Established: full range (week 0), high base
        ('coderabbit',       120, 450, 80, 35, 0),
        ('copilot',           80, 200, 60, 40, 0),
        ('sourcery',          60, 220, 45, 25, 0),
        ('codescene',         25,  80, 20, 14, 0),
        -- Mid-tier: mostly full range, medium base
        ('ellipsis',          15,  50, 12,  8, 0),
        ('greptile',          20,  70, 15, 10, 10),
        ('graphite',          18,  55, 14,  9, 5),
        ('korbit',            16,  48, 11,  7, 0),
        ('bito',              15,  45, 10,  6, 10),
        -- Qodo transition: codium-pr-agent early, qodo-merge mid, qodo-merge-pro late
        ('codium-pr-agent',   35, 130, 28, 16, 0),    -- weeks 0-80 active, then fades
        ('qodo-merge',        25, 100, 20, 12, 60),   -- starts week 60, overlap with codium
        ('qodo-merge-pro',    30, 110, 22, 14, 100),  -- starts week 100 (2025)
        -- Sentry family
        ('sentry',            22,  65, 18, 12, 0),
        ('seer-by-sentry',    10,  35,  8,  5, 50),   -- from ~2024
        ('codecov-ai',        12,  40,  9,  6, 50),   -- from ~2024
        -- LinearB family
        ('gitstream',         18,  55, 14,  9, 0),
        ('linearb',           10,  30,  8,  5, 130),  -- late 2025
        -- New AI entrants: start late, low base
        ('claude',            12,  38, 10,  7, 125),
        ('cursor',            10,  32,  8,  5, 120),
        ('windsurf',           8,  25,  7,  4, 125),
        ('openai-codex',      10,  30,  8,  5, 130),
        ('gemini',            11,  35,  9,  6, 120),
        ('augment',            8,  24,  6,  4, 130),
        -- Very new: last 20-40 weeks, very low base
        ('jazzberry',          5,  15,  4,  3, 140),
        ('cubic',              6,  18,  5,  3, 135),
        ('mesa',               4,  12,  3,  2, 145),
        ('baz',                5,  16,  4,  3, 140),
        ('codeant',            7,  20,  5,  3, 130)
    ]) AS bot
);

-- Make codium-pr-agent fade out after week 80 (users migrating to qodo-merge)
-- This is handled by the growth curve naturally going up, but in reality it would decline.
-- We approximate by having it start early with lower growth.

-- Seed human_review_activity
INSERT INTO code_review_trends.human_review_activity (week, review_count, review_comment_count, repo_count)
SELECT
    toDate('2023-01-02') + number * 7 AS week,
    toUInt64(500000 * (1 + number * 0.002) * (1 + (rand() % 20 - 10) / 100.0)) AS review_count,
    toUInt64(1800000 * (1 + number * 0.002) * (1 + (rand() % 20 - 10) / 100.0)) AS review_comment_count,
    toUInt64(350000 * (1 + number * 0.001) * (1 + (rand() % 15 - 7) / 100.0)) AS repo_count
FROM numbers(163);

-- Seed review_reactions with varied sentiment profiles per bot
INSERT INTO code_review_trends.review_reactions (week, bot_id, thumbs_up, thumbs_down, laugh, confused, heart)
SELECT
    toDate(arrayJoin(
        arrayMap(i -> toDate('2023-01-02') + i * 7, range(163))
    )) AS week,
    bot.1 AS bot_id,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.7,
        greatest(0, bot.2 * pow(1.01, (rowNumberInAllBlocks() % 163) - bot.7) * (1 + (rand() % 30 - 15) / 100.0)),
        0)) AS thumbs_up,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.7,
        greatest(0, bot.3 * pow(1.01, (rowNumberInAllBlocks() % 163) - bot.7) * (1 + (rand() % 30 - 15) / 100.0)),
        0)) AS thumbs_down,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.7,
        greatest(0, bot.4 * (1 + (rand() % 50 - 25) / 100.0)),
        0)) AS laugh,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.7,
        greatest(0, bot.5 * (1 + (rand() % 50 - 25) / 100.0)),
        0)) AS confused,
    toUInt64(if(rowNumberInAllBlocks() % 163 >= bot.7,
        greatest(0, bot.6 * pow(1.01, (rowNumberInAllBlocks() % 163) - bot.7) * (1 + (rand() % 30 - 15) / 100.0)),
        0)) AS heart
FROM (
    SELECT arrayJoin([
        -- (bot_id, thumbs_up, thumbs_down, laugh, confused, heart, start_week)
        ('coderabbit',      30, 5, 3, 2, 8,  0),
        ('copilot',         25, 8, 4, 3, 6,  0),
        ('sourcery',        20, 4, 2, 2, 7,  0),
        ('codescene',       10, 2, 1, 1, 3,  0),
        ('ellipsis',         5, 1, 1, 1, 2,  0),
        ('greptile',         8, 2, 1, 1, 3, 10),
        ('graphite',         7, 2, 1, 1, 3,  5),
        ('korbit',           6, 1, 1, 1, 2,  0),
        ('bito',             5, 1, 1, 1, 2, 10),
        ('codium-pr-agent', 14, 3, 1, 1, 5,  0),
        ('qodo-merge',      10, 2, 1, 1, 4, 60),
        ('qodo-merge-pro',  12, 3, 1, 1, 4, 100),
        ('sentry',           8, 2, 1, 1, 3,  0),
        ('seer-by-sentry',   4, 1, 0, 1, 2, 50),
        ('codecov-ai',       5, 1, 0, 1, 2, 50),
        ('gitstream',        7, 2, 1, 1, 3,  0),
        ('linearb',          3, 1, 0, 0, 1, 130),
        ('claude',           6, 1, 1, 1, 3, 125),
        ('cursor',           5, 1, 1, 1, 2, 120),
        ('windsurf',         4, 1, 0, 1, 2, 125),
        ('openai-codex',     5, 1, 1, 1, 2, 130),
        ('gemini',           5, 1, 1, 1, 2, 120),
        ('augment',          3, 1, 0, 0, 1, 130),
        ('jazzberry',        2, 0, 0, 0, 1, 140),
        ('cubic',            3, 1, 0, 0, 1, 135),
        ('mesa',             2, 0, 0, 0, 1, 145),
        ('baz',              2, 0, 0, 0, 1, 140),
        ('codeant',          3, 1, 0, 0, 1, 130)
    ]) AS bot
);

-- Seed repo_bot_usage for top repos per bot
INSERT INTO code_review_trends.repo_bot_usage (repo_full_name, bot_id, first_seen, last_seen, total_reviews, stars)
SELECT
    concat(orgs.1, '/', repos.1) AS repo_full_name,
    bot.1 AS bot_id,
    toDate('2023-01-02') + rand() % 365 AS first_seen,
    toDate('2026-01-01') + rand() % 45 AS last_seen,
    toUInt64(50 + rand() % 500) AS total_reviews,
    toUInt32(100 + rand() % 50000) AS stars
FROM (
    SELECT arrayJoin([
        ('coderabbit',), ('copilot',), ('codescene',), ('sourcery',),
        ('ellipsis',), ('codium-pr-agent',), ('qodo-merge',), ('qodo-merge-pro',),
        ('greptile',), ('sentry',), ('seer-by-sentry',), ('codecov-ai',),
        ('baz',), ('graphite',), ('codeant',), ('windsurf',), ('cubic',),
        ('cursor',), ('gemini',), ('bito',), ('korbit',), ('claude',),
        ('openai-codex',), ('jazzberry',), ('mesa',), ('gitstream',),
        ('linearb',), ('augment',)
    ]) AS bot
) AS bots
CROSS JOIN (
    SELECT arrayJoin([
        ('facebook',), ('google',), ('microsoft',), ('apache',), ('vercel',),
        ('supabase',), ('tailwindlabs',), ('prisma',), ('remix-run',), ('astro',),
        ('sveltejs',), ('vuejs',), ('angular',), ('nestjs',), ('strapi',)
    ]) AS orgs
) AS orgs_t
CROSS JOIN (
    SELECT arrayJoin([
        ('react',), ('next.js',), ('typescript',), ('vscode',), ('deno',),
        ('bun',), ('astro',), ('sveltekit',)
    ]) AS repos
) AS repos_t
WHERE rand() % 3 = 0;
