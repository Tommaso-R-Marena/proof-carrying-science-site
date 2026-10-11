-- Explicit adult CC0 consent only; no automatic gameplay storage.
CREATE TABLE IF NOT EXISTS bridge_research_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,
  version TEXT NOT NULL,
  session_digest TEXT NOT NULL CHECK(length(session_digest)=64),
  session_json TEXT NOT NULL CHECK(length(session_json)<=20000),
  replay_json TEXT NOT NULL CHECK(length(replay_json)<=40000),
  consent_version TEXT NOT NULL CHECK(consent_version='pcs-bridge-adult-cc0-optin-v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,version,session_digest)
);
CREATE INDEX IF NOT EXISTS bridge_sessions_export ON bridge_research_sessions(version,created_at,id);
