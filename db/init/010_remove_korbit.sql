-- Remove Korbit bot (korbit.ai is no longer available)
-- Deletes reference data and all associated activity/event data.

ALTER TABLE code_review_trends.bot_logins DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.bots DELETE WHERE id = 'korbit';
ALTER TABLE code_review_trends.products DELETE WHERE id = 'korbit';
ALTER TABLE code_review_trends.review_activity DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.pr_bot_events DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.pr_bot_reactions DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.pr_comments DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.pr_bot_event_counts DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.comment_stats_weekly DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.reaction_only_review_counts DELETE WHERE bot_id = 'korbit';
ALTER TABLE code_review_trends.reaction_only_repo_counts DELETE WHERE bot_id = 'korbit';
