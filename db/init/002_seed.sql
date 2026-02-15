-- Seed bots — must match pipeline/src/bots.ts (the source of truth)
INSERT INTO code_review_trends.bots (id, name, website, description) VALUES
    ('coderabbit', 'CodeRabbit', 'https://coderabbit.ai', 'AI code review agent that provides contextual feedback on pull requests.'),
    ('copilot', 'GitHub Copilot', 'https://github.com/features/copilot', 'GitHub''s AI pair programmer, also provides code review suggestions.'),
    ('codescene', 'CodeScene', 'https://codescene.com', 'Behavioral code analysis and AI code review.'),
    ('sourcery', 'Sourcery', 'https://sourcery.ai', 'AI code reviewer focused on code quality and refactoring.'),
    ('ellipsis', 'Ellipsis', 'https://ellipsis.dev', 'AI-powered code review and bug detection.'),
    ('qodo', 'Qodo (formerly CodiumAI)', 'https://www.qodo.ai', 'AI agent for code integrity — reviews, tests, and suggestions.'),
    ('greptile', 'Greptile', 'https://greptile.com', 'AI code review that understands your entire codebase.');

-- Seed bot logins — must match pipeline/src/bots.ts (the source of truth)
INSERT INTO code_review_trends.bot_logins (bot_id, github_login) VALUES
    ('coderabbit', 'coderabbitai[bot]'),
    ('copilot', 'copilot-pull-request-reviewer[bot]'),
    ('codescene', 'codescene-delta-analysis[bot]'),
    ('sourcery', 'sourcery-ai[bot]'),
    ('ellipsis', 'ellipsis-dev[bot]'),
    ('qodo', 'qodo-merge-pro[bot]'),
    ('greptile', 'greptile-apps[bot]');

-- Seed review_activity with fake weekly data (2023-01 to 2026-02)
-- Each bot has distinct growth curves and org/repo ratios

INSERT INTO code_review_trends.review_activity (week, bot_id, review_count, review_comment_count, repo_count, org_count)
SELECT
    toDate(arrayJoin(
        arrayMap(i -> toDate('2023-01-02') + i * 7, range(163))
    )) AS week,
    bot.1 AS bot_id,
    toUInt64(greatest(0, bot.2 * pow(1.015, rowNumberInAllBlocks() % 163) * (1 + (rand() % 40 - 20) / 100.0))) AS review_count,
    toUInt64(greatest(0, bot.3 * pow(1.015, rowNumberInAllBlocks() % 163) * (1 + (rand() % 40 - 20) / 100.0))) AS review_comment_count,
    toUInt64(greatest(1, bot.4 * pow(1.012, rowNumberInAllBlocks() % 163) * (1 + (rand() % 30 - 15) / 100.0))) AS repo_count,
    toUInt64(greatest(1, bot.5 * pow(1.010, rowNumberInAllBlocks() % 163) * (1 + (rand() % 25 - 12) / 100.0))) AS org_count
