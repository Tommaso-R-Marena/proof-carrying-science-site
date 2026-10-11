# PCS authored arithmetic learning demonstration

This is one new operational demonstration in the supported mathematical grammar, not a benchmark or a claimed discovery. Source revision: 3cfc1fff3bf0c722f968e50cf2cb874fbe44d838. A manually authored expected typed interpretation matches the generated IR; quantifiers are natural numbers and the only premise is a = b. General English intent fidelity is not proved.

The selected frozen graph policy and the symbolic baseline both prove the original statement through real Lean states. Model: 50 candidate expansions; symbolic: 51. Their total pipeline times are not evidence of a speed or solve-rate advantage. The learned proof has seven typed actions and only the allowed standard axiom propext. Independent intake replays the exact theorem and rejects corpus/holdout alpha duplicates. Four supervised epochs fit seven checked transitions, including trainable message parameters. This is behavioral cloning, not new RL training.

The 10419-parameter experimental next checkpoint has SHA256 f5f5501ca050e6c4c4e904f2dabe4c6a8c0bd0520ff1e9cc83e6db193f5c9e4a. A separate fresh execution reproduces the same checkpoint bytes. Production registry and model are unchanged. No held-out improvement is evaluated or claimed. No human trajectory, public proof job, GPU or paid service was used. Pipeline/comparison/replay/fitting wall times: 14.4625 seconds first execution, 12.2330 seconds reproduction; these exclude Python/framework import and environment setup.

Artifacts contain the exact protocol, statement, real goal states and failed attempts, proof receipt, symbolic baseline, independently replayed eligible intake, updated checkpoint and source script. Source and data are authored Apache-2.0; no evaluation solutions are consumed for fitting.

## Reproduce

In the PCS core checkout at the exact source revision above, install its hash-pinned Python/prover dependencies and select official Lean 4.28.0. From the core repository root run the included script with a NEW output directory:

python /path/to/run_fresh_arithmetic_demo.py --models "$PWD/research/lean-learning-v2" --output NEW_ARITHMETIC_RUN

The script freezes the same protocol before solving, compares the typed meaning independently, performs both searches, independently rechecks intake, updates real weights and validates the saved checkpoint digest. Output directories are never overwritten. Reproduction must run from the exact source revision because provenance is part of checkpoint metadata.

The standalone proof can additionally be checked with:

lean /path/to/CheckedProof.lean

Parsing, elaboration, proof checking, controlled-language interpretation and scientific acceptance remain distinct. pcs_authority is false. A changed checkpoint does not demonstrate self-improvement.

## Downloads

[All trajectories, replay, source, protocol and experimental checkpoint](authored-arithmetic-learning-v1.tar.gz) · [archive checksum](authored-arithmetic-learning-v1.sha256) · [standalone checked proof](authored-arithmetic-proof.lean) · [actual run summary](authored-arithmetic-summary.json).

## Later independent diagnostics

A separate [action-coverage diagnostic](checked-action-coverage-REPORT.md) executes this feedback checkpoint on three additional problems. Parent, feedback and symbolic policies initially return unknown on all three. After repairing the shared receiver action layer, all three policies solve the development regressions. Those cases were inspected during repair, not treated as untouched evaluation. The feedback checkpoint is not promoted and no learned superiority is established. This later diagnostic does not change the original training snapshot, artifact bytes or checkpoint digest above.
