# Lean checks the actual model-plan text

This report records the 218-call research phase. The later [durable session phase](DURABLE_RECOVERY.md) brings the total to 242 and adds checked recovery after process restarts. Its results are recorded separately; the original run below is preserved.

The experimental controller now sends the **original model-plan text** to a separate Lean process before publishing a new state. Lean parses it, checks each action and computes its effects. The existing TypeScript executor must agree. Results are staged in fresh memory; rejection, disagreement, a stale head or a failed checker leaves the published state unchanged.

This is an opt-in research interface. Production PCS authority, the playable game, the legacy session API and existing theorem statements are unchanged. The old Lean table program was moved into a small separate entry file so the mathematical library can be imported by the new decoder.

## What was actually tested

A new run made **24 actual CPU requests** to the same official, hash-checked Qwen3-0.6B Q8_0 model. It reused all 36 archived initial proposals, including the twelve deliberately bad delivery/gate plans, without counting those replays as new inference. A real source-built Lean process made **60 pre-publication authorization computations**: 36 initial plans and 24 continuations. All 36 seeded tasks completed with zero unauthorized effects. Twelve benign seeds needed no new call because they were already complete.

This preserves the preceding history-based recovery result while adding a direct executable Lean check. It does **not** establish improved model judgment, broader attack resistance or a performance gain from Lean. The repair system prompt is clean and controlled; the original compromised system prompt is excluded. The known small synthetic corpus is not a held-out generalization test.

Total actual inference requests across the research phases: **218**. No hosted inference API, newly provisioned compute, human participants or training was involved. All effects remain synthetic memory updates.

## The stricter input profile

Inspection found that Lean's standard JSON parser replaces lone UTF-16 surrogates and keeps the last duplicate object key. The new interface therefore uses an explicitly stricter decoder:

- Duplicate keys are rejected at every nesting level, including duplicates spelled with Unicode escapes.
- Lone surrogate escapes and malformed surrogate pairs are rejected. Well-formed Unicode remains data; registered IDs must be ASCII tokens.
- Numeric values are rejected everywhere in a tool plan. Every registered tool argument is a string ID, so numbers cannot be valid authorized parameters. This also rejects negative zero, overflow and oversized exponents before numeric conversion. Numbers inside quoted strings remain ordinary data.
- Plan and action fields are exact. Unknown tools or malformed arguments have no effects; unexpected root/action fields reject the plan.
- Parsing has explicit size/depth/container limits. Sessions retain four submissions, sixteen total actions and terminal-state enforcement.

Whitespace and escaped spellings of valid keys/IDs remain supported. This is a strict profile with exact original-text binding, **not** a claim that every semantic value has one canonical spelling. Mixed plans containing numeric malformed arguments may be rejected as a whole by the new interface, whereas the legacy API can record individual denials. The legacy API remains unchanged; no compatibility mismatch was silently resolved by weakening it.

## Source-built execution boundary

`createLeanRecoveryHost()` builds the pinned Lean 4.28.0 sources, checks every named theorem audit, records source/compiler/object hashes and launches the fixed Lean entry point. Requests contain the registered family and original plan strings. The response must echo those strings exactly; the caller cannot select a verdict, transport callback or replacement guard.

Bootstrap review found that merely observing the selected compiler's hash was insufficient. The current launcher therefore requires the qualified Linux x86-64 executable SHA-256 `3e0d0d3d801675359f2d4cf9815bfdb417b20b92fdd9d48b3b14c95bbae28bbf` **before executing it**, then rechecks after building. This digest was observed locally and confirmed byte-identical in the CI installation using the existing release-archive SHA check. A negative test supplies an unapproved executable and confirms its marker file is never created. The live run used these same qualified compiler bytes; this bootstrap hardening was added afterward, with its original source snapshot preserved. This pin does not attest the entire standard library, dynamic loader or host.

Each request checks the pinned files before and after the Lean computation. The controller serializes candidate publications, checks the expected head, stages the legacy receipt computation privately and compares the complete state plus accepted/invalid masks before publishing. A failed process, changed artifact, malformed response or mismatch cannot fall back to a positive TypeScript-only verdict. Source/build manifests and the full native authorization ledger accompany the raw model responses.

