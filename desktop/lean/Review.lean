import OriginalCsv
namespace PCSFiles
open PCS.V2.Csv

def distinctWith (seen : Std.HashSet Bytes) : List Bytes → Bool
  | [] => true
  | k :: ks => if seen.contains k then false else distinctWith (seen.insert k) ks

theorem distinctWith_iff (seen : Std.HashSet Bytes) (xs : List Bytes) :
    distinctWith seen xs = true ↔ xs.Nodup ∧ ∀ k ∈ xs, seen.contains k = false := by
  induction xs generalizing seen with
  | nil => simp [distinctWith]
  | cons x xs ih =>
    simp [distinctWith, ih, List.nodup_cons, Std.HashSet.contains_insert]
    constructor
    · rintro ⟨hx, hnd, hs⟩
      refine ⟨⟨?_, hnd⟩, hx, ?_⟩
      · intro hm
        have := hs x hm
        simp at this
      · intro k hk
        exact (hs k hk).2
    · rintro ⟨⟨hmem, hnd⟩, hx, hs⟩
      refine ⟨hx, hnd, ?_⟩
      intro k hk
      refine ⟨?_, hs k hk⟩
      intro he
      subst he
      exact hmem hk

def distinctB (xs : List PCS.V2.Csv.Bytes) : Bool := distinctWith {} xs
theorem distinctB_iff (xs : List PCS.V2.Csv.Bytes) : distinctB xs = true ↔ xs.Nodup := by
  simp [distinctB, distinctWith_iff]

namespace Review
open OriginalCsv
open PCS.V2.Csv

structure Entry where
  id : Bytes
  values : List Bytes
  deriving DecidableEq, Repr

def signature (e : Entry) : List Bytes := e.id :: e.values

def entryRow (key : Nat) (cols : List Nat) (row : List Bytes) : Option Entry := do
  let id ← row[key]?
  let vs ← mapOptSafe (fun i => row[i]?) cols
  if blank id || id.length > 256 then none else some (Entry.mk id vs)

def entries (t : Table) (key : Nat) (cols : List Nat) : Option (List Entry) := do
  if key ≥ t.header.length || !decide cols.Nodup || cols.any (fun i => i ≥ t.header.length || i == key) then none else do
    let es ← mapOptSafe (entryRow key cols) t.rows
    if distinctB (es.map Entry.id) then some es else none

theorem entries_unique {t : Table} {key : Nat} {cols : List Nat} {es : List Entry}
    (h : entries t key cols = some es) : (es.map Entry.id).Nodup := by
  unfold entries at h
  split at h
  · cases h
  · cases he : mapOptSafe (entryRow key cols) t.rows with
    | none => simp [he] at h
    | some xs =>
      rw [he] at h
      change (if distinctB (xs.map Entry.id) then some xs else none) = some es at h
      split at h
      · cases h
        exact (distinctB_iff _).1 (by assumption)
      · cases h

structure Rules where
  allowAdded : Bool := true
  allowRemoved : Bool := true
  allowChanged : Bool := true
  deriving DecidableEq, Repr

structure Difference where
  added : List Entry
  removed : List Entry
  changed : List Entry
  same : List Entry
  deriving DecidableEq, Repr

/-- Declarative row differences in the explicitly selected columns. -/
def Added (old : List Entry) (e : Entry) : Prop := ∀ a ∈ old, a.id ≠ e.id
def Removed (new : List Entry) (e : Entry) : Prop := ∀ b ∈ new, b.id ≠ e.id
def Changed (old : List Entry) (e : Entry) : Prop :=
  (∃ a ∈ old, a.id = e.id) ∧ ∀ a ∈ old, signature a ≠ signature e

def difference (old new : List Entry) : Difference :=
  let oldKeys := Std.HashSet.ofList (old.map Entry.id)
  let newKeys := Std.HashSet.ofList (new.map Entry.id)
  let oldRecords := Std.HashSet.ofList (old.map signature)
  ⟨new.filter (fun e => !oldKeys.contains e.id),
   old.filter (fun e => !newKeys.contains e.id),
   new.filter (fun e => oldKeys.contains e.id && !oldRecords.contains (signature e)),
   new.filter (fun e => oldKeys.contains e.id && oldRecords.contains (signature e))⟩

