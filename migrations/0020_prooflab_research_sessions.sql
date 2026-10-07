-- ProofLab is an educational theorem-planning study, not proof verification.
-- Opt-in only, verified-email adult account; no anonymous gameplay tracking.
CREATE TABLE IF NOT EXISTS prooflab_research_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest TEXT NOT NULL CHECK(LENGTH(digest)=64),
  task_id TEXT NOT NULL,
  source_module TEXT NOT NULL,
  task_split TEXT NOT NULL CHECK(task_split IN ('train','challenge')),
  core_revision TEXT NOT NULL,
  session_version TEXT NOT NULL CHECK(session_version='pcs-prooflab-educational-plan-v1'),
  submitted_actions_json TEXT NOT NULL,
  verified_replay_json TEXT NOT NULL,
  action_count INTEGER NOT NULL CHECK(action_count BETWEEN 6 AND 80),
  game_score INTEGER NOT NULL CHECK(game_score BETWEEN 0 AND 100),
  consent_version TEXT NOT NULL CHECK(consent_version='pcs-prooflab-adult-research-v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,digest)
);
CREATE INDEX IF NOT EXISTS idx_prooflab_by_user
  ON prooflab_research_sessions(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_prooflab_by_time
  ON prooflab_research_sessions(created_at,id);
