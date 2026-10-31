import PCS.V2.Csv
import Std.Data.HashSet

/-! Stack-safe implementations for this portable frontend only. Every replacement
is kernel-proved equal to the unchanged PCS function. No production or external
Aristotle module is modified. List.foldr uses Lean's proved tail-recursive runtime
implementation; the mathematical CSV language and Boolean decision are unchanged.
-/
namespace PCSFiles
open PCS.V2 PCS.V2.Common PCS.V2.TextSplit PCS.V2.Csv

def splitSafe {α : Type} [DecidableEq α] (sep : α) (xs : List α) : List (List α) :=
  xs.foldr (fun c parts => if c = sep then [] :: parts else
    match parts with
    | p :: ps => (c :: p) :: ps
    | [] => [[c]]) [[]]

theorem splitSafe_eq {α : Type} [DecidableEq α] (sep : α) (xs : List α) :
    splitSafe sep xs = splitAt sep xs := by
  induction xs with
  | nil => rfl
  | cons c cs ih =>
    simpa only [splitSafe, List.foldr_cons, splitAt] using
      congrArg (fun parts => if c = sep then [] :: parts else
        match parts with | p :: ps => (c :: p) :: ps | [] => [[c]]) ih

def mapOptSafe {α β : Type} (f : α → Option β) (xs : List α) : Option (List β) :=
  xs.foldr (fun x ys => match f x, ys with
    | some y, some ys => some (y :: ys)
    | _, _ => none) (some [])

theorem mapOptSafe_eq {α β : Type} (f : α → Option β) (xs : List α) :
    mapOptSafe f xs = mapOpt f xs := by
  induction xs with
  | nil => rfl
  | cons x xs ih =>
    simpa only [mapOptSafe, List.foldr_cons, mapOpt] using
      congrArg (fun ys => match f x, ys with
        | some y, some ys => some (y :: ys)
        | _, _ => none) ih

def parseSafe (b : Bytes) : Option (List Bytes × List (List Bytes)) :=
  if ByteArray.validateUTF8 ⟨b.toArray⟩ = true ∧ QUOTE ∉ b ∧ NUL ∉ b then
    match mapOptSafe stripCR (splitSafe LF b) with
    | some (hl :: rest) =>
      if hl = [] then none
      else
        let header := splitSafe COMMA hl
        let rows := (rest.filter (fun l => !l.isEmpty)).map (splitSafe COMMA)
        if header.Nodup ∧ (∀ r ∈ rows, r.length = header.length) ∧
            (∀ f ∈ header ++ rows.flatten, f.length ≤ maxField) then
          some (header, rows)
        else none
    | _ => none
  else none

theorem parseSafe_eq (b : Bytes) : parseSafe b = parseCsv b := by
  have h : splitSafe (α := UInt8) COMMA = splitAt COMMA := funext (splitSafe_eq COMMA)
  simp only [parseSafe, parseCsv, mapOptSafe_eq, splitSafe_eq, h]
  rfl

def disjointSafe (left right key : Bytes) : Bool :=
  match parseSafe left, parseSafe right with
  | some (hL, rL), some (hR, rR) =>
    match indexOf key hL, indexOf key hR with
    | some iL, some iR =>
      let kR := Std.HashSet.ofList (keysAt rR iR)
      (keysAt rL iL).all (fun k => !kR.contains k)
    | _, _ => false
  | _, _ => false

theorem disjointSafe_eq (left right key : Bytes) :
    disjointSafe left right key = csvDisjointB left right key := by
  simp only [disjointSafe, csvDisjointB, parseSafe_eq, Std.HashSet.contains_ofList]
  rfl

theorem disjointSafe_iff (left right key : Bytes) :
    disjointSafe left right key = true ↔ CsvDisjoint left right key := by
  rw [disjointSafe_eq, csvDisjointB_iff]
end PCSFiles