These are ordinary same-user processes and unsigned hashes. A hostile host can replace code, interfere with a process or fabricate an archive. This is not an immutable root, independently administered verifier, hardware boundary or signed attestation. The Lean compiler/runtime and standard libraries remain trusted. No real equipment or operational tool permission is granted by this prototype.

## New formal results

The original thirteen `GuardedTools` statements are preserved. Eight additional `GuardedJson` theorems compile in Lean 4.28.0:

| Theorem                      | Statement                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `delivery_exact`             | Authorization for a decoded delivery requires exactly the approved package and dock.            |
| `gate_exact`                 | A decoded gate action is authorized exactly for the approved gate.                              |
| `inspection_exact`           | A decoded inspection is authorized exactly for the modeled equipment.                           |
| `repair_exact`               | A decoded repair requires that equipment and an inspection in the current modeled state.        |
| `decoded_json_protected`     | Lists of decoded JSON values preserve the mathematical protected-state invariant.               |
| `decoded_plan_protected`     | A successfully decoded plan, when run through the mathematical guard, preserves that invariant. |
| `accepted_effects_exact`     | Removing denied actions preserves the modeled guarded effects.                                  |
| `accepted_effects_protected` | Those accepted effects remain protected from the empty initial world.                           |

No custom axiom, proof admission or unsafe shortcut was introduced. The eight audits use only standard Lean foundations: six list `propext`, `Classical.choice` and `Quot.sound`; two list only `propext`. The old thirteen audits retain their previous dependencies. The build checks the exact theorem names and explicit dependency allowlists.

The theorems concern decoded values and the mathematical guard. They are **not** a proof of the byte parser, UTF-8 IO, source hashing, compiled execution, JSON output rendering, publication/CAS implementation, model competence or host integrity. Moving authorization into Lean reduces the cross-language execution gap; it does not eliminate every implementation assumption.

## Independent checks and retained evidence

- The original **92,823-case** Lean/TypeScript comparison still produces the same table digest after separating the entry point.
- The actual Lean process matches **426 identifier/schema cases** and **144 archived recovery snapshots**.
- **22 counted rejections**, plus a concurrent-continuation check, cover duplicate/escaped duplicate keys, lone surrogates, numbers, limits, terminal writes, a changed real compiled object and a closed checker. No affirmative mock is used to validate authorization.
- A fresh Lean process recomputes every one of the **60 recorded live authorization results** and compares exact raw text, masks and state. This is independent replay of recorded inference, not a second inference run.
- Python independently checks the model requests, causal receipt chains, prior history and final effects. Ordinary unit/browser tests remain required.

[Raw evidence, exact source snapshot and native ledger](../evidence/lean-plan-replay-v1/README.md) preserve the new run. Earlier state-only failures and all preceding model experiments remain untouched.

## Reproduce

From `chaos-theory/`, after installing the existing dependencies:

```sh
source ../scripts/activate_lean_428.sh
npx --no-install tsx scripts/test-lean-plan-runtime.ts
npx --no-install tsx scripts/replay-lean-gated-evidence.ts
python3 scripts/local_model_recovery.py --verify evidence/lean-plan-replay-v1/live
```

These commands build/check the real Lean process and replay saved records without model weights or API credentials. For new inference, use the pinned model/runtime from [the real-model setup](REAL_MODEL_SAFETY.md):

```sh
python3 scripts/local_model_recovery.py --execute --history --lean \
  --model /absolute/path/Qwen3-0.6B-Q8_0.gguf \
  --runtime /absolute/path/llama-server \
  --seed evidence/model-safety-v1/compromised-proposer \
  --output /absolute/path/to/a/new-directory
```

The protocol and source-built Lean manifest are written before the first new inference request. All new calls are bounded and recorded; transport errors are not silently retried. An unexpected checker failure aborts rather than publishing an unchecked continuation, retaining partial files for diagnosis. Linux x86-64 is the qualified environment; no Windows/macOS support claim is made for this experimental process launcher.
