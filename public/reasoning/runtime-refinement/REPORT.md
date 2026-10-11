# Aristotle runtime refinement and verified reasoning integration

Returned archive SHA256: `0698d63f32ab077703ea92013f60c4a22a3c1fbfe5572e05edc77ed513c43008`.
User-reported run: `27341903-5aea-4a27-bafc-15f2a94e160a`; subsequent runs reported time limits.
Uploaded summaries and logs were treated as claims to verify, not as acceptance evidence.

## Independently executed results

All nine new Std-only libraries/controls built under official Lean 4.28.0, commit
`7e01a1bf5c70fc6167d49c345d3bf80596e9a79b`: 85 build jobs, exit zero.
`local-build.log` records the fresh imported-module build. The complete Python suite passed **1,393 tests** (one expected duplicate-ZIP negative-control warning); the real prover/reuse suite passed **74 tests**, and the new source/stack-integrity tests add **16 tests**. The original production
proofs, controls and authority imports remain mandatory and unchanged.

The complete returned principal audit was rerun: **54 named theorems**, each with
axioms contained in `propext`, `Classical.choice`, `Quot.sound`. The three additional
statistical gates were independently compiled/audited against Mathlib exactly
`8f9d9cff6bd728b17a24e163c9402775d9e6a365`. They use the same approved axiom set.
`local-integration.json`, `local-axioms.log` and `local-statistics.json` retain results.
An active-code audit rejects admission and escape-hatch tokens; uploaded logs never
substitute for compilation or the complete theorem inventory.

**Seven exact source windows** match the current repositories:

| Component | Source | Inclusive lines | Established boundary |
| --- | --- | --- | --- |
| PCS | `pcs/experimental/intervention.py` | 33–62 | Bellman function under the Python-subset semantics |
| Website | `public/intervention-core.mjs` | 14–27 | Bellman function under the JS-subset semantics, with safe integers |
| CertiForge | `crates/certir/src/lib.rs` | 20–35 | Width bits/mask |
| CertiForge | `crates/certir-interpreter/src/lib.rs` | 14–19, 39–66, 68–77, 79–137 | Value constructor, binary operations, bit-vector comparisons and `eval_expr` |

The gate checks exact window bytes against receiver-selected component checkouts,
then fresh elaboration checks the three source-reading extraction modules before the complete axiom inventory. Cached extraction oleans cannot substitute for today’s auxiliary source bytes. The kernel checks extraction certificates and semantic theorems. Rust binding
itself compares lexer tokens and validates precedence. This is a proof under the
declared Rust-subset semantics, not a formal verification of rustc, native machine
code, allocation, the operating system or all runtime files. Source readers and
the compiler environment remain explicit trusted infrastructure. Typed inputs and
sufficient fuel are assumptions; fuel exhaustion never returns a claimed value.

CertiForge protected main `415a1de40eaeadc366ac2d824c05ee52bb2bd66e` includes the
Boolean-ordering repair. Its merged tree equals tested candidate
`596f295435ecf116bb9e0c7bc9afed7350b1dd62`; the extracted windows are unchanged.
Website baseline is `543f70844987e659d0d5320a8f701bc1e07facca`; PCS baseline before
this integration is `6f13233eb4d77daf2bedef5a1d40c4d576d31f19`.

## Runtime bugs repaired

The original parser can exhaust Python's call stack on an input inside its
3,000-character bound. On Python 3.12.14 the original 995-parenthesis fixture succeeds,
but 1,480 parentheses (2,985 characters) produce an uncaught `RecursionError`.
`parser-original-reproduction.json` records both outcomes. The archive's original
failure was on Python 3.11. The integrated patch implements the exact proposed
`depth > 256` guard on every recursive parser edge. Seven tests cover parentheses,
the accepted boundary, negation, right-associative implication and Lean input.
Exhaustion produces unsupported/no candidates, never a success.

The actual patched English parser was compared with the Lean transcription on
**1,523 frozen differential cases**: zero mismatches. This is testing, not a source
refinement theorem or proof of unrestricted English fidelity. The fixture suite
contains formal bodies embedded in supported English headers; it is not an unseen
natural-language benchmark. Both the fixture and Lean driver are digest-bound.

CertiForge formerly accepted ordered Boolean comparisons, which `eval_expr` rejects
with `bad bool cmp`. The `and_zero` counterexample changes that error into a value.
The repaired Rust checker admits only `eq`/`ne` on Booleans, while retaining all six
operators on matching bit-vector widths. Native tests exercise the operator matrix
and the actual error-versus-value counterexample. Locked workspace tests, formatting,
warnings-denied clippy, builds, Lean/package/attack checks and the 162-case independent
Rust/Lean replay pass. The native checker implementation is not itself extracted by
the new theorem; certificate soundness uses the repaired Lean checker and canonical,
well-typed stores. The native large-domain package acceptance gate stays closed.

## Meaning of the new proofs

The language, immutable-goal, final-receipt, library-conservativity, assumption
discovery, training-data and reward theorems concern their explicit Lean models.
They do not automatically prove corresponding Python/browser behavior. In particular,
the fair-search completeness and resume-budget monotonicity theorems describe the
specified formal search, not production beam search or its fixed-budget portfolio.
The previously measured portfolio regression remains a valid negative result.

