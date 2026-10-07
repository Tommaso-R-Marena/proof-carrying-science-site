-- Least-privilege code packets for technical Commons tasks.
-- Contributors receive only curated excerpts. Larger excerpts require an explicit,
-- audited request and Founder/Owner decision; arbitrary repository browsing is never exposed.

CREATE TABLE IF NOT EXISTS task_code_packets (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  repo_target TEXT NOT NULL CHECK(repo_target IN ('core','site')),
  path TEXT NOT NULL,
  start_line INTEGER NOT NULL CHECK(start_line >= 1),
  end_line INTEGER NOT NULL CHECK(end_line >= start_line),
  allowed_start_line INTEGER NOT NULL CHECK(allowed_start_line >= 1),
  allowed_end_line INTEGER NOT NULL CHECK(allowed_end_line >= allowed_start_line),
  purpose TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(task_id,path,start_line,end_line)
);
CREATE INDEX IF NOT EXISTS idx_task_code_packets_task
  ON task_code_packets(task_id,active,sort_order,id);

CREATE TABLE IF NOT EXISTS task_code_requests (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  task_request_id TEXT NOT NULL,
  packet_id TEXT NOT NULL,
  repo_target TEXT NOT NULL CHECK(repo_target IN ('core','site')),
  requested_path TEXT NOT NULL,
  requested_start_line INTEGER NOT NULL CHECK(requested_start_line >= 1),
  requested_end_line INTEGER NOT NULL CHECK(requested_end_line >= requested_start_line),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  decision_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(task_request_id) REFERENCES task_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(packet_id) REFERENCES task_code_packets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_code_requests_user_task
  ON task_code_requests(user_id,task_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_task_code_requests_admin
  ON task_code_requests(status,created_at);

-- These are the currently published Commons tasks whose deliverable actually
-- requires source code. Planning/review tasks remain integration_target='none'.
UPDATE tasks SET integration_target='core',updated_at=CURRENT_TIMESTAMP
 WHERE id IN ('ENG-201','INV-003','INV-006');

INSERT OR IGNORE INTO task_code_packets
(id,task_id,repo_target,path,start_line,end_line,allowed_start_line,allowed_end_line,purpose,sort_order,active,created_at)
VALUES
('ENG-201-CHECKERS','ENG-201','core','formal/PCS/V2/Checkers.lean',108,130,95,145,
 'The certified-checker registry and fail-closed unknown-check behavior that the negative test must protect.',10,1,CURRENT_TIMESTAMP),
('ENG-201-AUTHORITY','ENG-201','core','formal/PCS/V2/Authority.lean',102,175,90,190,
 'The authority-side registration gate and transcript boundary exercised by the negative contract test.',20,1,CURRENT_TIMESTAMP),
('INV-003-IMPACT','INV-003','core','pcs/impact.py',1,51,1,51,
 'The complete small invalidation function under test; no unrelated core source is needed.',10,1,CURRENT_TIMESTAMP),
('INV-003-TEST','INV-003','core','tests/test_impact.py',1,11,1,11,
 'The existing minimal regression test, so new adversarial cases follow the established test contract.',20,1,CURRENT_TIMESTAMP),
('INV-006-SEMANTICS','INV-006','core','pcs/impact.py',1,51,1,51,
 'Executable reference semantics the new Lean invalidation model must refine rather than silently strengthen.',10,1,CURRENT_TIMESTAMP),
('INV-006-CERTMODEL','INV-006','core','formal/PCS/V2/CertificateModel.lean',25,105,20,125,
 'The existing typed claim/evidence/artifact model relevant to a new invalidation theorem.',20,1,CURRENT_TIMESTAMP);
