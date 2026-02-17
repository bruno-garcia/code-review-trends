-- Fix CodeScene avatar_url (old URL pointed to deleted GitHub user, now uses the GitHub App avatar)
INSERT INTO code_review_trends.products (id, name, website, description, docs_url, brand_color, avatar_url) VALUES
    ('codescene', 'CodeScene', 'https://codescene.com', 'Behavioral code analysis platform. Identifies code health issues, complexity hotspots, and technical debt trends. Combines static analysis with version control history to prioritize refactoring efforts.', 'https://codescene.io/docs', '#5f72ee', 'https://avatars.githubusercontent.com/in/53921?v=4');

INSERT INTO code_review_trends.bots (id, name, product_id, website, description, brand_color, avatar_url) VALUES
    ('codescene', 'CodeScene', 'codescene', 'https://codescene.com', 'Behavioral code analysis platform. Identifies code health, complexity hotspots, and technical debt.', '#5f72ee', 'https://avatars.githubusercontent.com/in/53921?v=4');
