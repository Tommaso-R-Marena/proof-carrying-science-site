# Cloudflare infrastructure handoff — read-only baseline (2026-11-13)

> **Status:** Evidence-backed inventory and staged implementation plan. **No production changes, migrations, secrets reads, deployments, billing changes, resource creations, or policy approvals were performed.**
>
> **Owner gate:** Changes to protected source/qualification/authority policy, CI enforcement, production resources, access rights, credentials, or bills require separate owner review and explicit approval. This document **does not** confer such authority.

## Purpose and boundaries

Define a verified starting point for deploying PCS as an independently checkable scientific and AI-safety verification service. Maintain PCS core as the authority for its specified formal checks; Cloudflare handles presentation, access, dispatch, availability, and optional evidence storage, never scientific truth by itself.

Included: existing `proof-carrying-science-site` Worker, two historical PCS CI Workers, its D1 binding, site repository, deployment controls, and proposed verification-service delivery path.

Excluded: `warriors-paradise-field` Pages project / `Warrior-s-Paradise` repository, other unrelated applications, and all FoldBounds core mathematics. They must not be automatically optimized or redeployed.

### Evidence collected

Snapshot from connected Cloudflare account API and GitHub connector on 2026-11-13; only inventory GET operations and a **read-only D1 schema SELECT** were used. No user rows or credential values were queried.

| Scope | Observed state |
| --- | --- |
| Account | One account accessible through the connected session; one listed member with Super Administrator role. |
| Account security | Listed user has `two_factor_authentication_enabled: false`; account `settings.enforce_twofactor: false`. **Urgent owner-operated remediation.** |
| Zones and custom domains | Account API listed zero zones and Worker-domain bindings. Do not assume zone WAF/DNS rules protect the `workers.dev` site. |
| Worker scripts | `proof-carrying-science-site`, `pcs-core-ci-gate`, `pcs-core-ci-only`. The latter two show no scheduled triggers or bindings in their script settings. Do not delete without confirming purpose and traffic. |
| PCS Worker | Built with Wrangler; static assets and Worker API; `compatibility_date: 2026-09-28`; observability/logs enabled, query-string redaction enabled, traces disabled. |
| PCS bindings | Assets + `COMMONS_DB` (D1), two nonsecret plain-text variables, and five secret bindings. **Secret values were not requested or inspected.** |
| PCS schedule | Hourly `0 * * * *` Cron trigger. Inspect its handler and external effects before changing. |
| Site deployment | Latest Worker deployment returned for 2026-11-05 21:11:53 UTC; deployed version ID `d76b61d6-b044-4fe3-92bf-0295c00de472`. The active version was reported as 100%. Do not infer which newer repository commits should be deployed. |
| Website repo | `Tommaso-R-Marena/proof-carrying-science-site`, default `main`; existing `wrangler.jsonc`, release checks, D1 schema/migration preflight, and protected review procedures. Snapshot main SHA: `e8136625c463b271364b36b2b8ae76f8777f1967`. |
| Production D1 | `pcs-commons` bound to website Worker. A read-only `sqlite_master` count returned **37 tables, 50 indexes, 10 triggers**. The D1 database listing's `num_tables: 0` is misleading and must not be used to conclude the DB is empty. No data was read or written. |
| D1 existing caveats | Repository's `docs/PCS_PRODUCTION_D1_PREFLIGHT_V1.md` already documents historical migration-ledger gaps and nonidentical definitions. No production reconciliation, ledger backfill, or schema rewrite is authorized by this report. |
| R2 | Bucket listing returned a provider error indicating R2 must first be enabled in the dashboard. It is **not assumed available**; do not enable it without cost/privacy review and owner approval. |
| Queues | Zero Queues returned. Do not provision one until traffic, retry, idempotency, and pricing requirements are specified. |
| Pages | One separate unrelated Pages project: `warriors-paradise-field`. This is out of scope; make no changes. |
| Account audit logs | Account audit API returned no entries in the queried period starting 2026-11-12 00:00 UTC. This does **not** demonstrate that no agent or external tool made changes outside the queried scope. |
| Preview configuration | `wrangler.jsonc` sets `workers_dev: true`, `preview_urls: false`, and a preview binding config with no D1 database. Verify preview isolation in an actual test; do not presume all resources or side effects are isolated. |

### Immediate security priorities

1. **P0 — Owner action: enable phishing-resistant MFA** for the Cloudflare administrator. This requires account-owner interaction; do not attempt to enroll an MFA factor automatically.
2. **P0 — Agent access:** inventory existing user, GitHub, and AI-agent tokens and permission scopes. Replace broad long-lived write permissions with bounded, least-privilege and time-limited credentials after review. Do not disclose token values, delete active tokens, or rotate credentials without an explicit cutover plan.
3. **P1 — Source/deployed provenance:** reconcile exact repository revision, Worker version, release approval, and available rollback. Do not auto-deploy newer main simply because its SHA differs from the November 5 deployment.
4. **P1 — Database and governance:** preserve the current production D1 schema and historical data. Execute existing fixed-query preflight and a restore rehearsal only in an approved isolated environment; do not apply or backfill migrations.
5. **P1 — Staging:** isolate test data, external action endpoints, credentials, scheduled triggers, and GitHub tokens. A preview URL alone is not a data-isolation guarantee.
6. **P2 — Observability:** define allowed non-sensitive event schemas, retention, redaction and sampling; independently verify that sensitive proof material, user data, cookies, and tokens are never logged.
7. **P2 — Bot/rate protection:** assess in-Worker rate controls and abuse scenarios. Because no zone is listed, do not claim zone WAF is protecting the `workers.dev` deployment.

