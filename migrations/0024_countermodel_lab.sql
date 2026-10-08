-- New research data is optional; players may play locally without an account.
-- Source-of-truth labels are replayed by the Worker; no browser score is stored.
CREATE TABLE IF NOT EXISTS countermodel_research_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  game_version TEXT NOT NULL,
  session_digest TEXT NOT NULL CHECK(length(session_digest)=64),
  session_json TEXT NOT NULL,
  replay_json TEXT NOT NULL,
  actions_count INTEGER NOT NULL CHECK(actions_count BETWEEN 1 AND 120),
  checked_count INTEGER NOT NULL CHECK(checked_count>=1),
  found_countermodel INTEGER NOT NULL CHECK(found_countermodel IN (0,1)),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id,session_digest)
);
CREATE INDEX IF NOT EXISTS idx_countermodel_user_created ON countermodel_research_sessions(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_countermodel_export ON countermodel_research_sessions(created_at,id);
