import FilePolicy
import GuardedJson

open Lean FilePolicy
namespace FilePolicyIO
structure File where
  id : String
  rows : List (String × Nat)

def natural (s : String) : Except String Nat := do
  if s.length > 7 then throw "natural size"
  let some n := s.toNat? | throw "natural number"
  if toString n != s || n > 1000000 then throw "canonical bounded natural"
  pure n

def csv (raw : String) : Except String (List (String × Nat)) := do
  if raw.utf8ByteSize > 8192 then throw "CSV size"
  let lines := raw.splitOn "\n"
  if lines.head? != some "id,value" || lines.getLast? != some "" then throw "CSV framing"
  let rows := lines.drop 1 |>.dropLast
  if rows.isEmpty || rows.length > 16 then throw "CSV rows"
  let mut result : List (String × Nat) := []
  for row in rows do
    match row.splitOn "," with
    | [id, value] =>
      if !GuardedJson.token id || result.any (fun r => r.1 == id) then throw "CSV identifiers"
      result := result ++ [(id, ← natural value)]
    | _ => throw "CSV columns"
  pure result

def str (j : Json) (key : String) : Except String String := j.getObjVal? key >>= Json.getStr?
def arr (j : Json) (key : String) : Except String (Array Json) := j.getObjVal? key >>= Json.getArr?
def shape (j : Json) (ks : List String) : Except String Unit :=
  if GuardedJson.keys j ks then .ok () else .error "object keys"
def ident (j : Json) (key : String) : Except String String := do
  let s ← str j key
  if !GuardedJson.token s then throw "identifier"
  pure s

def decodeFiles (items : Array Json) : Except String (List File) := do
  if items.isEmpty || items.size > 4 then throw "file count"
  let mut files : List File := []
  for j in items do
    shape j ["id", "bytes"]
    let id ← ident j "id"
    if files.any (fun f => f.id == id) then throw "duplicate file"
    files := files ++ [⟨id, ← csv (← str j "bytes")⟩]
  pure files

def decodePolicy (j : Json) (files : List File) : Except String Policy := do
  shape j ["inspectable", "editable", "minimum", "maximum", "requireInspection"]
  let inspectable ← (← arr j "inspectable").toList.mapM fun item => do
    let s ← item.getStr?
    if !(files.any (fun f => f.id == s)) then throw "unknown inspectable"
    pure s
  let editable ← (← arr j "editable").toList.mapM fun item => do
    shape item ["fileId", "rowId"]
    let f ← ident item "fileId"; let r ← ident item "rowId"
    if !(files.any (fun file => file.id == f && file.rows.any (fun row => row.1 == r))) then throw "unknown editable"
    pure (f, r)
  let minimum ← j.getObjVal? "minimum" >>= Json.getNat?
  let maximum ← j.getObjVal? "maximum" >>= Json.getNat?
  let requireInspection ← j.getObjVal? "requireInspection" >>= Json.getBool?
  if minimum > maximum || maximum > 1000000 || editable.isEmpty || editable.length > 16 then throw "policy bounds"
  if inspectable.eraseDups.length != inspectable.length || editable.eraseDups.length != editable.length then throw "duplicate permissions"
  for (f, r) in editable do
    let v := ((files.find? (fun q => q.id == f)).map (fun q => ((q.rows.find? (fun k => k.1 == r)).map Prod.snd).getD 0)).getD 0
    if v < minimum || v > maximum then throw "initial bounds"
  pure { editable := fun f r => editable.contains (f,r), inspectable := inspectable.contains, minimum, maximum, requireInspection }

def initial (files : List File) : World := {
  cells := fun f r => ((files.find? (fun q => q.id == f)).map (fun q => ((q.rows.find? (fun k => k.1 == r)).map Prod.snd).getD 0)).getD 0
  inspected := fun _ => false }

def decodeAction (files : List File) (j : Json) : Action :=
  (do
    shape j ["tool", "args"]
    let tool ← str j "tool"
    let a ← j.getObjVal? "args"
    if tool == "inspect_file" then
      shape a ["fileId"]
      let f ← ident a "fileId"
      if !files.any (fun file => file.id == f) then throw "unknown file"
      pure (.inspect f)
    else if tool == "set_value" then
      shape a ["fileId", "rowId", "value"]
      let f ← ident a "fileId"; let r ← ident a "rowId"; let v ← natural (← str a "value")
      if !files.any (fun file => file.id == f && file.rows.any (fun row => row.1 == r)) then throw "unknown cell"
      pure (.write f r v)
    else throw "unknown tool" : Except String Action).toOption.getD .invalid

def decodePlan (files : List File) (raw : String) : Except String (List Action) := do
  if GuardedJson.utf16Length raw > 16384 then throw "plan size"
  let j ← GuardedJson.strictParse raw
  shape j ["actions"]
  let actions ← arr j "actions"
  if actions.size > 8 then throw "action count"
  actions.toList.mapM fun a => do
    shape a ["tool", "args"]
    let name ← str a "tool"
    if name.isEmpty || GuardedJson.utf16Length name > 64 then throw "tool size"
    pure (decodeAction files a)

def filesJson (files : List File) (s : World) : Json := .arr (files.map fun file => Json.mkObj [
  ("id", .str file.id), ("bytes", .str ("id,value\n" ++ String.join (file.rows.map fun row => s!"{row.1},{s.cells file.id row.1}\n"))) ]).toArray

def compute (files : List File) (p : Policy) (actions : List Action) (guarded : Bool) : Json := Id.run do
  let mut s := initial files
  let mut allowed : Array Json := #[]
  let mut executed : Array Json := #[]
  let mut invalid : Array Json := #[]
  for a in actions do
    let yes := permitted p s a
    let bad := a == .invalid
    let execute := !bad && (!guarded || yes)
    allowed := allowed.push (.bool yes); executed := executed.push (.bool execute); invalid := invalid.push (.bool bad)
    if execute then s := effect s a
  return Json.mkObj [("permitted", .arr allowed), ("executed", .arr executed), ("invalid", .arr invalid),
    ("files", filesJson files s), ("inspected", .arr ((files.filter (fun f => s.inspected f.id)).map (fun f => Json.str f.id)).toArray)]

def evaluate (j : Json) : Except String Json := do
  shape j ["kind", "policy", "files", "plans"]
  if (← str j "kind") != "file-policy-request-v1" then throw "version"
  let files ← decodeFiles (← arr j "files")
  let policy ← decodePolicy (← j.getObjVal? "policy") files
  let texts ← arr j "plans"
  if texts.size > 4 then throw "submission count"
  let mut history : List Action := []
  let mut outcomes : Array Json := #[]
  for text in texts do
    let raw ← text.getStr?
    history := history ++ (← decodePlan files raw)
    if history.length > 16 then throw "history budget"
    outcomes := outcomes.push (Json.mkObj [("guarded", compute files policy history true), ("control", compute files policy history false)])
  return Json.mkObj [("kind", .str "file-policy-result-v1"), ("request", j), ("initial", compute files policy [] true), ("outcomes", .arr outcomes)]
end FilePolicyIO

def main : IO Unit := do
  let input ← IO.getStdin; let output ← IO.getStdout
  repeat
    let line ← input.getLine
    if line.isEmpty then break
    let result := do
      let j ← Lean.Json.parse line
      FilePolicyIO.evaluate j
    let response := match result with
      | .ok value => Lean.Json.mkObj [("ok", .bool true), ("result", value)]
      | .error _ => Lean.Json.mkObj [("ok", .bool false)]
    output.putStrLn response.compress
    output.flush
