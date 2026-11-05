import FileIntent
namespace FileConversion
open FilePolicy FileIntent

def agrees (source factor proposed : Nat) : Bool := decide (proposed = source * factor)
def compile (p : Policy) (i : Intent) (source factor : Nat) : Option (List Action) :=
  if agrees source factor i.value then FileIntent.compile p i else none

theorem matches_exact (s k v : Nat) : agrees s k v = true ↔ v = s * k := by simp [agrees]
theorem rejects_wrong (p i s k) (h : i.value ≠ s * k) : compile p i s k = none := by simp [compile, agrees, h]
theorem accepted_relation (p i s k xs) (h : compile p i s k = some xs) : i.value = s * k := by
  by_cases he : i.value = s*k
  · exact he
  · simp [compile, agrees, he] at h

theorem accepted_policy (p i s k xs) (h : compile p i s k = some xs) : FileIntent.compile p i = some xs := by
  have he := accepted_relation p i s k xs h
  simpa [compile, agrees, he] using h

theorem exact_output (p i s k xs) (world : World) (h : compile p i s k = some xs) :
    (run p world xs).cells i.file i.row = s*k := by
  rw [FileIntent.compiled_exact_value p i xs world (accepted_policy p i s k xs h)]
  exact accepted_relation p i s k xs h

theorem protected_output (p i s k xs) (world : World) (f r : String)
    (_h : compile p i s k = some xs) (hp : p.editable f r = false) :
    (run p world xs).cells f r = world.cells f r := protected_cell_run p world xs f r hp

theorem bounded_output (p i s k xs) (world : World) (_h : compile p i s k = some xs)
    (hb : Bounded p world) : Bounded p (run p world xs) := bounded_run p world xs hb

theorem history_exact_output (p i s k xs) (world : World) (history : List Action)
    (h : compile p i s k = some xs) : (run p world (history ++ xs)).cells i.file i.row = s*k := by
  rw [run_append]; exact exact_output p i s k xs _ h

/-- Permission safety alone does not prove the required calculation. -/
theorem safe_wrong_exists : ∃ (p : Policy) (i : Intent) (xs : List Action),
    FileIntent.compile p i = some xs ∧ compile p i 7 1000 = none := by
  let p : Policy := ⟨fun _ _ => true, fun _ => true, 0, 1000000, true⟩
  let i : Intent := ⟨"measurement", "sample", 8⟩
  exact ⟨p, i, [.inspect "measurement", .write "measurement" "sample" 8], by decide, by decide⟩

#print axioms matches_exact
#print axioms rejects_wrong
#print axioms accepted_relation
#print axioms accepted_policy
#print axioms exact_output
#print axioms protected_output
#print axioms bounded_output
#print axioms history_exact_output
#print axioms safe_wrong_exists
end FileConversion
