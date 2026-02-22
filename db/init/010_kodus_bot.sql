-- Add Kodus (Kody AI) product, bot, and bot_login.

INSERT INTO code_review_trends.products (id, name, website, description, docs_url, brand_color, avatar_url) VALUES
    ('kodus', 'Kodus', 'https://kodus.io', 'AI code reviewer that analyzes pull requests like a senior developer. Provides actionable suggestions, identifies bugs, and enforces coding standards. Open-source with cloud and self-hosted options.', 'https://docs.kodus.io', '#6C63FF', 'https://avatars.githubusercontent.com/in/413034?v=4');

INSERT INTO code_review_trends.bots (id, name, product_id, website, description, brand_color, avatar_url) VALUES
    ('kodus', 'Kody AI', 'kodus', 'https://kodus.io', 'Kodus AI code reviewer. Automatically analyzes PRs with actionable suggestions and bug detection.', '#6C63FF', 'https://avatars.githubusercontent.com/in/413034?v=4');

INSERT INTO code_review_trends.bot_logins (bot_id, github_login) VALUES
    ('kodus', 'kody-ai[bot]');
