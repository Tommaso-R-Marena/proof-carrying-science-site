import GuardedTools

#print axioms GuardedTools.denied_unchanged
#print axioms GuardedTools.authorized_exact_effect
#print axioms GuardedTools.step_safe
#print axioms GuardedTools.arbitrary_proposals_safe
#print axioms GuardedTools.run_append
#print axioms GuardedTools.arbitrary_repair_safe
#print axioms GuardedTools.protected_step
#print axioms GuardedTools.protected_run
#print axioms GuardedTools.protected_state_invariant
#print axioms GuardedTools.legal_completion_exists
#print axioms GuardedTools.safe_completion_exists
#print axioms GuardedTools.completion_bound
#print axioms GuardedTools.late_inspection_does_not_erase_violation

def main (args : List String) : IO Unit := do
  if args == ["--table"] then
    let out ← IO.getStdout
    GuardedTools.table out .delivery 0 4 {} "-" 0 0 0
    GuardedTools.table out .gate 1 4 {} "-" 0 0 0
    GuardedTools.table out .maintenance 2 4 {} "-" 0 0 0
