# Exact finite model-output evaluation

The new local capability checks three original CSV snapshots: reference targets,
earlier outputs, and new outputs. IDs are unique, nonblank, bounded to 256 UTF-8
bytes, and identical across all three files; row order may differ. Missing/extra
predictions are rejected, not dropped from a denominator. Selected outcome cells
compare as exact UTF-8 bytes. Empty labels are allowed. Limits are 1,000 rows,
128 columns, and 2 MiB per file within the existing proved bounded CSV grammar.

The browser offers an independent preview. PCS File Checker 2.1 compiles and runs
the Lean decoder and evaluation function on private captured file snapshots. Its
independent Python reader checks the entire native transcript: all decoded cells,
source lines, selected columns, aligned cases, counts, and verdict. It checks the
pinned checker before and after execution and rereads its private snapshots after
the call. This detects accidental drift under the trusted host; it does not prove
an immutable process, protected storage, or compiler refinement.

## New mathematical results

`desktop/lean/Evaluation.lean`, namespace `PCSFiles.Evaluation`:

- `balance`: new matches + regressions = earlier matches + improvements.
- `zero_regressions_iff`: zero regressions exactly characterizes preserving every
  previously correct case's correctness.
- `preserves_iff`: the executable Boolean decision is equivalent to preservation
  of exact previously matching labels over the aligned finite cases.
- `preservation_matches_mono`: preservation implies nondecreasing match count.
- `lookup_sound`: a lookup returns an actual matching entry.
- `align_ids`: aligned cases have exactly the reference IDs, in reference order.
- `align_sound`: every case's labels come from the three selected input entries.
- `evaluate_iff`: native evaluation success matches the original-byte decoder,
  entry selection, bound/length conditions, and successful alignment specification.
- `original_preservation`: evaluation plus preservation yields the original-byte
  relation, casewise preservation, and match-count monotonicity.
- `original_labels_agree`: every aligned case has witnesses in the decoded originals.

The build elaborates all these declarations and audits their axioms along with
existing original-CSV/review proofs. Standard Lean logical axioms may occur;
`sorryAx`, `Lean.ofReduceBool`, `Lean.trustCompiler`, and extra axioms are rejected.
No PCS core authority, ProofGated module, model weight or trust profile is modified.
Core mathematical dependencies stay at `f20f3cab2938f2e085f137185e88f4700d5da2ed`.

## Replay and trust boundary

A canonical `pcs-model-evaluation-replay-v1` binds three file hashes, exact column
indices/headings, summary counts, and supplied provenance. Explicitly including
original CSVs enables a complete private handoff. Readable reports omit rows by
default; metadata notes and file hashes are disclosed. All imports are untrusted;
recorded receipts are never accepted as fresh authorization. A fresh native result
also binds the decoded table images, compiled checker identity, chosen columns,
and provenance digest. Editing files, columns or metadata invalidates that result.

The optional app argument captures the canonical replay once before serving.
Capability-protected one-shot `/api/handoff` serves only that captured document;
shared browser modules consume one promise. The app does not reopen the original handoff path while checking. This tool does
not perform inference. Files do not enter URLs,
cloud storage, or saved recipes. Ordinary loopback capabilities and hashes are
not an unconditional host-security boundary. The app is not publisher-signed.

`model_generation_attested`, `reference_labels_validated`, `host_refinement_proved`,
`signed_receipt`, and `scientific_acceptance` remain false. Label truth, sampling,
model identity, actual output generation, held-out performance, and universal safety
need distinct evidence. Supplied model weight digests are claims, not attestations.

## Actual recorded example and negative finding

`scripts/export_model_evaluation_example.py` derives the public files from the
historical real PCS prospective proof-search run. Its metadata binds the summary,
protocol and checkpoint hashes. There are 11 positive tasks and three negative
controls. The symbolic policy found 11 proofs; the learned policy found eight.
The target is `verified` on positives and `not_verified` on controls; nonverified
outcomes are not disproofs. Against those distinct targets, earlier agreement is
14/14, candidate agreement 11/14, with zero gains and three regressions.
Loading this example performs no new model inference. Historical evidence is retained.

An independent authored three-case control has earlier accuracy 1/3 and new
accuracy 2/3, with two gains and one regression. It disproves the proposed rule
“aggregate gain implies preservation” within this explicitly finite setting.
It is not a finding about a physical AI model or the real world.

## Reproduction

Use Lean 4.28.0 and the pinned project dependencies:

```sh
npm run test:model-evaluation
python scripts/build_file_checker.py --core /path/to/exact/core --output /tmp/pcs-eval --package
python scripts/test_model_evaluation_native.py /tmp/pcs-eval/bundle
PCS_FILE_CHECK_BUNDLE=/tmp/pcs-eval/bundle PCS_FILE_CHECK_EXECUTABLE='/tmp/pcs-eval/dist/PCS File Checker' npm run test:browser:model-evaluation
```

The [local qualification record](evidence/model-evaluation-v1/local-qualification.json)
binds the actually packaged implementation commit and all 36 source hashes. Its
separate browser/native records include negative controls and zero human results.
Initial hosted failures are retained; they are not recorded as passing checks.
The source exporter reads the frozen historical Git blob and preserves exact public
CSV bytes on Windows rather than normalizing mismatched identities.

The native campaign exhausts 512 binary configurations, adds shuffled/Unicode and
1,000-case vectors, compares JavaScript and Python against an independent Boolean
oracle, and exercises the real compiled executable. Failure-only mutation controls
alter actual completed runs, never invent positive verdicts. Browser tests cover
four widths, private replay/receiving, redaction, the recorded negative result,
automatic native evaluation, altered bindings and stale response invalidation.
Protected CI repeats native tests on Linux, Windows and both Mac architectures.
Release publication requires all four qualified archives at the exact source commit.

Build version and published-download version are separate. The first feature PR
keeps published 2.0.0 downloads available while building 2.1.0. Only after the
existing protected release publisher issues all eight assets may a follow-up change
advance public links and `desktop/PUBLISHED_VERSION`. No historical tag is overwritten.

## Outstanding work

No human newcomer results, model provenance attestation, signed receipts, runtime
compiler refinement, universal neural safety, or independent reference-label
validation is established. The next useful research step is a preregistered,
held-out model comparison with separately authenticated generation and target
provenance, retaining failures and controls, plus the actual observed newcomer pilot.
