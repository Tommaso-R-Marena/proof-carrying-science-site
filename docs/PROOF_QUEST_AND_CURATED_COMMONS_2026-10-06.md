# PCS Commons tasks, one-click qualifications and Proof Quest research data

Implementation: `migrations/0016_proof_quest_adult_consent.sql`, `0017_curated_needed_tasks_and_roles.sql`, `public/arena-proof-quest.html`, `public/proof-order-core.mjs`, `src/worker.js`. This document records operational and scientific limitations, not a claim of formal correctness.

## Qualification

Option A links directly to the generated, per-skill variable evaluation in `account.html?qualification=evaluation#evaluationStartForm`. Option B links directly to the manual competency evidence form at `?qualification=application#skillForm`. Signed-out visitors first sign in or create an account; the chosen form is focused afterward. For task-specific links, a supported `skill` query parameter can preselect the corresponding skill. Exams do **not** confer verified level or skill without manual review.

L0 open work remains available without exams. A manual application does not reserve a high-trust task before Owner approval. L7 remains Owner-only; all contributor tasks are L0–L6.

## Catalog: deliverables and roles

Migration 0017 adds **33** actual bounded, voluntary, currently needed tasks across all eleven recognized category values and all contributor levels L0–L6, with explicit deliverables, independent review rules, acceptance criteria, estimated time and rationale. It adds **13** separately applied-for, manual-review volunteer roles (including seven nontechnical L0 roles), with a single opening per role. Ten informative task graph edges expose how lower-level outcomes help later work, without locking low-level tasks or creating exclusivity. All inserts are `INSERT OR IGNORE` so they cannot overwrite existing data. Existing migration metadata and contributor review rules are unchanged. Curators may pause/retire any item that becomes unnecessary; tasks are not synthetic busywork for an infinite points leaderboard.

These are volunteer roles and tasks; there is **no promise of payment**. Unreviewed L2+ work is gated by existing level, verified skill, review, and reservation controls. High levels do not waive task-specific skills or override scientific assurance.

## Beginner game

Proof Quest presents eight progressively technical but child-readable, static puzzle graphs. Each card is a prerequisite step and each `needs` edge means the prerequisite must precede the dependent step. A puzzle may have **multiple correct topological orderings**. `gradeOrder()` deterministically checks every declared edge, reports wrong edges, scores ordering and subtracts a small local hint penalty. Practice rewards are session-only stars: no public ranking, reward farming, real monetary payout, scientific acceptance or automatic verification role promotion.

The content uses Lean-style reasoning analogies only. **It never runs Lean 4, proves a theorem, checks an actual term, or provides a validated AI-safety guarantee.** A correct synthetic order is not a Lean proof and is not a ground-truth model training label for tactic search.

## Research collection: explicit opt-in adults only

Default game mode is entirely client-side, without saving or transmitting card choices. Any age can play. Only a separately submitted, consenting adult (18+) with a signed-in, verified-email PCS account may donate an ordering. Both checkboxes start unchecked. The server independently enforces: exact known puzzle/version, valid step permutation, age assertion, consent, verified account, 20-per-day/user maximum, endpoint rate limiting, and exact duplicate suppression. All scores and constraint results are computed again by the server; it does not trust client score. Minor submissions are prohibited, though age is **self-declared** rather than independently verified. Do not market donated data as child-generated.

D1 records the actual step ID ordering, fixture/puzzle version, hints used, computed score, constraint correctness, time and account ID (solely for anti-abuse and deletion). No free-form scientific data, self-reported age number, name, email or IP is stored in the research table. An Owner-only export strips account identifiers and includes provenance and explicit limits. An account user can remove their rows via `POST /api/arena/proof-order/erase`, which is guarded by their session. Account deletion cascades through the table. Existing exported files/backups cannot be retracted by the delete button; document retention honestly.

Data use: beginning **research candidates for dependency ordering / preference-learning experiments**, not production RL training or evidence of human proof skill. Before model training: deduplicate by puzzle family/version, avoid train/test leakage, protect against malicious/random submissions, preserve multiple valid orders, audit scoring, and independently evaluate on unseen actual Lean goals using Lean's kernel as the real acceptance oracle. Keep symbolic ground truth distinct from human preference labels and failed execution traces.

## Owner workflow

- Visit Admin Center → Arena → **Export consented puzzle dataset (.json)**. This endpoint requires a separate admin session and Owner flag. Do not share exports without a data governance review.
- Inspect `/api/tasks` and `/api/roles` to see curated, published, needed work. Pause completed/unnecessary tasks rather than leaving stale work listed.
- Enable deeper supervised proof-planning tasks only after the Aristotle unknown-check-type soundness issue, fresh CI, and an independently verified Lean interface have landed.
- Maintain separately versioned puzzle IDs and curated dependency graphs. Do not silently revise existing puzzle semantics after human submissions; introduce v2 instead.

## Rollback and production checks

Migrations are additive; do not drop tables. All frontend/backend changes must pass site integrity, defensive security campaign, 8 puzzle tests, 5 catalog tests, pre-existing submission/promotion/pilot tests, JS syntax and Wrangler deployment. Before release, use unauthenticated API smoke checks to verify anonymous donations and Owner exports fail with HTTP 401. A successful Cloudflare site build does not replace core protected Lean CI.
