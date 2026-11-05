import GuardedJson

open Lean

def main (args : List String) : IO Unit := do
  if args != ["--serve"] then throw (IO.userError "Use --serve")
  let input ← IO.getStdin
  let output ← IO.getStdout
  repeat
    let line ← input.getLine
    if line.isEmpty then break
    let checked := if line.utf8ByteSize > 100000 then Except.error "request size"
      else GuardedJson.strictParse line >>= GuardedJson.evaluate
    let response := match checked with
      | .error _ => Json.mkObj [("ok", .bool false), ("error", .str "rejected")]
      | .ok result => Json.mkObj [("ok", .bool true), ("result", result)]
    output.putStrLn response.compress
    output.flush
