-- PCS AI Safety Commons account / task-control schema.
-- Production D1 database: pcs-commons (US jurisdiction).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  recovery_hash TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0 CHECK(level BETWEEN 0 AND 6),
  role TEXT NOT NULL DEFAULT 'contributor' CHECK(role IN ('contributor','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','disabled')),
  ai_policy_ack INTEGER NOT NULL DEFAULT 0 CHECK(ai_policy_ack IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  availability_hours INTEGER NOT NULL DEFAULT 1,
  track TEXT NOT NULL DEFAULT 'nontechnical',
  compensation_preference TEXT NOT NULL DEFAULT 'either',
  profile_note TEXT NOT NULL DEFAULT '',
  level_review_note TEXT NOT NULL DEFAULT '',
  email_verified INTEGER NOT NULL DEFAULT 0,
  terms_version TEXT NOT NULL DEFAULT 'commons-v1',
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK(is_owner IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_owner ON users(is_owner) WHERE is_owner=1;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON email_verification_tokens(user_id, expires_at);

CREATE TABLE IF NOT EXISTS skills (
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'self_reported' CHECK(status IN ('self_reported','pending','verified','rejected')),
  evidence TEXT,
  verification_note TEXT,
  requested_at TEXT,
  verified_at TEXT,
  verified_by TEXT,
  PRIMARY KEY(user_id, skill),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(verified_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  min_level INTEGER NOT NULL DEFAULT 0 CHECK(min_level BETWEEN 0 AND 6),
  claim_mode TEXT NOT NULL CHECK(claim_mode IN ('open','approval','invite')),
  required_skill TEXT,
  calibrates_skill TEXT,
  expected_hours INTEGER NOT NULL,
  review_sla_business_days INTEGER NOT NULL DEFAULT 2,
  checkpoint_hours INTEGER,
  reservation_hours INTEGER,
  max_active_per_user INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','paused','closed')),
  compensation_type TEXT NOT NULL DEFAULT 'volunteer',
  compensation_label TEXT NOT NULL DEFAULT 'Volunteer',
  funding_status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn','expired','completed')),
  application_note TEXT NOT NULL DEFAULT '',
  ai_use_plan TEXT NOT NULL DEFAULT '',
  verification_plan TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL,
  decision_due_at TEXT NOT NULL,
  decision_at TEXT,
  decided_by TEXT,
  decision_note TEXT,
  reservation_expires_at TEXT,
  checkpoint_due_at TEXT,
  checkpoint_status TEXT CHECK(checkpoint_status IN ('pending','accepted','missed','not_required')),
  last_progress_at TEXT,
  checkpoint_note TEXT NOT NULL DEFAULT '',
  extension_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(decided_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_task_requests_user ON task_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_task_requests_task ON task_requests(task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_requests_due ON task_requests(status, decision_due_at);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  artifact_url TEXT,
  ai_used INTEGER NOT NULL DEFAULT 0 CHECK(ai_used IN (0,1)),
  ai_tools TEXT,
  verification_note TEXT NOT NULL,
  understanding_note TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','needs_changes','accepted','rejected')),
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  FOREIGN KEY(request_id) REFERENCES task_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  email_state TEXT NOT NULL DEFAULT 'queued' CHECK(email_state IN ('queued','sent','failed','disabled')),
  email_error TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log(subject_type, subject_id, created_at);


CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);
