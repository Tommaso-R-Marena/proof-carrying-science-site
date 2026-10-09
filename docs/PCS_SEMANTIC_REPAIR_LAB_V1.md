# PCS Semantic Repair Laboratory v1 — finite semantic search and repair

**Status:** Implemented locally and proposed as an additive draft website PR, NOT approved for production deployment. This is a separate bounded JavaScript research capability, **not** Aristotle's Lean v2 translation proof and not an empirical AI-safety guarantee.

## Primary result

PCS now supports a replayable *semantic countermodel-to-repair loop*: a selected source formula from the 60-case PCS Gauntlet, a grounded typed candidate formula, deterministic enumeration of all supported finite interpretations for 1–3 nonempty agents (binary relations capped at 2), and a bounded search of one- or two-step candidate AST edits. A candidate is reported as a **bounded agreement** if and only if it agrees with the fixed source in every enumerated model within the task's declared bound. A concrete countermodel is a valid witness to non-equivalence. The absence of a finite countermodel is **not** universal equivalence; a missing repair is **not** an impossibility proof. A failed or interrupted candidate budget is separately marked.

### Available capabilities

- `public/semantic-repair-core.mjs`: exact typed formula validation, grounding in the declared task symbol signature, binder-scoped variable checks, 40-node/14-level AST caps, deterministic one-step typed edits, exhaustive finite-model comparison, minimal domain counterexamples, bounded breadth-first repairs, replay of complete results.
- `scripts/semantic_repair_lab.mjs`: exact-source SHA-256 commitments for both the existing Gauntlet finite evaluator and repair engine, strict duplicate-key-rejecting JSON decoder (reused from Evaluation Firewall), non-overwriting private JSON outputs, task report replay, benchmark sweep.
- `public/semantic-repair-lab.html`, `.js`, `.css`: playable accessible edit palette, local-only progress and event notebook, one-click counterexample check, bounded suggestions, private JSON export, mobile-responsive UI. No new API endpoint or database table; no gameplay telemetry or research upload without explicit future consent governance.
- `tests/semantic-repair-core.test.mjs`: adversarial formal AST cases, deterministic mutations, independently implemented second finite evaluator for **all 60 source tasks and every supported finite interpretation**, repair verification and forged-report rejection.
- `tests/semantic-repair-cli.test.mjs`: exact-source replay and command-line failure modes; no overwriting existing reports; strict JSON duplicate/replay protection.
- `tests/semantic-repair-ui.test.mjs`: static accessibility/scope/navigation/contracts. A passing static test is **not** a real browser or accessibility audit.

## Executable usage

```bash
# Generate a fixed task request in the local working directory
node scripts/semantic_repair_lab.mjs request implication-reversal-1 request.json

# Independently enumerate a minimal finite countermodel and search typed AST repairs
node scripts/semantic_repair_lab.mjs analyze request.json repaired.json

# Recompute the result using exact expected source hash and full deterministic replay
node scripts/semantic_repair_lab.mjs recheck repaired.json rechecked.json

# Run a fixed, PUBLIC, non-blind 60-case bounded repair baseline
node scripts/semantic_repair_lab.mjs sweep sweep.json

# Tests; the website package wires them into its CI commands
node --test tests/semantic-repair-core.test.mjs tests/semantic-repair-cli.test.mjs tests/semantic-repair-ui.test.mjs
```

The JSON input contract has exact keys: `format`, `task_id`, `candidate`, `max_edits`, `max_candidates`. Search accepts at most 2 edits and 600 evaluated unique candidates. Tasks and source formulas are fixed by the Gauntlet engine, not supplied by untrusted users. Each candidate mutation preserves the declared symbol registry and rejects malformed or shadowing binders; no solver-level authority is given to the original human claim or the candidate expression.

The finite-model checker uses the existing Gauntlet evaluator; a separate test interpreter independently cross-checks its truth tables. Tests are evidence of implementation agreement on the specified finite domains. A soundness proof of the interpreter in Lean is **not** present.

## Explicit limitations and future use

- Only unary relations, certain binary relations, equality, negation, conjunction, disjunction, implication and typed quantifiers are supported. The task universe is exactly the 60 public Gauntlet formulas. No unrestricted English, Lean elaboration, arbitrary user-defined theorem, opaque definition, or trustworthy remote compiler execution.
- The edit grammar is deliberately incomplete (no unrestricted binder-renaming algorithm, rewrite theorem search, or arbitrary theorem discovery). A two-edit repair found by the BFS is the first minimal depth found under its enumerated grammar and budget, but *not* necessarily the only or minimal mathematical reformulation. Exhaustiveness flags do not make the logic complete.
- Browser games can be scripted and do not prove a human played. Locally exported trails have no independent researcher authorization or identity. They are never mixed into consented research-data exports unless a later independently replayed, opt-in ingestion and privacy protocol is implemented.
- A finite agreement is weaker than even Aristotle Semantic Translation v1's kernel-level all-model semantic-preservation theorem. **Do not promote this JavaScript output to PCS authority.** When a kernel-checked v2 countermodel/certificate system becomes available, compare its literal definitions and witnesses to this implementation with exact-source cross-checks; do not claim the APIs are interchangeable before proven.
- Task-set splits are public and subject to memorization and contamination; no trained model result is asserted.

## Publication / release gate

Before merging: run the complete website suite on exact SHA, check package registry/test scripts, perform desktop/mobile browser and keyboard/screen-reader tests, verify source hash/PR review, and confirm D1/Cloudflare release posture. Existing stacked CI has been skipped pending trusted runner configuration; a skipped check is not a green check. This PR does not deploy and does not change the DB.
