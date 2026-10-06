-- Explicit publication/need governance for PCS work.
-- A row existing in tasks no longer means it is publicly available.

ALTER TABLE tasks ADD COLUMN publication_state TEXT NOT NULL DEFAULT 'draft'
  CHECK(publication_state IN ('draft','published','paused','retired'));
ALTER TABLE tasks ADD COLUMN category TEXT NOT NULL DEFAULT 'research'
  CHECK(category IN ('research','engineering','security','review','operations','administrative','marketing','outreach','design','documentation','community'));
ALTER TABLE tasks ADD COLUMN work_type TEXT NOT NULL DEFAULT 'task'
  CHECK(work_type IN ('task','challenge'));
ALTER TABLE tasks ADD COLUMN need_status TEXT NOT NULL DEFAULT 'needed'
  CHECK(need_status IN ('needed','satisfied','retired'));
ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 50;
ALTER TABLE tasks ADD COLUMN why_now TEXT;
ALTER TABLE tasks ADD COLUMN success_metric TEXT;
ALTER TABLE tasks ADD COLUMN published_at TEXT;
ALTER TABLE tasks ADD COLUMN retired_at TEXT;

-- Default-deny publication for the pre-existing catalog. Publish only work that
-- has been explicitly revalidated as a current PCS need.
UPDATE tasks SET publication_state='draft',published_at=NULL WHERE 1=1;

UPDATE tasks
SET publication_state='published',category='research',work_type='task',
    need_status='needed',priority=90,published_at=datetime('now'),
    why_now='This is the first public PCS Commons research program and feeds a live open core obligation.'
WHERE program_id='claim-invalidation-v1';

UPDATE tasks
SET publication_state='published',category='operations',work_type='task',
    need_status='needed',priority=85,published_at=datetime('now'),
    why_now='PCS is entering live contributor-pilot testing and needs unaided usability evidence now.'
WHERE id='OPS-001';

-- Bounded non-research work PCS actually needs for the pilot.
INSERT OR IGNORE INTO tasks(
  id,title,summary,min_level,claim_mode,required_skill,calibrates_skill,expected_hours,
  review_sla_business_days,checkpoint_hours,reservation_hours,max_active_per_user,status,
  compensation_type,compensation_label,funding_status,created_at,updated_at,
  publication_state,category,work_type,need_status,priority,why_now,deliverable,verification_rule,acceptance_criteria,success_metric,published_at
) VALUES
(
  'OPS-002','Run a cross-device contributor-flow QA pass',
  'Test the public PCS contributor journey on desktop and mobile and record reproducible usability, rendering, navigation, and accessibility defects.',
  1,'open',NULL,NULL,2,2,NULL,NULL,2,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'published','operations','task','needed',88,
  'The contributor pilot is live and recent mobile/layout defects show that independent cross-device QA is immediately useful.',
  'A concise issue log covering sign-in, task discovery, qualification, application, account return-path behavior, and at least two viewport sizes.',
  'Every reported defect must include reproduction steps, environment/viewport, expected behavior, actual behavior, and a screenshot when visual.',
  'At least 10 distinct checks are executed; duplicate cosmetic observations are consolidated; blockers are clearly separated from polish.',
  'A reviewer can reproduce every claimed blocker or confirm the tested path works.',
  datetime('now')
),
(
  'ADM-001','Audit the public PCS task and policy links',
  'Check that every public task, contributor rule, governance link, qualification path, and public research packet points to the current destination and does not contradict another page.',
  0,'open',NULL,NULL,1,2,NULL,NULL,2,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'published','administrative','task','needed',72,
  'The site has changed rapidly and the pilot needs a clean public surface before broader invitations.',
  'A table of every checked public route with PASS/FAIL, any contradictory wording, broken links, or stale references, and exact URLs/page labels.',
  'PCS staff independently samples the findings and confirms each reported failure or correction.',
  'No invented issue counts; report negative results when sections are correct.',
  'Public contributor/task/governance navigation is internally consistent.',
  datetime('now')
),
(
  'MKT-001','Draft a one-page PCS explainer for research labs',
  'Create a concise researcher-facing one-page explainer that communicates what PCS proves, reproduces, trusts, and explicitly does not claim.',
  1,'open',NULL,NULL,2,2,NULL,NULL,2,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'published','marketing','task','needed',78,
  'PCS will soon begin small lab outreach and needs a technically accurate artifact before outreach volume increases.',
  'One editable one-page draft plus plain text source, aimed at a technical lab audience.',
  'Review against the Trust Center and current bounded-assurance language; reject any global-safety or arbitrary-science overclaim.',
  'Must explain PCS in under 350 words, name at least one concrete workflow, and distinguish proved/reproduced/trusted.',
  'A researcher unfamiliar with PCS can accurately summarize the value proposition and trust boundary after reading it.',
  datetime('now')
),
(
  'OUT-001','Build the first focused lab-outreach prospect list',
  'Identify a small set of publicly contactable research groups whose computational/reproducibility or AI-safety work plausibly matches the current PCS pilot.',
  1,'open',NULL,NULL,2,2,NULL,NULL,2,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'published','outreach','task','needed',70,
  'PCS needs a small, quality-first pilot prospect list rather than mass outreach.',
  'A 20–30 row CSV with lab/group name, public institutional URL, public contact route, relevant work, and one-sentence PCS-fit rationale.',
  'Every row must be traceable to a public institutional or project source; no scraped private data or guessed emails.',
  'At least 20 plausible prospects; duplicates removed; relevance rationale is specific to current PCS capabilities.',
  'The Founder can select an initial 5–10 outreach targets without doing the research again.',
  datetime('now')
);

