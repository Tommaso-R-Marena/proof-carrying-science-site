import Lean

theorem pcs_live_verified : ∀ (R : Prop) (S : Prop), ((R ∧ S) → ((S ∧ R) ∧ S)) := by
  intro h0
  intro h1
  intro h2
  constructor
  constructor
  exact h2.2
  exact h2.1
  exact h2.2

#print axioms pcs_live_verified
