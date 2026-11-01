import StackSafe

/-! A byte-level CSV dialect with a declarative transition semantics.
Quotes, doubled quotes, embedded LF/CRLF, a leading UTF-8 BOM, empty fields and
physical source lines are modeled explicitly. Bare CR, unclosed/ambiguous quotes,
blank records, invalid UTF-8, NUL and nonrectangular tables fail closed.
`Transition` describes the permitted grammar actions independently of `step`.
The executable decoder is proved sound and complete for those actions.
-/
namespace PCSFiles.OriginalCsv
open PCS.V2.Csv

inductive Mode where
  | start | plain | quoted | afterQuote | recordCR | quotedCR
  deriving DecidableEq, Repr

structure State where
  mode : Mode := .start
  field : Bytes := []
  row : List Bytes := []
  records : List (List Bytes) := []
  lines : List Nat := []
  line : Nat := 1
  startLine : Nat := 1
  active : Bool := false
  deriving DecidableEq, Repr

structure Table where
  header : List Bytes
  rows : List (List Bytes)
  lines : List Nat
  deriving DecidableEq, Repr

def put (s : State) (b : UInt8) (mode : Mode) : State :=
  {s with field := b :: s.field, mode := mode, active := true}
def fieldEnd (s : State) : State :=
  {s with row := s.field.reverse :: s.row, field := [], mode := .start, active := true}
def recordEnd (s : State) : State :=
  {mode := .start, records := (s.field.reverse :: s.row).reverse :: s.records,
   lines := s.startLine :: s.lines, line := s.line + 1, startLine := s.line + 1}
def normal (m : Mode) : Prop := m = .start ∨ m = .plain ∨ m = .afterQuote
instance (m : Mode) : Decidable (normal m) := inferInstanceAs (Decidable (_ ∨ _ ∨ _))

/-- Declarative grammar actions; no reference to the executable step. -/
def Transition (s : State) (b : UInt8) (t : State) : Prop :=
  (s.mode = .start ∧ b = 34 ∧ {s with mode := .quoted, active := true} = t) ∨
  (s.mode = .quoted ∧ b = 34 ∧ {s with mode := .afterQuote} = t) ∨
  (s.mode = .afterQuote ∧ b = 34 ∧ put s b .quoted = t) ∨
  (normal s.mode ∧ b = 44 ∧ fieldEnd s = t) ∨
  (normal s.mode ∧ b = 10 ∧ s.active = true ∧ recordEnd s = t) ∨
  (normal s.mode ∧ b = 13 ∧ s.active = true ∧ {s with mode := .recordCR} = t) ∨
  (s.mode = .recordCR ∧ b = 10 ∧ recordEnd s = t) ∨
  (s.mode = .quotedCR ∧ b = 10 ∧ {put s b .quoted with line := s.line + 1} = t) ∨
  (s.mode = .quoted ∧ b = 13 ∧ put s b .quotedCR = t) ∨
  (s.mode = .quoted ∧ b = 10 ∧ {put s b .quoted with line := s.line + 1} = t) ∨
  (s.mode = .quoted ∧ b ≠ 34 ∧ b ≠ 13 ∧ b ≠ 10 ∧ put s b .quoted = t) ∨
  ((s.mode = .start ∨ s.mode = .plain) ∧ b ≠ 34 ∧ b ≠ 44 ∧ b ≠ 10 ∧ b ≠ 13 ∧ put s b .plain = t)

def step (s : State) (b : UInt8) : Option State :=
  match s.mode with
  | .recordCR => if b = 10 then some (recordEnd s) else none
  | .quotedCR => if b = 10 then some {put s b .quoted with line := s.line + 1} else none
  | .quoted =>
    if b = 34 then some {s with mode := .afterQuote}
    else if b = 13 then some (put s b .quotedCR)
    else if b = 10 then some {put s b .quoted with line := s.line + 1}
    else some (put s b .quoted)
  | .start | .plain | .afterQuote =>
    if b = 34 then
      if s.mode = .start then some {s with mode := .quoted, active := true}
      else if s.mode = .afterQuote then some (put s b .quoted) else none
    else if b = 44 then some (fieldEnd s)
    else if b = 10 then if s.active then some (recordEnd s) else none
    else if b = 13 then if s.active then some {s with mode := .recordCR} else none
    else if s.mode = .afterQuote then none else some (put s b .plain)

theorem step_iff (s t : State) (b : UInt8) : step s b = some t ↔ Transition s b t := by
  cases hm : s.mode <;>
    by_cases hq : b = 34 <;> by_cases hc : b = 44 <;>
    by_cases hl : b = 10 <;> by_cases hr : b = 13 <;>
    by_cases ha : s.active = true <;>
    simp_all [step, Transition, normal]

/-- Ordered grammar derivations over original bytes. -/
inductive Runs : State → Bytes → State → Prop where
  | nil (s) : Runs s [] s
  | cons : Transition s b t → Runs t bs u → Runs s (b :: bs) u

def run (s : State) (bs : Bytes) : Option State :=
  bs.foldlM step s

