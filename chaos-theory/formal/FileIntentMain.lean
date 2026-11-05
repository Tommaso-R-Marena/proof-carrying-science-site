import FileIntent
import GuardedJson
open Lean FilePolicy FileIntent
namespace FileIntentIO

def str (j : Json) (key : String) : Except String String := j.getObjVal? key >>= Json.getStr?
def shape (j : Json) (ks : List String) : Except String Unit :=
  if GuardedJson.keys j ks then .ok () else .error "object keys"
def ident (j : Json) (key : String) : Except String String := do
  let s ← str j key
  if !GuardedJson.token s then throw "identifier"
  pure s

def decodeValue (raw : String) : Except String Nat := do
  if GuardedJson.utf16Length raw > 128 then throw "intent size"
  let j ← GuardedJson.strictParse raw
  shape j ["value"]
  let s ← str j "value"
  if s.length > 7 then throw "natural size"
  let some n := s.toNat? | throw "natural"
  if toString n != s || n > 1000000 then throw "canonical natural"
  pure n

def policy (j : Json) : Except String Policy := do
  shape j ["inspectable", "editable", "minimum", "maximum", "requireInspection"]
  let ins ← j.getObjVal? "inspectable" >>= Json.getArr?
  let ed ← j.getObjVal? "editable" >>= Json.getArr?
  if ins.size > 4 || ed.isEmpty || ed.size > 16 then throw "permission bounds"
  let ins ← ins.toList.mapM Json.getStr?
  let ed ← ed.toList.mapM fun v => do
    shape v ["fileId", "rowId"]
    pure (← ident v "fileId", ← ident v "rowId")
  let lo ← j.getObjVal? "minimum" >>= Json.getNat?
  let hi ← j.getObjVal? "maximum" >>= Json.getNat?
  let req ← j.getObjVal? "requireInspection" >>= Json.getBool?
  if lo > hi || hi > 1000000 then throw "policy bounds"
  pure { editable := (fun f r => ed.contains (f,r)), inspectable := ins.contains, minimum := lo, maximum := hi, requireInspection := req }

def encode : Action → Json
  | .inspect f => Json.mkObj [("tool", .str "inspect_file"), ("args", Json.mkObj [("fileId", .str f)])]
  | .write f r v => Json.mkObj [("tool", .str "set_value"), ("args", Json.mkObj [("fileId", .str f), ("rowId", .str r), ("value", .str (toString v))])]
  | .invalid => .null

def evaluate (j : Json) : Except String Json := do
  shape j ["kind", "policy", "target", "raw"]
  if (← str j "kind") != "file-intent-request-v1" then throw "version"
  let target ← j.getObjVal? "target"
  shape target ["fileId", "rowId"]
  let i : Intent := ⟨← ident target "fileId", ← ident target "rowId", ← decodeValue (← str j "raw")⟩
  let p ← policy (← j.getObjVal? "policy")
  let xs := compile p i
  pure (Json.mkObj [("request", j), ("value", .str (toString i.value)), ("eligible", .bool xs.isSome),
    ("plan", match xs with | none => .null | some actions => .str (Json.mkObj [("actions", .arr (actions.map encode).toArray)]).compress)])
end FileIntentIO

def main : IO Unit := do
  let input ← IO.getStdin; let output ← IO.getStdout
  repeat
    let line ← input.getLine
    if line.isEmpty then break
    let response := match Lean.Json.parse line >>= FileIntentIO.evaluate with
      | .ok result => Json.mkObj [("ok", .bool true), ("result", result)]
      | .error _ => Json.mkObj [("ok", .bool false)]
    output.putStrLn response.compress
    output.flush
