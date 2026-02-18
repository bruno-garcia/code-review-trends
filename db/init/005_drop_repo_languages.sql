-- Migration 4: Drop orphaned repo_languages table.
--
-- The repo_languages table stored per-language byte breakdowns fetched via
-- the old REST-based repo enrichment. Writing was removed in PR #112 when
-- repo enrichment switched to GraphQL batching (which only fetches
-- primaryLanguage → repos.primary_language).
--
-- The table has no writers and no readers — all language data in the app
-- comes from repos.primary_language. Safe to drop.

DROP TABLE IF EXISTS code_review_trends.repo_languages;
