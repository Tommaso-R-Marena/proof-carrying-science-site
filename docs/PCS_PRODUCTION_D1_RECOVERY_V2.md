# Production D1 schema-only recovery v2

The actual production schema was captured with the existing fixed `sqlite_master` SELECT and reconstructed transactionally in an isolated local SQLite database. All **96 objects**—36 tables, 50 indexes and 10 triggers—matched the captured definitions exactly. The schema digest remains `c39546dd9bf8f19012734e90d19a76f3270bbd100072d37003be0ca1838acb8b`, matching the prior production preflight. No account/game rows or migration-ledger contents were read remotely. No historical migration, ledger backfill, production write, quota reset or financial action occurred.

This establishes an executed **schema-only restoration**, followed by synthetic application checks. It does **not** establish recovery of production records, provider-native restore behavior or a safe production migration.

## Implementation and evidence boundary

`scripts/d1_schema_recovery_v2.py` accepts the bounded `pcs-schema-only-capture-v2` object format. The optional production capture reuses only the allowlisted schema SELECT from `d1_production_preflight.py`; the implementation offers no remote apply, backup-export or ledger-write command. SQL definitions, names, duplicate objects, object count, bytes and capture hashes are checked before restoration. Destinations and JSON reports are created exclusively; existing files and symlinks are never overwritten.

Tables, indexes, views and triggers are created inside one transaction with foreign keys enabled. Restored definitions are compared byte-for-byte to the captured objects, then column/index/foreign-key layouts, integrity and empty row state are inspected. Missing foreign-key target tables/columns reject the reconstruction. Extension loading, external database attachment and writable-schema pragmas are prohibited. A late malformed index fixture fails after tables were created, and rollback leaves **zero partial objects**. The mutated capture is preserved as an explicit negative control, not presented as a production failure.

Exact definition equality preserves captured constraints and trigger definitions; it does not independently certify every possible constraint interaction. The script reconstructs layouts locally from captured DDL rather than reading production PRAGMA results. Hidden SQLite/Cloudflare internals excluded by the fixed query are outside this restoration.

## Executed application checks

**24 synthetic controls** passed on the reconstructed schema:

- Case-insensitive email uniqueness, single-owner and account-level constraints.
- The captured omitted-field authentication default **250000**, and current explicit insertion value **100000**, remain distinct and preserved. No existing credential or login was examined.
- Bridge donation membership uniqueness, exact consent-version value, digest/size limits and actor foreign keys.
- Account deletion cascades donation/session rows, nulls the legacy audit actor and preserves the immutable archive actor snapshot.
- Audit archive updates/deletes and legacy audit deletion are rejected.
- Pending high-trust request, active-request uniqueness, approved-reservation and exclusive-reservation limits.
- Single open competency evaluation and daily attempt limits.
- The newly reconstructed migration ledger remains **empty**, without fabricating historical migration execution.

These fixtures contain reserved synthetic identities and non-credential placeholder values. They are schema exercises, not human participation, authenticated consent, valid game traces, Lean proofs or independent reviewer evidence. Server-side consent, authorization and replay checking remain required.

The exact SQL extracted from protected `src/lean-admission.js` also ran against this restored schema: **60 synthetic clients across 8 threads admitted exactly 12 and denied 48**, with **zero partial client charges**. The source and SQL hashes are recorded. This checks the extracted SQL under local SQLite; it does not prove JavaScript refinement or reproduce a production D1 race.

## Future migrations and historical effects

The tool analyzes the **25 historical migration sources without executing them**. Each data-changing statement records its operation, target table, digest, conflict/replace/upsert behavior, WHERE boundary and review obligation. The prior public preflight recorded only migrations 0024 and 0025; the other **23 sources** remain unrecorded in that prior observation. No new ledger contents were read, so this report does not assert that the current ledger is unchanged.

Seed/curation operations affect tasks, role openings, challenges and task code packets. Reservation backfill updates `task_requests`. Dependency migrations can replace groups/edges or change their acceptance semantics. INSERT OR REPLACE may delete/reinsert a conflicting row; UPSERT may overwrite current catalog state. Current object presence cannot prove those data effects occurred, nor justify repeating them on current contributor state. Operators must review source predicates and an authorized historical/current data comparison before any specific reconciliation. Issue #93 remains open.

Two **new, local-only candidate migrations** were executed on online-backup clones populated solely with synthetic fixtures:

1. Adding a new bridge-owner index succeeds, preserves all existing table rows/layouts and leaves the original database byte-for-byte unchanged.
2. Creating a probe table and then an index on a nonexistent column fails; transaction rollback restores the exact logical schema/data inventory and leaves the original unchanged.

The reusable candidate runner permits only bounded additive local table/index DDL and rejects row-changing SQL, historical replay and dangling foreign-key targets. The result explicitly declines production authorization. This is a tested future-migration rehearsal interface, not a proposed production change or a migration-ledger repair.

## Exact results and reproduction

The campaign and **14 adversarial/local tests** passed. [Release campaign](evidence/production-d1-recovery-v2/campaign-release.json), [test log](evidence/production-d1-recovery-v2/tests-release.log) and [resource accounting](evidence/production-d1-recovery-v2/release-resources.json) contain the executed evidence. [SHA256 manifest](evidence/production-d1-recovery-v2/SHA256.json) binds source/test overlays, capture, reports and every preserved control log. The manifest is unsigned and provides no external reviewer attestation. Initial campaign/test stages remain preserved.

Starting protected source: website `738da43fbdb840ab258dcda7d41861126df15559`; core `b59badd68cedba3dcc9c72a6d5148e7986545ebd`. Both were inspected before this work. No checkout, branch, commit or deployment changed within this workstream.

Offline reproduction uses the committed schema metadata and removes any need for credentials:

```bash
python tests/test_d1_schema_recovery_v2.py
python scripts/d1_schema_recovery_v2.py \
  --capture docs/evidence/production-d1-recovery-v2/captured-schema.json \
  --output /tmp/pcs-schema-recovery-new-report.json
```

The report destination must be fresh. The optional `--capture-production --database <existing-id>` command performs only the fixed metadata SELECT and requires a fresh capture path. Local tests/campaign were run with GitHub and Cloudflare bindings removed and made zero network requests. CPU, wall time and cumulative child RSS accounting are recorded; no GPU or paid resource was used.

## What remains open

**Actual production data recovery has not been exercised.** No private production rows were exported, so actual account credentials, task/submission state, donations, sessions, immutable audit history and migration-ledger rows were not restored or compared. Existing provider backup/time-travel capabilities, retention, snapshot consistency, restore endpoints, operator permissions, rollback/cutover, RPO/RTO and post-restore application validation remain unqualified. No production backup or restore receipt exists from this campaign.

The authentication default mismatch remains a historical data/behavior obligation. Schema reconstruction preserves it; changing it or determining which existing credentials depend on it requires separate authorized review. Consent/version and size constraints do not certify game meaning or training eligibility. A matching schema and passing synthetic fixtures cannot close historical data-effect obligations or authorize ledger backfill.

The next recovery step is an operator-controlled private backup/recovery drill using existing authorized infrastructure, with exact before/after data and application checks and a sanitized evidence receipt. This must preserve private records, avoid paid resources and separately authorize any production cutover. Until executed, PCS reports the production-data recovery obligation as **OPEN**.