`certified_reuse_complexity_separation` gives an infinite-family separation between
the specified backward-chaining tree algorithm without memoization and the specified
checked shared strategy, including construction/admission/checking in its cost model.
It is **not** a lower bound against all symbolic provers, DAG/memoized baselines,
general theorem proving, actual wall time, or evidence of a novel research breakthrough.

The statistical gates establish bounds under their explicit independent-observation,
boundedness, mean and pre-registration assumptions. Those assumptions have not been
proved for the current small correlated benchmark suites. These theorems do not
retroactively establish model superiority, robust RL gains or autonomous discovery.
Checkpoint registry membership, proofs and receipts confer no scientific authority.

## Public-job operational boundary

The prior live proof request stalled without diagnostic evidence and was cancelled; its cause is not yet established. The public job now emits bounded stage/status timing records without user text or credentials, and GNU timeout independently enforces a 600-second execution cutoff with a ten-second kill grace. Only the final result marker can supply proof evidence; progress, failure and cancellation cannot. A local real-kernel smoke produced all three sixteen-action proofs and exactly one final result marker (`public-job-observability-smoke.json`). This is operational testing on an already known theorem, not new research or a claim that remote hosting has recovered.

## Remaining obligations

1. Python and JavaScript **conditional checker** refinements: classes, mutable attributes,
   tuple-key dictionaries/Map, recursive methods, while loops and exceptions are missing
   from the extraction semantics. Both principal targets remain unproved, without placeholders.
2. Source-byte extraction of `adaptive.py` and its JavaScript counterpart. The replay theorem
   currently concerns the Lean model.
3. English regex rewriting and byte-extracted correspondence of the patched language parser.
4. Rust top-level `eval`, native type-checker/certificate-verifier extraction and compiler/native
   execution correspondence. The source-bound `eval_expr` theorem is narrower.
5. Implementation refinement of the other reasoning/learning/data models; actual empirical
   statistical assumptions, serialization/hashing/authentication and process isolation.

The complete returned inventory, build instructions, outstanding list, original
counterexamples and original logs are retained with `returned-` prefixes. The imported
source manifest binds exact additions. Four inert source snapshots are included because
the Lean extraction modules consume them; the gate checks the relevant current windows.
Existing reference sources are preserved. One new returned language module has only its extra EOF blank line removed; the exact original and both hashes are retained. Only the formal Lake target list is extended;
its old/new hashes are recorded and the toolchain, lock and authority graph are preserved.

## Reproduce

```bash
source /workspace/.onboarding/activate.sh  # or activate equivalent pinned tools
cd formal
lake build PCSRuntimeRefinement PCSMathLanguage PCSReasoningLibrary PCSAssumptionDiscovery \
  PCSVerifiedLearning PCSForgeRefinement PCSStatisticsCore PCSEndToEnd PCSNewControls
lake env lean tools/PrintPrincipalAxioms.lean
cd ..
python scripts/verify_runtime_refinement.py --site ../proof-carrying-science-site --certiforge ../certiforge
python scripts/verify_math_language_parity.py
python scripts/verify_statistics_formal.py
python -m pytest -q
bash scripts/verify_lean.sh
```

Required CI executes these checks against exact component revisions and the pinned
Mathlib checkout. Heavy model training was not rerun or claimed by this proof integration.
No paid services or financial information were used.

## Sources and continuation

[Integrated formal sources](https://github.com/Tommaso-R-Marena/proof-carrying-science/tree/main/formal) · [Core integration PR #101](https://github.com/Tommaso-R-Marena/proof-carrying-science/pull/101) · [Protected CertiForge repair #2](https://github.com/Tommaso-R-Marena/certiforge/pull/2).

[Single Aristotle continuation prompt](ARISTOTLE_RUNTIME_COMPLETION_PROMPT.md) · [Standalone formal input archive](aristotle-runtime-completion-input-v1.tar.gz) · [Archive SHA256](aristotle-runtime-completion-input-v1.sha256) · [Exact current source identities](current-runtime-sources.json). The archive is a standalone `formal/` workspace with no local dependency; the statistical subproject uses its separate exact Git Mathlib dependency. It contains frozen formal sources and current runtime snapshots; the manifest records their revisions. Integration tooling may advance without changing these mathematical sources.

The standalone upload archive was independently extracted into a fresh workspace and all nine new libraries/controls built successfully (85 jobs). Its 54-principal-theorem axiom inventory also passed. [Cold build log](standalone-build.log) · [Cold axiom log](standalone-axioms.log) · [Validation record](standalone-validation.json).

## Protected integration

PCS PR #101 and CertiForge PR #2 are merged by `Tommaso-R-Marena` through their normal protected gates. All ten required PCS jobs passed, including fresh source extraction, complete kernel/authority checks, real learned proof search, statistical proofs and native integration. The merged PCS tree equals the tested tree. [Exact commits and CI evidence](release-evidence.json). The earlier `validation-summary.json` preserves the local pre-merge record; this release evidence supersedes its pending-CI field. The website checker is pinned to merged PCS `c1c3ed267d55fc9adfedbe333baf1528bff7391b`.
