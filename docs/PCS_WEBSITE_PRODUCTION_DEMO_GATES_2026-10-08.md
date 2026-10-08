# PCS website and Arena — production/demo acceptance matrix (2026-10-08)

**Status: STAGED / NOT PRODUCTION-CLEARED.** This ledger distinguishes an implemented or locally checked feature from a deployed, authenticated, independently verified feature. A public browser's green indicator must never imply an actual Lean kernel proof if one did not occur.

| Surface | Existing or new checker | Trust statement | Open release gates |
| --- | --- | --- | --- |
| Countermodel Lab | **Actual deterministic finite first-order semantics** over nonempty sets of 1–3 agents, replayed independently by the Worker | A constructed world refutes equivalence of the two displayed formal expressions under this limited interpretation. This is not a Lean-verifier receipt. | D1 migration 0024, whole Worker tests, local/site smoke, external Lean 4.28 source compilation, CI green |
| Safety Forge | Deterministic finite-state policy/evidence replay | A synthetic trace/policy is checked against a declared finite-state objective; no guarantee about a deployed agent. | Live independent reviewer recheck, held-out scenarios, model-use governance |
| ProofLab | Real PCS source-indexed theorem/dependency data and deterministic graph planning | Genuine code provenance and structural candidate feasibility; not a live Lean tactic proof. | Exact-source SHA validation, independent replay of selected examples, gold proof cross-check |
| Meaning Forge | Explicit bounded semantic grammar, deterministic structural round trip | Checks a chosen structured syntax, not human intention or Lean elaboration. | Integrate Aristotle/PCS Semantic Translation Contract v1 and independent verifier refinement |
| Proof Quest | Deterministic educational prerequisite DAG ordering | Not Lean elaboration, kernel checking or mathematical derivation. | Review training utility, reduce synthetic template memorization |
| Contributor/task pipeline | Repository PR and guarded CI, existing PCS executable verifier | Status checks and signed approvals are evidence only when they actually executed the correct source revision. | Real full CI on PR integration SHA, permissions review, fail-closed negative check, core publication security |
| Login/admin/roles | Worker server-side authorization and D1 | Client UI never grants level or production authority. | Independently validate auth/CSRF, audit retention, privacy and DB restore paths before broad public recruitment |

## New Countermodel Lab gate evidence

- New source, game UI, server endpoints, migration, offline dataset builder and tests staged in draft site PR #82.
- Locally run: 26/26 finite-game and dataset tests; D1 migration successfully created its table in in-memory SQLite; Node static syntax passed; browser visual smoke used a temporary local base stylesheet and found no overflow or JavaScript errors on desktop/mobile. All seven game missions were then solved through actual browser interactions and generated `.lean` downloads successfully.
- The actual authenticated Worker integration tests are authored and in mandatory `npm run test:countermodel`, but **not yet reported green on the final complete website tree**.
- The local environment has no Lean executable. `node scripts/verify_countermodel_lean.mjs` correctly exits nonzero with `LEAN_REJECTED` and `ENOENT`; the `--emit-only` mode is not a verification run.
- GitHub Actions site checks on the branch have been seen **skipped**, not PASS. No production deployment or remote D1 migration was performed.

## Conditions for a public demonstration

1. Demo the local-only game immediately after review if needed, but never enable donation until migration 0024 and server route tests are verified in staging and production.
2. The displayed trusted checker mode must match `GET /api/system/status` and `GET /api/arena/countermodel/missions`; do not invent a live Lean-PASS status. The exported Lean source must be independently checked under the pinned Lean 4.28 toolchain.
3. For a complete operational demonstration, walk through one blind failed attempt, a repaired minimal world, independent server replay, explicitly consenting verified adult donation, owner-only export, privacy-reduced dataset conversion, and deletion.
4. Test a known-bad forged session/extra field, unauthenticated donation, user attempting owner export, other-account erase attempt, and migration absent; all should fail without writing unauthorized research data.
5. The release check should cover `npm run ci:zero-minutes`, dry-run Wrangler build, static accessibility and responsive layout, then real source SHA checks and Cloudflare preview. A skipped GitHub job is not approval.
6. The public **core** source and Aristotle formalization are separate projects: a website build or simulated game PASS must not waive their formal proof, CI, history, credential-isolation and legal disclosure gates.

## Research-data quality before training

Training data must carry original structured formulas, proposed meaning, exact bounded world states, sequential actions, pre/post-hint oracles, server-recomputed outcomes, dataset/checker version, and consent. Distinguish a computed label from what feedback a participant actually observed. Dedupe semantically identical action sequences regardless of JSON property ordering.

Hold out entirely new logical templates/source definitions and real proof projects for final evaluation; **the v1 held-out mission-ID partition does not establish compositional generalization**. Never treat synthetic fixtures as human trajectories. Human independence cannot be inferred from reproducible replay. Report false accepts explicitly.

This ledger is an implementation/verification task list, not a claim that the entire website has been made production-ready.

## 2026-10-08 independent-data-integrity hardening

- The replay now records **pre-action** world, prior hint/checker exposure, action, reward and post-action state separately. Earlier output mislabeled a post-action observation as the model's state; that information leak is corrected before the first production release.
- Repeated successful `check` actions no longer return another positive reward. A first successful counterexample check receives +10; subsequent successful checks receive a nonpositive reward. This prevents trivial reward-farming trajectories from contaminating an RL dataset.
- `tests/countermodel-oracle.test.mjs` exhaustively tests the semantic checker against **independently written truth-table formulas** for every supported valuation of 1, 2 and 3 agents across all seven missions. A shared interpreter can no longer certify itself by comparing to its own replay.
- `scripts/test_countermodel_migration.py` tests the real `0024_countermodel_lab.sql` schema in an isolated SQLite database: invalid counts/digest/statuses, missing users and duplicate sessions reject; account deletion cascades.
- `tests/countermodel-lean-runner.test.mjs` tests missing/wrong Lean versions fail closed. `.github/workflows/countermodel-lean.yml` adds a separate read-only exact-SHA Lean 4.28 verification job for all seven generated Lean files **only when a trusted isolated self-hosted PCS CI runner is explicitly enabled**. Until then its `skipped` outcome must never be interpreted as successful Lean verification.
- Locally, **37** game/oracle/dataset/Lean-runner tests passed. SQLite schema test passed. Actual Lean 4.28 verification returned `LEAN_TOOLCHAIN_NOT_VERIFIED` (binary unavailable), which is the correct fail-closed result. Authenticated Worker suite and full website test matrix have **not** been run from a complete checked-out source tree in this environment.
- To release, additionally verify a real full `npm run ci:zero-minutes` PASS, correct Cloudflare preview, production D1 migration/backup, a verified positive Lean result for the exact tested commit, and UI/auth/consent/deletion smoke results. Do not merge while those remain unverified.