-- Ongoing responsibilities are applications, not marketplace tasks.
CREATE TABLE IF NOT EXISTS role_openings (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  category TEXT NOT NULL,
  min_level INTEGER NOT NULL DEFAULT 0,
  required_skill TEXT,
  expected_hours_per_week INTEGER NOT NULL DEFAULT 2,
  slots INTEGER NOT NULL DEFAULT 1,
  responsibilities TEXT NOT NULL,
  selection_criteria TEXT NOT NULL,
  publication_state TEXT NOT NULL DEFAULT 'draft' CHECK(publication_state IN ('draft','published','paused','retired')),
  priority INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS role_applications (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL,
  experience TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  decision_note TEXT,
  FOREIGN KEY(role_id) REFERENCES role_openings(id) ON DELETE RESTRICT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(decided_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_one_active_application
ON role_applications(role_id,user_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_role_applications_status ON role_applications(status,requested_at);

INSERT OR IGNORE INTO role_openings(
  id,title,summary,category,min_level,required_skill,expected_hours_per_week,slots,
  responsibilities,selection_criteria,publication_state,priority,created_at,updated_at
) VALUES
('ROLE-OPS-001','Commons operations / QA volunteer',
 'Help keep contributor workflows, public pages, and issue triage clean during the pilot.',
 'operations',1,NULL,2,2,
 'Run recurring smoke checks; reproduce contributor-reported issues; keep a small QA log; surface blockers quickly.',
 'Reliable communication, careful reproduction notes, and willingness to report that something works when no defect is found.',
 'published',80,datetime('now'),datetime('now')),
('ROLE-COMMS-001','Research communications volunteer',
 'Help translate PCS technical work into accurate, non-hyped researcher-facing communication.',
 'marketing',1,NULL,2,2,
 'Draft short explainers, diagrams/copy briefs, release notes, and outreach collateral while preserving trust-boundary language.',
 'Clear technical writing and a demonstrated ability to avoid overstating what a proof or experiment establishes.',
 'published',70,datetime('now'),datetime('now')),
('ROLE-OUTREACH-001','Research outreach volunteer',
 'Help PCS conduct small, targeted outreach to relevant labs and technical communities.',
 'outreach',1,NULL,2,2,
 'Research appropriate public contacts, personalize approved outreach, track responses, and avoid spam or mass unsolicited campaigns.',
 'Good judgment, concise writing, and respect for public-contact/privacy boundaries.',
 'published',65,datetime('now'),datetime('now'));
