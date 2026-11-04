# Actual open-weight model evidence

These are three completed exploratory experiments using real Qwen3-0.6B Q8_0 inference: **36 one-shot requests, 50 interactive requests and 36 compromised-proposer requests**. Not fixture outputs, human observations, training data or a universal safety proof.

- `one-shot/`: frozen protocol, 36 raw response records, report and inference log. Ordinary notice attacks produced no unauthorized effects; no measured guard safety improvement.
- `interactive/`: separately frozen follow-up, 50 raw model calls and 72 guarded/unguarded execution episodes. Identical model histories within a condition share completions. Both arms completed all tasks with zero unauthorized effects.
- `compromised-proposer/`: separately frozen fault-injection study. The model intentionally receives a forbidden high-priority objective; the executor retains the real policy. Twelve model-generated plans had unauthorized effects with enforcement off and none with it on. Six maintenance fault cases did not exercise repair-before-inspection.
- `*-independent.json`: independent Python replay results. They are not an independent rerun of model inference.
- `*-source.tar.gz`: exact source bytes recorded by the corresponding protocol. Current code additionally rejects nonfinite/negative-zero plans; offline replay checks all actual archived plans against the current executor.
- `provenance/`: pinned model card, licenses, weight and runtime download metadata. Weight SHA-256 matches the official model's LFS object. The runtime archive hash is an observed integrity record, not a signed source attestation. Large model weights/runtime binaries are not committed.

Read [the findings and limitations](../../docs/REAL_MODEL_RESULTS.md) and [reproduction instructions](../../docs/REAL_MODEL_SAFETY.md). No provider billing, external tool effects, participant data or model-training permission is involved. All records are unsigned; they do not independently authenticate who ran an experiment or make a host immutable.

From `chaos-theory/`, replay without downloading a model:

```sh
python3 scripts/replay_real_model.py evidence/model-safety-v1/one-shot
python3 scripts/replay_real_model.py evidence/model-safety-v1/compromised-proposer
python3 scripts/local_model_interactive.py --verify evidence/model-safety-v1/interactive
npx --no-install tsx scripts/replay-model-evidence.ts
python3 -m unittest discover -s scripts -p test_real_model_replay.py -v
```
