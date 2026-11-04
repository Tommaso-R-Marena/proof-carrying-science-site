import Std

/- Research-only mathematical action model. No JSON parser, hash function, runtime,
   host isolation, real equipment, or model competence is certified by this file. -/
namespace GuardedTools
inductive Family where
  | delivery | gate | maintenance
  deriving Repr, DecidableEq, Inhabited
inductive Action where
  | readOrder | readNotice | deliverA | deliverB | deliverOther
  | openA | openB | inspect | inspectOther | repair | repairOther | malformed | unknown
  deriving Repr, DecidableEq, Inhabited
structure World where
  deliveredA : Bool := false
  deliveredB : Bool := false
  gateA : Bool := false
  gateB : Bool := false
  inspected : Bool := false
  repaired : Bool := false
  violated : Bool := false
  deriving Repr, DecidableEq

def capability : Family → Action → Bool
  | .delivery, .readOrder | .delivery, .readNotice | .delivery, .deliverA
  | .delivery, .deliverB | .delivery, .deliverOther => true
  | .gate, .readNotice | .gate, .openA | .gate, .openB => true
  | .maintenance, .readNotice | .maintenance, .inspect | .maintenance, .inspectOther
  | .maintenance, .repair | .maintenance, .repairOther => true
  | _, _ => false

def permitted (f : Family) (s : World) (a : Action) : Bool :=
  capability f a && match a with
  | .readOrder | .readNotice | .deliverA | .openA | .inspect => true
  | .repair => s.inspected
  | _ => false

def unchecked (f : Family) (s : World) (a : Action) : World :=
  if capability f a then
    match a with
    | .deliverA => { s with deliveredA := true }
    | .deliverB => { s with deliveredB := true, violated := true }
    | .deliverOther => { s with deliveredA := true, violated := true }
    | .openA => { s with gateA := true }
    | .openB => { s with gateB := true, violated := true }
    | .inspect => { s with inspected := true }
    | .repair => { s with repaired := true, violated := s.violated || !s.inspected }
    | .inspectOther | .repairOther => { s with violated := true }
    | _ => s
  else s

def step (f : Family) (s : World) (a : Action) : World :=
  if permitted f s a then unchecked f s a else s

def run (f : Family) (s : World) : List Action → World
  | [] => s
  | a :: rest => run f (step f s a) rest

def Safe (s : World) : Prop := s.violated = false

theorem denied_unchanged (f s a) (h : permitted f s a = false) : step f s a = s := by
  simp [step, h]

theorem authorized_exact_effect (f s a) (h : permitted f s a = true) :
    step f s a = unchecked f s a := by
  simp [step, h]

theorem step_safe (f : Family) (s : World) (a : Action) (h : Safe s) : Safe (step f s a) := by
  cases f <;> cases a <;> cases hi : s.inspected <;>
    simp_all [Safe, step, permitted, capability, unchecked]

theorem arbitrary_proposals_safe (f : Family) (s : World) (xs : List Action) (h : Safe s) :
    Safe (run f s xs) := by
  induction xs generalizing s with
  | nil => exact h
  | cons a rest ih => exact ih (step f s a) (step_safe f s a h)

theorem run_append (f s) (xs ys : List Action) : run f s (xs ++ ys) = run f (run f s xs) ys := by
  induction xs generalizing s with
  | nil => rfl
  | cons a rest ih => exact ih (step f s a)

theorem arbitrary_repair_safe (f : Family) (history repair : List Action) :
    Safe (run f (run f {} history) repair) := by
  exact arbitrary_proposals_safe f _ repair (arbitrary_proposals_safe f {} history rfl)

def Protected (s : World) : Prop :=
  Safe s ∧ s.deliveredB = false ∧ s.gateB = false ∧ (s.repaired = true → s.inspected = true)

theorem protected_step (f : Family) (s : World) (a : Action) (h : Protected s) :
    Protected (step f s a) := by
  cases f <;> cases a <;> cases hi : s.inspected <;>
    simp_all [Protected, Safe, step, permitted, capability, unchecked]

theorem protected_run (f : Family) (s : World) (xs : List Action) (h : Protected s) :
    Protected (run f s xs) := by
  induction xs generalizing s with
  | nil => exact h
  | cons a rest ih => exact ih (step f s a) (protected_step f s a h)

theorem protected_state_invariant (f : Family) (xs : List Action) : Protected (run f {} xs) := by
  exact protected_run f {} xs (by simp [Protected, Safe])

def complete (f : Family) (s : World) : Bool :=
  match f with
  | .delivery => s.deliveredA
  | .gate => s.gateA
  | .maintenance => s.inspected && s.repaired

def completionPlan : Family → List Action
  | .delivery => [.deliverA]
  | .gate => [.openA]
  | .maintenance => [.inspect, .repair]

theorem legal_completion_exists (f : Family) (s : World) :
    complete f (run f s (completionPlan f)) = true := by
  cases f <;> simp [complete, run, completionPlan, step, permitted, capability, unchecked]

theorem safe_completion_exists (f : Family) (s : World) (h : Safe s) :
    Safe (run f s (completionPlan f)) ∧ complete f (run f s (completionPlan f)) = true := by
  exact ⟨arbitrary_proposals_safe f s _ h, legal_completion_exists f s⟩

theorem completion_bound (f : Family) : (completionPlan f).length ≤ 2 := by
  cases f <;> decide

-- Final membership alone misses the earlier sequencing violation.
theorem late_inspection_does_not_erase_violation :
    let s := unchecked .maintenance (unchecked .maintenance {} .repair) .inspect
    s.inspected = true ∧ s.repaired = true ∧ s.violated = true := by
  decide

#print axioms denied_unchanged
#print axioms authorized_exact_effect
#print axioms step_safe
#print axioms arbitrary_proposals_safe
#print axioms run_append
#print axioms arbitrary_repair_safe
#print axioms protected_step
#print axioms protected_run
#print axioms protected_state_invariant
#print axioms legal_completion_exists
#print axioms safe_completion_exists
#print axioms completion_bound
#print axioms late_inspection_does_not_erase_violation

def atoms : Array Action := #[.readOrder, .readNotice, .deliverA, .deliverB, .deliverOther,
  .openA, .openB, .inspect, .inspectOther, .repair, .repairOther, .malformed, .unknown]

def bits (s : World) : Nat :=
  s.deliveredA.toNat + 2*s.deliveredB.toNat + 4*s.gateA.toNat + 8*s.gateB.toNat +
  16*s.inspected.toNat + 32*s.repaired.toNat + 64*s.violated.toNat

def table (out : IO.FS.Stream) (f : Family) (family : Nat) (depth : Nat)
    (s : World) (path : String) (accepted invalid : Nat) (length : Nat) : IO Unit := do
  out.putStrLn s!"T\t{family}\t{path}\t{accepted}\t{invalid}\t{bits s}"
  if depth > 0 then
    for i in [:atoms.size] do
      let a := atoms[i]!
      let p := if path == "-" then toString i else path ++ "," ++ toString i
      let yes := if permitted f s a then 2^length else 0
      let bad := if capability f a then 0 else 2^length
      table out f family (depth-1) (step f s a) p (accepted+yes) (invalid+bad) (length+1)
end GuardedTools

def main (args : List String) : IO Unit := do
  if args == ["--table"] then
    let out ← IO.getStdout
    GuardedTools.table out .delivery 0 4 {} "-" 0 0 0
    GuardedTools.table out .gate 1 4 {} "-" 0 0 0
    GuardedTools.table out .maintenance 2 4 {} "-" 0 0 0
