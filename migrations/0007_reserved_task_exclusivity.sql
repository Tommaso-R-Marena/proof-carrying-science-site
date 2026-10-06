-- Database-enforced exclusivity for reserved/high-trust tasks.
-- Open/non-exclusive tasks keep reservation_key NULL and are unaffected.

ALTER TABLE task_requests ADD COLUMN reservation_key TEXT;

UPDATE task_requests
SET reservation_key=task_id
WHERE status='approved'
  AND task_id IN (SELECT id FROM tasks WHERE claim_mode!='open');

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_requests_unique_reservation
ON task_requests(reservation_key)
WHERE reservation_key IS NOT NULL;
