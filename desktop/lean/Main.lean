import Review

/-! Scoped frontend with proved original-byte CSV decoding and record checks.
The old derived-image command remains available for compatibility.
Files are fresh private snapshots supplied by the fixed local application;
compilation, file-to-process binding and host execution remain assumptions.
-/
def legacyMain (args : List String) : IO UInt32 := do
  match args with
  | [leftPath, rightPath] =>
    try
      let left ← IO.FS.readBinFile leftPath
      let right ← IO.FS.readBinFile rightPath
      if left.size > 2600004 || right.size > 2600004 then
        IO.println "REJECT:too_large"
        return (2 : UInt32)
      let l := left.data.toList
      let r := right.data.toList
      match PCSFiles.parseSafe l, PCSFiles.parseSafe r with
      | some (lh, lr), some (rh, rr) =>
        let key := "id".toUTF8.data.toList
        let imageOK := fun rows : List (List (List UInt8)) =>
          !rows.isEmpty && rows.length ≤ 5000 && rows.all (fun row =>
            row.all (fun field => !field.isEmpty && field.length ≤ 512 && field.length % 2 == 0 &&
              field.all (fun b => (48 ≤ b.toNat && b.toNat ≤ 57) || (97 ≤ b.toNat && b.toNat ≤ 102))))
        if lh != [key] || rh != [key] || !imageOK lr || !imageOK rr then
          IO.println "REJECT:invalid_image"
          return (2 : UInt32)
        if PCSFiles.disjointSafe l r "id".toUTF8.data.toList then
          IO.println "DISJOINT"
        else
          IO.println "OVERLAP"
        return (0 : UInt32)
      | _, _ =>
        IO.println "REJECT:invalid_csv"
        return (2 : UInt32)
    catch _ =>
      IO.println "REJECT:read_failure"
      return (2 : UInt32)
  | _ =>
    IO.println "REJECT:bad_arity"
    return (2 : UInt32)


open PCSFiles.OriginalCsv PCSFiles.Review

def natArg (s : String) : Option Nat := do
  let n ← s.toNat?
  if toString n = s then some n else none

def colsArg (s : String) : Option (List Nat) :=
  if s = "-" then some [] else PCSFiles.mapOptSafe natArg (s.splitOn ",")

def tableWire (t : Table) : String :=
  let header := "H:" ++ String.intercalate "," (t.header.map hexSafe)
  let rows := (t.lines.zip t.rows).map (fun (line,row) =>
    "R:" ++ toString line ++ ":" ++ String.intercalate "," (row.map hexSafe))
  String.intercalate "\n" (header :: rows)

def originalReport (a b : PCS.V2.Csv.Bytes) (ia ib : Nat) (ca cb : List Nat)
    (rules : Rules) (review : Bool) : Option String := do
  let left ← decode a
  let right ← decode b
  let base := "PCS_CSV2\nMODE:" ++ (if review then "changes" else "overlap") ++
    "\nCOLS:" ++ toString ia ++ "," ++ toString ib ++ "\nLEFT\n" ++ tableWire left ++
    "\nRIGHT\n" ++ tableWire right
  if review then
    let old ← entries left ia ca
    let new ← entries right ib cb
    let verdict ← reviewCheck a b ia ib ca cb rules
    let d := difference old new
    some (base ++ "\nPROJECT:" ++ String.intercalate "," (ca.map toString) ++ "|" ++ String.intercalate "," (cb.map toString) ++
      "\nPOLICY:" ++ String.intercalate "," ([rules.allowAdded,rules.allowRemoved,rules.allowChanged].map (fun x => if x then "1" else "0")) ++ "\nCOUNTS:" ++ String.intercalate "," ([d.added.length,d.removed.length,d.changed.length,d.same.length].map toString) ++
      "\nRESULT:" ++ (if verdict then "PASS" else "REVIEW") ++ "\nEND\n")
  else
    let verdict ← overlap a b ia ib
    some (base ++ "\nRESULT:" ++ (if verdict then "DISJOINT" else "OVERLAP") ++ "\nEND\n")

