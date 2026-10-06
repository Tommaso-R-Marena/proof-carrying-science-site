-- First public PCS Commons research program:
-- Claim/evidence invalidation reachability under explicit dependency completeness.

ALTER TABLE tasks ADD COLUMN program_id TEXT;
ALTER TABLE tasks ADD COLUMN program_step INTEGER;
ALTER TABLE tasks ADD COLUMN source_ref TEXT;
ALTER TABLE tasks ADD COLUMN deliverable TEXT;
ALTER TABLE tasks ADD COLUMN verification_rule TEXT;
ALTER TABLE tasks ADD COLUMN acceptance_criteria TEXT;

CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL DEFAULT 'informative' CHECK(dependency_type IN ('informative','hard')),
  rationale TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(task_id,depends_on_task_id),
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY(depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id,dependency_type);

INSERT OR REPLACE INTO tasks(
  id,title,summary,min_level,claim_mode,required_skill,calibrates_skill,expected_hours,
  review_sla_business_days,checkpoint_hours,reservation_hours,max_active_per_user,status,
  compensation_type,compensation_label,funding_status,created_at,updated_at,
  program_id,program_step,source_ref,deliverable,verification_rule,acceptance_criteria
) VALUES
(
  'INV-001','Add one minimal claim-invalidation fixture',
  'Extend the public PCS invalidation corpus with one small dependency graph whose expected affected artifacts, evidence, and claims can be checked by hand.',
  0,'open',NULL,NULL,1,2,NULL,NULL,2,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'claim-invalidation-v1',1,'pcs/impact.py + docs/FORMAL_SEMANTICS_DRAFT.md §7',
  'One valid corpus JSON case plus a short explanation of why every expected affected node is downstream of the changed artifact.',
  'Schema validation, deterministic reference-run comparison, and human review of the expected reachability set.',
  'Fixture is minimal; IDs are unique; expected sets are exact; no hidden dependency is assumed; explanation identifies every dependency edge used.'
),
(
  'INV-002','Build a hidden-dependency counterexample',
  'Construct a minimal example showing why an unreachable claim cannot be declared unaffected unless the dependency graph is complete.',
  1,'open',NULL,NULL,2,2,NULL,NULL,2,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'claim-invalidation-v1',2,'docs/FORMAL_SEMANTICS_DRAFT.md §7 dependency-completeness boundary',
  'One counterexample fixture plus a concise statement of the hidden dependency and the unsound non-impact inference it defeats.',
  'Human review checks that graph reachability alone misses the real-world dependency while conservative reopening remains sound.',
  'Counterexample is genuinely minimal; hidden dependency is explicit in prose but absent from the declared graph; no claim is made that PCS can infer hidden dependencies.'
),
(
  'INV-003','Extend the invalidation differential/adversarial corpus',
  'Add a rigorous Python test contribution covering adversarial graph shapes and edge cases for pcs.impact.impact_from_artifacts.',
  2,'approval','python',NULL,4,2,24,72,1,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'claim-invalidation-v1',3,'pcs/impact.py + public claim-invalidation-v1 corpus',
  'A patch or standalone test artifact with at least eight independently justified cases and exact expected impact sets.',
  'Tests must run deterministically against the published reference function; false positives/false negatives are reviewed case by case.',
  'Must include direct evidence dependency, transitive workflow dependency, unrelated branch, changed intermediate/output artifact, duplicate consumer path, cycle-safe propagation, multi-claim evidence, and at least one dependency-completeness negative control.'
),
(
  'INV-004','Specify the dependency-completeness contract',
  'Turn the paper caveat into a precise, reviewable contract stating exactly what must be represented before PCS may infer that unreachable claims remain unaffected.',
  3,'approval','research',NULL,4,2,24,72,1,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'claim-invalidation-v1',4,'docs/FORMAL_SEMANTICS_DRAFT.md §7 + docs/RESEARCH_AGENDA.md Program B',
  'A bounded specification with definitions, theorem statement, assumptions, non-goals, and at least two countermodels showing why dependency completeness cannot be dropped.',
  'Independent reviewer checks that the contract distinguishes conservative reopening from the stronger non-impact conclusion.',
  'Must define graph nodes/edges, changed-node semantics, reachability, dependency completeness, reopen soundness, and the stronger non-impact theorem separately.'
),
(
  'INV-005','Independently review the invalidation semantics and corpus',
  'Act as an adversarial reviewer of the accepted corpus and dependency-completeness specification before they can feed the formal theorem task.',
  4,'invite','review',NULL,4,2,24,72,1,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'claim-invalidation-v1',5,'INV-003 + INV-004 accepted outputs',
  'A structured review identifying any unsound expected impacts, missing dependency class, ambiguity, or theorem overclaim; conclude ACCEPT, NEEDS_CHANGES, or REJECT.',
  'Founder/Owner checks review independence and verifies every raised issue is either resolved or explicitly carried as an open premise.',
  'Reviewer must test at least three mutations, include one attempted false-negative and one attempted false-positive, and explicitly assess the dependency-completeness assumption.'
),
(
  'INV-006','Formalize invalidation reachability soundness in Lean',
  'Prove the PCS invalidation theorem target in Lean: declared downstream dependencies must reopen when an upstream artifact changes, with any stronger non-impact result conditioned on explicit dependency completeness.',
  5,'invite','lean',NULL,8,2,24,120,1,'open',
  'volunteer','Volunteer','open',datetime('now'),datetime('now'),
  'claim-invalidation-v1',6,'formal/PCS/V2/ (new Invalidation module) + accepted INV-003/004/005 outputs',
  'A compiling Lean module and tests formalizing the graph/reachability model and the strongest sound invalidation theorem justified by the accepted specification.',
  'lake build PCS must pass; theorem dependency audit must use no sorry/admit tactic/project axiom/unsafe/extern/native_decide; counterexamples/non-impact premises must remain explicit.',
  'At minimum prove affected-reachability reopening soundness. Any theorem that unreachable claims remain valid must require a clearly named dependency-completeness hypothesis. Do not formalize hidden dependencies away by definition.'
);

INSERT OR REPLACE INTO task_dependencies(task_id,depends_on_task_id,dependency_type,rationale) VALUES
('INV-003','INV-001','informative','Use accepted minimal fixtures when available; the Python test task may begin in parallel.'),
('INV-003','INV-002','informative','Use accepted hidden-dependency counterexamples as negative controls when available.'),
('INV-004','INV-001','informative','Minimal fixtures are useful examples but do not gate the research specification.'),
('INV-004','INV-002','informative','The hidden-dependency counterexample should inform the completeness contract.'),
('INV-005','INV-003','hard','Independent review must inspect an accepted adversarial/differential corpus.'),
('INV-005','INV-004','hard','Independent review must inspect an accepted dependency-completeness specification.'),
('INV-006','INV-003','hard','The formal theorem must target the accepted executable/adversarial corpus semantics.'),
('INV-006','INV-004','hard','The formal theorem must implement the accepted dependency-completeness contract.'),
('INV-006','INV-005','hard','Formalization begins only after independent semantic review is accepted.');