theorem added_iff (old new : List Entry) (e : Entry) :
    e ∈ (difference old new).added ↔ e ∈ new ∧ Added old e := by
  simp [difference, Added, List.mem_map, not_exists]

theorem removed_iff (old new : List Entry) (e : Entry) :
    e ∈ (difference old new).removed ↔ e ∈ old ∧ Removed new e := by
  simp [difference, Removed, List.mem_map, not_exists]

theorem changed_iff (old new : List Entry) (e : Entry) :
    e ∈ (difference old new).changed ↔ e ∈ new ∧ Changed old e := by
  simp [difference, Changed, List.mem_map, not_exists]

def accepts (r : Rules) (d : Difference) : Bool :=
  (r.allowAdded || d.added.isEmpty) && (r.allowRemoved || d.removed.isEmpty) &&
  (r.allowChanged || d.changed.isEmpty)

def Preserves (r : Rules) (old new : List Entry) : Prop :=
  (r.allowAdded = false → ∀ e ∈ new, ¬Added old e) ∧
  (r.allowRemoved = false → ∀ e ∈ old, ¬Removed new e) ∧
  (r.allowChanged = false → ∀ e ∈ new, ¬Changed old e)

theorem accepts_iff (r : Rules) (old new : List Entry) :
    accepts r (difference old new) = true ↔ Preserves r old new := by
  have empty_iff (xs : List Entry) : xs.isEmpty = true ↔ ∀ e, e ∉ xs := by
    cases xs with
    | nil => simp
    | cons x xs =>
      constructor
      · intro h; cases h
      · intro h; exact False.elim (h x (by simp))
  simp only [accepts, Bool.and_eq_true, Bool.or_eq_true, empty_iff]
  simp only [added_iff, removed_iff, changed_iff, not_and]
  cases ha : r.allowAdded <;> cases hr : r.allowRemoved <;> cases hc : r.allowChanged <;>
    simp [Preserves, ha, hr, hc, and_assoc]

/-- Byte-level disjointness without host-side ID extraction. -/
def overlap (a b : Bytes) (ia ib : Nat) : Option Bool := do
  let left ← decode a
  let right ← decode b
  -- Duplicate IDs remain allowed in overlap mode, matching v1 behavior.
  let ka ← mapOptSafe (fun row => row[ia]?) left.rows
  let kb ← mapOptSafe (fun row => row[ib]?) right.rows
  if ia ≥ left.header.length || ib ≥ right.header.length ||
      (ka ++ kb).any (fun id => blank id || id.length > 256) then none
  else
    let keys := Std.HashSet.ofList kb
    some (ka.all (fun k => !keys.contains k))

def OriginalDisjoint (a b : Bytes) (ia ib : Nat) : Prop :=
  ∃ left right ka kb, Decodes a left ∧ Decodes b right ∧
    mapOptSafe (fun row => row[ia]?) left.rows = some ka ∧
    mapOptSafe (fun row => row[ib]?) right.rows = some kb ∧
    ia < left.header.length ∧ ib < right.header.length ∧
    (ka ++ kb).all (fun id => !blank id && id.length ≤ 256) = true ∧
    ∀ k ∈ ka, k ∉ kb

-- The proof below connects the native decision to original-byte grammar
-- derivations, selected columns, admission bounds and exact key disjointness.
theorem overlap_iff (a b : Bytes) (ia ib : Nat) :
    overlap a b ia ib = some true ↔ OriginalDisjoint a b ia ib := by
  simp only [overlap, OriginalDisjoint]
  cases ha : decode a with
  | none => simp [ha, ← decode_iff]
  | some left =>
    cases hb : decode b with
    | none => simp [ha, hb, ← decode_iff]
    | some right =>
      cases hka : mapOptSafe (fun row => row[ia]?) left.rows with
      | none => simp [ha, hb, hka, ← decode_iff]
      | some ka =>
        cases hkb : mapOptSafe (fun row => row[ib]?) right.rows with
        | none => simp [ha, hb, hka, hkb, ← decode_iff]
        | some kb =>
          simp [ha, hb, hka, hkb, ← decode_iff, List.all_eq_true, List.any_eq_true,
            not_or, Nat.not_le, Bool.and_eq_true, and_assoc]

