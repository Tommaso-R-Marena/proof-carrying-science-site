-- PCS submission automation: small text artifacts, GitHub review receipts, and minute-sized tasks.
-- Historical data is not retroactively assigned any passing checks.
ALTER TABLE tasks ADD COLUMN expected_minutes INTEGER;
ALTER TABLE tasks ADD COLUMN integration_target TEXT NOT NULL DEFAULT 'none'
  CHECK (integration_target IN ('none','core','site'));
ALTER TABLE submissions ADD COLUMN github_repo TEXT;
ALTER TABLE submissions ADD COLUMN github_branch TEXT;
ALTER TABLE submissions ADD COLUMN github_pr_number INTEGER;
ALTER TABLE submissions ADD COLUMN github_pr_url TEXT;
ALTER TABLE submissions ADD COLUMN github_stage_state TEXT NOT NULL DEFAULT 'not_applicable'
  CHECK (github_stage_state IN ('not_applicable','pending','not_configured','error','staged','merged'));
ALTER TABLE submissions ADD COLUMN github_stage_error TEXT;
ALTER TABLE submissions ADD COLUMN evidence_kind TEXT NOT NULL DEFAULT 'none'
  CHECK (evidence_kind IN ('none','activity','outcome'));
ALTER TABLE submissions ADD COLUMN outcome_metric TEXT;
ALTER TABLE submissions ADD COLUMN outcome_count INTEGER;
CREATE TABLE IF NOT EXISTS submission_files (
  submission_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(submission_id,filename),
  FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_submissions_github_stage
  ON submissions(github_stage_state,submitted_at);
-- Seed example-sized work ONLY as drafts: publication remains a Founder/Owner
-- decision and the public task-gate cannot be bypassed by migrations.
INSERT OR IGNORE INTO tasks (
  id,title,summary,min_level,claim_mode,required_skill,calibrates_skill,expected_hours,
  review_sla_business_days,checkpoint_hours,reservation_hours,max_active_per_user,status,
  compensation_type,compensation_label,funding_status,created_at,updated_at,
  deliverable,verification_rule,acceptance_criteria,publication_state,category,work_type,
  need_status,priority,why_now,success_metric,expected_minutes,integration_target
) VALUES
('MKT-MICRO-001','Check PCS outreach links',
 'Inspect five current publicly reachable PCS entry points for broken links, confusing labels, or inaccessible paths; identify only actionable defects.',
 0,'open',NULL,NULL,1,2,24,72,1,'open','volunteer','Volunteer','open',
 CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,
 'A five-link checklist with URLs, observed results, and reproducible steps for any broken link.',
 'Reviewer opens the five links and reproduces any claimed issue; passing links are not invented defects.',
 'Five distinct relevant URLs, reproducible observations, and no unsupported traffic or conversion claims.',
 'draft','marketing','task','needed',76,
 'Accessible outreach paths need regular independent checks before recruitment scales.',
 'Five independently confirmed routes checked.',10,'none'),
('MKT-MICRO-002','Write one accurate outreach paragraph',
 'Prepare a short, precise voluntary outreach paragraph explaining PCS Commons without promising proof of general AI alignment.',
 0,'open',NULL,NULL,1,2,24,72,1,'open','volunteer','Volunteer','open',
 CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,
 'A 90–140 word paragraph identifying the audience and a truthful, specific invitation.',
 'Reviewer checks each technical claim against the published PCS site and approves wording before any distribution.',
 'No overclaiming, no unsolicited sending, specific PCS link, and reader-facing clarity.',
 'draft','marketing','task','needed',73,
 'PCS needs honest, reusable communications assets for research-lab and volunteer outreach.',
 'One founder-approved reusable paragraph.',10,'none'),
('OUT-MICRO-001','Research two lab contact routes',
 'Find two public, appropriate research-lab collaboration contact channels without harvesting private contact information or sending messages.',
 0,'open',NULL,NULL,1,2,24,72,1,'open','volunteer','Volunteer','open',
 CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,
 'Two public institutional URLs, an explanation of fit, and proposed personalized opening sentences.',
 'Reviewer verifies public official channels and relevance, removes duplicates, and approves before contact.',
 'No scraped personal emails, no messages sent, no invented interest or commitments.',
 'draft','outreach','task','needed',78,
 'Meaningful lab pilots require carefully qualified contacts, not a mass unsolicited campaign.',
 'Two verified and relevant lab contact routes.',30,'none'),
('QA-MICRO-001','Mobile Commons navigation smoke test',
 'Check Account, Tasks, Roles, Arena, and Dependency Graph links at a narrow mobile viewport and document any navigation traps.',
 0,'open',NULL,NULL,1,2,24,72,1,'open','volunteer','Volunteer','open',
 CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,
 'A five-route device/browser matrix and exact steps/screenshots or descriptions for any reproducible issue.',
 'Reviewer repeats the reported path and confirms all five routes were actually examined.',
 'Five paths checked; defects are specific; no fabricated mobile testing.',
 'draft','operations','task','needed',80,
 'Navigation has just been reorganized and requires a fresh independent mobile check.',
 'Five independently exercised mobile routes.',30,'none'),
('DOC-MICRO-001','Review one PCS claim boundary',
 'Locate one sentence on the public website that might confuse formal proof with real-world evidence, then propose a precise correction if needed.',
 0,'open',NULL,NULL,1,2,24,72,1,'open','volunteer','Volunteer','open',
 CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,
 'Exact URL, original sentence, risk analysis, and a minimal replacement if correction is needed.',
 'Reviewer verifies page quotation and the proposed correction against public trust-boundary guidance.',
 'A verifiable real sentence and honest interpretation; no invented issue required.',
 'draft','documentation','task','needed',75,
 'Claim-scope honesty is central to PCS and benefits from small, independent text audits.',
 'One accepted scope-clarity review.',30,'none');
