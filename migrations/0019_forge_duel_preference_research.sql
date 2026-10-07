-- Forged client scores never enter this table: the Worker independently
-- regenerates every ballot and computes its finite-state comparison labels.
-- Adult-only opt-in; no anonymous or minor gameplay is stored.
CREATE TABLE IF NOT EXISTS forge_duel_research_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_digest TEXT NOT NULL CHECK(LENGTH(session_digest)=64),
  session_version TEXT NOT NULL CHECK(session_version='pcs-forge-duel-v1'),
  submitted_ballots_json TEXT NOT NULL,
  verified_replay_json TEXT NOT NULL,
  ballot_count INTEGER NOT NULL CHECK(ballot_count BETWEEN 3 AND 8),
  correct_count INTEGER NOT NULL CHECK(correct_count BETWEEN 0 AND ballot_count),
  consent_version TEXT NOT NULL CHECK(consent_version='pcs-forge-duel-adult-optin-v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,session_digest)
);
CREATE INDEX IF NOT EXISTS idx_forge_duel_by_user
  ON forge_duel_research_sessions(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_forge_duel_for_export
  ON forge_duel_research_sessions(created_at,id);