## Staged implementation architecture — proposal only

```
Researcher / API client
  -> Existing public PCS Worker (routing, authentication, size and rate limits)
  -> Admission validation and explicit trust boundary
  -> Verification job dispatcher with idempotency and bounded resource use
  -> Isolated PCS trusted checker / kernel as required by the claim type
  -> Independent receiver / replay validation
  -> Versioned output package: exact inputs, pinned checker, proof/receipt,
     provenance, assumptions, exclusions and reproducible commands
  -> Content-hash-addressed evidence publishing (R2 *only if approved*)
  -> Metadata index (D1 *only after schema and privacy design approval*)
```

**Critical distinction:** The API may report `PROVEN` only for exact formally established claims under enumerated assumptions and independently verified artifacts. Ordinary numerical agreement, self-reported signatures, heuristic agreement, model assessments and browser demos must remain labeled with their narrower evidentiary status. A CDN, database, signature or AI model does not grant verification authority.

### Phase A — retain existing working system

- Obtain and reconcile Grokbot's handoff inventory and any pending autonomous jobs.
- Record Worker versions, settings, scheduled triggers and supported recovery procedures.
- Run existing source and release checks on the exact candidate SHA; record results and any skipped checks separately.
- Review auth, secret scope, logging, and Cron behavior. Make no unrelated code or policy changes.
- **Acceptance:** dated baseline, identified authority, no unknown production writes, owner-reviewed change list.

### Phase B — stage the smallest useful verification API

- Identify the *already supported* PCS and website public verification path rather than inventing a new verifier.
- Specify typed request/response schemas, maximum sizes, provenance, version pinning, meaningful error codes, finite quotas and denial behavior.
- Add negative tests for forged receipts, altered payloads, unauthorized source policy, version mismatch, retries, resource-exhaustion attempts and cross-user access.
- Build a preview with isolated data and disabled external side effects; avoid requiring new paid Cloudflare services.
- **Acceptance:** test transcript on a specific source SHA, independent fresh replay, no bypassed protected release gate; no public deployment.

### Phase C — optional durable verification jobs

- If real pilot traffic requires asynchronous verification, design Queues/Workflows with deduplication, cancellation, bounded attempts, dead-letter handling, operator observability, and cost caps.
- Keep the trusted kernel on an independently controlled environment appropriate to its actual runtime needs; do not assert that Workers themselves run Lean without an implemented and tested runtime.
- Define durable replay artifacts including binary/toolchain hashes and trustworthy trust-root distribution.
- **Acceptance:** successful bounded-job test, fail-closed adversarial controls, incident simulation and pricing review.

### Phase D — optional public evidence archive

- Consider R2 for immutable-by-convention object keys under SHA-256, with explicit artifact signing and published trust-root/rotation policy. Storage immutability and cryptographic verifiability must be separately assessed.
- D1 indexes only metadata with a documented privacy/retention regime. Store no sensitive private proof files or user research data by default.
- Implement a stand-alone receiver so an independent third party can recheck a claim without trusting Cloudflare.
- **Acceptance:** independent clean-room replay and negative controls; owner approves enabling R2 and any D1 schema changes.

### Phase E — AI-safety governed actions (research sandbox)

- Restrict an agent to explicit, narrowly formalized permitted action classes.
- Require checker-passed certificates with pinned policy/version before protected operations.
- Test adversarial tool calls, concurrent updates, stale proofs, schema confusion, replay attacks and false accepts in a **nonproduction** sandbox.
- Clearly disclaim that finite proof-gated controls do **not** establish general alignment or arbitrary scientific correctness.
- **Acceptance:** independent red-team report and tested denial behavior.

## Invariants for every subsequent PR / infrastructure proposal

- No merges or deployments without approved, passing, source-pinned release checks.
- No changing/waiving protected security, qualification, source-admission or authority gates.
- No prod D1 migration, deletion, ledger backfill, quota reset or restoration without separately reviewed backup, recovery evidence and authorization.
- No production secrets in logs, diffs, prompts or public audit artifacts.
- No unrelated Cloudflare resource changes, especially Warrior's Paradise.
- No new paid service, paid model routing, or uncontrolled job execution without cost approval.
- No claim that artifact existence, signature, numerical agreement or AI output is a formally established proof.
- Rollback instructions must specify code vs. state: reverting a Worker version does not reverse external database or object-store writes.

## Immediate next steps / open owner gates

- [ ] Account owner enables MFA and confirms new authentication path.
- [ ] Obtain Grokbot handoff and inspect for ongoing autonomous write operations.
- [ ] Read-only secret-scope/permissions inventory and source/deployment provenance review.
- [ ] Verify live Cron handler and isolation requirements.
- [ ] Confirm whether this doc accurately captures current infrastructure.
- [ ] Approve one narrowly scoped nonproduction implementation PR at a time.
- [ ] Approve resource provisioning, IAM changes, and production deployment **separately**.

This baseline is deliberately a snapshot and plan, not a security certification, complete penetration test, approved expenditure, or authorization to deploy.
