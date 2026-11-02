# Frozen prospective proof-search study v1

No learned advantage was found on these 14 authored cases. Per run, the frozen
neural policy solved 8, same-memory structural search solved the same 8, and the
Std-then-structural baseline solved 11. Total charged search Lean calls were
248, 224 and 50 respectively. All three methods proved zero false controls.
Two physical runs (84 searches) reproduced outcomes and call counts exactly.
They are replications of 14 cases, not 28 independent samples.

The protocol and case meanings were committed at
`f3549c30921ea2e1527b10d9f43bb0700e10ff39` before search. They exclude
outer-binder-alpha matches in four known frozen corpora (139 goals). This does
not establish conceptual novelty, blindness or exclusion from all historical
training data. No fitting or checkpoint selection was performed. All policies,
memories and trusted core bytes are pinned in the protocol.

Every successful search has a fresh independent replay: 27 proofs per run, 54
across the two. `negative-controls.json` additionally records three actual Lean
refutations, independently replayed with empty axiom lists. Search failure alone
is never refutation. Some positive receipts use standard Lean axioms, including
`propext`; inspect individual receipts. No new Lean theorem library or production
scientific authority is introduced by this experiment.

## Original records and source provenance

`run-1/` and `run-2/` preserve original raw JSON, summaries and per-run evaluator
source provenance. `artifacts.json` binds the complete JSON/protocol closure.
The original evaluator was `e7197109331cd6f3e55ccd8a04d4d1704edaff2f`.
Instrumentation at `8d872cc6dc401dc3b1ebd7e228ab9cab45752b2a` adds separate
compiler/wire/physical setup counters; it does not change the algorithm or caps.
Run 1's outer-call setup ledger excludes an internal startup handshake. Run 2
records it separately. Search counters agree with physical search attempts.
Child phase times exclude interpreter/import startup; hard external deadlines
include it. Equal call caps do not equate tactic internal work and one proposal.

The final runner adds a defensive aggregation check: a producer-only positive
status cannot become verified without a successful independent replay. This
change did not produce these archived runs. All archived positives were actually
independently replayed; original provenance is retained.

## Reproduce or independently receive

Use Python 3.12, a trusted checkout of core commit
`f20f3cab2938f2e085f137185e88f4700d5da2ed`, its hash-locked build/dev dependencies,
and the official Lean 4.28.0 toolchain. The receiving path needs no neural weights
or PyTorch. It uses the local source trust profile and regenerates approved
commands rather than running arbitrary producer Lean text.

```sh
python scripts/check_proof_search_artifacts.py
python scripts/verify_proof_search_study.py --core /trusted/core --results research/proof-search-prospective-v1/run-1
python scripts/verify_proof_search_study.py --core /trusted/core --results research/proof-search-prospective-v1/run-2
python scripts/verify_proof_search_study.py --core /trusted/core --negative-controls
```

For a new physical search run, additionally install the core's locked prover
requirements (actual CPU PyTorch), commit the evaluator source, and use a fresh
output directory:

```sh
python scripts/run_proof_search_evaluation.py --core /trusted/core --out /fresh/results
```

Protected site CI requires independent receiving replay of both original runs
and all false controls. A separate manually dispatched workflow can reproduce
fresh neural search without spending CPU on every PR. Timings and physical
model execution remain host observations, not kernel attestation. Checksums
bind recorded bytes; they are not signatures or immutable trust roots. These
small results establish neither accelerating recursive improvement nor general
AI safety, scientific validity or human usability.
