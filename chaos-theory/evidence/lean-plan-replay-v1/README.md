# Actual Lean-gated model continuations

This phase adds **24 actual Qwen3-0.6B Q8_0 inference calls** to the previous 194. All 36 archived seeds are retained; replaying them is not new inference. All seeded tasks completed, with zero unauthorized effects and **60 actual native Lean authorization computations before publication**. Twelve benign seeds were already complete. The [method and limitations](../../docs/LEAN_PLAN_GATE.md) explain the strict profile and trust boundary.

`live/` preserves the frozen protocol, full raw model responses, Python/TypeScript receipt outcomes, source-built manifest and `lean-authority.json` ledger. `live-source.tar.gz` contains the exact source files recorded before inference. All records are unsigned and cannot authenticate who ran the experiment. The model was not trained or improved.

The earlier state-only failures, ordinary attack experiments and legacy history recovery remain under `model-safety-v1/` and `model-recovery-v1/`. This run assumes a clean repair system prompt and uses the same known synthetic corpus. It is not a held-out deployment-safety result.

The decoder and gate are real compiled/interpreted Lean computations; no model-provided verdict or mock transport substitutes for them. The eight new theorem audits use only the standard `propext`, `Classical.choice` and `Quot.sound` foundations. The parser, compiler/runtime, byte IO, hashes and host remain implementation assumptions outside the theorem.

`native-integration.json`, `native-replay.json`, `model-differential.json` and `python-replay.json` preserve the executed checks. Readable console logs trim trailing whitespace only; `raw-console.tar.gz` preserves the original bytes. Previous phases and their negative results are untouched.
