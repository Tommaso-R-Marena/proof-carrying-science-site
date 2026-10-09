# PCS Semantic Gauntlet v1 — bounded research benchmark and playable Arena

**Status: source-implemented and locally tested; not a Lean-verification release, trained model, production deployment, or public blind evaluation.**

## Purpose
Evaluate whether an untrusted semantic translator can identify concrete finite countermodels and avoid unsupported equivalence claims. The benchmark requires an explicit Boolean interpretation of each predicate/relation for COUNTERMODEL predictions, and checks that witness rather than trusting model output. EQUIVALENT_WITHIN_BOUND is correct only if exhaustive enumeration finds no witness within the declared finite bound. That is not a universal first-order theorem.

## Delivered
- 60 deterministic challenges, 20 formula-structure families, three lexical variants per family.
- Family-disjoint development and evaluation partitions with 27 public evaluation tasks. **Public source is inspectable, so this is not a blind benchmark.**
- Closed typed first-order formulas in one agent sort: unary predicates, binary relations, equality, negation, conjunction, disjunction, implication, typed universal/existential quantification and binding.
- Complete finite-world enumeration: up to three agents in unary challenges; up to two in relational challenges.
- Sound bounded countermodel verification and minimum-domain search.
- Accepted prediction decisions: ABSTAIN, EQUIVALENT_WITHIN_BOUND, COUNTERMODEL with exact world. All tasks must be submitted exactly once.
- Metrics: coverage, attempted and total accuracy, false-equivalence count, valid countermodel rate, minimal-domain witness rate, split/family/skill context.
- Baselines: all-abstain, all-equivalent, syntactic identity and finite oracle. Finite oracle is the source of the ground-truth labels, not an independently trained model.
- Independent exhaustive truth-table tests for all cases and all supported worlds.
- Browser game with interactive predicate/relation editing, local feedback, hints and private JSON trajectory export, with **no automatic upload**.

## Commands

From the website repository root:

    npm run test:semantic-gauntlet
    node scripts/semantic_gauntlet_benchmark.mjs generate /tmp/pcs-gauntlet-tasks.json
    node scripts/semantic_gauntlet_benchmark.mjs prediction-template /tmp/pcs-gauntlet-predictions.json
    node scripts/semantic_gauntlet_benchmark.mjs baselines /tmp/pcs-gauntlet-baselines.json
    node scripts/semantic_gauntlet_benchmark.mjs evaluate /tmp/pcs-gauntlet-tasks.json /tmp/pcs-gauntlet-predictions.json /tmp/pcs-gauntlet-report.json

Predictions may be JSON arrays or JSONL objects, with exactly id, decision and world fields for every task. The task-set content digest for this v1 source is:
c67a6cdf9bfaad68a7a2743a5162f60eaf4f438b6bfce3c9453c166e875fd810

## Trust, data and privacy boundaries
- A validated countermodel establishes a genuine difference in the finite interpreted world, not that arbitrary English had that meaning.
- No finite search result proves unrestricted first-order equivalence.
- There is no Lean execution, proof certificate, external empirical claim, or PCS scientific authority on this page.
- These are machine-generated tasks, not independently authenticated human trajectories, and no participant data is automatically collected.
- The public evaluation families are not secret, so scores should not be reported as independent unseen research generalization.
- A task JSON hash is not a signing receipt; task or checker revisions require versioning and review.
- The full website CI, real browser/device tests and deployment approval remain separate gates.

## Next integration
After Aristotle v2, formalize a revision-pinned cross-language semantics mapping from the browser finite interpreter to certified Lean Semantic IR, independently rerun golden vectors and connect to authenticated verifier receipts. Until then, keep all labels in FINITE_MODEL_ONLY scope.
