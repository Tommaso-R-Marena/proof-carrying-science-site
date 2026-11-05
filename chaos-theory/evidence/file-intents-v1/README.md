# Numeric intents and exact-conversion refinement

This research is stacked on draft PR #146 at `991733d5dcb488eb3636b992a9953333e1e0b011`. Commit `b77d17e585c9dabcd485b7efbf96f312a1eedc96` captured the execution/scoring implementation before inference. All 31 frozen execution/scoring files still match that commit and their archive. The exact-conversion gate is a separate implementation developed after this frozen study; it does not change the study's scores.

[Use the conversion CLI](../../docs/EXACT_CONVERSIONS.md). [Numeric interfaces and proofs](../../docs/NUMERIC_FILE_INTENTS.md). [Frozen scorecard](REPORT.md).

## Real-model result: no completion improvement

The same cached official Qwen3-0.6B Q8_0 weights made **96 new actual local CPU requests**, bringing the recorded multi-phase total to **574**. Twelve new authored tasks (four development, eight prospective held-out), benign/attack notices and two guarded interfaces produced 48 episodes. Both interfaces enforce the original policy. No shared/fabricated requests, training, hosted inference or human study occurred.

| Outcome | Tool plans (24 episodes) | Numeric intents (24 episodes) |
| --- | ---: | ---: |
| Completed tasks | **0** | **0** |
| Executed model-produced writes | 0 | 4 |
| Episodes with executed writes | 0 | 2 |
| Unsafe versions under protection/bounds policy | 0 | 0 |
| Incorrect written answers | 0 | 4 |
| Malformed numeric proposals | Not this interface | 44 |

The four numeric writes were wrong, in two development attack episodes. The remaining numeric responses used JSON numbers instead of required strings. The decoder was not relaxed to make them pass. Both arms completed zero held-out tasks. This interface did **not** demonstrate productive model use.

A permission-safe answer can be mathematically wrong. Nine new numeric-intent proofs establish protocol compilation, not answer correctness. Greedy generation, disabled thinking, 384 reply tokens, a 4096-token context, two CPU threads and the small model constrain interpretation. This curated prospective split is not a blind external benchmark, pretraining-novelty claim or general AI-safety result. Both prompts disclose all budgets; malicious notices persist during repair. No reference answer is supplied in repair prompts.

Every actual request, failure, intermediate dataset and original pre-publication execution record remains. The original ledger contains **248 real computations**; no reconstruction was needed. Independent Python verifies complete causal order, scoring, 48 compilation records, 48 physical workspaces and the ledger. Fresh Lean recompiles all 48 intents and recomputes all 248 execution records. These are consistency checks, not origin authentication or model-generation reproduction.

## Stronger conditional answer verification

The separate conversion gate requires proposed value = **original CSV cell × owner multiplier**. Actual Lean checks this relation, followed by the original intent compiler and file authority. A retained job receipt binds source bytes, target, multiplier and enforcement implementation. Reopening and explicit recovery recheck every committed version, including lower-level writes.

Nine more proofs establish exact relation/output, wrong-answer rejection, policy refinement, preservation and arbitrary-history composition. `safe_wrong_exists` is an axiom-free concrete counterexample to equating permission safety with the required calculation. Total named audits: **51**, including the unchanged earlier 33. New dependencies are only standard `propext` and `Quot.sound`.

The campaign accepted and physically wrote all **12 authored correct conversions**, rejected 12 authored wrong answers, and rejected all **48 archived numeric model proposals**, including the four previously allowed incorrect writes. This is **archival filtering**, not an adaptive live-model counterfactual: the saved repairs used the weaker interface's feedback. It establishes no improved model completion rate.

The deterministic CLI can calculate and publish the correct conversion through Lean without a model. The documented commands actually copied a local CSV, converted 7 to 7000, kept reference 42 and left the input unchanged. This useful deterministic baseline and authored controls are not model successes.

Additional actual tests cover one winner among concurrent stale submissions, multiplier/receipt substitution, a wrong lower-level write detected on resume, verified recovery of a safe unacknowledged suffix and refusal of an incorrect suffix. Twenty-six real-Lean parser/arithmetic cases agree with independent TypeScript and Python. Independent Python checks 38 physical workspaces: 37 valid refined histories and one retained wrong lower-level counterexample. The 72 selected semantic computation records do not claim to include every extra internal resume/race query.

## Package

- `prospective-plan.json`, `live/protocol.json`, `live/frozen-sources.tar.gz`: frozen plan, corpus, prompts, runtime identities and exact execution/scoring sources.
- `live/`: all 96 calls, 48 episodes, original CSV/receipt histories, 48 compiler records and original native ledger.
- `original-live-run.tar.gz`: the complete unmodified run, including runtime/bridge logs and original report. Plain log copies are omitted from `live/`; original logs are archived without normalization.
- `REPORT.md`, `python-replay.json`, `native-replay.json`, `python-tests.txt`: verified rendering, independent replays and genuine-data negative tests.
- `intent-native-controls.json`, `intent-control-artifacts/`: 94 compiler differentials, all twelve actual legal goals, safe wrong-answer execution and source-pin control.
- `authored-demo/`: actual demonstration, explicitly zero model calls.
- `conversion-campaign.json`, `conversion-artifacts/`: refinement controls, archival filtering, actual CSVs, job-bound proposals and retained lower-level counterexample.
- `conversion-parser.json`, `conversion-parser-artifacts/`, `conversion-python.json`: lexical/arithmetic and independent artifact checks.
- `documented-cli/`: original fixture, actual output workspace, receipts and `show` result.
- `summary.json`, `current-source-state.json`: derived totals and current source inventory. Local hashes and commits do not establish independent timestamps or origin.

## Replay

From `chaos-theory/`, with dependencies and qualified Linux x86-64 Lean 4.28.0:

```sh
source ../scripts/activate_lean_428.sh
npm test
python3 -m unittest discover -s scripts/file-intent -p 'test_*.py' -v
python3 scripts/file-intent/replay.py evidence/file-intents-v1/live
npx --no-install tsx scripts/file-intent/native-replay.ts
npx --no-install tsx scripts/file-intent/test-native.ts
npx --no-install tsx scripts/conversion-gate/test-parser.ts
npx --no-install tsx scripts/conversion-gate/campaign.ts evidence/file-intents-v1/live
python3 scripts/conversion-gate/verify-artifacts.py evidence/file-intents-v1/conversion-artifacts --study evidence/file-intents-v1/live
```

These checks need no weights/API key and make zero new inference requests. `test-native.ts` temporarily mutates and restores one new driver for a pin-negative control; run it in isolation from other checker processes. Native study replay requires exact execution/scoring sources, with no compatibility fallback.

## Limits

The multiplier relation is proved conditional on the mathematical model and owner inputs. Parsing/encoding, byte-to-model correspondence, hashes and physical host execution are independently tested, not kernel-proved. Correctness of unit metadata, the chosen multiplier and measurement validity remain scientific assumptions.

Host/storage remain trusted; records are unsigned, independent administration is not established, retained receipts are necessary for rollback protection and directory copies can fork. Process-crash tests do not prove power-loss durability. Nothing changes production PCS authority, existing theorem statements, model weights or deployed services.

Next research: a separately frozen structured-decoding comparison with more capable authorized local resources, preserving these failures. Decoder/byte refinement and independently administered storage/execution remain obligations. For the known-multiplier workflow, deterministic execution is already the appropriate baseline; no model is needed.
