import StackSafe

/-! Scoped frontend to the unchanged, kernel-proved PCS CSV checker.
The local host binds source-file snapshots and extracted ID images. This
frontend does not claim that the host's RFC-style CSV parser is proved in Lean.
Files are fresh private snapshots supplied by the fixed local application.
-/
def main (args : List String) : IO UInt32 := do
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
