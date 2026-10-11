import Std

theorem pcs_authored_arithmetic_demo : ∀ (a : Nat) (b : Nat), ((a = b) → (((a + (0 : Nat)) = b) ∧ (((0 : Nat) + a) = (b + (0 : Nat))))) := by
  intro h0
  intro h1
  intro h2
  rw [h2]
  constructor
  simp only [Nat.add_zero, Nat.zero_add, Nat.mul_zero, Nat.zero_mul, Nat.mul_one, Nat.one_mul]
  apply Nat.add_comm

#print axioms pcs_authored_arithmetic_demo
