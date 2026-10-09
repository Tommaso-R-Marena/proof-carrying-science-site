# PCS Model Foundry: Learned Semantic Repair Policy v1

## Research question
Can a **genuinely trained** ranking policy prioritize candidate repairs to typed finite first-order formulas, lowering checker calls on separate semantic families, while a deterministic PCS checker independently determines the actual bounded result?

This is a research prototype **not** a universal translator, a proof-producing LLM, a Lean tactic learner, an AI-alignment result, or an attempt to authenticate human contributors.

## Architecture

1. `public/semantic-gauntlet-core.mjs`: registered source/candidate formulas and independent bounded finite-world interpreter.
2. `public/semantic-repair-core.mjs`: typed closed-formula validation, legal primitive edit enumeration, and exact finite model checking of each proposed edit. This existing module is unchanged by the Model Foundry feature.
3. `public/semantic-repair-policy.mjs`: **shared browser/Node feature extractor** mapping task/edits to a 384-dimensional hashed feature vector. It reads NO oracle result. The linear score is never an authority or proof.
4. `scripts/train_semantic_repair_policy.mjs`: deterministically generate checker-labeled candidate edits from training families only; fit weights via pairwise logistic ranking using fixed seeds and epochs; save the exact model artifact and training provenance. Node.js 22, no external ML dependencies.
5. `public/repair-policy-model-v1.json`: numerical trained weights and training metadata, stored as a reproducible public demonstration artifact.
6. `public/repair-model-lab.html`: interactive model suggestions, side-by-side original-order baseline, live JS finite recheck, locally downloadable experimental notebook (no upload or research donation).
7. Tests: deterministic exact retrain, train/evaluation family exclusions, poisoned/rehash model detection, adversarial report replay, CLI roundtrip, evaluation metrics, and non-authoritative browser status.

## Provenance

The 60 Gauntlet challenges are public, machine-authored. 18 training-family incorrect candidate statements yield 138 legal candidate-edit observations, of which 24 pass the exact bounded checker. Pairwise ranking constructs 384 positive-negative pairs, using no labels from the designated evaluation families. Numerical weights are learned, not hand-selected: 48 epochs, 384-dimensional hashed features, deterministic shuffling. These data are NOT consenting-human trajectories and not blinded external scientific observations. The test set is **public, source-derived and not independently blind**; families are disjoint, but compositional leakage and shared task templates remain possible.

## Reproducing

Run in a working copy of the website repository (Node 22 or later):

```bash
node scripts/train_semantic_repair_policy.mjs train /tmp/pcs-model.json
node scripts/train_semantic_repair_policy.mjs verify /tmp/pcs-model.json
node scripts/train_semantic_repair_policy.mjs evaluate /tmp/pcs-model.json /tmp/pcs-evaluation.json
node scripts/train_semantic_repair_policy.mjs propose /tmp/pcs-model.json implication-reversal-1 /tmp/pcs-proposal.json
node scripts/train_semantic_repair_policy.mjs recheck /tmp/pcs-model.json /tmp/pcs-proposal.json /tmp/pcs-recheck.json
npm run test:learned-repair
```

The CLI refuses overwrite (`wx`) of existing experiment files and re-runs exact deterministic training to verify model integrity. A SHA-256 digest is a content commitment, not a signature or proof of the validity of the training algorithm. Without independent source review, complete build/test provenance, and trust in the executable, the result remains experimental.

## Held-out evaluation (5 checker calls per incorrect candidate, fixed seed 31)

| Metric | Learned policy | Original edit order | Seeded random | Oracle ceiling (scans all candidate edits) |
|---|---:|---:|---:|---:|
| Distinct incorrect evaluation cases | 18 | 18 | 18 | 18 |
| One-edit-repairable cases | 9 | 9 | 9 | 9 |
| Repaired successfully | 9 | 9 | 7 | 9 |
| Total actual finite checker calls | 48 | 63 | 64 | 72 |

The model does not improve *coverage* over the original-order baseline. It uses 15 fewer checker calls (23.8% of baseline) while producing the same successes. The oracle ceiling may check more candidates than necessary and is not a viable learned baseline; it exists to bound one-edit repairability. The nine unresolved cases require richer edits/search and are not proof of impossibility. The sample is extremely small (18 incorrect evaluation cases derived from six semantic families), so **no statistical superiority, publication-level generalization or real-world gain is established**. The reported gain may be sensitive to task generation and edit grammar.

## Hard trust boundaries

- **Learned policy: untrusted.** It assigns numerical scores to source-defined edits. It does not validate equivalence, determine natural-language intent, or prove anything in Lean.
- **Checker: bounded.** Successful edits are checked over all enumerated finite models up to the task's declared bound, with the current JavaScript implementation. This is not universal logical equivalence.
- **Human data: none.** No real participants, labels or opt-in submissions were collected.
- **Evaluation: public.** Held-out only in the narrow sense of training/evaluation family separation.
- **Source and artifact hashes: provenance only.** They do not prove the JS runtime, browser, compiler or model source correct. Even a valid-looking result report can be forged; exact local replay is required.
- **Website: preview only.** No production D1 migration, Lean verifier, or deploy is performed by this PR.

## Priority upgrades

1. Incorporate genuinely independent, human-reviewed scientific/formalization tasks under source/license review and strict family/project holdouts.
2. Extend the repair action grammar to allow multi-step search without giving the model checker labels as features.
3. Add model-calibrated abstention and independent collection of real adult consented trajectories, separating self-attested provenance from cryptographic fact.
4. Only when Aristotle's formal contract is integrated: compare the bounded JS verifier's decisions against actual independent Lean 4 certificates and require genuine kernel evidence for high assurance.

**Claim to reviewers:** a reproducible, modest learned ranking policy for verifier-checked bounded repair search. Nothing stronger.
