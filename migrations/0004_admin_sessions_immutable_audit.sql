-- Separate administrative sessions and append-only audit archive.
-- The audit_archive table intentionally has no foreign keys so later account deletion
-- cannot erase or rewrite the actor snapshot recorded at event time.

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expiry ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_archive (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  legacy_audit_id TEXT UNIQUE,
  actor_user_id TEXT,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  prev_hash TEXT NOT NULL UNIQUE,
  event_hash TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_audit_archive_created ON audit_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_archive_actor ON audit_archive(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_archive_subject ON audit_archive(subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_archive_action ON audit_archive(action, created_at DESC);

CREATE TRIGGER IF NOT EXISTS audit_archive_no_update
BEFORE UPDATE ON audit_archive
BEGIN
  SELECT RAISE(ABORT, 'PCS audit archive is immutable');
END;

CREATE TRIGGER IF NOT EXISTS audit_archive_no_delete
BEFORE DELETE ON audit_archive
BEGIN
  SELECT RAISE(ABORT, 'PCS audit archive is immutable');
END;

-- Preserve the legacy log as well. We allow FK-driven actor_user_id nulling on UPDATE,
-- but no audit row may be deleted through normal database operations.
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'PCS legacy audit log rows cannot be deleted');
END;
