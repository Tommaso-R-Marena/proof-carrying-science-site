-- Qualified human review recommendations for accepted contributor deliverables.
-- Independent advice: never a direct authority to merge or promote production code.
CREATE TABLE IF NOT EXISTS submission_peer_reviews (
  submission_id TEXT NOT NULL,
  reviewer_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('recommend_accept','request_changes','recommend_reject')),
  rationale TEXT NOT NULL,
  ci_head_sha TEXT,
  ci_verified INTEGER NOT NULL DEFAULT 0 CHECK(ci_verified IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(submission_id,reviewer_user_id),
  FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewer_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_submission_peer_reviews_decisions ON submission_peer_reviews(submission_id,decision);
