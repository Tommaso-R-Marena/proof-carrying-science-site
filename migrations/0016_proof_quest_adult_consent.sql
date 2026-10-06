-- PCS Arena proof-ordering data, opt-in only for verified adult contributors.
-- Practice attempts are processed in the browser and are NEVER stored by this migration.
CREATE TABLE IF NOT EXISTS proof_order_research_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL,
  puzzle_version TEXT NOT NULL,
  ordering_json TEXT NOT NULL,
  hints_used INTEGER NOT NULL CHECK(hints_used BETWEEN 0 AND 20),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100),
  correct_constraints INTEGER NOT NULL CHECK(correct_constraints >= 0),
  total_constraints INTEGER NOT NULL CHECK(total_constraints > 0),
  valid_order INTEGER NOT NULL CHECK(valid_order IN (0,1)),
  consent_version TEXT NOT NULL CHECK(consent_version='pcs-proof-quest-adult-optin-v1'),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,puzzle_id,puzzle_version,ordering_json)
);
CREATE INDEX IF NOT EXISTS idx_proof_order_research_by_user
  ON proof_order_research_attempts(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_proof_order_research_by_puzzle
  ON proof_order_research_attempts(puzzle_id,puzzle_version,created_at);
