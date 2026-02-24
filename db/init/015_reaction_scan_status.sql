-- Adds scan_status column to reaction_scan_progress.
-- Distinguishes successful scans from permanent failures (repo gone, reactions unavailable).
-- Values: 'ok' (scanned), 'not_found' (repo gone), 'unavailable' (reactions field missing).
-- Defaults to 'unknown' so pre-existing rows (written before this column existed)
-- can be identified and retried: DELETE FROM reaction_scan_progress WHERE scan_status = 'unknown'
ALTER TABLE code_review_trends.reaction_scan_progress
    ADD COLUMN IF NOT EXISTS scan_status String DEFAULT 'unknown';
