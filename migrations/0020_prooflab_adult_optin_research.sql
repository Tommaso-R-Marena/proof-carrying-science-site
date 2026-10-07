-- Step 2: explicit adult-only proof-planning research traces, not real Lean proofs.
-- No anonymous play is stored; the server independently recomputes each fixed
-- graph's prerequisite satisfaction and does not accept client-side results.
CREATE TABLE IF NOT EXISTS prooflab_source_research_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL CHECK(LENGTH(case_id) BETWEEN 8 AND 96),
  source_commit TEXT NOT NULL CHECK(source_commit='cff0b67595abd4862ab0c156b157f262b169eca5'),
  session_digest TEXT NOT NULL CHECK(LENGTH(session_digest)=64),
  session_version TEXT NOT NULL CHECK(session_version='pcs-prooflab-plan-v1'),
  submitted_plan_json TEXT NOT NULL,
  verified_replay_json TEXT NOT NULL,
  action_count INTEGER NOT NULL CHECK(action_count BETWEEN 4 AND 26),
  accepted_count INTEGER NOT NULL CHECK(accepted_count BETWEEN 0 AND action_count),
  rejected_count INTEGER NOT NULL CHECK(rejected_count BETWEEN 0 AND action_count),
  completed INTEGER NOT NULL CHECK(completed IN (0,1)),
  consent_version TEXT NOT NULL CHECK(consent_version='pcs-prooflab-adult-optin-v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, session_digest)
);
CREATE INDEX IF NOT EXISTS idx_prooflab_source_user_created ON prooflab_source_research_sessions(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_prooflab_source_export_created ON prooflab_source_research_sessions(created_at,id);
