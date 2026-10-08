-- Meaning Forge research capture, strictly voluntary for verified-email adults.
-- Correctness labels come from deterministic server replay, not from user claims.
-- This migration does not enable collection until the new Worker routes deploy.
CREATE TABLE IF NOT EXISTS meaning_forge_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('english-to-lean','lean-to-english')),
  replay_digest TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  verified_replay_json TEXT NOT NULL,
  structurally_correct INTEGER NOT NULL CHECK(structurally_correct IN (0,1)),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,replay_digest),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_meaning_forge_created
 ON meaning_forge_sessions(created_at,mission_id,mode);
CREATE INDEX IF NOT EXISTS idx_meaning_forge_user
 ON meaning_forge_sessions(user_id,created_at);
-- Independent qualified reviews apply only to *written* explanations.
-- They are never manufactured from the structured score.
CREATE TABLE IF NOT EXISTS meaning_forge_explanation_reviews (
  session_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK(label IN ('faithful','unfaithful','ambiguous','unsupported')),
  rationale TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  PRIMARY KEY(session_id,reviewer_user_id),
  FOREIGN KEY(session_id) REFERENCES meaning_forge_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
