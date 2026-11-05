import Std

/- General mathematical file policy. Filesystem/CSV/JSON implementations, hashes,
   host integrity, task correctness and scientific validity are not proved here. -/
namespace FilePolicy
structure Policy where
  editable : String → String → Bool
  inspectable : String → Bool
  minimum : Nat
  maximum : Nat
  requireInspection : Bool

structure World where
  cells : String → String → Nat
  inspected : String → Bool

inductive Action where
  | inspect (file : String)
  | write (file row : String) (value : Nat)
  | invalid
  deriving Repr, DecidableEq

def permitted (p : Policy) (s : World) : Action → Bool
  | .inspect f => p.inspectable f
  | .write f r v => p.editable f r && (!p.requireInspection || s.inspected f) &&
      decide (p.minimum ≤ v) && decide (v ≤ p.maximum)
  | .invalid => false

def effect (s : World) : Action → World
  | .inspect f => { s with inspected := fun q => if q = f then true else s.inspected q }
  | .write f r v => {
      cells := fun q k => if q = f ∧ k = r then v else s.cells q k
      inspected := fun q => if q = f then false else s.inspected q }
  | .invalid => s

def step (p : Policy) (s : World) (a : Action) : World :=
  if permitted p s a then effect s a else s

def run (p : Policy) (s : World) : List Action → World
  | [] => s
  | a :: rest => run p (step p s a) rest

theorem denied_unchanged (p s a) (h : permitted p s a = false) : step p s a = s := by
  simp [step, h]

theorem write_exact_permission (p s f r v) : permitted p s (.write f r v) = true ↔
    p.editable f r = true ∧ (p.requireInspection = false ∨ s.inspected f = true) ∧
    p.minimum ≤ v ∧ v ≤ p.maximum := by
  cases hi : p.requireInspection <;> simp [permitted, hi, and_assoc]

theorem inspect_exact_permission (p s f) : permitted p s (.inspect f) = p.inspectable f := rfl

theorem protected_cell_step (p : Policy) (s : World) (a : Action) (f r : String)
    (h : p.editable f r = false) : (step p s a).cells f r = s.cells f r := by
  cases a with
  | inspect q => cases hi : p.inspectable q <;> simp [step, permitted, hi, effect]
  | invalid => rfl
  | write q k v =>
    by_cases ha : permitted p s (.write q k v) = true
    · have he := (write_exact_permission p s q k v).mp ha
      have hn : ¬(f = q ∧ r = k) := by
        intro ⟨hf, hr⟩
        subst q; subst k
        simp [h] at he
      simp [step, ha, effect, hn]
    · simp [step, ha]

theorem protected_cell_run (p : Policy) (s : World) (xs : List Action) (f r : String)
    (h : p.editable f r = false) : (run p s xs).cells f r = s.cells f r := by
  induction xs generalizing s with
  | nil => rfl
  | cons a rest ih =>
    rw [run, ih, protected_cell_step p s a f r h]

def Bounded (p : Policy) (s : World) : Prop :=
  ∀ f r, p.editable f r = true → p.minimum ≤ s.cells f r ∧ s.cells f r ≤ p.maximum

theorem bounded_step (p : Policy) (s : World) (a : Action) (h : Bounded p s) : Bounded p (step p s a) := by
  intro f r hf
  cases a with
  | inspect q => cases hi : p.inspectable q <;> simpa [step, permitted, hi, effect] using h f r hf
  | invalid => exact h f r hf
  | write q k v =>
    by_cases ha : permitted p s (.write q k v) = true
    · have he := (write_exact_permission p s q k v).mp ha
      by_cases ht : f = q ∧ r = k
      · simpa [step, ha, effect, ht] using And.intro he.2.2.1 he.2.2.2
      · simpa [step, ha, effect, ht] using h f r hf
    · simpa [step, ha] using h f r hf

theorem bounded_run (p : Policy) (s : World) (xs : List Action) (h : Bounded p s) : Bounded p (run p s xs) := by
  induction xs generalizing s with
  | nil => exact h
  | cons a rest ih => exact ih _ (bounded_step p s a h)

theorem write_requires_current_inspection (p s f r v)
    (hp : p.requireInspection = true) (ha : permitted p s (.write f r v) = true) : s.inspected f = true := by
  have h := (write_exact_permission p s f r v).mp ha
  simp [hp] at h
  exact h.2.1

theorem write_consumes_inspection (p s f r v) (h : permitted p s (.write f r v) = true) :
    (step p s (.write f r v)).inspected f = false := by
  simp [step, h, effect]

theorem second_write_requires_reinspection (p s f r v k w)
    (hp : p.requireInspection = true) (ha : permitted p s (.write f r v) = true) :
    permitted p (step p s (.write f r v)) (.write f k w) = false := by
  simp [permitted, hp, write_consumes_inspection p s f r v ha]

theorem run_append (p s) (xs ys : List Action) : run p s (xs ++ ys) = run p (run p s xs) ys := by
  induction xs generalizing s with
  | nil => rfl
  | cons a rest ih => exact ih (step p s a)

theorem legal_value_reachable (p s f r v)
    (hi : p.inspectable f = true) (he : p.editable f r = true)
    (hmin : p.minimum ≤ v) (hmax : v ≤ p.maximum) :
    (run p s [.inspect f, .write f r v]).cells f r = v := by
  cases hp : p.requireInspection <;> simp [run, step, permitted, hi, he, hmin, hmax, effect, hp]

#print axioms denied_unchanged
#print axioms write_exact_permission
#print axioms inspect_exact_permission
#print axioms protected_cell_step
#print axioms protected_cell_run
#print axioms bounded_step
#print axioms bounded_run
#print axioms write_requires_current_inspection
#print axioms write_consumes_inspection
#print axioms second_write_requires_reinspection
#print axioms run_append
#print axioms legal_value_reachable
end FilePolicy
