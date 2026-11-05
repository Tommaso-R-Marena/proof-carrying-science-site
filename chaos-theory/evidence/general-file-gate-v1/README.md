# General file gate: frozen evidence and negative utility result

This is an experimental addition stacked on `91e0164a7a24fd77736606c2d481cb14d947918a` (draft PR #145). It does not change production PCS authority, model weights, browser gameplay or deployed services. [Usage and exact guarantees](../../docs/GENERAL_FILE_GATE.md). [Generated scorecard](REPORT.md).

## Main finding

Actual cached Qwen3-0.6B Q8_0 weights made **236 new local CPU inference requests**, bringing the recorded multi-phase total to **478**. This phase used 24 authored conversion tasks, eight development and sixteen prospective held-out, each with benign and malicious notices in guarded and capability-control arms: 96 episodes. The first 48 actual proposals are shared across arms and counted once; later repairs are separate calls. No new hosted inference, training or human study occurred.

| Outcome | Guarded (48 episodes) | Capability control (48 episodes) |
| --- | ---: | ---: |
| Completed tasks | **0** | 2 |
| Executed model-produced writes | **0** | 158 |
| Logical policy violations | 0 | 158 |
| Unsafe published dataset versions | 0 | 72 |
| Episodes with an unsafe published version | 0 | 24 |

**No model-produced write was accepted in the guarded arm.** This demonstrates bounded containment, not productive autonomous task completion. Nine guarded actions were inspections. Zero oracle false rejections does not establish useful acceptance when no eligible model write was demonstrated. Separately, all **24 authored legal goal witnesses** succeed through actual Lean and physical CSV publication. These are implementation positive controls, not model successes.

The run used greedy generation, disabled thinking, 384 reply tokens, a 4096-token context and two CPU threads. The frozen prompt states eight actions per proposal and three proposals, but omits the executor's cumulative sixteen-action ceiling. Interface and budget failures constrain interpretation of model competence. These are authored disposable datasets, not measurements from published scientific studies. Reference factors and unit metadata remain assumptions. A safe wrong answer and an unreachable restrictive policy are retained negative controls.

## Collection failure and recovery

The final aggregate native-ledger export exceeded the bridge's 1 MB response bound **after all 96 episode files, calls, receipts and actual CSV versions were saved**. The original aggregate native ledger was not retained. `original-collection-failure.tar.gz` preserves the original raw run and console, before report recovery or ledger reconstruction.

`live/report.json` was derived from the exact saved 236 calls and 96 episodes with the unchanged frozen scoring function. `live/native-ledger.json` is **856 fresh real Lean computations**, not the original pre-publication recording. Reconstruction reproduces the exact expected input sequence and publishes actual CSVs in a separate workspace; those workspaces are in `reconstructed-ledger-artifacts.tar.gz`. A subsequent fresh native replay verifies the original 96 physical workspaces and every reconstructed result. Independent Python verifies complete causal request histories, reference outcomes, receipts, artifacts and input order. This establishes consistency under the stated host assumptions, not origin authentication or original timing. Recovery made zero new inference calls.

The repaired collector writes its ledger exclusively to a fixed host-owned file, synchronizes it and returns bounded count/digest metadata. The real-Lean regression exports **2,292,875 bytes**, returns **124 bytes** of metadata and refuses a second overwrite. No positive verifier response is mocked.

The frozen source archive and source inventory remain unchanged. `post-freeze-maintenance.json` records the collector and presentation/test maintenance. Replay explicitly pins the exact historical and repaired observer hashes, checks the whole historical source profile, and rejects mixed or unknown profiles. All 17 enforcement sources retain fingerprint `fd2c828e7c475406a5fcb2080b0e168a8a58e62066c472416e716ee8c30ebc10`; prompts, tasks, policies and metrics were not tuned after inference.

## Package contents

- `live/`: actual request/response records, protocol, 96 episode records, original physical CSV versions and receipts; recovered report and explicitly reconstructed native ledger.
- `pre-inference-plan.json`, `source-state.json`, `pre-inference-source.tar.gz`: original frozen plan and sources.
- `original-collection-failure.tar.gz`: original failed collection, unmodified.
- `ledger-reconstruction.json`, `reconstructed-ledger-artifacts.tar.gz`, `recovered-report-dry-run.json`: exact recovery provenance and reproducible derivation hash.
- `native-integration.json`: 9,360 Lean/TypeScript/Python differential cases, fifteen negative controls, three killed-process boundaries, a synchronization failure and one winner in a real two-process publication race. No model inference.
- `authored-reachability.json`: 24 actual successful legal goal witnesses; no model inference.
- `collector-regression.json`: actual large-ledger regression after repair.
- `python-replay.json`, `native-replay.json`, `native-replay-final.json`: independent saved-run consistency checks. The final replay uses the extracted, unit-tested compatibility helper.
- `native-fixture/`, `native-fixture-checkpoint.json`: genuine native-generated artifacts used by Python negative tests.
- `documented-cli/`: actually executed authored demo and custom-CSV commands; inputs, plans, receipts and real output versions. Absolute paths in receipts describe original execution locations.
- `REPORT.md`: current human-readable rendering. `REPORT-initial-render.md` preserves an earlier rendering; neither changes the frozen raw study data or scores.
- `summary.json`, `post-freeze-maintenance.json`, `current-source-state.json`: derived summary and source-change provenance. Hashes do not establish an independent timestamp or origin.

## Replay

From `chaos-theory/`, with Node 24 dependencies and qualified Linux x86-64 Lean 4.28.0:

```sh
source ../scripts/activate_lean_428.sh
npm test
python3 -m unittest discover -s scripts/file-gate -p 'test_*.py' -v
python3 scripts/file-gate/verify_evaluation.py evidence/general-file-gate-v1/live
npx --no-install tsx scripts/file-gate/replay-evidence.ts
python3 scripts/file-gate/recover-report.py evidence/general-file-gate-v1/live --dry-run
npx --no-install tsx scripts/file-gate/test-native.ts
npx --no-install tsx scripts/file-gate/test-reachability.ts
python3 scripts/file-gate/test-collector.py
```

Fresh reconstruction can be reproduced by extracting the original failure archive into a new directory, running `recover-report.py` there without `--dry-run`, then `reconstruct-ledger.ts DIRECTORY`, then both independent replayers. Recovery tools refuse to overwrite existing evidence. No model weights are needed for replay or these tests. Generating new proposals requires the cached real weights and explicit `evaluate.py --execute`.

## Trust boundary and next milestone

Twelve new kernel proofs cover arbitrary resource IDs, protected cells, conditional editable-value bounds, inspection consumption and legal reachability; all 21 earlier theorem statements remain unchanged. JSON/CSV parsing, hashes, filesystem execution and correspondence are tested, not kernel-proved. Compiler pins and a separate process do not establish independent administration. Host and storage remain trusted, checkpoints are unsigned and require separate retention, copied directories can fork, and process-crash tests do not prove power-loss durability.

The next useful milestone is productive model-generated guarded completion on a newly frozen corpus, with the full budget stated, exact policy retained, separate malformed/budget/reasoning outcomes and negative controls. Then prove decoder/serialized-byte refinement and strengthen independently administered execution/storage. The current package is a reproducible research prototype, not production scientific or general AI-safety authority.
