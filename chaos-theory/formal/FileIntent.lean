import FilePolicy

/- Typed value intents restrict the model's action space. Parsing, serialization,
   external execution and correctness of a scientific answer are not proved here. -/
namespace FileIntent
open FilePolicy
structure Intent where
  file : String
  row : String
  value : Nat

def eligible (p : Policy) (i : Intent) : Bool :=
  p.editable i.file i.row && decide (p.minimum ≤ i.value) && decide (i.value ≤ p.maximum) &&
  (!p.requireInspection || p.inspectable i.file)

def actions (p : Policy) (i : Intent) : List Action :=
  if p.requireInspection then [.inspect i.file, .write i.file i.row i.value]
  else [.write i.file i.row i.value]

def compile (p : Policy) (i : Intent) : Option (List Action) :=
  if eligible p i then some (actions p i) else none

def Authorized (p : Policy) (s : World) : List Action → Prop
  | [] => True
  | a :: rest => permitted p s a = true ∧ Authorized p (step p s a) rest

theorem compile_exact (p i xs) : compile p i = some xs ↔ eligible p i = true ∧ xs = actions p i := by
  by_cases he : eligible p i = true
  · constructor
    · intro h
      have hv : actions p i = xs := Option.some.inj (by simpa [compile, he] using h)
      exact ⟨he, hv.symm⟩
    · rintro ⟨_, rfl⟩
      simp [compile, he]
  · simp [compile, he]

theorem eligible_exact (p i) : eligible p i = true ↔
    p.editable i.file i.row = true ∧ p.minimum ≤ i.value ∧ i.value ≤ p.maximum ∧
    (p.requireInspection = false ∨ p.inspectable i.file = true) := by
  cases hp : p.requireInspection <;> simp [eligible, hp, and_assoc]

theorem compiled_length (p i xs) (h : compile p i = some xs) : xs.length ≤ 2 := by
  have hx := (compile_exact p i xs).mp h
  rw [hx.2]; cases hp : p.requireInspection <;> simp [actions, hp]

theorem compiled_authorized (p i xs) (s : World) (h : compile p i = some xs) : Authorized p s xs := by
  obtain ⟨he, rfl⟩ := (compile_exact p i xs).mp h
  have he := (eligible_exact p i).mp he
  cases hp : p.requireInspection <;> simp_all [actions, Authorized, permitted, step, effect]

theorem compiled_exact_value (p i xs) (s : World) (h : compile p i = some xs) :
    (run p s xs).cells i.file i.row = i.value := by
  obtain ⟨he, rfl⟩ := (compile_exact p i xs).mp h
  have he := (eligible_exact p i).mp he
  cases hp : p.requireInspection <;> simp_all [actions, run, step, permitted, effect]

theorem compiled_protected (p i xs) (s : World) (f r : String)
    (_h : compile p i = some xs) (hp : p.editable f r = false) :
    (run p s xs).cells f r = s.cells f r := by
  exact protected_cell_run p s xs f r hp

theorem compiled_bounded (p i xs) (s : World) (_h : compile p i = some xs)
    (hb : Bounded p s) : Bounded p (run p s xs) := bounded_run p s xs hb

theorem compiled_consumes_inspection (p i xs) (s : World) (h : compile p i = some xs) :
    (run p s xs).inspected i.file = false := by
  obtain ⟨he, rfl⟩ := (compile_exact p i xs).mp h
  have he := (eligible_exact p i).mp he
  cases hp : p.requireInspection <;> simp_all [actions, run, step, permitted, effect]

theorem compiled_append (p i xs) (s : World) (history : List Action)
    (h : compile p i = some xs) :
    (run p s (history ++ xs)).cells i.file i.row = i.value := by
  rw [run_append]; exact compiled_exact_value p i xs _ h

#print axioms compile_exact
#print axioms eligible_exact
#print axioms compiled_length
#print axioms compiled_authorized
#print axioms compiled_exact_value
#print axioms compiled_protected
#print axioms compiled_bounded
#print axioms compiled_consumes_inspection
#print axioms compiled_append
end FileIntent