def originalMain (args : List String) : IO UInt32 := do
  let config := match args with
    | ["original", ia, ib, left, right] => do
      let ia ← natArg ia
      let ib ← natArg ib
      some (ia, ib, [], [], Rules.mk true true true, false, left, right)
    | ["changes", ia, ib, ca, cb, policy, left, right] => do
      let ia ← natArg ia
      let ib ← natArg ib
      let ca ← colsArg ca
      let cb ← colsArg cb
      let p ← natArg policy
      if p > 7 || ca.length != cb.length then none else
        some (ia, ib, ca, cb, Rules.mk (p % 2 == 1) (p / 2 % 2 == 1) (p / 4 % 2 == 1), true, left, right)
    | _ => none
  match config with
  | none => IO.println "REJECT:bad_arguments"; return (2 : UInt32)
  | some (ia,ib,ca,cb,rules,review,leftPath,rightPath) =>
    try
      let a ← IO.FS.readBinFile leftPath
      let b ← IO.FS.readBinFile rightPath
      if a.size > 2097152 || b.size > 2097152 then
        IO.println "REJECT:too_large"; return (2 : UInt32)
      match originalReport a.data.toList b.data.toList ia ib ca cb rules review with
      | none => IO.println "REJECT:invalid_original_csv_or_columns"; return (2 : UInt32)
      | some wire => (← IO.getStdout).putStr wire; return (0 : UInt32)
    catch _ => IO.println "REJECT:read_failure"; return (2 : UInt32)


def decodeBatch (path : String) : IO UInt32 := do
  try
    let raw ← IO.FS.readFile path
    if raw.utf8ByteSize > 2097152 then IO.println "REJECT:batch_size"; return (2 : UInt32)
    for hex in raw.splitOn "\n" do
      if !hex.isEmpty then
        let answer := do
          let bytes ← PCS.V2.Hex.hexDecode (if hex = "-" then "" else hex)
          let table ← decode bytes
          some (tableWire table)
        IO.println (match answer with | none => "REJECT" | some wire => "OK:" ++ wire.replace "\n" "|")
    return (0 : UInt32)
  catch _ => IO.println "REJECT:batch_read"; return (2 : UInt32)


def reviewBatchLine (s : String) : Option String := do
  let [ah,bh,ias,ibs,cas,cbs] := s.splitOn "|" | none
  let a ← PCS.V2.Hex.hexDecode ah
  let b ← PCS.V2.Hex.hexDecode bh
  let ia ← natArg ias
  let ib ← natArg ibs
  let ca ← colsArg cas
  let cb ← colsArg cbs
  if ca.length != cb.length then none else do
    let left ← decode a
    let right ← decode b
    let old ← entries left ia ca
    let new ← entries right ib cb
    let d := difference old new
    let decisions := (List.range 8).map (fun p =>
      if accepts (Rules.mk (p % 2 == 1) (p / 2 % 2 == 1) (p / 4 % 2 == 1)) d then "1" else "0")
    some (String.intercalate "," ([d.added.length,d.removed.length,d.changed.length,d.same.length].map toString) ++ ";" ++ String.join decisions)

def reviewBatch (path : String) : IO UInt32 := do
  try
    let raw ← IO.FS.readFile path
    if raw.utf8ByteSize > 2097152 then IO.println "REJECT:batch_size"; return (2 : UInt32)
    for s in raw.splitOn "\n" do
      if !s.isEmpty then IO.println ((reviewBatchLine s).getD "REJECT")
    return (0 : UInt32)
  catch _ => IO.println "REJECT:batch_read"; return (2 : UInt32)

def main (args : List String) : IO UInt32 :=
  match args with
  | [] => legacyMain []
  | ["decode-batch", path] => decodeBatch path
  | ["review-batch", path] => reviewBatch path
  | _ => if args.length == 2 then legacyMain args else originalMain args
