# Proof Quest synthetic trajectory preparation

PCS Proof Quest contains a beginner-friendly graph-ordering game, not actual Lean 4 proof terms. Participants may play anonymously and locally. **Only consenting adult users** with verified PCS account emails can explicitly donate a puzzle ordering. The Owner may export up to 500 rows of deidentified records from Admin → Arena. Exports omit account identity, names, emails and IP data, and timestamps are rounded to the day.

## Prepare exploratory offline learning data

Do **not** commit actual participant exports to GitHub or share without checking consent, applicable institutional review, and retention obligations. Work in a private local directory:

```bash
node scripts/prepare_proof_quest_dataset.mjs OWNER_EXPORT.json DEIDENTIFIED_TRAJECTORIES.json
node --test tests/proof-quest-dataset.test.mjs
```

The converter uses the actual versioned public puzzle definitions to independently recompute every server-reported score, constraint result, and step order. It rejects unrecognized inputs, added identity fields, wrong puzzle versions, fabricated PASS scores and bad permutations. Outputs contain the prerequisite state, proposed next action, immediate synthetic edge-consistency reward (+1 if prerequisites were placed, −1 otherwise), terminal marker and held-out puzzle grouping.

Three puzzle families (`archive`, `optimize`, `invalidation`) are held out entirely from training so identical fixed puzzles do not leak into evaluation. The training output drops even the rounded submission day. It is a **candidate dataset for experiments in planning heuristics or offline imitation/RL**, not a claim of trained or aligned AI, Lean tactic search, theorem validity or general scientific correctness.

Before ever using for real Lean proof search:
- obtain appropriate authorization/ethical review if required for the intended research use;
- defend against spam, duplicated human responses, skewed experience and adversarial labels;
- require an independent held-out benchmark of actual Lean 4 goals, exact kernel-verified completed proofs, and a reproducible train/test specification;
- record original puzzle source version and source SHA, label/rule construction, consent terms, dataset access and withdrawals;
- document that deleting stored attempts cannot revoke historic exported training files or already-trained model weights; honor feasible subsequent withdrawal/retention policies transparently.

No training is run by this change. No collected dataset or private constituent research is committed to GitHub.
