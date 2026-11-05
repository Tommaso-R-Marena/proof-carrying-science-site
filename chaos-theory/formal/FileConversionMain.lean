import FileConversion
import GuardedJson
open Lean FileConversion
namespace FileConversionIO

def str (j : Json) (key : String) : Except String String := j.getObjVal? key >>= Json.getStr?
def shape (j : Json) (ks : List String) : Except String Unit :=
  if GuardedJson.keys j ks then .ok () else .error "object keys"
def nat (s : String) : Except String Nat := do
  if s.length > 7 then throw "size"
  let some v := s.toNat? | throw "integer"
  if toString v != s || v > 1000000 then throw "canonical bounded integer"
  pure v

def evaluate (j : Json) : Except String Json := do
  shape j ["kind", "sourceCsv", "rowId", "factor", "raw"]
  if (← str j "kind") != "file-conversion-request-v1" then throw "version"
  let raw ← str j "raw"
  if GuardedJson.utf16Length raw > 128 then throw "intent size"
  let intent ← GuardedJson.strictParse raw
  shape intent ["value"]
  let value ← nat (← str intent "value")
  let factor ← nat (← str j "factor")
  if factor == 0 then throw "positive multiplier"
  let row ← str j "rowId"
  if !GuardedJson.token row then throw "row identifier"
  let csv ← str j "sourceCsv"
  if csv.utf8ByteSize > 8192 then throw "CSV size"
  let lines := csv.splitOn "\n"
  if lines.head? != some "id,value" || lines.getLast? != some "" then throw "CSV framing"
  let rows := lines.drop 1 |>.dropLast
  if rows.isEmpty || rows.length > 16 then throw "CSV rows"
  let mut seen : List String := []
  let mut source : Option Nat := none
  for line in rows do
    match line.splitOn "," with
    | [key, text] =>
      if !GuardedJson.token key || seen.contains key then throw "CSV row"
      seen := key :: seen
      let n ← nat text
      if key == row then source := some n
    | _ => throw "CSV columns"
  let some sourceValue := source | throw "unknown row"
  pure (Json.mkObj [("request", j), ("sourceValue", .str (toString sourceValue)), ("expectedValue", .str (toString (sourceValue*factor))), ("matches", .bool (agrees sourceValue factor value))])
end FileConversionIO

def main : IO Unit := do
  let input ← IO.getStdin; let output ← IO.getStdout
  repeat
    let line ← input.getLine
    if line.isEmpty then break
    let response := match Lean.Json.parse line >>= FileConversionIO.evaluate with
      | .ok value => Json.mkObj [("ok", .bool true), ("result", value)]
      | .error _ => Json.mkObj [("ok", .bool false)]
    output.putStrLn response.compress
    output.flush
