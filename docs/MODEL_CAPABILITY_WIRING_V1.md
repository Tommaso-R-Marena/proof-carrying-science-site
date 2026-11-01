# Website model and execution wiring, 2026-11-01

The audit found a concrete service defect: the public proof receiver required
`fabc704efdbda4c8822881366e4db3d3e31f066a` while protected core main was
`f20f3cab2938f2e085f137185e88f4700d5da2ed`. Its metadata endpoint reported
configuration without checking dispatch readiness. The browser consequently
offered submissions that the receiver's exact-source gate would reject.

The receiver and protected browser qualification now use the current reviewed
core. Prover sources and the four frozen model directories are identical between
those revisions. The public workflow differs only in its pinned checkout action.
The previous approved revision remains eligible for existing signed tickets
during their original lifetime. Exact revision equality is retained; new core
commits require another explicit qualification and pin update.

The status route now checks the same bounded repository, source and workflow
metadata as dispatch. Positive and negative observations are cached for at most
30 seconds per environment in each isolate, with concurrent calls coalesced.
Every status request is rate limited (60/client/hour, 240/global/hour) before
provider access. Missing configuration produces unavailable without a provider
call. Dispatch always repeats its uncached checks; readiness reserves no quota
and establishes no proof. Existing atomic proof admission remains unchanged.

## Execution map and actual weights

`public/capabilities.html` links 18 workflows with their execution mode, engine,
useful operation and limit. It separates live browser inference, hosted proof
jobs, exact calculations, the downloaded verifier, recorded state replay,
recorded research and contribution services.

`public/model-capabilities.json` inventories all 41 frozen checkpoints in the four
supported core families, selected models, registry digests, weight digests and
80 execution source files. It also binds the five frozen browser model files: the
repair ranker plus Omega bag, graph, bandit and nonlinear checkpoints. The hybrid
portfolio shares verified-memory weights.
Protected CI checks this inventory against the exact core checkout and actual
checkpoint bytes. Listing a comparison checkpoint does not expose a new hosted
model choice. The public job's closed family/action interface is unchanged.

The proof UI now names the returned executor and actual winning portfolio
component, including symbolic fallbacks. It displays a checkpoint when the
executor reports one; it does not invent a missing runtime attestation. Exact
human actions are labeled as human actions rather than model generation.

The two learned repair demos now capture a separate inference snapshot and
validate all numerical weights against release-pinned digest
`1202f553597d3e946a99f38131656ee06a0ed2937ef2da2ae9aea93df33af4ee`.
Changing a weight, provenance or the file's self-reported digest fails closed.
The snapshot is frozen to prevent accidental drift within the application.
This is not an immutable security root against a compromised host or browser.
The existing trainer, feature extractor and historical model bytes are unchanged.

## Independent execution evidence

Before edits, `npm run test:lean-research` passed 85 Node tests and 24 Python tests.
Afterward it passed 92 Node tests and the same 24 Python tests. The complete Node
test inventory passed 525 tests, zero failures, zero skipped. Learned-repair and
multi-step suites also passed, including deterministic retraining of the
unchanged actual weight file. Release integrity, source-bound historical receipt,
copy, infrastructure and security checks passed.

The current-core owner diagnostic `learned-chain` freshly loaded the real
`supervised-17` verified-memory checkpoint, searched 12 expansions (13 reported
Lean invocations), proved the authored conjunction goal, and independently
replayed it with an empty axiom list. Wall time was 48.98 seconds on this host.
The checkpoint digest is
`869732df6ef29bac30c9878b57e5d8c7e0f1fba41231d0d10c5f1112309aee57`.
The compact observation and exact standalone Lean source are preserved in
`docs/evidence/model-wiring-v1/learned-chain.{json,lean}`. A further direct Lean
4.28 compilation printed that `pcs_model_wiring_chain` depends on no axioms.
Unused simp-argument warnings originate in the unchanged memory declarations.
This elementary diagnostic is not a new theorem or a held-out capability result.

Real Chromium tests at 320, 390, 768 and 1440 pixels loaded the actual browser
weights, repaired the public implication-reversal case with one finite check,
and rejected altered weights in both model demos. The inventory rendered all
41 models without horizontal page overflow. Separate explicit HTTP readiness
fixtures test that configuration alone cannot enable submission; those fixtures
are not real hosted authorization evidence. There were no human participants.

## Full public-job family probe

A fresh local run of the actual public-job entrypoint, followed by the website
receiver and independent Lean compilation, used the same authored conjunction
swap in every family. This probe is operational evidence, not a benchmark:

| Selected family | Result | Expansions | Independent axiom audit |
| --- | --- | --- | --- |
| Checked reuse | verified, learned reuse stage | 4 | empty |
| Grounded induction | unknown | 20 | no proof claimed |
| Verified memory | verified | 12 | empty |
| Hybrid | verified, ordinary Std winner | 1 | `propext` |

The induction model's previous-policy and symbolic comparisons proved the goal.
Its `unknown` result remains in the original logs. A successful process exit is
not proof success. The hybrid result is attributed to ordinary Lean tactics;
it does not establish a neural gain. `propext` is disclosed, not erased.
All four raw local result logs and request bindings are preserved under
`docs/evidence/model-wiring-v1/public-families/`. The replay script validates
receipt bindings, recompiles every verified result and comparison, and compares
the exact independently printed axiom lists. It does not repeat inference or
attest GitHub execution.

Protected CI caught an integration defect during development: the local Lean
server correctly refused a newly imported display module outside its explicit
asset list. The helper now lives in the already supported job-client module.
The strict local server allowlist and core code are unchanged. The original
failed CI run is retained; the repaired real-browser gate must pass before merge.

## Reproduce

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:lean-research
npm run test:learned-repair
npm run test:multistep-repair
node --test tests/*.test.mjs
npm run verify:release
python3 scripts/check_model_capabilities.py --core /path/to/exact/core
PCS_CHROMIUM=/usr/bin/chromium npm run test:browser:model-wiring
lean docs/evidence/model-wiring-v1/learned-chain.lean
node scripts/replay_website_model_families.mjs
# From the exact core checkout, with its locked CPU dependencies and Lean 4.28:
python -m pcs.experimental.prover.hosted_qualification --case learned-chain
```

## Remaining boundaries

There is no single general PCS neural model behind every feature. Deterministic
verification remains independent of neural proposals. Qwen 0.6B/1.7B experiments
use real official weights in recorded/local research; this release adds no
fresh hosted LLM generation. Local interactive Lean sessions require the local
backend; public jobs are bounded, asynchronous and quota limited. Moving a game
card through a recorded catalog does not invoke a live kernel on each click.

The source pin intentionally fails closed after an unqualified core advance.
Status can become stale between observation and dispatch, or admission can run
out. Host execution, delivered JavaScript, GitHub, the Lean toolchain and
implementation correspondence remain trusted dependencies. A source-bound
receipt does not independently attest the physical neural computation. Formal
mathematical truth, encoded assumptions, implementation correspondence and
empirical validity remain separate. No production PCS authority or formal
specification was changed, and no model training or promotion was introduced.