FROM (
    SELECT arrayJoin([
        ('coderabbit',  120, 450, 80,  35),
        ('copilot',     80,  200, 60,  40),
        ('codescene',   25,  80,  20,  14),
        ('sourcery',    60,  220, 45,  25),
        ('ellipsis',    15,  50,  12,  8),
        ('qodo',        35,  130, 28,  16),
        ('greptile',    20,  70,  15,  10)
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

-- Seed review_reactions with varied sentiment profiles per bot
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
        ('codescene',   10, 2,  1, 1, 3),
        ('sourcery',    20, 4,  2, 2, 7),
        ('ellipsis',    5,  1,  1, 1, 2),
        ('qodo',        14, 3,  1, 1, 5),
        ('greptile',    8,  2,  1, 1, 3)
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
        ('coderabbit',), ('copilot',), ('codescene',),
        ('sourcery',), ('ellipsis',), ('qodo',), ('greptile',)
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

-- =============================================================================
-- Seed data for entity-level tables (repos, repo_languages, pull_requests,
-- pr_comments, pr_bot_events)
-- =============================================================================

-- Seed repos (~30 repos from popular orgs)
INSERT INTO code_review_trends.repos (name, owner, stars, primary_language, fork, archived, fetch_status)
SELECT
    concat(r.1, '/', r.2) AS name,
    r.1 AS owner,
    r.3 AS stars,
    r.4 AS primary_language,
    false AS fork,
    false AS archived,
    'ok' AS fetch_status
FROM (
    SELECT arrayJoin([
        ('facebook',    'react',          228000, 'JavaScript'),
        ('facebook',    'docusaurus',      57000, 'TypeScript'),
        ('facebook',    'relay',           18000, 'TypeScript'),
        ('google',      'material-design', 68000, 'TypeScript'),
        ('google',      'zx',             43000, 'TypeScript'),
        ('google',      'guava',          50000, 'Java'),
        ('vercel',      'next.js',        130000, 'TypeScript'),
        ('vercel',      'turbo',           27000, 'Rust'),
        ('vercel',      'swr',            30000, 'TypeScript'),
        ('microsoft',   'vscode',         167000, 'TypeScript'),
        ('microsoft',   'TypeScript',     102000, 'TypeScript'),
        ('microsoft',   'playwright',      68000, 'TypeScript'),
        ('supabase',    'supabase',        75000, 'TypeScript'),
        ('supabase',    'realtime',         7000, 'Elixir'),
        ('prisma',      'prisma',          40000, 'TypeScript'),
        ('tailwindlabs','tailwindcss',      85000, 'TypeScript'),
        ('remix-run',   'remix',           30000, 'TypeScript'),
        ('sveltejs',    'svelte',          80000, 'JavaScript'),
        ('sveltejs',    'kit',             19000, 'JavaScript'),
        ('vuejs',       'core',            48000, 'TypeScript'),
        ('angular',     'angular',         97000, 'TypeScript'),
        ('nestjs',      'nest',            69000, 'TypeScript'),
        ('strapi',      'strapi',          65000, 'JavaScript'),
        ('denoland',    'deno',            98000, 'Rust'),
        ('oven-sh',     'bun',             75000, 'Zig'),
        ('astro-build', 'astro',           48000, 'TypeScript'),
        ('pallets',     'flask',           69000, 'Python'),
        ('django',      'django',          82000, 'Python'),
        ('golang',      'go',             125000, 'Go'),
        ('rust-lang',   'rust',            99000, 'Rust')
    ]) AS r
);

-- Seed repo_languages (~100 rows, 2-5 languages per repo)
INSERT INTO code_review_trends.repo_languages (repo_name, language, bytes)
SELECT
    l.1 AS repo_name,
    l.2 AS language,
    l.3 AS bytes
FROM (
    SELECT arrayJoin([
        ('facebook/react',          'JavaScript', 4200000),
        ('facebook/react',          'TypeScript',  800000),
        ('facebook/react',          'CSS',         120000),
        ('facebook/docusaurus',     'TypeScript', 3500000),
        ('facebook/docusaurus',     'JavaScript',  600000),
        ('facebook/docusaurus',     'CSS',         400000),
        ('facebook/relay',          'TypeScript', 2800000),
        ('facebook/relay',          'JavaScript',  500000),
        ('google/material-design',  'TypeScript', 5000000),
        ('google/material-design',  'CSS',        1200000),
        ('google/material-design',  'HTML',        300000),
        ('google/zx',              'TypeScript', 1800000),
        ('google/zx',              'JavaScript',  200000),
        ('google/guava',           'Java',       8500000),
        ('google/guava',           'Shell',        50000),
        ('vercel/next.js',         'TypeScript', 8000000),
        ('vercel/next.js',         'JavaScript', 3000000),
        ('vercel/next.js',         'Rust',        500000),
        ('vercel/next.js',         'CSS',         200000),
        ('vercel/turbo',           'Rust',       6000000),
        ('vercel/turbo',           'TypeScript', 1000000),
        ('vercel/turbo',           'Go',          500000),
        ('vercel/swr',             'TypeScript', 1200000),
        ('vercel/swr',             'JavaScript',  150000),
        ('microsoft/vscode',       'TypeScript',15000000),
        ('microsoft/vscode',       'JavaScript', 2000000),
        ('microsoft/vscode',       'CSS',        1500000),
        ('microsoft/vscode',       'HTML',        800000),
        ('microsoft/TypeScript',   'TypeScript',12000000),
        ('microsoft/TypeScript',   'JavaScript', 1000000),
        ('microsoft/playwright',   'TypeScript', 9000000),
        ('microsoft/playwright',   'JavaScript', 1500000),
        ('microsoft/playwright',   'Python',      800000),
        ('microsoft/playwright',   'C#',          700000),
        ('supabase/supabase',      'TypeScript', 5000000),
        ('supabase/supabase',      'JavaScript',  800000),
        ('supabase/supabase',      'CSS',         300000),
        ('supabase/realtime',      'Elixir',     2000000),
        ('supabase/realtime',      'JavaScript',  200000),
        ('prisma/prisma',          'TypeScript', 7000000),
        ('prisma/prisma',          'Rust',       3000000),
        ('prisma/prisma',          'JavaScript',  500000),
        ('tailwindlabs/tailwindcss','TypeScript', 3000000),
        ('tailwindlabs/tailwindcss','JavaScript', 1000000),
        ('tailwindlabs/tailwindcss','CSS',        2000000),
        ('remix-run/remix',        'TypeScript', 4000000),
        ('remix-run/remix',        'JavaScript',  600000),
        ('sveltejs/svelte',        'JavaScript', 3500000),
        ('sveltejs/svelte',        'TypeScript', 1500000),
        ('sveltejs/kit',           'JavaScript', 2500000),
        ('sveltejs/kit',           'TypeScript',  800000),
        ('vuejs/core',             'TypeScript', 5000000),
        ('vuejs/core',             'JavaScript',  400000),
        ('angular/angular',        'TypeScript',10000000),
        ('angular/angular',        'JavaScript',  500000),
        ('angular/angular',        'HTML',        300000),
        ('nestjs/nest',            'TypeScript', 6000000),
        ('nestjs/nest',            'JavaScript',  300000),
        ('strapi/strapi',          'JavaScript', 4000000),
        ('strapi/strapi',          'TypeScript', 2000000),
        ('denoland/deno',          'Rust',       8000000),
        ('denoland/deno',          'TypeScript', 2000000),
        ('denoland/deno',          'JavaScript',  500000),
        ('oven-sh/bun',            'Zig',       10000000),
        ('oven-sh/bun',            'TypeScript', 1000000),
        ('oven-sh/bun',            'C++',         800000),
        ('astro-build/astro',      'TypeScript', 4500000),
        ('astro-build/astro',      'JavaScript',  700000),
        ('astro-build/astro',      'CSS',         200000),
        ('pallets/flask',          'Python',     2500000),
        ('pallets/flask',          'HTML',        100000),
        ('django/django',          'Python',    12000000),
        ('django/django',          'JavaScript',  300000),
        ('django/django',          'HTML',        800000),
        ('golang/go',              'Go',        15000000),
        ('golang/go',              'Assembly',   1000000),
        ('golang/go',              'HTML',        200000),
        ('rust-lang/rust',         'Rust',      20000000),
        ('rust-lang/rust',         'Python',      500000),
        ('rust-lang/rust',         'Shell',       200000)
    ]) AS l
);

-- Seed pull_requests (~200 PRs spread across repos)
-- Generate PRs using a cross join of repos and PR numbers
INSERT INTO code_review_trends.pull_requests (repo_name, pr_number, title, author, state, created_at, merged_at, closed_at, additions, deletions, changed_files)
SELECT
    r.1 AS repo_name,
    toUInt32(1000 + rowNumberInAllBlocks() * 7 + rand() % 100) AS pr_number,
    arrayElement(
        ['fix: resolve race condition in startup',
         'feat: add dark mode support',
         'refactor: simplify error handling',
         'chore: update dependencies',
         'fix: handle null response gracefully',
         'feat: implement caching layer',
         'docs: update API reference',
         'perf: optimize database queries',
         'feat: add webhook support',
         'fix: correct timezone handling',
         'refactor: extract shared utilities',
         'feat: add pagination to list endpoint',
         'fix: prevent memory leak in watcher',
         'chore: migrate to new CI pipeline',
         'feat: add rate limiting middleware'],
        1 + rand() % 15
    ) AS title,
    arrayElement(
        ['dependabot[bot]', 'renovate[bot]', 'alice', 'bob', 'charlie',
         'diana', 'eve', 'frank', 'grace', 'hank'],
        1 + rand() % 10
    ) AS author,
    if(rand() % 10 < 7, 'merged', if(rand() % 10 < 9, 'closed', 'open')) AS state,
    toDateTime('2023-03-01 10:00:00') + toIntervalSecond(rand() % 94608000) AS created_at,
    if(state = 'merged',
       created_at + toIntervalSecond(3600 + rand() % 604800),
       null) AS merged_at,
    if(state != 'open',
       created_at + toIntervalSecond(3600 + rand() % 604800),
       null) AS closed_at,
    toUInt32(5 + rand() % 2000) AS additions,
    toUInt32(2 + rand() % 800) AS deletions,
    toUInt32(1 + rand() % 50) AS changed_files
FROM (
    SELECT arrayJoin([
        ('facebook/react',),         ('facebook/react',),         ('facebook/react',),
        ('facebook/docusaurus',),    ('facebook/docusaurus',),
        ('google/material-design',), ('google/material-design',),
        ('google/zx',),              ('google/guava',),
        ('vercel/next.js',),         ('vercel/next.js',),         ('vercel/next.js',),
        ('vercel/next.js',),         ('vercel/turbo',),           ('vercel/turbo',),
        ('vercel/swr',),
        ('microsoft/vscode',),       ('microsoft/vscode',),       ('microsoft/vscode',),
        ('microsoft/TypeScript',),   ('microsoft/TypeScript',),
        ('microsoft/playwright',),   ('microsoft/playwright',),
        ('supabase/supabase',),      ('supabase/supabase',),
        ('prisma/prisma',),          ('prisma/prisma',),
        ('tailwindlabs/tailwindcss',),
        ('remix-run/remix',),        ('remix-run/remix',),
        ('sveltejs/svelte',),        ('sveltejs/kit',),
        ('vuejs/core',),             ('vuejs/core',),
        ('angular/angular',),        ('angular/angular',),
        ('nestjs/nest',),            ('nestjs/nest',),
        ('strapi/strapi',),
        ('denoland/deno',),          ('denoland/deno',),
        ('oven-sh/bun',),            ('oven-sh/bun',),
        ('astro-build/astro',),      ('astro-build/astro',),
        ('pallets/flask',),
        ('django/django',),          ('django/django',),
        ('golang/go',),              ('golang/go',),
        ('rust-lang/rust',),         ('rust-lang/rust',)
    ]) AS r
) AS repos_t
-- Multiply each repo entry by ~4 PRs
CROSS JOIN (SELECT arrayJoin(range(4)) AS n) AS multiplier;

-- Seed pr_comments (~500 comments spread across PRs)
-- We reference pr_numbers from pull_requests via a subquery pattern
INSERT INTO code_review_trends.pr_comments (repo_name, pr_number, comment_id, bot_id, body_length, created_at, thumbs_up, thumbs_down, laugh, confused, heart, hooray, eyes, rocket)
SELECT
    pr.repo_name,
    pr.pr_number,
    toUInt64(100000 + rowNumberInAllBlocks() * 13 + rand() % 1000) AS comment_id,
    arrayElement(
        ['coderabbit', 'copilot', 'sourcery', 'codescene', 'ellipsis', 'qodo', 'greptile'],
        1 + rand() % 7
    ) AS bot_id,
    toUInt32(50 + rand() % 5000) AS body_length,
    pr.created_at + toIntervalSecond(600 + rand() % 172800) AS created_at,
    -- Reactions: mostly 0, some with 1-5, rare higher
    toUInt32(if(rand() % 3 = 0, rand() % 6, 0)) AS thumbs_up,
    toUInt32(if(rand() % 10 = 0, rand() % 3, 0)) AS thumbs_down,
    toUInt32(if(rand() % 15 = 0, rand() % 2, 0)) AS laugh,
    toUInt32(if(rand() % 20 = 0, rand() % 2, 0)) AS confused,
    toUInt32(if(rand() % 8 = 0, rand() % 4, 0)) AS heart,
    toUInt32(if(rand() % 15 = 0, rand() % 2, 0)) AS hooray,
    toUInt32(if(rand() % 10 = 0, rand() % 3, 0)) AS eyes,
    toUInt32(if(rand() % 12 = 0, rand() % 3, 0)) AS rocket
FROM code_review_trends.pull_requests AS pr
-- ~2.5 comments per PR on average
CROSS JOIN (SELECT arrayJoin([1, 2, 3]) AS comment_num) AS c
WHERE rand() % 10 < 8;

-- Seed pr_bot_events (~300 rows, one per repo/PR/bot combination)
INSERT INTO code_review_trends.pr_bot_events (repo_name, pr_number, bot_id, actor_login, event_type, event_week)
SELECT
    pc.repo_name,
    pc.pr_number,
    pc.bot_id,
    bl.github_login AS actor_login,
    if(rand() % 2 = 0, 'PullRequestReviewEvent', 'PullRequestReviewCommentEvent') AS event_type,
    toMonday(pc.created_at) AS event_week
FROM code_review_trends.pr_comments AS pc
INNER JOIN code_review_trends.bot_logins AS bl ON pc.bot_id = bl.bot_id
GROUP BY pc.repo_name, pc.pr_number, pc.bot_id, bl.github_login, event_type, event_week;
