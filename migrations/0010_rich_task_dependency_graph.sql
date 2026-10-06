-- Rich dependency graph semantics for PCS work.
-- Dependency groups let a task express ALL / ANY / AT_LEAST(k) prerequisite logic.
-- Edge relation/artifact_contract make the graph explain what is consumed, not just that "A depends on B".

ALTER TABLE task_dependencies ADD COLUMN group_id TEXT;
ALTER TABLE task_dependencies ADD COLUMN relation TEXT NOT NULL DEFAULT 'requires';
ALTER TABLE task_dependencies ADD COLUMN required_outcome TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE task_dependencies ADD COLUMN artifact_contract TEXT NOT NULL DEFAULT '';
ALTER TABLE task_dependencies ADD COLUMN criticality INTEGER NOT NULL DEFAULT 50;

CREATE TABLE IF NOT EXISTS task_dependency_groups (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  label TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('all','any','at_least')),
  min_satisfied INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_dependency_groups_task ON task_dependency_groups(task_id,sort_order);

-- Existing hard edges are preserved. The first research program now gets explicit
-- semantic contracts for the outputs each downstream stage consumes.
INSERT OR REPLACE INTO task_dependency_groups(id,task_id,label,mode,min_satisfied,description,sort_order) VALUES
('INV-005-inputs','INV-005','Inputs required for independent review','all',2,
 'Independent review must inspect both the executable/adversarial corpus and the dependency-completeness specification.',1),
('INV-006-formalization','INV-006','Formalization gate','all',3,
 'Lean formalization may begin only from an accepted test oracle, accepted semantics contract, and accepted independent review.',1);

UPDATE task_dependencies
SET group_id='INV-005-inputs',
    relation=CASE depends_on_task_id WHEN 'INV-003' THEN 'produces_test_oracle' ELSE 'produces_specification' END,
    required_outcome='completed',
    artifact_contract=CASE depends_on_task_id
      WHEN 'INV-003' THEN 'Accepted differential/adversarial corpus with exact expected impact sets.'
      ELSE 'Accepted dependency-completeness contract with theorem boundary and countermodels.'
    END,
    criticality=95
WHERE task_id='INV-005' AND depends_on_task_id IN ('INV-003','INV-004');

UPDATE task_dependencies
SET group_id='INV-006-formalization',
    relation=CASE depends_on_task_id
      WHEN 'INV-003' THEN 'test_oracle'
      WHEN 'INV-004' THEN 'specification'
      ELSE 'independent_review_gate'
    END,
    required_outcome='completed',
    artifact_contract=CASE depends_on_task_id
      WHEN 'INV-003' THEN 'Accepted executable/adversarial corpus that the formal semantics must agree with.'
      WHEN 'INV-004' THEN 'Accepted formal contract separating reopening soundness from non-impact under dependency completeness.'
      ELSE 'Accepted independent adversarial review with every raised issue resolved or carried as an explicit premise.'
    END,
    criticality=100
WHERE task_id='INV-006' AND depends_on_task_id IN ('INV-003','INV-004','INV-005');

UPDATE task_dependencies
SET relation='informs',required_outcome='completed',
    artifact_contract='Useful prior example/counterexample; this edge informs the downstream work but does not block it.',
    criticality=35
WHERE dependency_type='informative' AND group_id IS NULL;
