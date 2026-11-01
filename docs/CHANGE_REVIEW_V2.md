# Original-file checks and recurring-export review

Version 2 closes the previous mathematical decoding boundary for the supported
CSV dialect: the fixed native checker receives **original CSV bytes**, decodes
them in Lean and checks exact ID disjointness or selected record preservation.
Python and JavaScript remain independent readers. Every decoded header, cell and
physical row line must agree before a host receipt is returned. Compilation,
file-to-process binding, runtime execution and the intended meaning of selected
IDs/columns remain explicit assumptions. This is not a signed scientific claim.

## Use the workflow

Open **What changed?**, choose previous/new CSV exports and confirm the ID columns.
Each ID must occur once per file. Select shared value headings to compare. Exact
heading matches are required; added/removed headings are visibly excluded.
No selected value columns means edits were not checked, which the UI states.

The three independent rules allow or flag additions, removals and edits. The
default permits new records while protecting existing IDs and compared values.
Review the original physical lines and before/after previews. Long values are
truncated only in the UI preview; checking and replay use complete snapshots.
An intentional change is not a scientific error merely because a rule flags it.

Save settings and counts explicitly, or download a reusable review. CSV contents,
IDs, values and live receipts are not stored in saved settings. Reports omit IDs
and values by default. Replay files include CSVs only on explicit selection.
Imported counts, rule verdicts and receipts are untrusted until rechecked from
matching file hashes. Changing files, ID columns, compared columns or rules
invalidates earlier confirmations and aborts in-flight requests.

The portable app retains its stable loopback address and rotates its capability
on each launch. A navigation nonce refreshes reused tabs without storing the
capability in browser storage. Links between local tools carry the capability
only in their fragment; it is removed on arrival. Unsupported old app versions
cannot authorize the new change-review scope. Version 1 artifacts remain
replayable in their original tool and carry only their original derived-list scope.

## Exact mathematical contract

`desktop/lean/OriginalCsv.lean` defines a byte grammar with independent permitted
`Transition` actions and inductive `Runs`. It explicitly models ordinary/quoted
fields, doubled quotes, LF/CRLF including embedded line breaks, physical lines,
UTF-8 BOM and EOF. Blank records, NUL, ambiguous/unclosed quotes, bare CR, invalid
UTF-8, nonrectangular rows and exceeded bounds reject. This is the documented PCS
bounded dialect, not an assertion of accepting every interpretation of RFC 4180.

The executable fold is proved sound and complete for that grammar. Decoded tables
are unique. Output hex encoding is proved equal to the existing injective codec.
Selection and change decisions are composed with original-file decoding; the
native verdict does not rely on host-generated ID images. The previous strict
CSV frontend remains available for existing artifact tests.

New theorems (all actually kernel-checked and audited):

- `PCSFiles.OriginalCsv.step_iff`, `run_iff`, `decode_iff`, `decodes_unique`,
  `hexSafe_eq`, `hexSafe_injective`.
- `PCSFiles.distinctWith_iff`, `distinctB_iff`.
- `PCSFiles.Review.entries_unique`, `added_iff`, `removed_iff`, `changed_iff`,
  `accepts_iff`, `overlap_iff`, `reviewCheck_iff`, `unique_id_eq`,
  `conservative_extension`, `original_conservative_extension`.

The last theorem says that if the original-file checker permits additions but
forbids removals/edits, every previous selected record occurs unchanged in the
new decoded export. It does not establish entity identity, correct measurements,
statistical validity, model safety, an immutable host or a publisher signature.
No core authority, certificate schema or Aristotle proof-development module is
modified. Core mathematical dependencies remain pinned to
`f20f3cab2938f2e085f137185e88f4700d5da2ed` and Lean 4.28.0.

## Validation and reproduction

```sh
npm run test:file-check
npm run test:change-review
python scripts/test_original_csv_native.py /path/to/pcs-files-checker
python scripts/test_change_review_native.py /path/to/pcs-files-checker
python scripts/test_change_review_boundary.py /path/to/bundle
python scripts/run_public_export_experiment.py /path/to/bundle
PCS_FILE_CHECK_BUNDLE=/path/to/bundle npm run test:browser:change-review
```

The original-byte corpus contains 20,541 cases: exhaustive suffixes through six
bytes over comma, quote, LF, CR and a data character; 1,000 deterministic quoted
UTF-8 examples; and malformed UTF-8/BOM controls. Full tables and physical lines
are compared across Lean, Python and JavaScript. A separate 1,352 table/scope
corpus exercises all eight rule combinations (10,816 configurations) against
independent set-of-signatures semantics in the compiled native implementation.

The [public Iris experiment](../research/export-conservation-v2/README.md) preserves
actual published observations with explicit source hashes, license, transformations
and identity assumptions. Artificial corruption/removal controls are labeled.
No new measurements or model-accuracy findings are claimed.

Release frontend/app/page source bytes come from a Git archive on every platform,
including Windows; newline-converted working files cannot silently change build
source identities. All four archives, sidecar digests, source hashes, source
commit, theorem audit and nonproduction trust flags are checked before a draft
release becomes public. Existing tags/releases are never overwritten.

For actual newcomer evaluation use [the opt-in study protocol](NEWCOMER_STUDY_V1.md).
Automated sessions never count as observed humans. Human identity, client clocks
and task self-reports are not proved by the software. Actual unfamiliar volunteers
and observation remain required before claiming the workflow is easier.

## Local qualification findings (2026-11-01)

The full website gate passed 520 JavaScript and 76 Python tests, with no failures
or skipped Node tests. The native compatibility suite retained all 231 actual
checks and 40 negative controls. Six additional real native calls and 24 negative
controls exercised change-request admission, arbitrary-verifier refusal, duplicate
IDs, scope ambiguity, and changes to snapshots/binary bytes after the real child
returned. Tampering controls never fabricate an affirmative verifier result.

The first maximum-size original-file regression hit the 30-second limit: a lookup
set was being rebuilt within the per-ID closure. Hoisting that pure construction
preserved the theorem and decision. The unchanged maximum-size suite then passed;
the development-package run took about 0.9 seconds for 5,000 rows per file with
256-byte IDs. Timings are local observations, not cross-platform guarantees.

The overlap browser suite completed all four widths, seven real native calls,
three accepted confirmations, four tampering/stale-response controls, and a normal
packaged-app restart. The new review suite checks exact changes, private saved
settings, canonical replay, hostile imported receipts, rule invalidation, duplicate
IDs and opt-in study export/erasure at four widths. A separate 390-pixel
local-app journey runs three real native review calls, including a deliberately
corrupted response that must not produce a confirmation.
These are automated task tests; actual unfamiliar human participants remain zero.

Protected CI must repeat the build, audit, native semantics, request-boundary and
published-data experiment on Linux, Windows and both Mac targets before release.
The Linux job also runs both browser suites using the actual packaged executable.
The release publisher checks the source closure of all four archives before
publication. Run links and qualified source identities belong to the corresponding
PR/release records, rather than being inferred from these development runs.

Deployment also requires public metadata for all four advertised ZIPs and their
checksum files. Both the manual deploy script and the configured automatic
Cloudflare deploy command apply this check. Before a new release is published,
a deployment is held and the existing live version remains active. Retry the
same qualified source after publication. This availability check does not replace
archive qualification or claim a signature or Lean verdict. Seven focused metadata
tests cover missing platforms/checksums, unfinished uploads, drafts, wrong tags,
foreign URLs and ambiguous metadata.
