-- Bot reference data — products, bots, and bot_logins.
-- Must match pipeline/src/bots.ts. Applied to ALL environments (local, CI, staging, prod).
-- The bots.test.ts test validates consistency between this file and the TypeScript registry.
--
-- TRUNCATE + INSERT ensures re-running this file is fully idempotent.
-- These are small reference tables so the cost is negligible.

-- Products

TRUNCATE TABLE IF EXISTS code_review_trends.products;

INSERT INTO code_review_trends.products (id, name, website, description, docs_url, brand_color, avatar_url) VALUES
    ('coderabbit', 'CodeRabbit', 'https://coderabbit.ai', 'AI-first code review agent. Auto-summarizes PRs, provides line-by-line feedback, and learns from your preferences over time. Supports custom review instructions and integrates with Jira, Linear, and GitHub Issues.', 'https://docs.coderabbit.ai', '#f97316', 'https://avatars.githubusercontent.com/in/347564?v=4'),
    ('copilot', 'GitHub Copilot', 'https://github.com/features/copilot', 'GitHub''s native AI pair programmer. Provides inline code review suggestions directly in the GitHub pull request UI. Part of the Copilot suite that includes code completion, chat, and workspace features.', 'https://docs.github.com/en/copilot', '#58a6ff', 'https://avatars.githubusercontent.com/in/946600?v=4'),
    ('codescene', 'CodeScene', 'https://codescene.com', 'Behavioral code analysis platform. Identifies code health issues, complexity hotspots, and technical debt trends. Combines static analysis with version control history to prioritize refactoring efforts.', 'https://codescene.io/docs', '#5f72ee', 'https://avatars.githubusercontent.com/in/53921?v=4'),
    ('sourcery', 'Sourcery', 'https://sourcery.ai', 'AI code reviewer focused on code quality and refactoring. Enforces coding standards, suggests simplifications, and provides an overall quality score for each PR. Strong Python and JavaScript support.', 'https://docs.sourcery.ai', '#65a30d', 'https://avatars.githubusercontent.com/in/48477?v=4'),
    ('ellipsis', 'Ellipsis', 'https://ellipsis.dev', 'AI-powered code review and bug detection with configurable review rules. Auto-reviews PRs for bugs, security issues, and style violations. Supports custom prompts and per-repo configuration.', 'https://docs.ellipsis.dev', '#06b6d4', 'https://avatars.githubusercontent.com/in/64358?v=4'),
    ('qodo', 'Qodo', 'https://qodo.ai', 'Code integrity platform (formerly CodiumAI). Generates tests, reviews PRs, and provides suggestions for improving code quality. Focuses on test coverage and code correctness with IDE and CI integrations.', 'https://qodo-merge-docs.qodo.ai', '#9d75f8', 'https://avatars.githubusercontent.com/in/484649?v=4'),
    ('greptile', 'Greptile', 'https://greptile.com', 'Codebase-aware AI code review. Indexes your entire repository for context-rich feedback that understands architecture, patterns, and conventions specific to your project.', 'https://docs.greptile.com', '#22c55e', 'https://avatars.githubusercontent.com/in/867647?v=4'),
    ('sentry', 'Sentry', 'https://sentry.io', 'Application monitoring and error tracking platform. PR review is part of Seer, Sentry''s AI debugger, which uses production context — errors, traces, logs, and commit history — to catch breaking changes before they ship. Seer also automatically root causes issues in production and can open fix PRs for live errors.', 'https://docs.sentry.io', '#9589c4', 'https://avatars.githubusercontent.com/u/1396951?v=4'),
    ('baz', 'Baz', 'https://baz.co', 'AI code reviewer for fast, actionable PR feedback. Focuses on catching real bugs before merge with minimal noise. Designed for teams that want signal over volume in code review.', 'https://docs.baz.co', '#39FF14', 'https://avatars.githubusercontent.com/in/933528?s=60&v=4'),
    ('graphite', 'Graphite', 'https://graphite.dev', 'Developer productivity platform with stacked PRs, merge queues, and AI-assisted code review. Reviewer automatically summarizes changes and provides feedback to speed up the review cycle.', 'https://graphite.dev/docs', '#5b8ef0', 'https://avatars.githubusercontent.com/in/158384?v=4'),
    ('codeant', 'CodeAnt', 'https://codeant.ai', 'AI code review and static analysis tool. Catches bugs, anti-patterns, and security issues across 30+ languages. Provides auto-fix suggestions and integrates with GitHub, GitLab, and Bitbucket.', 'https://docs.codeant.ai', '#a855f7', 'https://avatars.githubusercontent.com/in/646884?v=4'),
    ('windsurf', 'Windsurf', 'https://windsurf.com', 'AI-powered development platform (formerly Codeium). IDE-first experience with deep codebase understanding. PR review feature analyzes changes in the context of your full repository.', 'https://docs.windsurf.com', '#0d9488', 'https://avatars.githubusercontent.com/in/1066231?v=4'),
    ('cubic', 'Cubic', 'https://cubic.dev', 'AI development assistant with automated code review. Reviews PRs for correctness, suggests improvements, and helps maintain code quality standards across your team.', 'https://docs.cubic.dev', '#edc00c', 'https://avatars.githubusercontent.com/in/1082092?v=4'),
    ('cursor', 'Cursor Bugbot', 'https://cursor.com', 'PR review feature from the Cursor AI code editor. Bugbot scans pull requests for potential bugs and suggests fixes, bringing Cursor''s code understanding to the review workflow.', 'https://docs.cursor.com', '#e84e4e', 'https://avatars.githubusercontent.com/in/1210556?v=4'),
    ('gemini', 'Gemini Code Assist', 'https://cloud.google.com/gemini/docs/codeassist/overview', 'Google''s AI code assistant. Reviews pull requests with suggestions for improvements, security fixes, and best practices. Part of Google Cloud''s developer tools suite with enterprise integration.', 'https://cloud.google.com/gemini/docs/codeassist/overview', '#ec4899', 'https://avatars.githubusercontent.com/in/956858?v=4'),
    ('bito', 'Bito', 'https://bito.ai', 'AI code review assistant powered by large language models. Provides PR summaries, security analysis, performance suggestions, and code explanations. Supports custom review checklists.', 'https://docs.bito.ai', '#94a3b8', 'https://avatars.githubusercontent.com/in/1061978?v=4'),
    ('korbit', 'Korbit', 'https://korbit.ai', 'AI code review mentor. Goes beyond catching bugs — provides educational feedback that helps developers learn and improve. Focuses on teaching best practices during the review process.', 'https://docs.korbit.ai', '#b07838', 'https://avatars.githubusercontent.com/in/322216?v=4'),
    ('claude', 'Claude', 'https://claude.ai', 'Anthropic''s AI assistant with GitHub integration. Provides thoughtful, in-depth code review with strong reasoning capabilities. Can be assigned as a reviewer on pull requests via the GitHub app.', 'https://docs.anthropic.com', '#FF9F1C', 'https://avatars.githubusercontent.com/in/1236702?v=4'),
    ('openai-codex', 'OpenAI Codex', 'https://openai.com/codex', 'OpenAI''s cloud-based coding agent. Runs in a sandboxed environment to write code, fix bugs, and review pull requests. Operates asynchronously — assign tasks and review results when ready.', 'https://platform.openai.com/docs/guides/codex', '#808080', 'https://avatars.githubusercontent.com/in/1144995?s=60&v=4'),
    ('mesa', 'Mesa', 'https://mesa.dev', 'AI-powered development workflow platform. Automates code review as part of a broader CI/CD integration, providing feedback on code quality, testing, and deployment readiness.', 'https://docs.mesa.dev', '#c06a33', 'https://avatars.githubusercontent.com/in/1050077?v=4'),
    ('linearb', 'LinearB', 'https://linearb.io', 'Developer workflow platform with gitStream automation and AI-powered code review. Automates PR routing, reviewer assignment, and provides workflow metrics for engineering teams.', 'https://linearb.io/docs', '#a37ce2', 'https://avatars.githubusercontent.com/in/1658443?v=4'),
    ('augment', 'Augment Code', 'https://augmentcode.com', 'AI coding assistant with automated PR review. Understands your codebase context to provide relevant feedback. Designed for enterprise teams with support for private codebases and custom guidelines.', 'https://docs.augmentcode.com', '#968CFF', 'https://avatars.githubusercontent.com/in/1027498?v=4'),
    ('kodus', 'Kodus', 'https://kodus.io', 'AI code reviewer that analyzes pull requests like a senior developer. Provides actionable suggestions, identifies bugs, and enforces coding standards. Open-source with cloud and self-hosted options.', 'https://docs.kodus.io', '#6C63FF', 'https://avatars.githubusercontent.com/in/413034?v=4'),
    ('amazon-q', 'Amazon Q Developer', 'https://aws.amazon.com/q/developer/', 'AWS''s generative AI assistant for software development. Reviews PRs for bugs, security vulnerabilities, and best practices. Deeply integrated with the AWS ecosystem — understands IAM policies, CloudFormation templates, and AWS SDK patterns.', 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/what-is.html', '#232F3E', 'https://avatars.githubusercontent.com/in/1220912?v=4'),
    ('codacy', 'Codacy', 'https://www.codacy.com', 'Automated code quality and security platform analyzing PRs since 2012. Combines static analysis, security scanning (SAST/DAST), and AI-powered review across 40+ languages with end-to-end DevSecOps coverage.', 'https://docs.codacy.com', '#242C33', 'https://avatars.githubusercontent.com/in/56611?v=4'),
    ('qlty', 'Qlty', 'https://qlty.sh', 'Code quality platform spun out from Code Climate in 2024. Automates PR review with linting, formatting, security scanning, complexity analysis, and AI-generated autofix suggestions. No CI setup required.', 'https://qlty.sh/docs', '#6366F1', 'https://avatars.githubusercontent.com/in/890766?v=4'),
    ('codeclimate', 'Code Climate', 'https://codeclimate.com', 'Pioneering automated code review platform founded in 2011. Now focused on Software Engineering Intelligence (SEI). Original quality product was spun out as Qlty Software in 2024.', 'https://codeclimate.com/quality/docs', '#1E293B', 'https://avatars.githubusercontent.com/u/789641?v=4'),
    ('kilo', 'Kilo Review', 'https://kilocode.ai', 'AI code review bot from Kilo Code. Fast-growing newcomer reviewing PRs for bugs and code quality issues with rapidly accelerating adoption since late 2025.', 'https://kilocode.ai/docs', '#000000', 'https://avatars.githubusercontent.com/in/2193792?v=4');

-- Bots

TRUNCATE TABLE IF EXISTS code_review_trends.bots;

INSERT INTO code_review_trends.bots (id, name, product_id, website, description, brand_color, avatar_url) VALUES
    ('coderabbit', 'CodeRabbit', 'coderabbit', 'https://coderabbit.ai', 'AI-first code review agent. Auto-summarizes PRs, provides line-by-line feedback, and learns from your preferences over time.', '#f97316', 'https://avatars.githubusercontent.com/in/347564?v=4'),
    ('copilot', 'GitHub Copilot', 'copilot', 'https://github.com/features/copilot', 'GitHub''s native AI pair programmer. Provides inline code review suggestions directly in the PR UI.', '#58a6ff', 'https://avatars.githubusercontent.com/in/946600?v=4'),
    ('codescene', 'CodeScene', 'codescene', 'https://codescene.com', 'Behavioral code analysis platform. Identifies code health, complexity hotspots, and technical debt.', '#5f72ee', 'https://avatars.githubusercontent.com/in/53921?v=4'),
    ('sourcery', 'Sourcery', 'sourcery', 'https://sourcery.ai', 'AI code reviewer focused on code quality, refactoring suggestions, and coding standards enforcement.', '#65a30d', 'https://avatars.githubusercontent.com/in/48477?v=4'),
    ('ellipsis', 'Ellipsis', 'ellipsis', 'https://ellipsis.dev', 'AI-powered code review and bug detection with configurable rules and custom prompts.', '#06b6d4', 'https://avatars.githubusercontent.com/in/64358?v=4'),
    ('codium-pr-agent', 'Qodo (CodiumAI PR Agent)', 'qodo', 'https://qodo.ai', 'Legacy CodiumAI PR agent, now part of Qodo. Generates tests and reviews PRs for code integrity.', '#9d75f8', 'https://avatars.githubusercontent.com/u/54746889?v=4'),
    ('qodo-merge', 'Qodo Merge', 'qodo', 'https://qodo.ai', 'Qodo''s AI-powered pull request merge assistant with test generation and code integrity checks.', '#9d75f8', 'https://avatars.githubusercontent.com/u/104026966?v=4'),
    ('qodo-merge-pro', 'Qodo Merge Pro', 'qodo', 'https://qodo.ai', 'Qodo''s premium AI agent for code integrity — reviews, tests, and suggestions.', '#9d75f8', 'https://avatars.githubusercontent.com/in/484649?v=4'),
    ('qodo-ai', 'Qodo AI', 'qodo', 'https://qodo.ai', 'Qodo''s latest AI code review bot. Successor to qodo-merge and qodo-merge-pro.', '#9d75f8', 'https://avatars.githubusercontent.com/in/1420315?v=4'),
    ('greptile', 'Greptile', 'greptile', 'https://greptile.com', 'Codebase-aware AI code review. Indexes your entire repo for context-rich feedback.', '#22c55e', 'https://avatars.githubusercontent.com/in/867647?v=4'),
    ('sentry', 'Sentry', 'sentry', 'https://sentry.io', 'Sentry''s GitHub bot for issue linking, error tracking, and code review integration.', '#9589c4', 'https://avatars.githubusercontent.com/u/1396951?v=4'),
    ('seer-by-sentry', 'Seer by Sentry', 'sentry', 'https://sentry.io', 'Sentry''s AI agent for automated root cause analysis and error triage on PRs.', '#9589c4', 'https://avatars.githubusercontent.com/in/801464?v=4'),
    ('codecov-ai', 'Codecov AI', 'sentry', 'https://codecov.io', 'Codecov''s AI-powered code review for test coverage insights and regression detection.', '#9589c4', 'https://avatars.githubusercontent.com/in/797565?v=4'),
    ('baz', 'Baz', 'baz', 'https://baz.co', 'AI code reviewer focused on catching real bugs before merge with minimal noise.', '#39FF14', 'https://avatars.githubusercontent.com/in/933528?s=60&v=4'),
    ('graphite', 'Graphite', 'graphite', 'https://graphite.dev', 'Developer productivity platform with stacked PRs, merge queues, and AI-assisted code review.', '#5b8ef0', 'https://avatars.githubusercontent.com/in/158384?v=4'),
    ('codeant', 'CodeAnt', 'codeant', 'https://codeant.ai', 'AI code review and static analysis. Catches bugs, anti-patterns, and security issues across 30+ languages.', '#a855f7', 'https://avatars.githubusercontent.com/in/646884?v=4'),
    ('windsurf', 'Windsurf', 'windsurf', 'https://windsurf.com', 'AI-powered development platform (formerly Codeium). IDE-first with deep codebase-aware PR reviews.', '#0d9488', 'https://avatars.githubusercontent.com/in/1066231?v=4'),
    ('cubic', 'Cubic', 'cubic', 'https://cubic.dev', 'AI development assistant with automated code review and improvement suggestions.', '#edc00c', 'https://avatars.githubusercontent.com/in/1082092?v=4'),
    ('cursor', 'Cursor Bugbot', 'cursor', 'https://cursor.com', 'PR review feature from Cursor AI editor. Scans PRs for potential bugs and suggests fixes.', '#e84e4e', 'https://avatars.githubusercontent.com/in/1210556?v=4'),
    ('gemini', 'Gemini Code Assist', 'gemini', 'https://cloud.google.com/gemini/docs/codeassist/overview', 'Google''s AI code assistant. Reviews PRs with suggestions for improvements, security fixes, and best practices.', '#ec4899', 'https://avatars.githubusercontent.com/in/956858?v=4'),
    ('bito', 'Bito', 'bito', 'https://bito.ai', 'AI code review powered by LLMs. Provides PR summaries, security analysis, and performance suggestions.', '#94a3b8', 'https://avatars.githubusercontent.com/in/1061978?v=4'),
    ('korbit', 'Korbit', 'korbit', 'https://korbit.ai', 'AI code review mentor. Provides educational feedback that helps developers learn best practices during review.', '#b07838', 'https://avatars.githubusercontent.com/in/322216?v=4'),
    ('claude', 'Claude', 'claude', 'https://claude.ai', 'Anthropic''s AI assistant with GitHub integration. Provides in-depth code review with strong reasoning capabilities.', '#FF9F1C', 'https://avatars.githubusercontent.com/in/1236702?v=4'),
    ('openai-codex', 'OpenAI Codex', 'openai-codex', 'https://openai.com/codex', 'OpenAI''s cloud-based coding agent. Runs in a sandbox to write code, fix bugs, and review PRs asynchronously.', '#808080', 'https://avatars.githubusercontent.com/in/1144995?s=60&v=4'),
    ('mesa', 'Mesa', 'mesa', 'https://mesa.dev', 'AI-powered development workflow platform with integrated code review and CI/CD automation.', '#c06a33', 'https://avatars.githubusercontent.com/in/1050077?v=4'),
    ('gitstream', 'gitStream', 'linearb', 'https://linearb.io', 'LinearB''s gitStream workflow automation bot. Automates PR routing and continuous merge management.', '#a37ce2', 'https://avatars.githubusercontent.com/ml/13414?v=4'),
    ('linearb', 'LinearB', 'linearb', 'https://linearb.io', 'LinearB''s GitHub bot for dev workflow insights, metrics, and AI-powered code review.', '#a37ce2', 'https://avatars.githubusercontent.com/in/1658443?v=4'),
    ('augment', 'Augment Code', 'augment', 'https://augmentcode.com', 'AI coding assistant with codebase-aware PR review. Designed for enterprise teams with private codebases.', '#968CFF', 'https://avatars.githubusercontent.com/in/1027498?v=4'),
    ('kodus', 'Kody AI', 'kodus', 'https://kodus.io', 'Kodus AI code reviewer. Automatically analyzes PRs with actionable suggestions and bug detection.', '#6C63FF', 'https://avatars.githubusercontent.com/in/413034?v=4'),
    ('amazon-q', 'Amazon Q Developer', 'amazon-q', 'https://aws.amazon.com/q/developer/', 'AWS''s AI assistant for software development. Reviews PRs for bugs, security issues, and AWS best practices.', '#232F3E', 'https://avatars.githubusercontent.com/in/1220912?v=4'),
    ('codacy', 'Codacy', 'codacy', 'https://www.codacy.com', 'Automated code quality and security platform. Analyzes PRs for bugs, vulnerabilities, and style across 40+ languages.', '#242C33', 'https://avatars.githubusercontent.com/in/56611?v=4'),
    ('qlty', 'Qlty', 'qlty', 'https://qlty.sh', 'Code quality platform (spun out from Code Climate). Automated linting, security, and AI autofix on every PR.', '#6366F1', 'https://avatars.githubusercontent.com/in/890766?v=4'),
    ('codeclimate', 'Code Climate', 'codeclimate', 'https://codeclimate.com', 'Pioneering code review platform (est. 2011). Quality product spun out as Qlty in 2024, now focused on engineering intelligence.', '#1E293B', 'https://avatars.githubusercontent.com/u/789641?v=4'),
    ('kilo', 'Kilo Review', 'kilo', 'https://kilocode.ai', 'AI code review bot from Kilo Code. Fast-growing newcomer reviewing PRs for bugs and code quality.', '#000000', 'https://avatars.githubusercontent.com/in/2193792?v=4');

-- Bot logins (GitHub usernames)

TRUNCATE TABLE IF EXISTS code_review_trends.bot_logins;

INSERT INTO code_review_trends.bot_logins (bot_id, github_login) VALUES
    ('coderabbit', 'coderabbitai[bot]'),
    ('copilot', 'copilot-pull-request-reviewer[bot]'),
    ('copilot', 'Copilot'),
    ('codescene', 'codescene-delta-analysis[bot]'),
    ('sourcery', 'sourcery-ai[bot]'),
    ('ellipsis', 'ellipsis-dev[bot]'),
    ('codium-pr-agent', 'codium-pr-agent[bot]'),
    ('qodo-merge', 'qodo-merge[bot]'),
    ('qodo-merge-pro', 'qodo-merge-pro[bot]'),
    ('qodo-ai', 'qodo-ai[bot]'),
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
    ('mesa', 'mesa-dot-dev[bot]'),
    ('gitstream', 'gitstream-cm[bot]'),
    ('linearb', 'linearb[bot]'),
    ('augment', 'augmentcode[bot]'),
    ('kodus', 'kody-ai[bot]'),
    ('amazon-q', 'amazon-q-developer[bot]'),
    ('codacy', 'codacy-production[bot]'),
    ('qlty', 'qltysh[bot]'),
    ('codeclimate', 'codeclimate[bot]'),
    ('kilo', 'kiloconnect[bot]');