theorem run_iff (bs : Bytes) (s t : State) : run s bs = some t ↔ Runs s bs t := by
  induction bs generalizing s with
  | nil => simp [run, List.foldlM_nil]; constructor
           · intro h; cases h; exact Runs.nil _
           · intro h; cases h; rfl
  | cons b bs ih =>
    simp only [run, List.foldlM_cons]
    cases hs : step s b with
    | none =>
      constructor
      · simp [hs]
      · intro h; cases h with
        | cons hst _ => have := (step_iff _ _ _).2 hst; simp [hs] at this
    | some u =>
      change run u bs = some t ↔ Runs s (b :: bs) t
      rw [ih]
      constructor
      · intro h; exact Runs.cons ((step_iff _ _ _).1 hs) h
      · intro h; cases h with
        | cons hst hrest =>
          have he := (step_iff _ _ _).2 hst
          rw [hs] at he
          cases he
          exact hrest

def stripBOM : Bytes → Bytes
  | 239 :: 187 :: 191 :: xs => xs
  | xs => xs

def finish (s : State) : Option Table :=
  if normal s.mode then
    let records := if s.active then (recordEnd s).records.reverse else s.records.reverse
    let lines := if s.active then (recordEnd s).lines.reverse else s.lines.reverse
    match records, lines with
    | header :: rows, _ :: rowLines => some ⟨header, rows, rowLines⟩
    | _, _ => none
  else none

def blank (b : Bytes) : Bool := b.all (fun c => c = 9 || c = 10 || c = 11 || c = 12 || c = 13 || c = 32)
def validTable (t : Table) : Bool :=
  !t.header.isEmpty && t.header.length ≤ 128 && !t.rows.isEmpty && t.rows.length ≤ 5000 &&
  t.header.all (fun h => !blank h && h.length ≤ 1024) &&
  decide t.header.Nodup && t.rows.all (fun r => r.length == t.header.length) &&
  (t.header ++ t.rows.flatten).all (fun f => ByteArray.validateUTF8 ⟨f.toArray⟩)

def admitted (raw : Bytes) : Bool :=
  !raw.isEmpty && raw.length ≤ 2097152 &&
  ByteArray.validateUTF8 ⟨raw.toArray⟩ && !raw.contains 0

/-- The bounded PCS CSV dialect over the original file bytes. -/
def Decodes (raw : Bytes) (t : Table) : Prop :=
  admitted raw = true ∧ ∃ s, Runs {} (stripBOM raw) s ∧ finish s = some t ∧ validTable t = true

def decode (raw : Bytes) : Option Table := do
  if !admitted raw then none else do
    let s ← run {} (stripBOM raw)
    let t ← finish s
    if validTable t then some t else none

theorem decode_iff (raw : Bytes) (t : Table) : decode raw = some t ↔ Decodes raw t := by
  simp only [decode, Decodes]
  cases ha : admitted raw <;> simp [ha]
  case true =>
    cases hr : run {} (stripBOM raw) with
    | none =>
      simp [hr]
      intro s hs
      have := (run_iff _ _ _).2 hs
      simp [hr] at this
    | some s =>
      simp only [hr, Option.bind_some]
      cases hf : finish s with
      | none =>
        simp [hf]
        intro u hu
        have he := (run_iff _ _ _).2 hu
        rw [hr] at he
        cases he
        simp [hf]
      | some u =>
        simp only [hf, Option.bind_some]
        constructor
        · split
          · intro he; cases he
            exact ⟨s, (run_iff _ _ _).1 hr, hf, by assumption⟩
          · simp
        · rintro ⟨v, hv, hfinish, hvalid⟩
          have he := (run_iff _ _ _).2 hv
          rw [hr] at he
          cases he
          rw [hf] at hfinish
          cases hfinish
          simp [hvalid]

theorem decodes_unique {raw : Bytes} {a b : Table} (ha : Decodes raw a) (hb : Decodes raw b) : a = b := by
  have ea := (decode_iff raw a).2 ha
  have eb := (decode_iff raw b).2 hb
  rw [ea] at eb
  exact Option.some.inj eb

/-- Output serialization uses the existing proved injective hex codec. -/
def hexSafe (bs : Bytes) : String := String.ofList (bs.flatMap PCS.V2.Hex.byteChars)
theorem hexSafe_eq (bs : Bytes) : hexSafe bs = PCS.V2.Hex.hexEncode bs := by
  have h : bs.flatMap PCS.V2.Hex.byteChars = PCS.V2.Hex.hexChars bs := by
    induction bs with
    | nil => rfl
    | cons b bs ih => simp [PCS.V2.Hex.hexChars, List.flatMap_cons, ih]
  exact congrArg String.ofList h

theorem hexSafe_injective {a b : Bytes} (h : hexSafe a = hexSafe b) : a = b := by
  rw [hexSafe_eq, hexSafe_eq] at h
  exact PCS.V2.Hex.hexEncode_injective h
end PCSFiles.OriginalCsv
