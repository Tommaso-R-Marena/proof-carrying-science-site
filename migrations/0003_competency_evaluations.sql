-- Variable competency evaluations + manual-review SLA.
-- Auto-grading is screening evidence only; final skill/task authority always requires human approval.

ALTER TABLE skills ADD COLUMN review_due_at TEXT;
ALTER TABLE skills ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE skills ADD COLUMN evaluation_id TEXT;

CREATE TABLE IF NOT EXISTS competency_evaluations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  task_id TEXT,
  variant_token TEXT NOT NULL,
  challenge_json TEXT NOT NULL,
  answer_key_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  submitted_at TEXT,
  answers_json TEXT,
  rationale TEXT NOT NULL DEFAULT '',
  score INTEGER,
  max_score INTEGER NOT NULL DEFAULT 4,
  auto_pass INTEGER CHECK(auto_pass IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','submitted','expired')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_competency_eval_user ON competency_evaluations(user_id, skill, created_at);
CREATE INDEX IF NOT EXISTS idx_competency_eval_status ON competency_evaluations(status, expires_at);
