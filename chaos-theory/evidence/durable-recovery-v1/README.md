# Durable Lean-gated recovery evidence

This phase adds persistent exact-text journals and exercises them with the actual cached official Qwen3-0.6B Q8_0 weights and source-built Lean 4.28.0. It does not train or change model weights.

- **24 new actual inference requests**, bringing all recorded phases to **242**. All 36 known seeded tasks completed, with zero unauthorized effects. Twelve benign seeds needed no continuation. The 36 archival seed proposals are reused, not counted as new inference.
- **60 journal commits** and **144 actual native Lean computations**, including incumbent-prefix checks and final restoration replays. These are computations, not 144 new model proposals or independent scientific samples.
- Fresh native replay verifies all 36 final journals and all 144 recorded Lean results, including their expected causal sequence. Python independently checks prompts, report hashes, receipt chains, raw text and mathematical states. No inference runs during replay.
- The native crash/race suite performs **205 main-host Lean computations**, **19 counted rejections**, three killed-process boundaries and one injected directory-sync error. Two separate real-Lean processes reach the same publication slot; exactly one wins. All 60 archived model submissions replay through new durable journals. Separate worker computations are not included in the main-host count.
- The suite reproduces a limitation: two copies of an unprotected directory can accept different valid continuations. A separately retained latest checkpoint detects truncation below its protected prefix; it does not supply a global trusted history.

The actual inference protocol and 32-file source snapshot were frozen before the first new request. This is an end-to-end engineering replication on the same tiny known corpus under a clean repair prompt. It is not a held-out generalization test, improved model judgment, persistent-system-compromise recovery or broad AI-safety result. No human participants, hosted inference API, new compute resource or production deployment was involved.

## Files

- `live/`: frozen protocol, all 24 request/response records, report, source-built checker manifest and 144-result ledger, every journal, and separately stored generation checkpoints. The checkpoint directory is not independently protected storage.
- `live-raw.tar.gz`: exact original run files, before readability-only trimming of console log line endings. Journal/protocol/response JSON bytes are preserved as originally written.
- `live-console.log`: runner progress and final independent Python verification.
- `test-and-live-source.tar.gz`, `source-state.json`: exact sources and SHA-256 inventory, captured before inference. Compiler SHA-256: `3e0d0d3d801675359f2d4cf9815bfdb417b20b92fdd9d48b3b14c95bbae28bbf`. Weight SHA-256: `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`.
- `native-integration.json`, `native-ledger.json`: actual native crash/race results and the 205 main-host authorization records. No affirmative verifier response was mocked.
- `native-journals.tar.gz`: valid test journals, including the preserved crash remnants, race winner, independent fork counterexample, Unicode case and archived-plan replays. Negative corruption controls are reproducible from the saved test source.
- `temporal/`, `temporal-checkpoint.json`: actual denied repair, inspection and permitted repair across a newly built checker process. Independent Python negative controls use these genuine saved receipts.
- `native-live-replay.json`: fresh native computation of the live journals and ledger, with zero new inference calls.
- `summary.json`: counts and explicit trust limits. All 21 existing theorem statements and their axiom dependencies are unchanged. No new kernel theorem proves storage behavior.

## Reproduce

From `chaos-theory/` with the existing dependencies and qualified Linux Lean toolchain:

```sh
source ../scripts/activate_lean_428.sh
npm test
python3 -m unittest discover -s scripts -p 'test_*replay.py' -v
npm run test:journal
python3 scripts/local_model_recovery.py --verify evidence/durable-recovery-v1/live
npx --no-install tsx scripts/replay-durable-model-evidence.ts
```

The source fingerprint deliberately rejects a journal under changed controller/codec sources. A future integration requires a reviewed migration and full replay, preserving the old archive. Logs and hashes are unsigned; a hostile host can fabricate an experiment. Atomic hard links and synchronization rely on the filesystem. Process-crash tests do not establish power-loss durability, immutable storage, origin authentication or externally controlled verification.

[Architecture, runnable local example and recovery procedure](../../docs/DURABLE_RECOVERY.md).
