# Production D1 schema preflight

The new `scripts/d1_production_preflight.py` executes two fixed metadata-only SELECTs against the existing database: schema objects and migration names. It never reads account/game rows or applies migrations. Credentials remain in environment bindings; public output contains schema hashes, object names, layout differences and migration source hashes. Five adversarial/local tests exercise query allowlisting, provider mutation/error rejection, historical data-effect boundaries, actual default/order drift, and schema statement/resource limits.

The actual production read found 96 objects, no missing source objects, and only `0024_countermodel_lab.sql` and `0025_bridge_research_sessions.sql` in the migration ledger. Twenty-three historical source migrations are unrecorded. Extra objects include the migration ledger and pre-existing ProofLab table/indexes. Thirty-nine object definitions differ bytewise; empty local schema reconstruction narrows table/index layout differences to `tasks` (column order) and `users` (column order plus `password_iterations` default 250000 in production versus 100000 in source). Matching columns/index layouts do not establish equality of all constraints or trigger behavior.

The historical default differs from current explicit account creation, which writes 100000 and notes the Worker Web Crypto bound. Schema metadata does not show which existing credentials use that default. No account rows, password hashes or credentials were examined. This default must be reviewed with the historical authentication migration before reconciliation; silently rebuilding the table or replaying authentication migrations would be unsafe.

Evidence is `docs/evidence/production-d1-preflight-v1/schema-preflight.json`. Current schema presence does not prove that historical data-changing SQL ran. Issue #93 remains open. No ledger backfill, production schema write, production backup restore or paid service was performed.

Owner reproduction:

```bash
python scripts/d1_production_preflight.py --database <existing-database-id> --output <private-output-path>
python tests/test_d1_production_preflight.py
```

Before any future schema change: preserve an authorized backup, review every unrecorded data effect and definition difference, run proposed changes on an isolated restored copy, inspect account/task/donation/audit preservation and only then authorize the specific production change. This tool deliberately offers no apply or backfill command.

The production D1 parser/planner also accepted the exact new atomic admission statement under `EXPLAIN QUERY PLAN` (15 plan rows, zero rows written). The INSERT was never executed by this probe. This qualifies SQL syntax/planning compatibility, not production admission races or recovery. Exact SQL/source hashes are in `docs/evidence/production-d1-preflight-v1/atomic-admission-explain.json`.
