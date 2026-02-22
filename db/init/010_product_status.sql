-- Add status column to products table (active/retired).
-- Bots that are no longer maintained or whose service has shut down
-- are marked as 'retired'. Their historical data is preserved.

ALTER TABLE code_review_trends.products ADD COLUMN IF NOT EXISTS status String DEFAULT 'active';

-- Korbit (korbit.ai) — domain parked, service no longer available as of early 2026.
ALTER TABLE code_review_trends.products UPDATE status = 'retired' WHERE id = 'korbit';
