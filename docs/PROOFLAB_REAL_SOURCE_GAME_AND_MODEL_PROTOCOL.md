# ProofLab v1 implementation and research contract

## Completed architecture

ProofLab v1 shows **46 real PCS Lean theorem headers** on the public site, derived from a pinned source snapshot of **61** genuine declarations at core commit `cff0b67595abd4862ab0c156b157f262b169eca5`. The other 15 declarations, all from `PKPDCheck` and `Workflow`, are **not shipped**. Public challenge examples from `IndexProofs` and `PackageProofs` are **not** a blind evaluation holdout.

The public website uses reviewed `prooflab-data-*.mjs` modules. The private core repository holds all eight source-anchored snapshots in `benchmarks/prooflab/`, with original file path, declaration line, Git source blob and statement. A core script `scripts/validate_prooflab_benchmark.py` checks exact original source bytes/header identity and module splits.

**Trust boundary:** Every original Lean statement is source-backed. The visually rearranged graph in `public/prooflab-core.mjs` is **an explicitly invented, honest educational reasoning scaffold**, not a graph extracted from actual Lean elaboration. No player action, game score, proof card, self-reported judgment or transcript is automatically a checked Lean theorem. Existing P0 checker-registration work remains separately unresolved; the game cannot override it.

## Interaction design

Players select a real theorem and can:

1. Explore a goal statement and original source provenance.
2. Build a pedagogical dependency path, with invalid moves counted separately from accepted moves, optional assistance and local undo.
3. Repair a deterministically omitted dependency by choosing a source stage.
4. Reject overclaims by selecting the scope-aware scientific conclusion, with 3-point confidence.
5. Inspect their bounded score and in-memory attempt diary. They may share a task link without sharing a session.

This is beginner-friendly and mobile responsive, with keyboard buttons and optional drag-to-lane. Game interaction is local, no login required.

## Explicit adult research, independent replay

The sole donation endpoint is `POST /api/arena/prooflab/donate`; `POST /api/arena/prooflab/erase` removes a contributor's active rows. The server requires a signed-in verified-email account, both explicit age-18+ and informed-consent booleans, a real public task, a valid versioned action sequence, at least six decisions, and repair + scope votes. It independently recreates the source-pinned task and computes all educational labels. False scores, extra fields, unsupported/private evaluation problems and fake proof-result labels are rejected. D1 migration `0020_prooflab_research_sessions.sql` creates an isolated table with per-user deduplication, bounded daily submission and ON DELETE CASCADE. No automatic tracking or anonymous research donation was added.

Only the owner may call `GET /api/admin/arena/prooflab/dataset?offset=…` for bounded 25-row, deidentified batches. No account ID, email, IP or raw timestamp enters the exported research replay. Deletion cannot guarantee recall of earlier approved offline exports or trained weights.

## Preparing the narrow dataset

Run:

    node scripts/prepare_prooflab_dataset.mjs OWNER_EXPORT.json REPLAYED_DATASET.json

The converter independently reconstructs each episode from recorded behavioral events. It rejects extra identity fields and altered labels and preserves negative moves, optional hints and donor-reported confidence. It never labels a game path as a kernel-verified proof.

This is a **candidate next-stage planning / missing-dependency / abstention** study. Merely memorizing its educational scaffold is trivial. The strong baseline is the deterministic game solver, which computes the exact labels without participants. A model trained on these sessions must demonstrate a measurable advantage on **separate real Lean proof attempts** under equal compute, then on independent scientific projects before any generalization claim.

## Evaluation and future research dependencies

* *Practice modules*: Units (13), Binding (8), EnvFacts (6), Checkers (5).
* *Public challenges*: IndexProofs (6), PackageProofs (8). These are open and non-blind.
* *Withheld core source modules*: PKPDCheck (8), Workflow (7). These do not appear in public JS.
* *Still required*: actual proof terms from an authenticated trusted execution environment, fresh Lean 4 kernel results, deterministic dependency extraction grounded in actual source rather than scaffolds, project-level holdouts from consented outside labs, red-team testing, sample efficiency comparisons and model ablations.

Do not present a model trained on source headers as a theorem prover. The target is to improve genuine formal verification workflow planning without inflating confidence in unsupported conclusions.
