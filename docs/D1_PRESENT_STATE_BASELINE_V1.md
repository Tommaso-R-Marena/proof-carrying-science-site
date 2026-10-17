# Legacy D1 maintenance baseline and forward-only migrations

Issue #93 is addressed by adopting the observed current state, rather than inventing execution records for migrations 0001–0023. The existing Wrangler ledger is preserved: it records only the actually observed 0024 and 0025 migrations. A normal migration listing over the complete historical directory will still show the 23 unrecorded files. **Never apply that directory to production.** Use the isolated forward path below.

## Executed evidence

The protected website source at inspection was `a6a9a54bb8f2e8fb45f783a9df56929aca11a54b`. An authenticated, schema-only API read was compared with a private full D1 export restored into local SQLite. Both had schema digest `c39546dd9bf8f19012734e90d19a76f3270bbd100072d37003be0ca1838acb8b`, 96 objects and 36 non-internal tables. The restored snapshot passed integrity and foreign-key checks. The private SQL export and restored databases remain outside Git, public assets and CI artifacts; no account/research rows are included in the published evidence.

The [baseline](evidence/d1-present-state-baseline-v1/baseline.json) binds every one of the 25 source SQL file hashes, both actual ledger entries, all 23 legacy exclusions, the observed schema and a private snapshot-content digest. All eleven migrations with actual top-level reference data writes are enumerated with their target tables. Their disposition is to **preserve current state and never replay**. Fresh seed equality is not required: catalog edits, reservations and progress may legitimately differ. Trigger definitions, extra historical ProofLab tables, task column order and the stronger users password-iteration default of 250,000 are preserved.

This is an explicit maintenance starting state. Schema/data presence is not used to assert that historical SQL ran. No `d1_migrations` record was inserted, no production schema or row changed, and no historical effect was silently reapplied.

The [executed summary](evidence/d1-present-state-baseline-v1/summary.json) records two isolated rehearsals against the actual private restored state:

- A temporary 0026 fixture adds exactly one new rehearsal table on a disposable clone. All preexisting table inventories—including accounts, tasks, research and immutable audit state—remain identical. Only that exact forward SQL file is staged; no legacy file is copied.
- A duplicate users-column ALTER is rejected on the clone. A separate transactional DDL failure rolls back completely. The original restored snapshot remains unchanged.

The rehearsal migration is not a repository migration and was never applied remotely. Candidate SQL is additionally checked by SQLite's authorizer: ATTACH, VACUUM INTO, virtual-table creation and unsafe PRAGMAs cannot access files outside the clone. These rejections happen before the offending operation executes. Remote restore/cutover, point-in-time RPO/RTO, external audit and secure backup erasure are not established by this local exercise.

## Repeatable forward path

1. Work from protected, qualified website source. Obtain a fresh private D1 export and restore it privately. Keep credentials and rows outside Git/logs/public assets. Run the existing schema preflight and compare its digest with the restore.
2. Keep `migrations/0001`–`0025` byte-identical to the baseline. Add only contiguous new migrations. Any history edit, schema drift or actual-ledger drift requires an explicit baseline advancement and review; never silently loosen the manifest.
3. Generate an exact clone-tested plan, using new output paths:

```sh
python scripts/d1_forward_migrations.py \
  --database /PRIVATE/FRESH_RESTORE.sqlite \
  --baseline docs/evidence/d1-present-state-baseline-v1/baseline.json \
  --output /PRIVATE/NEW_PLAN.json
```

4. Review every changed table and the complete SQL. The plan prints a SHA-256. Regenerate and stage with that exact hash:

```sh
python scripts/d1_forward_migrations.py \
  --database /PRIVATE/FRESH_RESTORE.sqlite \
  --baseline docs/evidence/d1-present-state-baseline-v1/baseline.json \
  --output /PRIVATE/NEW_STAGED_PLAN.json \
  --stage /PRIVATE/NEW_ISOLATED_STAGE \
  --plan-sha256 REVIEWED_PLAN_SHA256
```

The fresh source snapshot must match the same plan, including its data inventory. Staging rejects changed SQL, forged legacy entries and existing output directories. The generated Wrangler configuration points at a directory containing **only** the pending forward files and the existing D1 identity. It does not deploy a Worker or run SQL remotely.

5. Immediately before any separately authorized production apply, recheck the authenticated live schema and actual ledger against the plan. If either changed, stop and replan. Check the staged file hashes, retain the private backup, and use only the isolated configuration:

```sh
npx --no-install wrangler d1 migrations list pcs-commons \
  --config /PRIVATE/NEW_ISOLATED_STAGE/wrangler.jsonc --remote
# After SQL/backup review and the live readback, apply ONLY that isolated set:
npx --no-install wrangler d1 migrations apply pcs-commons \
  --config /PRIVATE/NEW_ISOLATED_STAGE/wrangler.jsonc --remote
```

6. Read back the new objects and actual ledger entries, test the application, and retain a separately versioned baseline advancement for the next migration. Do not overwrite this baseline or older evidence. The tool does not automatically authorize the new SQL, prove arbitrary migration correctness, or decide whether a data-changing migration is appropriate.

The current qualified source has no migration after 0025, so the current forward plan is empty. The website release needs **no production D1 migration**.
