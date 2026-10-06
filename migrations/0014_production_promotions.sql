-- Promotion is a distinct, Owner-controlled trust boundary after the Commons archive.
-- No legacy submission is silently approved for promotion.
CREATE TABLE IF NOT EXISTS production_promotions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL,
  repo TEXT NOT NULL CHECK (repo IN ('Tommaso-R-Marena/proof-carrying-science','Tommaso-R-Marena/proof-carrying-science-site')),
  source_pr_number INTEGER NOT NULL CHECK (source_pr_number>0),
  mapping_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'requested'
    CHECK(state IN ('requested','stage_error','staged','needs_changes','rejected','approved','merged')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  staged_at TEXT,
  base_sha TEXT,
  branch TEXT,
  head_sha TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  stage_error TEXT,
  decision_at TEXT,
  decision_by TEXT,
  decision_note TEXT,
  approved_head_sha TEXT,
  merged_at TEXT,
  merge_sha TEXT,
  FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(decision_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_production_promotions_state ON production_promotions(state,created_at);
