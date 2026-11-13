# PCS Cron recovery — qualification and production admission

**Date:** 2026-11-13  
**Status:** STAGED / NOT PRODUCTION-CLEARED  
**Implementation:** draft PR #152, stacked on #151.  
**Targeted independent CI:** [Cron Recovery Qualification run 43392272928](https://github.com/Tommaso-R-Marena/proof-carrying-science-site/actions/runs/43392272928) — **50/50 tests passed** (27 Node tests; 12 isolated SQLite tests; 11 tests against the captured production schema), plus `node --check`, `wrangler deploy --dry-run`, and an actual local Wrangler `scheduled()` invocation with local D1 (success, intentional mail outage, synthetic expiry + hash-archive evidence, repeat-run idempotency, and injected DB failure). The job did **not** deploy.  
**Unresolved source qualification:** [Open PR source reconciliation run 43387807628](https://github.com/Tommaso-R-Marena/proof-carrying-science-site/actions/runs/43387807628) failed because the pinned source-intake policy in `scripts/check_reconciled_prs.py` forbids changes to qualified non-control source bytes or file census. That is a genuine protected gate requiring independent owner-approved requalification, **not** a test to delete or waive.

## Fresh read-only production schema equality check (2026-11-13)

A current Cloudflare read-only D1 metadata query was compared in bounded groups against the existing source-pinned `docs/evidence/production-d1-recovery-v2/captured-schema.json` record (capture 2026-10-13). **All 96 named non-internal schema objects matched their exact SQL definitions, types, names and table owners; zero missing, extra, or definition mismatches.** Queries only accessed `sqlite_master` through the existing fixed allowlisted schema SELECT; they did **not** query application/account rows or execute SQL mutations. Because the connector abbreviates large returned strings, the comparisons were performed inside the Cloudflare execution environment, before truncating the response, in six independently bounded groups (37 + 21 + 10 + 10 + 7 + 11 objects).

This confirms compatibility of the local schema-rehearsal fixture with the observed current D1 *schema*, but it does not establish exact live row state, production backup/restore correctness, migration ledger chronology, or safe production migration authority. Those gates remain open.

## Trust and scope

The Worker is an application coordinator, not the scientific authority. Its Cron maintains task reservations, notifications, sessions and an audit journal. None of this can certify scientific results or modify PCS formal source.

No live changes were made to the Cloudflare account, Cron trigger, credentials, billing, D1 data, production deployments, or unrelated resources.

## Old failure modes and new mitigation

| Failure / adversarial condition | Design | Verification |
| --- | --- | --- |
| Expiry update succeeds but audit notification insert fails | One D1 `batch()` transaction containing conditional status update, deterministic audit intent, and on-site notification intent | Real SQLite fault injection triggers INSERT abort and verifies rollback of all three operations |
| Cron crashes after legacy audit insert before hash-chain append | `reconcileExpiryArchive` scans only Cron-owned expired-task audit records lacking an archive event and invokes the existing idempotent `archiveLeanEvent` | Mocked interrupted append/replay plus real SQLite orphan-intent selection |
| Two Cron invocations retry the same task | Stable `cron-expiry:<request-id>` and `cron-expiry-note:<request-id>` identifiers; conditional `approved`-only update | Repeated transaction tests: one audit, one notification |
| First duty fails and reminders never execute | Independent sequential duties with sanitized failure report and aggregate rejection | Existing PR #151 tests |
| Session cleanup fails partway | One transaction containing the five hygiene statements, isolated from other duties | JS duty test; no claim of full production restore test |
| Immutable archive row has a matching legacy ID but conflicting action, subject, timestamp or detail | Recover-by-ID is no longer accepted; select conflicting rows as incomplete, reject conflicts and verify an exact archive postcondition after append | Captured-schema divergence tests and Node failure-injection tests |
| Admin review notifications unnecessarily copy email, names or credential level | Store generic task/skill reminders and authenticated dashboard links; remove unnecessary personal-data reads | Privacy regression executing actual Worker reminder function against synthetic sensitive fixtures |
| Reminder-ID collision silently suppresses an admin notification | Replace ignore-on-unique failure with a failing insert while retaining same-kind replay idempotency | Real isolated SQLite ID-collision control |
| Expiry mail outruns hash-linked audit | Cron mail lookup requires matching archived expiry event before allowing external delivery | Isolated SQLite rejection before archive and positive delivery eligibility after archive |
| Forged archive identifier reuses an expiry ID but has the wrong action | Email readiness now requires exact legacy-event binding, archived action, subject type and subject ID, not just matching event ID | Captured-production-schema regression with deliberately mismatched archived action |
| Email fails or Cron restarts | Mail intent is stored first; separate `cron_delivery_attempts` table records claims, leases, retries and acknowledgments | Real SQLite lease/next-attempt test and JS provider-failure tests |
| Message recipient not verified or deleted | Site notification may remain; external mail is disabled unless verified / admin address configured | JS recipient tests and SQLite cascading deletion test |
| Unbounded database/email work | Per-run limits, explicit failures on over-limit backlog, five-attempt cap | JS bounded-load tests |

## Resend-specific duplicate-reduction layer

For **Cron-owned** outbound email only, the Worker derives a stable `pcs-cron-v1-` idempotency key using SHA-256 of a domain-separated, internal notification ID and passes the key to Resend's `POST /emails` endpoint. Provider test fixtures verify the header is present on Cron messages, the same notification gets the same key on retries, a different notification has a different key, and ordinary transactional emails remain unchanged. The internal notification identifier is not itself transmitted in this header.

Resend documents an [Idempotency-Key header on `POST /emails`](https://github.com/resend/resend-openapi/blob/main/resend.yaml) and a **24-hour replay window**. This protects only requests processed on Resend within that window with unchanged body; altered payloads can receive HTTP 409, and attempts sent over the separate Gmail relay are not protected by Resend's key. It cannot turn the entire mail workflow into exactly-once delivery. The D1 outbox remains the durable, bounded retry source, and provider ambiguity remains visible in the audit/operations report.

## Important limitations

1. **Email is at-least-once, not exactly-once.** A provider can accept a message and a subsequent database acknowledgement can fail. Provider-side idempotency or an acknowledged reliable relay is needed to eliminate duplicate sends. Never claim otherwise.
2. **The hash-linked audit archive is recoverable from committed intents, not a single atomic transaction with the app row update.** Recovery is sequential and may lag after a crash; the journal must not claim complete archival while reconciliation is pending.
3. A missing task audit intent can still occur if other, non-Cron code changes task statuses outside this path. Scope remains only scheduled expiry.
4. The outbox gate does not send task-expiration email before hash-linked archival; site notification rows may still be visible while recovery is pending. The helper preserves existing `appendAuditArchive` behavior; its race logic and cryptographic trust root require independent verification. The new fixture does not prove global correctness.
5. Admin notification `kind` uniqueness before this change was inferred by application checks rather than enforced by a database unique index. The new deterministic ID enforces uniqueness for newly created Cron-owned records.
6. Pending/failed messages from historical pre-migration notifications are intentionally not auto-replayed unless they carry the new `cron-` prefix. This avoids accidentally resending old mail.
7. Failed mail attempts after exhausting five tries remain visible as failed records but need an operator monitoring and manual-retry process.
8. Current tests use bounded synthetic fixtures; real concurrency on Workers/D1, actual email provider ambiguity, restore rehearsal, latency/CPU budget and user consent flows still require separate isolated validation.

9. Current admin reminders avoid unnecessary name/email/competency-level copies, but their deterministic kind keys still contain opaque application/user identifiers; existing historical notifications are not rewritten or deleted.
10. An attempted send and a concurrent account deletion cannot be made atomic across D1 and an external mail provider; provider-side idempotency and further data-retention review remain necessary.

## Production admission sequence (must remain blocked until all steps pass)

1. **Owner review of changed source and governance:** qualify the new Worker/module/test bytes and migration without weakening `scripts/check_reconciled_prs.py`, its pinned intake, or `site-full-gate`.
2. **Resolve D1 issue #93:** Existing production migration ledger has missing historical entries and schema differences. A generic `wrangler d1 migrations apply --remote` can be dangerous. Do not apply missing migrations or backfill their names speculatively.
3. **Back up / rehearse:** capture an approved D1 recovery point; restore to an isolated database; compare schema objects, historical data invariants, account deletion and audit hash-chain continuity. Owner approves an exact migration plan.
4. Apply `migrations/0026_cron_mail_outbox.sql` **only to the isolated database first**, then replay concurrent expiration failures, notification retries, user deletion, and bounded Cron execution.
5. Verify existing non-Cron authenticated routes and signatures remain unaltered, including permissions, rate-limit behavior, audit archive, and `README` trust language.
6. Require the protected full website gate, this Cron qualification job, independent reviewer approval of exact SHA, and an explicit deployment authorisation. A passing dry run is not a successful deployment.
7. Roll out only after separately authorizing production schema migration and Worker deployment with a reviewed rollback and recovery plan. Code rollback never reverts D1 schema/data writes.
8. Monitor Cron errors, backlog and failed emails, compare against baseline, then close out the change only with recorded evidence.

## Rollback and recovery

No rollback is necessary now: the current production website is untouched. After an approved production release, reverting Worker code **does not** undo newly created D1 tables or state. Preserve recovery point and schema snapshots before starting. Do not drop new tables or restore a historical D1 timestamp without independent impact assessment.

## Follow-up candidates

- Explicit operator alert and manual-retry process for permanently failed email.
- Provider-idempotency header or durable acknowledged relay, after transport-specific verification.
- Index/query-plan optimization after migration-ledger review.
- Token scope transition for Codex and deploy provenance monitoring under separate owner authorization.
- Pilot instrumentation for independent proof checks, with appropriately bounded statements of authority.
