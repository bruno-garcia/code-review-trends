-- Bot reference data — products, bots, and bot_logins.
-- Must match pipeline/src/bots.ts. Applied to ALL environments (local, CI, staging, prod).
-- The bots.test.ts test validates consistency between this file and the TypeScript registry.
--
-- TRUNCATE + INSERT ensures re-running this file is fully idempotent.
-- These are small reference tables so the cost is negligible.

-- Products

TRUNCATE TABLE IF EXISTS code_review_trends.products;

INSERT INTO code_review_trends.products (id, name, website, description, brand_color, avatar_url) VALUES
    ('coderabbit', 'CodeRabbit', 'https://coderabbit.ai', 'AI code review agent that provides contextual feedback on pull requests.', '#f97316', 'https://avatars.githubusercontent.com/in/347564?v=4'),
    ('copilot', 'GitHub Copilot', 'https://github.com/features/copilot', 'GitHub''s AI pair programmer, also provides code review suggestions.', '#e5e7eb', 'https://avatars.githubusercontent.com/in/946600?v=4'),
    ('codescene', 'CodeScene', 'https://codescene.com', 'Behavioral code analysis and AI code review.', '#5f72ee', 'https://avatars.githubusercontent.com/u/38929568?v=4'),
    ('sourcery', 'Sourcery', 'https://sourcery.ai', 'AI code reviewer focused on code quality and refactoring.', '#65a30d', 'https://avatars.githubusercontent.com/in/48477?v=4'),
    ('ellipsis', 'Ellipsis', 'https://ellipsis.dev', 'AI-powered code review and bug detection.', '#06b6d4', 'https://avatars.githubusercontent.com/in/64358?v=4'),
    ('qodo', 'Qodo', 'https://qodo.ai', 'AI agent for code integrity — reviews, tests, and suggestions.', '#9d75f8', 'https://avatars.githubusercontent.com/in/484649?v=4'),
    ('greptile', 'Greptile', 'https://greptile.com', 'AI code review that understands your entire codebase.', '#22c55e', 'https://avatars.githubusercontent.com/in/867647?v=4'),
    ('sentry', 'Sentry', 'https://sentry.io', 'Application monitoring platform with AI-powered code review and error tracking.', '#9589c4', 'https://avatars.githubusercontent.com/u/1396951?v=4'),
    ('baz', 'Baz', 'https://baz.co', 'AI code reviewer for fast, actionable pull request feedback.', '#39FF14', 'https://avatars.githubusercontent.com/in/933528?s=60&v=4'),
    ('graphite', 'Graphite', 'https://graphite.dev', 'Developer productivity platform with AI-assisted code review.', '#5b8ef0', 'https://avatars.githubusercontent.com/in/158384?v=4'),
    ('codeant', 'CodeAnt', 'https://codeant.ai', 'AI code review tool that catches bugs and anti-patterns.', '#a855f7', 'https://avatars.githubusercontent.com/in/646884?v=4'),
    ('windsurf', 'Windsurf', 'https://windsurf.com', 'AI-powered code review with deep codebase understanding.', '#0d9488', 'https://avatars.githubusercontent.com/in/1066231?v=4'),
    ('cubic', 'Cubic', 'https://cubic.dev', 'AI development assistant with automated code review.', '#edc00c', 'https://avatars.githubusercontent.com/in/1082092?v=4'),
    ('cursor', 'Cursor Bugbot', 'https://cursor.com', 'AI code editor with automated bug detection on pull requests.', '#e84e4e', 'https://avatars.githubusercontent.com/in/1210556?v=4'),
    ('gemini', 'Gemini Code Assist', 'https://cloud.google.com/gemini/docs/codeassist/overview', 'Google''s AI code assistant with automated pull request reviews.', '#ec4899', 'https://avatars.githubusercontent.com/in/956858?v=4'),
    ('bito', 'Bito', 'https://bito.ai', 'AI code review assistant powered by large language models.', '#94a3b8', 'https://avatars.githubusercontent.com/in/1061978?v=4'),
    ('korbit', 'Korbit', 'https://korbit.ai', 'AI code review mentor that helps teams improve code quality.', '#b07838', 'https://avatars.githubusercontent.com/in/322216?v=4'),
    ('claude', 'Claude', 'https://claude.ai', 'Anthropic''s AI assistant with code review capabilities on GitHub.', '#FF9F1C', 'https://avatars.githubusercontent.com/in/1236702?v=4'),
    ('openai-codex', 'OpenAI Codex', 'https://openai.com/codex', 'OpenAI''s coding agent with automated pull request reviews.', '#808080', 'https://avatars.githubusercontent.com/in/1144995?s=60&v=4'),
    ('jazzberry', 'Jazzberry', 'https://jazzberry.ai', 'AI code review tool for automated feedback on pull requests.', '#d44d7f', 'https://avatars.githubusercontent.com/in/1231820?v=4'),
    ('mesa', 'Mesa', 'https://mesa.dev', 'AI-powered development workflow with code review automation.', '#c06a33', 'https://avatars.githubusercontent.com/in/1050077?v=4'),
    ('linearb', 'LinearB', 'https://linearb.io', 'Dev workflow platform with gitStream automation and AI-powered code review.', '#a37ce2', 'https://avatars.githubusercontent.com/in/1658443?v=4'),
    ('augment', 'Augment Code', 'https://augmentcode.com', 'AI coding assistant with automated code review on pull requests.', '#968CFF', 'https://avatars.githubusercontent.com/in/1027498?v=4'),
    ('kodus', 'Kodus AI', 'https://kodus.ai', 'AI code review assistant for automated pull request feedback.', '#6366f1', 'https://avatars.githubusercontent.com/u/148880201?v=4'),
    ('corgea', 'Corgea', 'https://corgea.com', 'AI-powered security code review that finds and fixes vulnerabilities.', '#10b981', 'https://avatars.githubusercontent.com/in/673913?v=4');

