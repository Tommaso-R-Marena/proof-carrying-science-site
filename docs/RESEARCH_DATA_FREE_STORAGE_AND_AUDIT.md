# Free-tier storage decisions and admin audit UX (October 2026)

## Current implementation

The **PCS Commons D1 database is the system of record** for contributor accounts, admin sessions and the hash-linked audit archive. It also owns the two user-deletable, research-consent-gated adult opt-in datasets:
- `proof_order_research_attempts`: puzzles, versions, server-scored orderings, hint counts;
- `safety_forge_research_sessions`: selected synthetic mission actions and deterministic server-replay labels.

The dashboard now presents **5 recent approval decisions** and **10 recent admin actions**. Clicking **Browse complete audit database** fetches older pages from D1 (25/50/100 at a time) with optional server-side search. The complete archive is **not truncated** to this display limit. All pages require the dedicated admin session. Audit archive hash-chain verification is requested separately and never bypassed; it does not rerun on every page request.

The Arena section has a **Founder/Owner-only storage summary** (record counts and approximate JSON payload bytes). It intentionally does not enumerate individual players and does not expose identity-linked training examples in public endpoints.

## Why not put personal information in a second database immediately?

Cloudflare's **Workers Free** currently includes:
- **D1**: 5 million rows read/day, 100,000 rows written/day, 5 GB total across databases but only **500 MB per Free-tier database** (and 10 databases max).
- **Durable Objects**: **SQLite-backed Durable Objects only** on Free; 100,000 requests/day, 13,000 GB-seconds/day and **5 GB combined object storage**. Avoid storing duplicate personal profiles and gameplay in both D1 and DO unless consent withdrawal, data export and account deletion are atomic or independently reconciled; otherwise “delete my data” can silently miss one copy.
- **Workflows**: included on Free, currently **3,000 steps/day**, 1 GB-month of execution state and 10 ms active CPU per invocation. Workflows are orchestration, **not a substitute for a searchable research database**.

References (limits may change): 
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/platform/limits/
- https://developers.cloudflare.com/workflows/reference/pricing/

## When to introduce each service

1. **Continue using D1 for authenticated, replay-checked data and audit events now.** Monitor the dashboard's approximate opt-in payload usage and the Cloudflare D1 capacity panel (which also counts indexes, account rows and audit tables). Minimize duplicate game entries and preserve the existing per-account deletion paths.
2. Add a **SQLite-backed Durable Object** for *new* high-frequency, multi-user collaborative simulation state or per-session replay editing **only when concurrent state coordination becomes necessary**. Before enabling adult telemetry, implement user-indexed deletion, bounded sample retention, consent/version checks at the Worker boundary, end-to-end exact-session replay checking, and dual-store failure recovery; never move authentication or audit custody casually.
3. Add **Workflows** if a multistep, retryable operation actually arises, for example an owner-approved, deidentified dataset snapshot requiring explicit human review and expiry. Prefer the existing scheduled Worker cron for small periodic housekeeping; adding an idle Workflow is not intrinsically helpful.
4. When data becomes large, plan an **append-only, researcher-approved deidentified export** with dataset version, simulator/puzzle version, verifier hash, aggregate counters, deduplication and train/test split by scenario family. The synthetic nature of the labels must remain explicit; no stored game result is a Lean theorem or demonstrated model improvement.

## Consent, deletion and safety

Playing either game is local and available to all ages, but **research donation requires a separate explicit action from a signed-in user who attests to being 18+ and has verified email**. The server rechecks and labels submissions and enforces daily caps. Saved rows remain linked to the account *privately* for erasure, while owner-only training exports omit names, email addresses, account IDs and precise timestamps.

Active D1 rows can be deleted by the donor; historical exports, backups and weights trained on prior data may not be fully retractable. Do not start a high-frequency client event collector without new consent copy and an audit of deletion/retention semantics.

The complete audit archive remains D1-backed with existing no-update/no-delete SQL triggers and a hash chain. The UI is deliberately an inexpensive window into that archive, not a retention policy and not a way to clear it.
