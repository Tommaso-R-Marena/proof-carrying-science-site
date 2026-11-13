-- New cron-only delivery ledger. NOT authorized for production application.
-- Requires historical D1 migration ledger / schema reconciliation and owner-reviewed
-- backup + isolated restore test before any production D1 write.
-- Emails remain at-least-once; provider idempotency must be proven separately.
CREATE TABLE IF NOT EXISTS cron_delivery_attempts (
  notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count BETWEEN 0 AND 5),
  lease_id TEXT,
  lease_until TEXT,
  next_attempt_at TEXT NOT NULL,
  delivered_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_class TEXT
);
CREATE INDEX IF NOT EXISTS idx_cron_delivery_due
  ON cron_delivery_attempts(next_attempt_at,lease_until)
  WHERE delivered_at IS NULL;