-- Bots

TRUNCATE TABLE IF EXISTS code_review_trends.bots;

INSERT INTO code_review_trends.bots (id, name, product_id, website, description, brand_color, avatar_url) VALUES
    ('coderabbit', 'CodeRabbit', 'coderabbit', 'https://coderabbit.ai', 'AI code review agent that provides contextual feedback on pull requests.', '#f97316', 'https://avatars.githubusercontent.com/in/347564?v=4'),
    ('copilot', 'GitHub Copilot', 'copilot', 'https://github.com/features/copilot', 'GitHub''s AI pair programmer, also provides code review suggestions.', '#e5e7eb', 'https://avatars.githubusercontent.com/in/946600?v=4'),
    ('codescene', 'CodeScene', 'codescene', 'https://codescene.com', 'Behavioral code analysis and AI code review.', '#5f72ee', 'https://avatars.githubusercontent.com/u/38929568?v=4'),
    ('sourcery', 'Sourcery', 'sourcery', 'https://sourcery.ai', 'AI code reviewer focused on code quality and refactoring.', '#65a30d', 'https://avatars.githubusercontent.com/in/48477?v=4'),
    ('ellipsis', 'Ellipsis', 'ellipsis', 'https://ellipsis.dev', 'AI-powered code review and bug detection.', '#06b6d4', 'https://avatars.githubusercontent.com/in/64358?v=4'),
    ('codium-pr-agent', 'Qodo (CodiumAI PR Agent)', 'qodo', 'https://qodo.ai', 'Legacy CodiumAI PR agent, now part of Qodo''s code review suite.', '#9d75f8', 'https://avatars.githubusercontent.com/u/54746889?v=4'),
    ('qodo-merge', 'Qodo Merge', 'qodo', 'https://qodo.ai', 'Qodo''s AI-powered pull request merge assistant.', '#9d75f8', 'https://avatars.githubusercontent.com/u/104026966?v=4'),
    ('qodo-merge-pro', 'Qodo Merge Pro', 'qodo', 'https://qodo.ai', 'AI agent for code integrity — reviews, tests, and suggestions.', '#9d75f8', 'https://avatars.githubusercontent.com/in/484649?v=4'),
    ('greptile', 'Greptile', 'greptile', 'https://greptile.com', 'AI code review that understands your entire codebase.', '#22c55e', 'https://avatars.githubusercontent.com/in/867647?v=4'),
    ('sentry', 'Sentry', 'sentry', 'https://sentry.io', 'Sentry''s GitHub bot for issue linking, code review, and error tracking.', '#9589c4', 'https://avatars.githubusercontent.com/u/1396951?v=4'),
    ('seer-by-sentry', 'Seer by Sentry', 'sentry', 'https://sentry.io', 'Sentry''s AI agent for automated root cause analysis.', '#9589c4', 'https://avatars.githubusercontent.com/in/801464?v=4'),
    ('codecov-ai', 'Codecov AI', 'sentry', 'https://codecov.io', 'Codecov''s AI-powered code review for test coverage insights.', '#9589c4', 'https://avatars.githubusercontent.com/in/797565?v=4'),
    ('baz', 'Baz', 'baz', 'https://baz.co', 'AI code reviewer for fast, actionable pull request feedback.', '#39FF14', 'https://avatars.githubusercontent.com/in/933528?s=60&v=4'),
    ('graphite', 'Graphite', 'graphite', 'https://graphite.dev', 'Developer productivity platform with AI-assisted code review.', '#5b8ef0', 'https://avatars.githubusercontent.com/in/158384?v=4'),
    ('codeant', 'CodeAnt', 'codeant', 'https://codeant.ai', 'AI code review tool that catches bugs and anti-patterns.', '#a855f7', 'https://avatars.githubusercontent.com/in/646884?v=4'),
    ('windsurf', 'Windsurf', 'windsurf', 'https://windsurf.com', 'AI-powered code review with deep codebase understanding.', '#0d9488', 'https://avatars.githubusercontent.com/in/1066231?v=4'),
    ('cubic', 'Cubic', 'cubic', 'https://cubic.dev', 'AI development assistant with automated code review.', '#edc00c', 'https://avatars.githubusercontent.com/in/1082092?v=4'),
    ('cursor', 'Cursor Bugbot', 'cursor', 'https://cursor.com', 'AI code editor with automated bug detection on pull requests.', '#e84e4e', 'https://avatars.githubusercontent.com/in/1210556?v=4'),
    ('gemini', 'Gemini Code Assist', 'gemini', 'https://cloud.google.com/gemini/docs/codeassist/overview', 'Google''s AI code assistant with automated pull request reviews.', '#ec4899', 'https://avatars.githubusercontent.com/in/956858?v=4'),
    ('bito', 'Bito', 'bito', 'https://bito.ai', 'AI code review assistant powered by large language models.', '#94a3b8', 'https://avatars.githubusercontent.com/in/1061978?v=4'),
    ('korbit', 'Korbit', 'korbit', 'https://korbit.ai', 'AI code review mentor that helps teams improve code quality.', '#b07838', 'https://avatars.githubusercontent.com/in/322216?v=4'),
    ('claude', 'Claude', 'claude', 'https://claude.ai', 'Anthropic''s AI assistant with code review capabilities on GitHub.', '#FF9F1C', 'https://avatars.githubusercontent.com/in/1236702?v=4'),
    ('openai-codex', 'OpenAI Codex', 'openai-codex', 'https://openai.com/codex', 'OpenAI''s coding agent with automated pull request reviews.', '#808080', 'https://avatars.githubusercontent.com/in/1144995?s=60&v=4'),
    ('jazzberry', 'Jazzberry', 'jazzberry', 'https://jazzberry.ai', 'AI code review tool for automated feedback on pull requests.', '#d44d7f', 'https://avatars.githubusercontent.com/in/1231820?v=4'),
    ('mesa', 'Mesa', 'mesa', 'https://mesa.dev', 'AI-powered development workflow with code review automation.', '#c06a33', 'https://avatars.githubusercontent.com/in/1050077?v=4'),
    ('gitstream', 'gitStream', 'linearb', 'https://linearb.io', 'LinearB''s workflow automation bot for continuous merge management.', '#a37ce2', 'https://avatars.githubusercontent.com/ml/13414?v=4'),
    ('linearb', 'LinearB', 'linearb', 'https://linearb.io', 'LinearB''s GitHub bot for dev workflow insights and code review.', '#a37ce2', 'https://avatars.githubusercontent.com/in/1658443?v=4'),
    ('augment', 'Augment Code', 'augment', 'https://augmentcode.com', 'AI coding assistant with automated code review on pull requests.', '#968CFF', 'https://avatars.githubusercontent.com/in/1027498?v=4'),
    ('kodus', 'Kodus AI', 'kodus', 'https://kodus.ai', 'AI code review assistant for automated pull request feedback.', '#6366f1', 'https://avatars.githubusercontent.com/u/148880201?v=4'),
    ('corgea', 'Corgea', 'corgea', 'https://corgea.com', 'AI-powered security code review that finds and fixes vulnerabilities.', '#10b981', 'https://avatars.githubusercontent.com/in/673913?v=4');

-- Bot logins (GitHub usernames)

TRUNCATE TABLE IF EXISTS code_review_trends.bot_logins;

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
    ('augment', 'augmentcode[bot]'),
    ('kodus', 'kodus-ai[bot]'),
    ('corgea', 'corgea[bot]');

