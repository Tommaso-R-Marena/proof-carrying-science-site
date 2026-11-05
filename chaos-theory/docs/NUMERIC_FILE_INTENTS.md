# A smaller, proved interface for model-assisted data edits

The previous [file-gate study](GENERAL_FILE_GATE.md) blocked unsafe changes but completed none of its 48 guarded tasks. No model-generated write was accepted. This experiment tests a different division of work: the model chooses a number; the host selects the approved cell and constructs the required tool sequence.

The compiler **does not calculate or correct the model's answer**. An in-bounds wrong answer can be accepted. Its job is to turn a permitted numeric proposal into the exact inspect/write actions required by the unchanged owner policy. Actual output datasets still pass the existing separate Lean file authority before publication.

## Try the complete workflow

From `chaos-theory/`, with Node 24 dependencies and qualified Linux x86-64 Lean 4.28.0:

```sh
source ../scripts/activate_lean_428.sh
python3 scripts/file-intent/demo.py /tmp/my-numeric-intent-demo > demo-result.json
```

This authored example uses a real CSV containing a sample of 7 and protected reference of 42. It first accepts 8 to show that permission does not prove scientific correctness. It then rejects an attempted protected-target override. Finally it accepts 7000, compiling the inspection/write sequence and publishing an actual checked CSV while keeping the reference at 42. The printed result includes its path. It makes no model call and is not evidence of model performance.

For ordinary supported CSV import and receipt-based editing, use the existing [file CLI](GENERAL_FILE_GATE.md#try-one-complete-example). The new numeric bridge is an operator research interface; it does not add a browser model endpoint or production authority.

## The new formal results

`FileIntent.lean` imports the unchanged mathematical file policy. An intent has a file, row and natural-number value. The **host**, not model text, selects the file and row. Compilation succeeds exactly when the target is editable, the value is in bounds, and any required inspection is possible. It emits a write, preceded by an inspection when required. It returns no plan when those conditions fail.

| Theorem                        | Guarantee in the mathematical model                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `compile_exact`                | Success yields exactly the compiler's selected plan and implies eligibility.                    |
| `eligible_exact`               | Eligibility is exactly edit permission, both bounds and any needed inspection permission.       |
| `compiled_length`              | A successful plan has at most two actions.                                                      |
| `compiled_authorized`          | Every emitted action is authorized in sequence, from any initial modeled state.                 |
| `compiled_exact_value`         | Executing a compiled plan reaches the proposed value.                                           |
| `compiled_protected`           | The compiled execution preserves noneditable cells, derived from the existing policy invariant. |
| `compiled_bounded`             | Initially bounded editable cells stay bounded, derived from the existing invariant.             |
| `compiled_consumes_inspection` | Execution ends with that file's inspection consumed.                                            |
| `compiled_append`              | A successful plan reaches its proposed value after any preceding guarded history.               |

The nine new proofs use only standard `propext` and `Quot.sound`. Together with the unchanged earlier 33 audits, the build checks 42 named theorems. No existing theorem or trust assumption is weakened.

`FileIntentMain.lean` executes this actual compiler. It independently parses the original model string using the strict Lean JSON parser, decodes a single canonical bounded integer string, checks eligibility and encodes the plan. The launcher qualifies the compiler bytes, builds the proofs, audits the exact names/dependencies and checks source/object pins before and after execution. An independent TypeScript implementation must agree. The original Lean-produced plan string then goes to the existing file authority; it is not replaced by a TypeScript-only verdict.

JSON/CSV parsing and encoding, hashes, the external process, physical execution and scientific correctness remain outside the kernel proofs. Intent JSON may contain equivalent standard escapes; its decoded numeric string must be canonical. Duplicate and escaped-duplicate keys, numeric JSON values, unknown fields, negative zero, leading zeros, non-ASCII digits and trailing material are rejected. The original string and exact compiled plan are preserved.

## Frozen evaluation design

The new corpus has twelve authored conversion tasks with new resource IDs and unit families, four development and eight prospective held-out. Every task has benign and malicious notices and runs through both tool-plan and numeric-intent interfaces. **Both interfaces enforce the same original policy.** This phase has no safety-off control.

Each of the 48 episodes makes at most two actual requests, up to 96 requests total. Both prompts disclose the eight-action per-proposal and sixteen-action cumulative limits. Requests use the same cached Qwen3-0.6B Q8_0 weights, greedy generation, disabled thinking, 384 reply tokens, 4096-token context and two CPU threads. No response is shared between interfaces. Malicious notices stay in the original conversation during repair; feedback contains actual state and commitment status, never a supplied reference answer.

Protocol, task/reference split, execution/scoring source hashes and their complete source archive are frozen before the first call. No prompt or policy tuning occurs between splits. Held-out unit families and IDs differ, but this is a tiny curated prospective benchmark, not a blind external study or pretraining-novelty claim. The interface comparison changes model responsibility and cannot establish model learning or autonomous protocol planning.

The scorecard separates completion, executed writes, unsafe published versions, malformed proposals, policy-ineligible intents, profile rejections, inference errors, safe wrong final answers, recovery and observed computation cost. All failed proposals and intermediate files remain in the evidence. The independent reference conversion depends on correct authored unit metadata and factors, not a measurement-validity proof.

Run new inference only by explicit choice, using existing local resources:

```sh
python3 scripts/file-intent/run.py --execute \
  --model /absolute/path/Qwen3-0.6B-Q8_0.gguf \
  --runtime /absolute/path/llama-server \
  --output /absolute/path/to/a/new-directory
```

Repeating the published tasks later is regression testing, not another fresh held-out result. [Frozen results and evidence](../evidence/file-intents-v1/README.md).

## Reproduce without inference

```sh
source ../scripts/activate_lean_428.sh
npm test
python3 -m unittest discover -s scripts/file-intent -p 'test_*.py' -v
npx --no-install tsx scripts/file-intent/test-native.ts
python3 scripts/file-intent/replay.py evidence/file-intents-v1/live
npx --no-install tsx scripts/file-intent/native-replay.ts
python3 scripts/file-intent/report.py evidence/file-intents-v1/live
```

Compiler differentials use actual Lean, independent TypeScript and Python, including both inspection modes, absent inspection permission, protected targets, bound edges and malformed encodings. Physical positive controls include every new authored goal and an accepted safe wrong answer. A source-mutation test must be run in isolation; it restores the original bytes before returning. Native replay requires exact frozen sources, with no compatibility fallback.

Compilation records bind owner-selected targets, original model strings, compiler fingerprint and exact plans, and are persisted before their plans are submitted. The original execution ledger is retained separately. Replay checks complete causal order and real CSV bytes. These local unsigned records do not authenticate their origin or establish independent administration. The host/storage remain trusted, retained checkpoints are needed for rollback detection, directory copies can fork, and process-crash tests do not prove power-loss durability. Nothing changes production PCS authority, model weights or deployed services.
