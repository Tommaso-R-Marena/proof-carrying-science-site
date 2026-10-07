# ProofLab v1 — source-grounded benchmark and interactive theorem investigation

## What was built (2026-10-06)

ProofLab is a Foldit-inspired **human proof-planning and critique experiment**, not a new theorem prover. The benchmark's 40 targets are actual pre-existing Lean theorem declarations from PCS core pinned at `cff0b67595abd4862ab0c156b157f262b169eca5`. Private core index files retain source statements, source paths, exact line numbers, Git blob hashes and mentions of previously indexed lemmas in the stored proof bodies. Separate private core source-verification tests check these references. No new mathematical claim is established by playing.

Of those targets, **22** in Binding, Workflow and PKPDCheck modules are public pedagogical **training** missions. **Eight** checker targets are reserved for **validation**, and **ten** package/frontier targets are reserved for **evaluation**. Their private theorem statements, pedagogical graphs and source identifiers are intentionally omitted from public game modules. This is a **module-level split within ONE PCS repository**, not an independent-project test. The 18 held-out targets must remain private until their evaluation protocol is exhausted.

The public app contains theorem IDs, human-readable non-verbatim summaries, source file SHA and line anchors, but **no private proof bodies**. Source-cited lemma nodes correspond to literal earlier indexed theorem-name references in stored proofs. The other plan nodes (scope, premises, source check, proof review, challenge, limits, independent Lean review) are **educational research-workflow steps** rather than claimed minimal mathematical dependencies.

## Play and independent grading

The public page `prooflab.html` has three campaigns, an interactive graph, movable cards with click and drag/drop support, a dependency X-ray, coaching, a research notebook for accepted and blocked moves, source citations, adversarial hypothesis choices, a replay theater, a daily case, personal-best XP and shareable links.

The shared pure module `public/prooflab-core.mjs` is imported **unchanged** into both the browser and Worker. It independently reconstructs every eligible action from fixed prerequisites, limits each case to 26 bounded moves, allows multiple valid next moves, labels blocked attempts, and rejects unknown/withheld case IDs or forged claimed results.

**A completed game is NEVER a Lean proof**: actual source proof-checking requires building the pinned private PCS repo separately with its Lean toolchain. The PCS core authority's P0 unknown-checker hardening remains its own mandatory release gate. A game success cannot close that issue.

## Optional 18+ research collection

Everyone may play without creating an account. Local XP and case best scores are stored in that browser's `localStorage` where available, with a user-visible clear button. The Worker receives no player trajectory except after:

1. Signed-in PCS user with verified email.
2. Explicit self-attestation of age 18+.
3. Separate informed-consent checkbox.
4. A distinct click to donate an actual bounded case.

The server independently recomputes the educational graph result. It stores at most fifteen sessions per adult account per rolling day, with per-IP rate limiting and a stable digest for deduplication. D1 migration `0020_prooflab_adult_optin_research.sql` is additive, has a strict schema and account-delete cascade. Participants can explicitly delete active linked data; backups, exports and trained models may need separate handling.

The Owner-only paginated dataset export omits direct account identifiers, IP and timestamps. It returns source-anchored decision records, self-reported reason and confidence, bounded hints, independently checked prerequisite labels, and a **human-suggested but unverified** attack category. No raw free text, mouse telemetry, minors' game records or implied opt-in.

## Data for models, correctly scoped

`node scripts/prepare_prooflab_dataset.mjs OWNER_EXPORT.json TRAINING_ROWS.json` replays every exported session again, refuses forged outcome labels and unexpected personal fields, and produces next-step training examples.

- **Objective A:** Predict feasible next proof-review step(s) under known dependencies. Ground truth is a **multilabel set**, not the unique next move the human happened to choose.
- **Objective B:** Learn human selection/search preferences among several valid paths, carefully distinguished from ground truth and filtered for hint exposure.
- **Objective C:** Predict which obligations will be blocked and why; avoid hallucinating a completed proof.
- **Objective D:** Explore human-selected counterexample hypotheses. These **must be independently tested** before being treated as adversarial positives.

A deterministic graph oracle already solves all public educational dependencies. Thus the experiment must compare learned models with that oracle, graph heuristics and non-human baselines, and ultimately measure performance on **privately held-out problems and independent real research projects**. A model winning at this game alone does not demonstrate Lean proof search, real-world alignment, or scientific discovery. This code does not train a production model automatically.

## Quality and privacy release gates

- Private core benchmark validator checks SHA-1 Git blobs, exact theorem lines/statements, lexical lemma mentions and private holdout isolation. Its test suite must run on the core source.
- Website `npm run test:prooflab` checks all 22 cases, valid/blocked plans, no test-case leak, independent data replay, worker auth/consent and owner-only export.
- Site `npm run ci:zero-minutes` includes syntax, static security, all prior game suites, and Wrangler dry-run.
- Production must install D1 migration 0020 **before** public release of its API; site PR head must have an exact-commit green Cloudflare build.
- Browser QA should test 375px mobile and desktop navigation, drag/drop and keyboard alternative, graph reveal, partial review, and opt-in gate **without submitting a real production donation**.

Next phase: obtain permission-cleared, genuinely independent projects/labs; add actual Lean tactic-state or counterexample reproduction tasks; and preregister model-no-human vs model-with-human gameplay ablations under equal verification budgets.