def reviewCheck (a b : Bytes) (ia ib : Nat) (ca cb : List Nat) (r : Rules) : Option Bool := do
  let left ← decode a
  let right ← decode b
  let old ← entries left ia ca
  let new ← entries right ib cb
  some (accepts r (difference old new))

def OriginalPreserves (a b : Bytes) (ia ib : Nat) (ca cb : List Nat) (r : Rules) : Prop :=
  ∃ left right old new, Decodes a left ∧ Decodes b right ∧
    entries left ia ca = some old ∧ entries right ib cb = some new ∧ Preserves r old new

theorem reviewCheck_iff (a b : Bytes) (ia ib : Nat) (ca cb : List Nat) (r : Rules) :
    reviewCheck a b ia ib ca cb r = some true ↔ OriginalPreserves a b ia ib ca cb r := by
  simp only [reviewCheck, OriginalPreserves]
  cases ha : decode a with
  | none => simp [ha, ← decode_iff]
  | some left =>
    cases hb : decode b with
    | none => simp [ha, hb, ← decode_iff]
    | some right =>
      cases he : entries left ia ca with
      | none => simp [ha, hb, he, ← decode_iff]
      | some old =>
        cases hn : entries right ib cb with
        | none => simp [ha, hb, he, hn, ← decode_iff]
        | some new => simp [ha, hb, he, hn, ← decode_iff, accepts_iff]


theorem unique_id_eq (xs : List Entry) (h : (xs.map Entry.id).Nodup)
    (a b : Entry) (ha : a ∈ xs) (hb : b ∈ xs) (hid : a.id = b.id) : a = b := by
  induction xs with
  | nil => simp at ha
  | cons x xs ih =>
    simp only [List.map_cons, List.nodup_cons] at h
    simp only [List.mem_cons] at ha hb
    rcases ha with rfl | ha <;> rcases hb with rfl | hb
    · rfl
    · exact False.elim (h.1 (List.mem_map.mpr ⟨b, hb, hid.symm⟩))
    · exact False.elim (h.1 (List.mem_map.mpr ⟨a, ha, hid⟩))
    · exact ih h.2 ha hb

theorem conservative_extension (old new : List Entry) (hunique : (old.map Entry.id).Nodup)
    (h : Preserves ⟨true, false, false⟩ old new) :
    ∀ e ∈ old, ∃ b ∈ new, signature b = signature e := by
  classical
  intro e he
  have hex : ∃ b ∈ new, b.id = e.id := by
    apply Classical.byContradiction
    intro hn
    apply h.2.1 rfl e he
    intro b hb hid
    exact hn ⟨b, hb, hid⟩
  obtain ⟨b, hb, hid⟩ := hex
  have hs : ∃ a ∈ old, signature a = signature b := by
    apply Classical.byContradiction
    intro hn
    apply h.2.2 rfl b hb
    refine ⟨⟨e, he, hid.symm⟩, ?_⟩
    intro a ha heq
    exact hn ⟨a, ha, heq⟩
  obtain ⟨a, ha, hs⟩ := hs
  have hae : a = e := unique_id_eq old hunique a e ha he ((List.cons.inj hs).1.trans hid)
  subst a
  exact ⟨b, hb, hs.symm⟩

theorem original_conservative_extension (a b : Bytes) (ia ib : Nat) (ca cb : List Nat)
    (h : reviewCheck a b ia ib ca cb ⟨true, false, false⟩ = some true) :
    ∃ left right old new, Decodes a left ∧ Decodes b right ∧
      entries left ia ca = some old ∧ entries right ib cb = some new ∧
      ∀ e ∈ old, ∃ n ∈ new, signature n = signature e := by
  obtain ⟨left, right, old, new, hl, hr, ho, hn, hp⟩ := (reviewCheck_iff ..).1 h
  exact ⟨left, right, old, new, hl, hr, ho, hn,
    conservative_extension old new (entries_unique ho) hp⟩

end Review
end PCSFiles
