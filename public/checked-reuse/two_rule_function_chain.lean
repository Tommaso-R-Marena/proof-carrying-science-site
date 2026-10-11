import Lean

theorem PCSReuseL0 : ∀ (P : Prop) (Q : Prop), ((P ∧ Q) → (Q ∧ P)) := by
  intro h0
  intro h1
  intro h2
  constructor
  exact h2.2
  exact h2.1
theorem PCSReuseL1 : ∀ (P : Prop) (Q : Prop), ((P ∧ Q) → P) := by
  intro h0
  intro h1
  intro h2
  exact h2.1
theorem PCSReuseL2 : ∀ (P : Prop) (Q : Prop), (P → (Q → (P ∧ Q))) := by
  intro h0
  intro h1
  intro h2
  intro h3
  constructor
  exact h2
  exact h3
theorem PCSReuseL3 : ∀ (P : Prop) (Q : Prop), ((P → Q) → (P → Q)) := by
  intro h0
  intro h1
  intro h2
  exact h2
theorem PCSReuseL4 : ∀ (n : Nat) (m : Nat), ((n + m) = (m + n)) := by
  intro h0
  intro h1
  apply Nat.add_comm
theorem PCSReuseL5 : ∀ (f : Nat → Nat) (g : Nat → Nat), (((∀ (v2 : Nat), (∀ (v3 : Nat), (((f v2) = (f v3)) → (v2 = v3)))) ∧ (∀ (v4 : Nat), (∀ (v5 : Nat), (((g v4) = (g v5)) → (v4 = v5))))) → (∀ (v0 : Nat), (∀ (v1 : Nat), (((g (f v0)) = (g (f v1))) → (v0 = v1))))) := by
  intro h0
  intro h1
  intro h2
  intro h3
  intro h4
  intro h5
  apply h2.1
  apply h2.2
  exact h5

theorem pcs_two_rule_function_chain : ∀ (f : Nat → Nat) (g : Nat → Nat) (h : Nat → Nat), (((∀ (a : Nat), ((f a) = (g a))) ∧ (∀ (b : Nat), ((g b) = (h b)))) → (∀ (c : Nat), ((f (f c)) = (h (h c))))) := by
  intro h0
  intro h1
  intro h2
  intro h3
  intro h4
  rw [h3.1]
  rw [h3.1]
  rw [h3.2]
  rw [h3.2]
#print axioms pcs_two_rule_function_chain
