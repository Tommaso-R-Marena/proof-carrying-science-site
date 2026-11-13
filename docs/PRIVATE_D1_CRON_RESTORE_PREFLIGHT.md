# PCS Cron v1 — offline private D1 backup restore rehearsal

**Status: STAGED / NOT AUTHORIZED FOR PRODUCTION**  
**PR:** stacked on Cron reliability PR #152.  
**Trust boundary:** The preflight is an offline, checksum-pinned technical exercise on an **operator-supplied SQLite backup**, never on Cloudflare D1. It does not fetch backups, trigger a Time Travel restore, modify account resources, inspect secrets, issue a migration, approve source, or deploy a Worker.

## What this implements

The script `scripts/cron_private_restore_preflight.py` accepts a previously exported, separately authorized **SQLite database file**, an independently recorded SHA-256 for that file, and the independently reviewed SHA-256 of `migrations/0026_cron_mail_outbox.sql` (**exact audited revision `28e1c98642317ffaa2df976ea976f3a696638f7f2c6232823112dbc17ce12756`**). The tool independently pins these migration bytes in its implementation: supplying a matching checksum for different SQL does not qualify the alternative.

It performs these checks, **offline**:

1. Refuses symlinks, hard-linked sources, missing/non-regular files, uncontrolled backup sizes, journal-mode WAL databases, any `-wal`, `-shm`, or `-journal` sidecar, and mismatched checksum pins. An ordinary main-database SHA-256 does **not** cover uncheckpointed WAL records; operators must supply a completed standalone SQLite backup.
2. Opens the backup using a read-only SQLite connection with `PRAGMA query_only=ON` and pins a single read transaction for schema inspection, row fingerprinting, and SQLite backup cloning; verifies the current approved captured production schema (96 exact objects), existing SQLite and foreign-key integrity, and the **observed pre-0026 ledger** of `0024_countermodel_lab.sql` and `0025_bridge_research_sessions.sql`.
3. Computes streaming, type-encoded SHA-256 fingerprints of each captured table's rows **without logging raw values or their hashes**.
4. Clones the database through SQLite's backup API into a private temporary directory and verifies snapshot schema/row equality.
5. Enforces an exact two-statement additive migration shape and runs it with a fail-closed SQLite authorizer allowing only the proposed table/index creation. The authorizer denies direct application-row updates/deletes, unauthorized DDL, ATTACH/DETACH, VACUUM INTO and PRAGMA changes; it can never treat a caller-provided checksum as authorization for different SQL. Applies **only the exact pinned migration 0026** to the temporary clone, never the original backup. Requires exactly two additive objects: `cron_delivery_attempts` and `idx_cron_delivery_due`.
6. Asserts that every old schema object and old table's complete rows have identical fingerprints, the new attempt ledger is empty, the existing historical ledger has not been backfilled, and SQLite integrity/foreign keys remain valid.
7. Deletes the temporary cloned backup on completion or failure, and rechecks the original backup's SHA-256. The script returns status booleans only, not rows, emails, user IDs, passwords, salts, tokens, raw backup hashes, or customer data.

The **18-test synthetic GitHub Actions suite** creates an entirely artificial database from PCS's captured schema, seeds a synthetic account and historical migration ledger, and proves that damaged backups, mismatched checksums, missing ledger entries, changed schema, symlinked inputs, extra migration objects, and malicious migration writes are rejected. It also demonstrates that malicious ATTACH, VACUUM INTO, unauthorized DDL, direct application-row writes, self-hashed alternative migration definitions, and weakened constraint variants are rejected before the migration executes. A separate direct-authorizer test checks that external files are never created.

## How an authorized reviewer would run it privately

A reviewer must first obtain a **separately approved, fully checkpointed, standalone** SQLite-format backup in an access-controlled private environment. **Do not** pass a live or copied WAL-mode database, a `*.sqlite` file still accompanied by `-wal`/`-shm`/`-journal` files, or a hard-linked live database; the preflight rejects those forms because the main-file checksum may not cover the actual logical dataset. Have the authorized operator produce a stable standalone backup by a separately reviewed process, and pin its digest only after the backup is complete. Do not upload the backup to GitHub, public CI, ChatGPT, an agent, cloud logs or a shared artifact. Keep it outside the repository; do not pass the live Cloudflare database as the input.

From an exact, reviewed checkout of this PR and its pinned Cron implementation:

```bash
# Record these digest pins independently through the approved backup/migration process.
sha256sum /PRIVATE/PATH/pcs-approved-backup.sqlite
sha256sum migrations/0026_cron_mail_outbox.sql

python3 scripts/cron_private_restore_preflight.py \
  --input-backup /PRIVATE/PATH/pcs-approved-backup.sqlite \
  --backup-sha256 THE_INDEPENDENT_64_CHARACTER_BACKUP_SHA256 \
  --migration-sha256 THE_REVIEWED_64_CHARACTER_MIGRATION_SHA256 \
  --output /PRIVATE/PATH/new-offline-preflight-report.json
```

The file must already exist in SQLite format. A Cloudflare SQL export is **not** a SQLite file; conversion would be a separate security-sensitive process and is not performed by this script.

## What passing would and would not mean

A pass on an authentic, approved backup would demonstrate a **local technical clone and forward-only SQL rehearsal** with row preservation for the captured schema and the stated old migration ledger. It cannot independently establish that the backup came from current production, that the backup was captured consistently, that no concurrent production writes were lost, or that the external mail provider offers exactly-once delivery.

The report explicitly sets `backup_authenticity_independently_proven=false`, `protected_source_admitted=false`, `production_migration_authorized=false`, and `production_deployment_authorized=false`.

**Required independent gates before production:** protected source successor review (issue #154), migration-ledger conflict resolution (issue #93), owner-reviewed backup provenance and restore rehearsal, rollback implications, independently approved production migration, protected full-site CI, then separate merge/deployment authorization.

Do **not** run `wrangler d1 migrations apply --remote`, backfill old migration IDs, or merge this branch solely because its synthetic tests pass.
