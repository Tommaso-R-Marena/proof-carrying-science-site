-- Optional ADULT-only Safety Forge simulation replay. Anonymous gameplay is NEVER stored.
-- Records are attributable privately for deletion/abuse-control but no PII is exported.
CREATE TABLE IF NOT EXISTS safety_forge_research_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_seed INTEGER NOT NULL CHECK(scenario_seed BETWEEN 1 AND 9999999),
  scenario_version TEXT NOT NULL CHECK(scenario_version='pcs-safety-forge-v1'),
  session_digest TEXT NOT NULL CHECK(LENGTH(session_digest)=64),
  submitted_choices_json TEXT NOT NULL,
  verified_replay_json TEXT NOT NULL,
  attack_count INTEGER NOT NULL CHECK(attack_count BETWEEN 0 AND 12),
  repair_count INTEGER NOT NULL CHECK(repair_count BETWEEN 0 AND 12),
  unsafe_witness_count INTEGER NOT NULL CHECK(unsafe_witness_count BETWEEN 0 AND 12),
  valid_repair_count INTEGER NOT NULL CHECK(valid_repair_count BETWEEN 0 AND 12),
  consent_version TEXT NOT NULL CHECK(consent_version='pcs-safety-forge-adult-optin-v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,session_digest)
);
CREATE INDEX IF NOT EXISTS idx_safety_forge_user
  ON safety_forge_research_sessions(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_safety_forge_export
  ON safety_forge_research_sessions(created_at,id);
