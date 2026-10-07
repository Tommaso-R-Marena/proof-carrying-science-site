# ProofLab v2 — controlled, source-grounded planning research

## What ProofLab is

ProofLab is a Foldit-inspired **human planning experiment around real PCS Lean theorem targets**. It is not a theorem prover and a game win is not a Lean proof. The public benchmark is synchronized to PCS core revision `717c00ea6f362fe059267184273e1a733d59f0ce`.

The benchmark has 40 existing theorem targets from one PCS repository. Twenty-two targets from Binding, Workflow and PKPDCheck are public training missions. Eight Checkers targets are private validation cases, and ten PackageProofs/Frontier targets are private evaluation cases. This is a module-level split inside one project, so cross-project generalization remains untested.

Public missions expose source identifiers, file/line/blob provenance, non-verbatim summaries, cited-theorem metadata and a bounded educational investigation graph. They do not expose private proof bodies or withheld challenge graphs.

## The v2 game loop

ProofLab v2 no longer treats the whole dependency graph as an unrestricted card dump. At every step, the deterministic game engine constructs a **controlled candidate set of two to four plausible next investigations**. The set contains currently feasible work plus near-frontier choices that may be premature. Candidate order is deterministically shuffled so screen position is not the answer.

The player chooses one candidate and records a bounded reason/confidence tag. The server independently reconstructs the exact candidate set that should have appeared, the feasible subset under the fixed graph, the selected action and any missing prerequisite. Opening the dependency X-ray or coach marks later choices as **assisted**, so blind planning examples are not silently mixed with hint-assisted examples.

The graph remains available as an explanatory X-ray, but it is not an alternate action surface that bypasses the controlled choice. Unknown or withheld case IDs, malformed actions, oversized sessions and choices outside the deterministic candidate set fail closed.

**No Lean kernel runs inside the game.** A completed mission means only that the player navigated the source-indexed educational investigation graph.

## Optional adult research collection

Anyone can play locally. A research session is stored only after a signed-in, verified-email user explicitly confirms age 18+, explicitly consents to training use, and clicks the separate Donate control.

The Worker independently recomputes the complete v2 replay before storing it. Current donations use `pcs-prooflab-plan-v2`; owner exports filter to that version and the current source revision, preventing older schemas or stale benchmark pins from silently entering a v2 dataset. The database keeps the account link privately for rate limiting, deduplication and erasure; Owner-only export excludes account identifiers, email, IP address and precise timestamps.

## What one training decision contains

The deidentified preparation step emits a listwise planning example with:

- the exact controlled `choice_set` shown at that step;
- the player's `selected_action` and its position;
- every `feasible_action_in_set` independently derived from the graph;
- whether the selected action was feasible;
- missing prerequisites when it was premature;
- the action type, stated reason and confidence;
- whether an explicit hint had already been exposed;
- the source-pinned case/module and prior completed work.

This is stronger than an unconstrained click log because the alternatives are explicit and replayable. It also does **not** assume the human choice is uniquely optimal: multiple candidates may be feasible at the same time.

`node scripts/prepare_prooflab_dataset.mjs OWNER_EXPORT.json TRAINING_ROWS.json` independently replays every stored session again, checks the controlled candidate/feasible sets, rejects label drift or unexpected personal fields, and writes `pcs-prooflab-obligation-choice-dataset-v2`.

## Intended model objectives

The first useful objectives are bounded and measurable: rank or choose the next investigation among controlled alternatives; identify prerequisite-feasible alternatives; predict why a premature choice will be blocked; and compare blind with hint-assisted planning. Human-selected adversarial hypotheses remain hypotheses until independently tested.

A deterministic graph oracle can solve these public prerequisite relations, so a learned model must be compared against that oracle and simple heuristics. Meaningful research claims require private held-out evaluation and, later, genuinely independent projects with real proof-state/counterexample tasks.

ProofLab alone does not demonstrate Lean tactic synthesis, AI alignment, or scientific discovery. Its value is a clean, source-grounded human planning dataset and a game interface for repeatedly collecting bounded decision/search behavior.

## Release gates

- PCS core owns the source-pinned benchmark and private holdouts.
- Site `npm run test:prooflab` checks controlled candidate sets, blocked choices, listwise data preparation, Worker auth/consent and Owner-only export.
- Site `npm run ci:zero-minutes` includes syntax, static security, the complete game/test suite and Wrangler dry-run.
- D1 migration `0020_prooflab_adult_optin_research.sql` remains the storage schema; v2 is an application/replay schema upgrade, not a destructive database migration.
- Production release requires a green exact-head Cloudflare build and normal mobile/desktop smoke testing.

Next research phase: add permission-cleared independent projects, real proof-state or falsification tasks, and preregister model-only versus model-plus-human ablations under equal verification budgets.
