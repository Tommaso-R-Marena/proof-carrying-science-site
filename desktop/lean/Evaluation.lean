import Review

/-! Exact finite evaluation of two sets of outputs against supplied reference
labels. Label truth, dataset selection and physical model generation are external
assumptions. There is no universal or scientific model-safety conclusion here. -/
namespace PCSFiles.Evaluation
open PCSFiles.OriginalCsv PCSFiles.Review PCS.V2.Csv

structure Case where
  id : Bytes
  expected : Bytes
  before : Bytes
  after : Bytes
  deriving DecidableEq, Repr

def oldCorrect (c : Case) : Bool := c.before == c.expected
def newCorrect (c : Case) : Bool := c.after == c.expected
def oldMatches (cs : List Case) : Nat := (cs.filter oldCorrect).length
def newMatches (cs : List Case) : Nat := (cs.filter newCorrect).length
def improvements (cs : List Case) : Nat := (cs.filter (fun c => !oldCorrect c && newCorrect c)).length
def regressions (cs : List Case) : Nat := (cs.filter (fun c => oldCorrect c && !newCorrect c)).length
def preserves (cs : List Case) : Bool := regressions cs == 0

theorem balance (cs : List Case) :
    newMatches cs + regressions cs = oldMatches cs + improvements cs := by
  induction cs with
  | nil => simp [newMatches, oldMatches, regressions, improvements]
  | cons c cs ih =>
    cases ho : oldCorrect c <;> cases hn : newCorrect c <;>
      simp [newMatches, oldMatches, regressions, improvements, ho, hn] at * <;> omega

theorem zero_regressions_iff (cs : List Case) :
    regressions cs = 0 ↔ ∀ c ∈ cs, oldCorrect c = true → newCorrect c = true := by
  simp [regressions, List.length_eq_zero_iff, List.filter_eq_nil_iff, Bool.and_eq_true]

theorem preserves_iff (cs : List Case) :
    preserves cs = true ↔ ∀ c ∈ cs, c.before = c.expected → c.after = c.expected := by
  simp [preserves, zero_regressions_iff, oldCorrect, newCorrect]

theorem preservation_matches_mono (cs : List Case) (h : preserves cs = true) :
    oldMatches cs ≤ newMatches cs := by
  have hz : regressions cs = 0 := by simpa [preserves] using h
  have hb := balance cs
  omega

def lookup (key : Bytes) : List Entry → Option Entry
  | [] => none
  | e :: es => if e.id == key then some e else lookup key es

theorem lookup_sound (key : Bytes) (xs : List Entry) (e : Entry)
    (h : lookup key xs = some e) : e ∈ xs ∧ e.id = key := by
  induction xs with
  | nil => simp [lookup] at h
  | cons x xs ih =>
    simp only [lookup] at h
    split at h
    · cases h; exact ⟨by simp, by simpa using (show (e.id == key) = true from by assumption)⟩
    · obtain ⟨hm, he⟩ := ih h
      exact ⟨by simp [hm], he⟩

def align (refs before after : List Entry) : Option (List Case) :=
  match refs with
  | [] => some []
  | r :: rs => do
    let b ← lookup r.id before
    let a ← lookup r.id after
    let [label] := r.values | none
    let [old] := b.values | none
    let [new] := a.values | none
    let tail ← align rs before after
    some (⟨r.id, label, old, new⟩ :: tail)

theorem align_ids (refs before after : List Entry) (cs : List Case)
    (h : align refs before after = some cs) : cs.map Case.id = refs.map Entry.id := by
  induction refs generalizing cs with
  | nil => simp [align] at h; subst cs; rfl
  | cons r rs ih =>
    simp only [align] at h
    cases hb : lookup r.id before <;> simp [hb] at h
    rename_i b
    cases ha : lookup r.id after <;> simp [ha] at h
    rename_i a
    split at h <;> try contradiction
    split at h <;> try contradiction
    split at h <;> try contradiction
    cases ht : align rs before after <;> simp [ht] at h
    cases h
    simp [ih _ ht]

def Corresponds (refs before after : List Entry) (c : Case) : Prop :=
  ∃ r ∈ refs, r.id = c.id ∧ r.values = [c.expected] ∧
    ∃ b ∈ before, b.id = c.id ∧ b.values = [c.before] ∧
      ∃ a ∈ after, a.id = c.id ∧ a.values = [c.after]

