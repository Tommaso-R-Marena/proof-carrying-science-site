# PCS Semantic Evaluation Firewall v1

**Status:** Executable evaluation infrastructure; **not** a learned-model success claim, blind evaluation, Lean kernel proof, or deployable-world safety certificate. The project is stacked on the Semantic Gauntlet website branch PR #84.

## Purpose

The public Semantic Gauntlet tests 60 logic pairs from 20 semantic families. It is valuable for teaching and unit tests, but memorization, exposed templates and metamorphic inconsistency make a score alone unsuitable as research evidence. This firewall constructs **240 derived cases** by applying four transformations (identity, bijective predicate renaming, capture-free α-renaming and source/candidate reversal) to the original 60. The resulting set contains **108 evaluation cases** from held-out *operator families*, not genuinely unseen private problems. All task sources and algorithms are public.

The underlying logic is first-order Boolean formulas with typed predicates over finite nonempty domains of size at most three. Relation tasks use a bound of two. A verified countermodel is genuine evidence of finite disagreement, but **failure to find one cannot establish unrestricted logical equivalence**.

## Research workstream

1. **Derive the exact case pack** from checked-in `public/semantic-gauntlet-core.mjs`. The case pack includes the original `TASKS_SHA256`, a 64-character SHA-256 of all derived formulas and transform metadata, exact SHA-256s for the evaluator and firewall source files, and all input ASTs. Deliberately changing a source formula or transformation requires a versioned benchmark review. Every case belongs to its original development or evaluation family.
2. **Submit all predictions** as a JSON array. Exactly one `{id,decision,world}` is required per case. Optional `confidence` must be a finite number between 0 and 1 for non-abstention cases and means *the model's subjective probability its chosen answer is correct*. Supported decisions are `ABSTAIN`, `COUNTERMODEL` (with a concrete finite model), and `EQUIVALENT_WITHIN_BOUND` (not global equivalence).
3. **Replay and score** every candidate using the existing bounded evaluator and independently reconstructed task definitions, not the model's confidence or a browser-provided score. Malformed structure, duplicate task IDs, unexpected fields, malformed worlds and invalid confidence all reject the entire submission.
4. **Measure robustness:** coverage, accuracy on attempts, overall accuracy, number of dangerously false equivalence declarations, independently checked counterexample witnesses, minimal-domain witnesses, five-bin calibration ECE, Brier score, and decision consistency across the four meaning-preserving variants. Consistency of the raw decision is a *behavioral* property; consistently wrong predictions do not become correct.
5. **Compare runs** with a paired bootstrap over the nine exposed evaluation families (1,000 deterministic resamples by default), rather than treating three variations of the same semantic family as independent observations. Comparisons re-evaluate raw submitted predictions and reject altered metric reports. Confidence intervals are descriptive for the fixed public distribution, **not** claims of generalization.
6. **Inspect locally** using `public/evaluation-firewall.html`: reports loaded through browser file inputs are not transmitted by this feature, and all values are rendered via safe DOM text nodes. This page does **not** authenticate scores; run the CLI for verification.

## CLI

From the PCS website repository with Node 22:

```bash
node scripts/semantic_evaluation_firewall.mjs pack pack.json
node scripts/semantic_evaluation_firewall.mjs baseline everything_equivalent naive.json
node scripts/semantic_evaluation_firewall.mjs evaluate pack.json naive.json naive-report.json
node scripts/semantic_evaluation_firewall.mjs baseline finite_oracle oracle.json
node scripts/semantic_evaluation_firewall.mjs evaluate pack.json oracle.json oracle-report.json
node scripts/semantic_evaluation_firewall.mjs compare oracle-report.json naive-report.json comparison.json
npm run test:evaluation-firewall
```

The CLI creates output files exclusively (`wx`) and refuses to overwrite existing results. Read input limits are 2 MB. JSON duplicate keys (including Unicode-escaped repeats) and dangerous object-key names are rejected; all predictions are strictly typed. The package contains no remote execution or network calls.

To evaluate a model, implement a separate **untrusted** model runner that reads `pack.json` and writes predictions with the above exact schema. Do not execute arbitrary untrusted model code in a Cloudflare Worker or the production web server; run it in an isolated environment subject to model owner consent and resource limits.

## Baseline interpretation

- The `everything_equivalent` baseline is intentionally naïve and produces 33.3% accuracy on the evaluation partition.
- The `finite_oracle` baseline gets 100% *by construction*, as it supplies the same bounded evaluator's labels and witnesses. It is not a learned system or independent verification proof.
- An independently implemented evaluator exhaustively cross-checks every finite world for all 240 cases in the test suite, protecting against accidental shared-logic bugs, but this does not prove the JavaScript evaluator in Lean.
- The public benchmark's held-out semantic families share syntax, templates, implementation, and task provenance. It is not sufficient to demonstrate novel reasoning or out-of-distribution model generalization.

## Authority and privacy

The scorer has **no PCS scientific authority**. It provides reproducible evidence about finite semantic game tasks only. No human participant records are needed to run it, and it creates no additional user-data collection. Output files can include model-predicted worlds and should be reviewed for model/provider intellectual-property requirements before publication. The local report viewer does not transmit files, but the hosting website could have separate telemetry; do not include confidential information without checking the website's actual deployment policy.

## Deployment blockers

This code is staged on a draft PR. Exact-head full website tests, browser accessibility testing, self-hosted CI configuration, any promotion to production, independent scientific benchmark review, and external model evaluations are **not yet established**. Running this evaluation is not a substitute for the pending Aristotle/PCS actual Lean implementation.
