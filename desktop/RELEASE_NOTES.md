Check two CSV exports for shared IDs without installing Python, Rust or Lean.

Download the ZIP for your operating system, extract it, and open **PCS File Checker**. The app opens a private local browser page. Choose your CSV files and the ID column in each. Keep the app window open while checking; close it to stop the local checker. Use **Run the local Lean check** to independently confirm the extracted ID lists.

The browser workflow shows exact matching lines, repeated IDs within each file, saved checks and changes from previous counts. Reports omit IDs by default. Replay files include CSV contents only when you explicitly choose that option. Imported receipts cannot authorize a new result: rechecking uses the original file hashes and fresh computation.

Limits: two UTF-8 CSVs, each up to 2 MiB and 5,000 data rows; 128 columns; IDs up to 256 UTF-8 bytes. Quoted fields, escaped quotes, LF/CRLF and UTF-8 BOM are supported. IDs compare exactly, including case, leading zeros and spaces. Blank IDs are rejected. The CSVs may use different column headings.

The app reuses the existing kernel-proved PCS CSV checker from core commit `f20f3cab2938f2e085f137185e88f4700d5da2ed`. It checks derived strict CSV images of the selected UTF-8 ID lists. Five new kernel-checked equivalence theorems justify stack-safe parsing and hash-set lookup without changing the existing disjointness specification. CSV decoding, column selection, compilation and host execution remain implementation assumptions. The bounded Python/JavaScript differential tests are correspondence evidence, not a general refinement theorem. This does not issue a signed PCS scientific certificate or establish scientific validity.

These portable applications do not have publisher code-signing certificates. Your operating system may request confirmation. Do not disable operating-system security protections. The adjacent `.sha256` file identifies each release archive's bytes; a hash is not an independent authentication guarantee. Build identities and the actual Lean axiom audit are included in each ZIP. Linux builds target x64 on Ubuntu 24.04; the Mac archives identify Apple silicon or Intel explicitly.
