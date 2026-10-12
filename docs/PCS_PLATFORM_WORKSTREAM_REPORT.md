# PCS contributor and research-data platform execution

This work extends the existing accounts, task review, Bridge Builder and Memory Workshop. It preserves the two catalogs, the adult CC0 opt-in, the existing L0–L7/Owner boundaries and the requirement for fresh independent Lean replay. It does not introduce a new scientific authority or promote a model.

The [sealed evidence](evidence/platform-governance-v1/ARTIFACT_SHA256.json) includes executed browser/security results, a fresh Lean intake, real gradient updates, the experimental checkpoint, withdrawal quarantine and local database recovery. All browser accounts and gameplay records in this experiment are synthetic fixtures. There are **zero human participants** and **zero dollars spent**.

## Executed contributor and browser workflow

The expanded [actual integration campaign](evidence/platform-governance-v1/authorization-browser.json) passed 33 checks against an isolated local Cloudflare Worker/D1 service, using Chromium. It registered through the real account form, requested manual skill review, exercised the variable screening and cross-user/repeated screening rejection, started a published eligible task, submitted through the actual dialog, displayed `needs_changes` feedback, and accepted the low-risk submission through a different authorized reviewer. Acceptance raised that fixture only to L1; it did not confer scientific or production authority.

Email verification and Owner fixture setup used **explicit local SQL fixtures**. External email delivery, a real contributor assessment and a GitHub contribution merge were not exercised. No hidden evaluation answers were used; the automatic screening deliberately failed. The existing GitHub artifact, protected CI and production promotion tests remain separate checks.

The campaign rejected crafted profile authority, cross-origin mutations, contributor access to administrative exports, forged reviewer access, cross-user submissions, repeat final decisions, fabricated consent and changed catalog identities. The audit found an administrator self-review gap. `adminSubmissionDecision` now rejects the submitting account with `self_review_forbidden`, including Owner accounts. A real delegated-admin fixture could sign in but received HTTP 403 when attempting to accept its own submission.

Keyboard interaction completed the actual Memory Workshop proof and activated its recommended next challenge at **320, 768 and 1440 CSS pixels**, with reduced motion enabled, no horizontal overflow and no page exceptions. This exercises keyboard and browser semantics; it is not a human screen-reader evaluation or an exhaustive audit of every website interface.

## Practice curriculum and evidence classes

`curriculum` in `public/bridge-builder-core.mjs` derives progression from replayed catalog sessions, using the minimum checked action count and whether a proof uses induction. The shared interface recommends unfinished matching/longer/induction crossings, keeps every challenge selectable, and can suggest a no-hint replay. Completion estimates exist only in the current tab. They do not grant reviewed account skills and are not automatically donated.

`public/research-governance-core.mjs` derives export quality from the server replay. It separates complete and partial routes, archived-state and independent-kernel replay, recorded hint exposure, undo events, and valid/invalid actions. `consented-account` indicates the authenticated consent path; replay cannot establish that the account corresponds to a real human or that the actions were independent. Only the independent intake can produce kernel-checked labels. Explicit synthetic fixture labeling remains mandatory in experiments.

Exports now include deterministic content and membership digests, catalog/goal bindings and the existing consent scope. Owner access remains required. The new fields do not expand consent or turn the export into approved training data. Changed catalogs, mismatched labels, reordered histories and forged session fields are rejected. The pre-existing training/utility split and structural held-out screening are retained; the public games do not expose final evaluation solutions.

## Actual game → model → withdrawal execution

A synthetic browser fixture solved the public Memory Workshop crossing using actual keyboard choices. Its exported session was donated under the existing explicit adult CC0 opt-in, inserted into D1, exported by the local Owner fixture, and passed fresh independent Lean transition/proof replay.

The resulting one verified trajectory supplied **six eligible proof-action states**, trained for **two epochs** (12 gradient steps) through the existing CPU `MemoryNetwork` and imitation code. All 30 named parameter tensors listed in [the training record](evidence/platform-governance-v1/synthetic-training.json) changed. The historical model architecture contains 14,773 trainable parameters. The actual [candidate checkpoint](evidence/platform-governance-v1/synthetic-candidate.json) was saved; it has no production approval. This experiment measures pipeline execution and parameter updates. It does not measure human-data transfer, held-out improvement, scientific novelty or superiority over a symbolic baseline.

The local `scripts/research_lineage.py` ledger binds export membership to a dataset and then to a checkpoint, with source commits, SHA-256 identities and append-only hash-chained events. The Worker erases active donated rows and returns the same anonymous membership IDs in a withdrawal receipt. Its D1 batch reads, deletes and recounts transactionally; it removes at most 1,000 matching records per call and reports any remainder.

Importing the actual withdrawal receipt quarantined the export, dataset and model descendants, as shown by [lineage evidence](evidence/platform-governance-v1/lineage-quarantine.json). A subsequent [preflight invocation](evidence/platform-governance-v1/future-use-denial.json) returned nonzero for the withdrawn dataset. The saved checkpoint bytes remained unchanged. This is future-use control in the ledger-aware workflow, **not** model unlearning, retrieval of distributed copies, deletion of backups, or a universal access control over arbitrary independent training scripts. Existing exported copies require their custodians to act. The game now downloads the receipt when the user deletes donations.

The proof intake preserves separately checked invalid attempts and utility calibration examples. It does not treat archived transitions, a model prediction, consent assertions, or a successful database operation as proof authority.

## Issue #93: migration reconciliation and recovery

