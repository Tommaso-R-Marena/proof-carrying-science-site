# PCS Arena — Countermodel Lab v1 release gate

**Status:** implementation staged in a dedicated website PR. **NOT DEPLOYED or production-certified.** The seven missions use a genuine deterministic, exhaustive **finite-domain first-order model checker** over 1–3 elements. Browser and Worker run the same pinned evaluator module; Workers do not run Lean. The `.lean` export is a *real Lean source file* with a `by decide` proof obligation requiring independent compilation/kernel check. No source export or game score is itself an authoritative PCS certificate.

## Motivation and game loop

Players modify Boolean interpretations of unary P/Q or a binary R relation, change a domain's cardinality, request explicit checker feedback, and seek a minimal finite model differentiating an original proposition from a corrupted proposal. Seven missions cover quantifier changes, negation, implication direction, AND/OR weakening, assumption loss, quantifier scope, and variable capture. No account is necessary for gameplay; local personal bests stay in localStorage.

## Actual checker and machine-learning data

`public/countermodel-core.mjs` contains a small explicit first-order formula tree and interpreter. Each mission's symbolic meanings are independently evaluated against every finite assignment for witness discovery/minimality. The replay checker strictly accepts a versioned 1–120-action sequence of permitted toggles, entity additions/removals, checks and hints. It **derives** every Boolean verdict, sequence label, state, reward and final score; client results and unknown fields are rejected. Explicit checker-feedback and hint flags identify assisted samples. These are useful **countermodel-search trajectories, not Lean tactic proof data** or human-intent judgments.

Model generalization must be measured on held-out formula and task families, and ideally on independently authored new definitions/claims; holding out merely example IDs does not establish compositional generalization. Episodes are not verified human-authored solely because their actions replay correctly. Beware copied solution trajectories, bots and high-frequency low-diversity samples. Recommended follow-on: provenance-bound independent Lean theorem fixtures, source-based held-out claims, blind tasks, active learning and genuine model evaluation with false-accept rate as the top metric.

## Data safeguards

The Worker exposes `GET /api/arena/countermodel/missions` to any visitor. Opt-in donation requires same-origin authenticated requests, verified account email, explicit 18+ self-attestation, consent, rate limits, daily quotas, a successfully replayed **final** check, and at least one edit. It stores one user-bound D1 record with unique per-user content digest. Deletion is available via the user's `POST /api/arena/countermodel/erase`. The owner-only `GET /api/admin/arena/countermodel/dataset` exports only bounded replayable sessions and results (no email, account IDs, IPs or precise dates). The offline conversion utility replays the original choices *again*, rejects falsified labels, deduplicates and produces per-action state/action/reward episodes without personal identifiers.

The website's claims of consent refer to a checkbox and adult self-attestation, not independent verification of age, human authenticity, or a promise to untrain from already exported models. If the research scope, consent language, or retention policy changes, issue a new consent version. The owner should document downstream dataset use and deletion handling before accepting research donations.

## Required rollout steps

1. Review this PR and verify its exact source SHA. Check standard website syntax, all existing Worker/arena tests and new Countermodel Lab tests (`npm run ci:zero-minutes`), and run Wrangler deploy *dry-run*.
2. **Before deploying Worker donation routes**, apply D1 migration `0024_countermodel_lab.sql` to the correct PCS Commons database. Test it against a staging/local D1 database first. Existing rows and auth tables must not be changed. Back up production D1 before live migration.
3. Execute `node scripts/verify_countermodel_lean.mjs` on a host with the pinned `leanprover/lean4:v4.28.0` (or `PCS_LEAN_BIN` pointing to the same). The `--emit-only` mode does **not** verify anything.
4. Exercise desktop/mobile UI with keyboard, screen reader and touch. Validate all seven missions, invalid/nested payload rejection, no account gameplay, account/consent donation, owner-only export and self-service deletion.
5. Verify repo/site Cloudflare preview and manual authorized promotion through the existing production-review path. Never bypass website CI.
6. Inspect D1 post-deploy migration and sample data, and verify the public page's actual endpoint returns version `pcs-countermodel-lab-v1`.
7. To make this part of core PCS **formal authority**, independently prove the semantics-to-Lean correspondence and run each candidate through the real PCS executable checker or Lean kernel with tamper-evident receipts; this is **not implemented** by this website feature.

## Commands

```bash
npm run test:countermodel
npm run ci:syntax
npm run ci:zero-minutes
node scripts/verify_countermodel_lean.mjs --emit-only   # NO LEAN PASS
node scripts/verify_countermodel_lean.mjs               # REQUIRES ACTUAL LEAN
npx wrangler d1 migrations apply pcs-commons --local
# After tested backup + authorization only:
# npx wrangler d1 migrations apply pcs-commons --remote
```

## Critical nonclaims

Finite-domain model checking does not prove statements equivalent or inequivalent in all possible domains; a found countermodel **does** refute an unrestricted equivalence of the displayed formulas under the standard explicit interpretation, provided both formulas and the displayed instance are faithful. More subtly, this does not prove the chosen interpretation matches natural-language intent. A running Worker checker is not a Lean kernel certificate. The training dataset is not automatically suitable for autonomous AI safety verification.

## 2026-10-08 independent-data-integrity hardening

- The replay now records **pre-action** world, prior hint/checker exposure, action, reward and post-action state separately. Earlier output mislabeled a post-action observation as the model's state; that information leak is corrected before the first production release.
- Repeated successful `check` actions no longer return another positive reward. A first successful counterexample check receives +10; subsequent successful checks receive a nonpositive reward. This prevents trivial reward-farming trajectories from contaminating an RL dataset.
- `tests/countermodel-oracle.test.mjs` exhaustively tests the semantic checker against **independently written truth-table formulas** for every supported valuation of 1, 2 and 3 agents across all seven missions. A shared interpreter can no longer certify itself by comparing to its own replay.
- `scripts/test_countermodel_migration.py` tests the real `0024_countermodel_lab.sql` schema in an isolated SQLite database: invalid counts/digest/statuses, missing users and duplicate sessions reject; account deletion cascades.
- `tests/countermodel-lean-runner.test.mjs` tests missing/wrong Lean versions fail closed. `.github/workflows/countermodel-lean.yml` adds a separate read-only exact-SHA Lean 4.28 verification job for all seven generated Lean files **only when a trusted isolated self-hosted PCS CI runner is explicitly enabled**. Until then its `skipped` outcome must never be interpreted as successful Lean verification.
- Locally, **37** game/oracle/dataset/Lean-runner tests passed. SQLite schema test passed. Actual Lean 4.28 verification returned `LEAN_TOOLCHAIN_NOT_VERIFIED` (binary unavailable), which is the correct fail-closed result. Authenticated Worker suite and full website test matrix have **not** been run from a complete checked-out source tree in this environment.
- To release, additionally verify a real full `npm run ci:zero-minutes` PASS, correct Cloudflare preview, production D1 migration/backup, a verified positive Lean result for the exact tested commit, and UI/auth/consent/deletion smoke results. Do not merge while those remain unverified.
