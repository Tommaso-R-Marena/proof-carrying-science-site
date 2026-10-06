-- Enrich the non-blocking edges of Claim Invalidation v1.
-- These edges remain informative, but now state the exact upstream artifact role.

UPDATE task_dependencies
SET relation='positive_fixture_baseline',
    required_outcome='completed',
    artifact_contract='Accepted minimal positive invalidation fixture with hand-checkable exact downstream impact sets; useful as a baseline case for differential/adversarial tests.',
    criticality=42,
    rationale='Use an accepted minimal positive fixture as a regression baseline when available; this informs but does not block the Python corpus task.'
WHERE task_id='INV-003' AND depends_on_task_id='INV-001';

UPDATE task_dependencies
SET relation='negative_control_counterexample',
    required_outcome='completed',
    artifact_contract='Accepted hidden-dependency counterexample that demonstrates the dependency-completeness boundary; useful as a negative control against unsound non-impact inference.',
    criticality=58,
    rationale='Use an accepted hidden-dependency counterexample as a negative control when available; this informs but does not block the Python corpus task.'
WHERE task_id='INV-003' AND depends_on_task_id='INV-002';

UPDATE task_dependencies
SET relation='minimal_model_example',
    required_outcome='completed',
    artifact_contract='Accepted minimal declared dependency graph with exact reachability semantics; useful as a concrete witness/example while writing the completeness contract.',
    criticality=38,
    rationale='Use an accepted minimal fixture as a concrete example while specifying graph semantics; it does not gate specification work.'
WHERE task_id='INV-004' AND depends_on_task_id='INV-001';

UPDATE task_dependencies
SET relation='countermodel_for_assumption',
    required_outcome='completed',
    artifact_contract='Accepted hidden-dependency counterexample showing why graph non-reachability does not imply real-world non-impact without a dependency-completeness premise.',
    criticality=72,
    rationale='Use the hidden-dependency counterexample as the principal countermodel motivating the completeness assumption; it informs but does not gate specification work.'
WHERE task_id='INV-004' AND depends_on_task_id='INV-002';
