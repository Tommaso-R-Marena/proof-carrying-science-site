import Std

namespace PCS.SearchCertificate

inductive Walk {S : Type} (step : S → S → Prop) : Nat → S → S → Prop
  | nil (s : S) : Walk step 0 s s
  | cons {n : Nat} {s t u : S} : step s t → Walk step n t u → Walk step (n + 1) s u

theorem potential_lower_bound {S : Type} (step : S → S → Prop)
    (goal : S → Prop) (p : S → Nat)
    (goal_zero : ∀ s, goal s → p s = 0)
    (edge_bound : ∀ s t, step s t → p s ≤ p t + 1)
    {n : Nat} {s t : S} (path : Walk step n s t) (finish : goal t) : p s ≤ n := by
  revert finish
  induction path with
  | nil s =>
    intro finish
    have h := goal_zero s finish
    omega
  | @cons n s t u edge tail ih =>
    intro finish
    have h := edge_bound s t edge
    have bound := ih finish
    omega

theorem descending_witness {S : Type} (step : S → S → Prop)
    (goal : S → Prop) (p : S → Nat)
    (zero_goal : ∀ s, p s = 0 → goal s)
    (descend : ∀ s, 0 < p s → ∃ t, step s t ∧ p t + 1 = p s) :
    ∀ n s, p s = n → ∃ t, goal t ∧ Walk step n s t := by
  intro n
  induction n with
  | zero =>
    intro s h
    exact ⟨s, zero_goal s h, Walk.nil s⟩
  | succ n ih =>
    intro s h
    obtain ⟨t, edge, smaller⟩ := descend s (by omega)
    have ht : p t = n := by omega
    obtain ⟨u, finish, path⟩ := ih t ht
    exact ⟨u, finish, Walk.cons edge path⟩

theorem exact_edit_distance {S : Type} (step : S → S → Prop)
    (goal : S → Prop) (p : S → Nat)
    (zero_iff : ∀ s, p s = 0 ↔ goal s)
    (edge_bound : ∀ s t, step s t → p s ≤ p t + 1)
    (descend : ∀ s, 0 < p s → ∃ t, step s t ∧ p t + 1 = p s)
    (s : S) :
    (∃ t, goal t ∧ Walk step (p s) s t) ∧
    (∀ n t, Walk step n s t → goal t → p s ≤ n) := by
  constructor
  · exact descending_witness step goal p (fun x h => (zero_iff x).mp h) descend (p s) s rfl
  · intro n t path finish
    exact potential_lower_bound step goal p (fun x h => (zero_iff x).mpr h) edge_bound path finish

#print axioms potential_lower_bound
#print axioms descending_witness
#print axioms exact_edit_distance
end PCS.SearchCertificate
