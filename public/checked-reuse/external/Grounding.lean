import Mathlib.Data.Nat.Basic
import Mathlib.Logic.Basic
theorem external_grounding_0 : ∀ (m : Nat) (n : Nat), (¬ (((2 : Nat) * n) = (((2 : Nat) * m) + (1 : Nat)))) := by
  intro m n
  exact Nat.two_mul_ne_two_mul_add_one (m := m) (n := n)
#print axioms external_grounding_0
theorem external_grounding_1 : ∀ (A : Prop) (B : Prop) (C : Prop), ((A → (B → C)) ↔ (B → (A → C))) := by
  intro A B C
  exact Imp.swap
#print axioms external_grounding_1
theorem external_grounding_2 : ∀ (A : Prop), (((¬ A) → A) ↔ A) := by
  intro A
  exact not_imp_self
#print axioms external_grounding_2
