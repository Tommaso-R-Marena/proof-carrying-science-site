-- PCS Arena: challenge-specific, verifier/reviewer-gated gamification.
-- No global task-count points. Leaderboards are local to a scientifically meaningful challenge.

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  objective TEXT NOT NULL,
  scoring_rule TEXT NOT NULL,
  score_direction TEXT NOT NULL CHECK(score_direction IN ('min','max')),
  verification_mode TEXT NOT NULL CHECK(verification_mode IN ('manual_gate','automatic','kernel')),
  leaderboard_state TEXT NOT NULL DEFAULT 'draft' CHECK(leaderboard_state IN ('draft','pilot','live','closed')),
  min_level INTEGER NOT NULL DEFAULT 0,
  max_entries_per_day INTEGER NOT NULL DEFAULT 5,
  opens_at TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS challenge_entries (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  leaderboard_alias TEXT NOT NULL,
  artifact_url TEXT NOT NULL,
  summary TEXT NOT NULL,
  hidden_dependency_explanation TEXT NOT NULL DEFAULT '',
  workflow_nodes INTEGER NOT NULL DEFAULT 0,
  dependency_edges INTEGER NOT NULL DEFAULT 0,
  evidence_items INTEGER NOT NULL DEFAULT 0,
  claims INTEGER NOT NULL DEFAULT 0,
  raw_score REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','withdrawn')),
  submitted_at TEXT NOT NULL,
  verified_at TEXT,
  verified_by TEXT,
  review_note TEXT,
  FOREIGN KEY(challenge_id) REFERENCES challenges(id) ON DELETE RESTRICT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(verified_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_challenge_entries_rank ON challenge_entries(challenge_id,status,raw_score,verified_at);
CREATE INDEX IF NOT EXISTS idx_challenge_entries_user ON challenge_entries(user_id,challenge_id,submitted_at);

INSERT OR REPLACE INTO challenges(
  id,task_id,title,summary,objective,scoring_rule,score_direction,verification_mode,
  leaderboard_state,min_level,max_entries_per_day,opens_at,created_at,updated_at
) VALUES(
  'ARENA-INV-001','INV-002','Counterexample Golf · Hidden Dependency',
  'Construct the smallest valid example showing why graph non-reachability cannot imply real-world non-impact when a dependency is omitted.',
  'Produce a dependency-incomplete fixture where the declared graph leaves at least one claim unreachable from the changed artifact, while an explicitly described hidden dependency makes that claim genuinely affected.',
  'After manual validity review, lower complexity wins: 10×workflow nodes + 5×declared dependency edges + 5×evidence items + 5×claims. Counts are checked against the submitted artifact before verification.',
  'min','manual_gate','pilot',1,5,datetime('now'),datetime('now'),datetime('now')
);