`scripts/d1_reconcile.py` has no network code and opens the supplied database read-only. It fingerprints actual schema definitions and streamed table contents without emitting personal rows. It executes each historical migration on an isolated fresh reference and records actual reference writes and table/schema changes. The text hazard scan is conservative; reference effects are not proof that historical production effects occurred.

All 25 historical migrations were executed locally. In the actual disposable D1 state, 94 schema objects were inventoried; no canonical objects were missing. `_cf_METADATA` and `d1_migrations` were expected additional D1 objects. Any altered definitions and current data hashes remain visible. Present schema or current seed data does **not** authorize execution-ledger backfilling.

The [populated recovery exercise](evidence/platform-governance-v1/migration-recovery.json) copied the actual local SQLite/D1 state while it held three synthetic accounts, one research donation and 16 audit rows. SQLite online backup and restore preserved full schema/data fingerprints. A transactional migration that created a table and then referenced a nonexistent table rolled back completely. The source remained unchanged.

Pending-migration dry runs likewise use an online-backup clone. Tests executed an additive candidate on that clone and rejected a duplicate historical `ALTER` without modifying the source. No historical migration was replayed on production; no production ledger entry was backfilled; no production database was mutated. This provides operational tooling and a local recovery qualification for issue #93, **not** completion of its production reconciliation. Cloudflare remote/time-travel recovery remains untested here.

A safe production procedure still requires a read-only production inventory/export, explicit review of every historical data-changing effect, protection of legitimate current account/task state, a verified backup and remote recovery procedure, and independently approved baseline metadata. Future candidate migrations must be tested on a copy of that reviewed baseline. Recording a baseline must never falsely assert that a historical migration ran.

## Reproduction and tests

From the website repository, with the existing pinned environment activated:

```sh
node --test tests/research-governance.test.mjs tests/bridge-curriculum.test.mjs
python3 tests/test_d1_reconcile.py
python3 tests/test_research_lineage.py
```

These executed five Node tests and five Python tests. Existing Bridge Builder and Memory Workshop tests also passed alongside the curriculum (11 tests total in that run).

For a fresh **isolated local** Worker/D1 fixture, use a separate absolute state/output directory:

```sh
npx wrangler d1 migrations apply pcs-commons --local --persist-to /tmp/pcs-platform-fixture
npx wrangler dev --local --ip 127.0.0.1 --port 8794 \
  --var RATE_LIMIT_SALT:local-synthetic-fixture-only --persist-to /tmp/pcs-platform-fixture
PCS_BROWSER_BASE_URL=http://127.0.0.1:8794 \
PCS_RESEARCH_DB_STATE=/tmp/pcs-platform-fixture \
PCS_PLATFORM_OUTPUT=/tmp/pcs-platform-evidence \
PCS_LEAN_CORE=/workspace/proof-carrying-science \
node scripts/browser_platform_governance.cjs
```

The browser script refuses non-loopback services. Its fixtures are not allowed against production. It uses existing free/local tools, does not provision paid resources, and cleans up its accounts through the actual deletion API after testing. Initial fixture failures (missing local rate-limit salt and missing fixture terms version) were preserved privately; correcting those fixtures produced the passing real run.

For a downloaded database copy:

```sh
python3 scripts/d1_reconcile.py /absolute/path/copy.sqlite \
  --exercise-recovery --pending /absolute/path/reviewed-candidate.sql \
  --output /absolute/path/reconciliation.json
```

For authorized export custody:

```sh
python3 scripts/research_lineage.py --ledger /absolute/path/lineage.sqlite \
  export /absolute/path/owner-export.json --source EXACT_SOURCE_COMMIT
python3 scripts/research_lineage.py --ledger /absolute/path/lineage.sqlite \
  derived /absolute/path/independently-checked-intake.json --kind dataset \
  --parent EXPORT_SHA256 --source EXACT_SOURCE_COMMIT
python3 scripts/research_lineage.py --ledger /absolute/path/lineage.sqlite preflight DATASET_SHA256
python3 scripts/research_lineage.py --ledger /absolute/path/lineage.sqlite \
  withdraw /absolute/path/withdrawal-receipt.json
```

Source references and file digests are in [SOURCE_OVERLAY.json](evidence/platform-governance-v1/SOURCE_OVERLAY.json). The baseline was core `e1067e406a1a1991497e7130e1f209239e5607cc`, website `1a351144cac080a990ab6f75fe8b57b476c3b08a`; work was tested with a local source overlay and Worker hot reload. Protected CI/release commits and deployment evidence are separate release obligations. The historical experiment/checkpoint artifacts were preserved.

## Remaining boundaries

This work does not claim complete task taxonomy, external email or GitHub submission integration, scientific acceptance, actual human training data, held-out model improvement, protected production merges, deployed-source guarantees, production D1 reconciliation, remote rollback/recovery, global distributed-copy deletion, or legal clearance for all external datasets. No new third-party dependency, license change, financial information or production secret was introduced. Full per-stage CPU/memory profiling was not collected; executed gradient counts, checkpoint hashes, checks and database fingerprints are retained instead.

## Account deletion addendum

The later 34-check actual Worker/D1/Chromium campaign also verifies deletion through the actual account UI and download of exact proof-game withdrawal membership. The D1 selection and user cascade share one transaction; unsupported oversized historical membership blocks deletion pending bounded erasure. The receipt preserves membership for future local quarantine and does not erase prior weights. Earlier sealed 33-check evidence remains unchanged. See `docs/evidence/account-withdrawal-v1/summary.json`. Signed unexpired tickets also preserve their one explicitly approved previous core revision during a deployment transition; new dispatch requires the current protected revision.
