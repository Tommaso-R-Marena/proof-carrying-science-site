# PCS learned multi-step repair planning v1

**State:** bounded research prototype. No Lean proof, no production claim, no real human training data, no independent unseen benchmark.

## The advance

The v1 Model Foundry learned pairwise edit ranking from verified one-step edits in **18 training-family tasks** (138 candidates; 24 positive cases; 384 ranking pairs). Its 384-dimensional numerical weights remain **unchanged**. Here we extend the actual application into a two-step repair planner, and verify every attempted candidate with the independent finite-model checker.

Modules:
- `public/semantic-multistep-core.mjs`: typed candidate proposals, cycle/duplicate handling, strict budgets, BFS and best-first modes, checker evidence, exact deterministic replay. A ranked candidate is NEVER a proof.
- `scripts/benchmark_multistep_repair.mjs`: generator of 18 source-derived, genuinely two-edit finite challenge cases from six public evaluation families; fixed equivalent resource budgets; independent rechecks; source-copy disclosure; report tamper detection.
- `public/multistep-challenges-v1.json`: immutable public browser exercises. NOT a private generalization holdout.
- `public/semantic-multistep-lab.{html,css,js}`: local playable experiment and export, no automatic user upload.
- `tests/multistep-{planner,cli,ui}.test.mjs`: training-family contamination checks, true 2-edit challenge generation, invalid claims rejection, replay integrity, UI non-injection, CLI negative attacks.

The algorithms are **bounded**. At most two edits. Every node checked is a closed and typed formula in the same registered symbol signature. Every successfully proposed repair must satisfy the exact bounded finite-model predicate `finiteRepairCheck` with the source interpretation. The search does not prove that a missing solution is impossible. It does not necessarily return the shortest number of edits when using priority search or beam pruning.

## Reproduction

Requires Node 22. No internet, GPU or production credentials needed.

```bash
node --test tests/multistep-planner.test.mjs tests/multistep-cli.test.mjs tests/multistep-ui.test.mjs
node scripts/benchmark_multistep_repair.mjs challenges public/repair-policy-model-v1.json /tmp/pcs-two-edit-cases.json
node scripts/benchmark_multistep_repair.mjs evaluate public/repair-policy-model-v1.json /tmp/pcs-two-edit-eval.json
node scripts/benchmark_multistep_repair.mjs verify public/repair-policy-model-v1.json /tmp/pcs-two-edit-eval.json
npm run test:multistep-repair
```

Output paths must not already exist. `evaluate` reruns deterministic model training to validate the exact weights and source commitments before scoring, and `verify` recomputes the entire report rather than trusting its saved metrics.

## Measured public finite-logic results

**Task construction:** six deliberately *post-selected* evaluation semantic operator families, three symbol-renamed variants per family, giving 18 public two-edit problems. Every task begins at a candidate not equivalent within the finite bound; every valid one-step edit is independently checked and fails, proving that **within the fixed edit grammar** these require two edits. Successful plans are checked by the finite evaluator. The challenge recipes were selected after inspecting how the finite checker and policies perform, so this is exploratory evaluation with selection bias, not a statistically valid independent test. This is not a proof about arbitrary formulas, proof search or unbounded mathematics.

**Resource budget:** 55 full finite-checker calls including the original initial check, 16 pending-state beam, at most 120 proposed edits per expanded formula, at most two edits, seed 23.

| Search policy | Successful finite repairs | Full checker calls |
|---|---:|---:|
| Learned one-step ranker in best-first search | 18/18 | 102 |
| FIFO / original enumerator | 18/18 | 240 |
| Seeded random | 15/18 | 387 |
| Syntactic source-distance priority | 18/18 | 54 |
| Learned plus syntactic heuristic | 18/18 | 54 |
| Literal source copy (trivial oracle upper bound) | 18/18 | 36 |

**Negative result documented:** the original depth-ordered learned search used 336 checker calls, *worse than* the simple original order at 240. Best-first search resolves that inefficiency (102 calls), but most of the improvement is due to search scheduling, not more learning. Syntactic source distance is faster (54 calls), and copying the known structured source is faster still. These findings prevent unsubstantiated claims of frontier-level generalization.

Different symbol-renamed variants of one family are correlated, so the effective number of independent families is only six. The test set is **public** and a single designed DSL, without Lean-generated proof obligations or new empirical science claims. We did not train a new model on evaluation labels and did not use any participant data.

## Trust and security

- Failed/accepted labels are recomputed only by the finite checker; ranking scores never certify results.
- Strict CLI JSON and exact schemas; reject duplicate JSON keys, unknown task IDs, invalid typed formulas, incorrect request budgets, forged results, unknown models, and stale/recomputed report mismatches.
- This prototype does not issue or validate signature receipts; no signature authority is claimed.
- The model's SHA-256 digest is provenance of bytes, **not** evidence of machine correctness. The CLI re-trains against the training-family source and compares the exact weights before evaluation.
- Browser demo is deliberately a read-only, locally running research illustration. It does not issue formal Lean receipts or upload user trajectories.
- Full production website CI, Cloudflare deployment, and exact browser/mobile smoke have to pass separately. Do not merge or deploy merely because isolated Node tests pass.

## Next research move

Use **real, independently sourced Lean theorem states** to create repair tasks in which exact source copying is not the answer. Then require genuine Lean-kernel validated repairs and report performance on held-out projects, with contamination controls, oracle leakage accounting, and independent reviewer reproduction. Until then, this is an instrumented learning-and-search pilot, not a general scientific formalizer.