theorem align_sound (refs before after : List Entry) (cs : List Case)
    (h : align refs before after = some cs) : ∀ c ∈ cs, Corresponds refs before after c := by
  induction refs generalizing cs with
  | nil => simp [align] at h; subst cs; simp
  | cons r rs ih =>
    simp only [align] at h
    cases hb : lookup r.id before <;> simp [hb] at h
    rename_i b
    cases ha : lookup r.id after <;> simp [ha] at h
    rename_i a
    split at h <;> try contradiction
    split at h <;> try contradiction
    split at h <;> try contradiction
    cases ht : align rs before after <;> simp [ht] at h
    cases h
    intro c hc
    rcases List.mem_cons.mp hc with hc | hc
    · subst c
      obtain ⟨hbm, hbi⟩ := lookup_sound _ _ _ hb
      obtain ⟨ham, hai⟩ := lookup_sound _ _ _ ha
      refine ⟨r, by simp, rfl, ?_, b, hbm, hbi, ?_, a, ham, hai, ?_⟩ <;> assumption
    · obtain ⟨r', hr', hid, hv, rest⟩ := ih _ ht c hc
      exact ⟨r', by simp [hr'], hid, hv, rest⟩

/-- Inputs must have exactly the same unique IDs. Extra or missing predictions
are rejected, rather than silently excluded from the evaluation denominator. -/
def evaluate (gold old new : Bytes) (ig lg io lo inn ln : Nat) : Option (List Case) := do
  let g ← decode gold
  let b ← decode old
  let a ← decode new
  let refs ← entries g ig [lg]
  let before ← entries b io [lo]
  let after ← entries a inn [ln]
  if refs.length > 1000 || refs.length != before.length || refs.length != after.length then none
  else align refs before after

def OriginalEvaluation (gold old new : Bytes) (ig lg io lo inn ln : Nat) (cs : List Case) : Prop :=
  ∃ g b a refs before after, Decodes gold g ∧ Decodes old b ∧ Decodes new a ∧
    entries g ig [lg] = some refs ∧ entries b io [lo] = some before ∧
    entries a inn [ln] = some after ∧ refs.length ≤ 1000 ∧
    refs.length = before.length ∧ refs.length = after.length ∧ align refs before after = some cs

theorem evaluate_iff (gold old new : Bytes) (ig lg io lo inn ln : Nat) (cs : List Case) :
    evaluate gold old new ig lg io lo inn ln = some cs ↔ OriginalEvaluation gold old new ig lg io lo inn ln cs := by
  simp only [evaluate, OriginalEvaluation]
  cases hg : decode gold <;> simp [hg, ← decode_iff]
  rename_i g
  cases hb : decode old <;> simp [hb, ← decode_iff]
  rename_i b
  cases ha : decode new <;> simp [ha, ← decode_iff]
  rename_i a
  cases hr : entries g ig [lg] <;> simp [hr]
  rename_i refs
  cases ho : entries b io [lo] <;> simp [ho]
  rename_i before
  cases hn : entries a inn [ln] <;> simp [hn]
  rename_i after
  by_cases h1 : refs.length ≤ 1000 <;>
    by_cases h2 : refs.length = before.length <;>
      by_cases h3 : refs.length = after.length <;> simp_all [and_assoc]

theorem original_preservation (gold old new : Bytes) (ig lg io lo inn ln : Nat) (cs : List Case)
    (h : evaluate gold old new ig lg io lo inn ln = some cs) (hp : preserves cs = true) :
    OriginalEvaluation gold old new ig lg io lo inn ln cs ∧
    (∀ c ∈ cs, c.before = c.expected → c.after = c.expected) ∧ oldMatches cs ≤ newMatches cs :=
  ⟨(evaluate_iff ..).1 h, (preserves_iff cs).1 hp, preservation_matches_mono cs hp⟩

theorem original_labels_agree (gold old new : Bytes) (ig lg io lo inn ln : Nat) (cs : List Case)
    (h : evaluate gold old new ig lg io lo inn ln = some cs) :
    ∃ g b a refs before after, Decodes gold g ∧ Decodes old b ∧ Decodes new a ∧
      entries g ig [lg] = some refs ∧ entries b io [lo] = some before ∧
      entries a inn [ln] = some after ∧ cs.map Case.id = refs.map Entry.id ∧
      (∀ c ∈ cs, Corresponds refs before after c) := by
  obtain ⟨g,b,a,refs,before,after,hg,hb,ha,hr,ho,hn,_,_,_,hx⟩ := (evaluate_iff ..).1 h
  exact ⟨g,b,a,refs,before,after,hg,hb,ha,hr,ho,hn,align_ids _ _ _ _ hx,align_sound _ _ _ _ hx⟩

end PCSFiles.Evaluation
