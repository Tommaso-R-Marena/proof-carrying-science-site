# Check my files, version 2

For current original-byte decoding, recurring-export review, exact theorem names
and trust limits, see [CHANGE_REVIEW_V2.md](CHANGE_REVIEW_V2.md). Version 2 passes
original CSV snapshots to the proved native decoder. Version 1's derived-image
contract is retained below as historical compatibility context; it must not be
confused with an original-file decoding proof. Old receipts never grant new live
confirmation merely by being imported.

# Version 1 compatibility and basic workflow

The first complete own-data workflow checks whether two selected ID columns share
any exact values. It is useful for inspecting dataset splits and reconciling file
exports. It does not decide whether an overlap is appropriate for a study.

1. Save each spreadsheet sheet as CSV UTF-8.
2. Choose a first and second file. Confirm the ID column in each preview.
3. Run the check. Review the original physical line numbers, including the header.
4. Correct records in the source spreadsheet, export again, and choose the new file.
5. Save the check to reuse the column choices. Compare counts next time.
6. Download a readable report or replay file. Reports omit matching IDs by default.

No account or file upload is required. Browser storage changes only when the user
chooses **Save check on this device** or **Forget**. A saved recipe contains names,
column choices, previous counts and file hashes; no original CSV or matching IDs.
The **Download replay file** button includes original CSV data only if the explicit
checkbox is selected. Without embedded data, the recipient must choose both original
files. Fresh SHA-256 checks and recomputation must match the recorded counts.
Recorded receipts are never sufficient to mark a new session locally confirmed.

## Local app

The versioned release offers portable ZIPs. Extract the archive and open **PCS File
Checker**. It opens a private loopback page with a fresh session capability. Keep
its window open while checking, and close it to stop the server. A replay download
with embedded CSVs can be opened directly in the app. No terminal commands or
separate language-toolchain installation are needed by the user.

Applications lack publisher code-signing certificates. OS confirmation may be
required. The provided SHA-256 and BUILD records identify the release bytes and
source version; they do not independently authenticate a publisher. Do not disable
OS security protections. Mac archives label Apple silicon and Intel separately.
The Linux package targets x64 Ubuntu 24.04. The app uses the same local address
(`127.0.0.1:49381`) across launches so explicitly saved recipes remain reachable.
Each launch creates a fresh capability; old capabilities are rejected. Only one
app instance can occupy that address. If it is busy, return to the existing app
or close the other copy and try again. Browser history belongs to this local
origin and browser profile; clearing browser storage or changing profiles removes
access to it. Download a reusable check to transfer it between browsers.

## Formal and implementation boundary

Version 1's native frontend imports the unchanged PCS `PCS.V2.Csv` module from exact core
commit `f20f3cab2938f2e085f137185e88f4700d5da2ed`. Build-time Git archives exclude
working files, caches and untracked module substitutions. The build independently
elaborates and audits `parseCsv_sound`, `parseCsv_complete`, `csvTable_unique`,
`csvDisjointB_iff` and `csvRun_sound` using Lean 4.28.0.

The browser and local Python reader independently decode bounded RFC-style UTF-8
CSV files, preserve the selected ID values, and map each UTF-8 byte string
injectively to lowercase hexadecimal. Those images have a fixed `id` header and
contain no quoting ambiguity. The local app writes fresh private snapshots and
passes their exact bytes to the bundled native Lean checker. Its Boolean result
must match the independent Python computation. Binary/dependency digests and
derived snapshots are checked before and after execution. No caller can select
the checker program or supply an affirmative verdict.

The frontend's `StackSafe.lean` adds five kernel-checked theorems:
`PCSFiles.splitSafe_eq`, `mapOptSafe_eq`, `parseSafe_eq`, `disjointSafe_eq` and
`disjointSafe_iff`. They prove tail-recursive splitting/optional mapping and a
hash-set membership implementation equal to the original mathematical functions,
including the full `CsvDisjoint` equivalence. Hash collisions do not authorize
false matches: the verified set checks exact equality. No core source is changed.
All ten frontend/core theorem dependencies are audited during every package build.

Lean establishes disjointness for the derived ID-list CSV bytes. The relationship
between original RFC CSVs and those images is implementation correspondence,
supported by differential/adversarial tests, not a general Lean theorem about
Python/JavaScript, filesystem or OS behavior. Hashes, private temporary files,
loopback binding and a bundled executable are not immutable security boundaries.
The host and application code remain trusted. No scientific acceptance, organization
signature, identity authentication, statistical generalization or model safety is
claimed.

The loopback API accepts only fixed bounded JSON snapshots, two column indexes and
a per-session 256-bit capability. It rejects unsupported Host/Origin values, CORS
preflights, wrong/missing capabilities, requester-selected verifiers, duplicate JSON
fields, byte/hash mismatches, oversized requests and conflicting checks. It exposes
no arbitrary file paths, commands, generic proxy or remote upload endpoint.

## Supported inputs

Two files, each up to 2 MiB and 5,000 data rows; 128 columns; unique nonempty headings
up to 1,024 UTF-8 bytes; selected IDs up to 256 UTF-8 bytes. LF, CRLF, initial UTF-8
BOM, quoted commas, double quotes and embedded LF/CRLF are supported. Invalid UTF-8,
NUL, bare CR, ambiguous quotes, ragged tables, empty datasets and blank IDs reject
with an actionable message. ASCII whitespace-only IDs are blank. All other IDs are
compared exactly: no trimming, case folding, number coercion or Unicode normalization.
Repeated IDs within a file are counted separately from distinct cross-file matches.

## Reproduction

Developers can run:

```sh
npm run test:file-check
npm run test:browser:file-check
python scripts/build_file_checker.py --core /path/to/pcs --output /fresh/build/path --package
python scripts/test_file_checker_native.py /fresh/build/path/bundle
PCS_FILE_CHECK_BUNDLE=/fresh/build/path/bundle npm run test:browser:file-check
```

Building requires Lean 4.28.0 and the hash-pinned `desktop/requirements-build.lock`.
Users of released apps require neither. CI checks each official SDK ZIP against a
fixed SHA-256 digest. Packaged-app smoke tests remove development Python and Lean
paths before executing real authorization. The portable-checker workflow is a
prerequisite of protected `site-full-gate`. Publishing is restricted to an explicit
workflow dispatch on `main` after every platform job succeeds; existing releases
are never overwritten.

Automated browser journeys are functional evidence. No new human participants or
independent newcomer-usability results are claimed by this implementation.
