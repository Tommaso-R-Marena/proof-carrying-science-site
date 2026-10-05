# PCS reviewed free-tier infrastructure policy

PCS should stay inexpensive enough to operate before commercial revenue while making every stateful or potentially billable dependency explicit.

## Active infrastructure

| Capability | Service | PCS use |
| --- | --- | --- |
| Static hosting + edge delivery | Cloudflare Workers Free static assets | Public PCS website |
| Commons account/API runtime | Cloudflare Workers Free | Authentication, contributor profiles, task access, founder review, scheduled cleanup |
| Commons durable state | Cloudflare D1 (`pcs-commons`, US jurisdiction) | Accounts, hashed session/recovery state, verified levels/skills, task requests, submissions, notifications, audit records, rate limits |
| TLS / workers.dev hostname | Cloudflare Workers Free | HTTPS production endpoint |
| Aggregate visitor/performance analytics | Cloudflare Web Analytics | Privacy-first traffic and Core Web Vitals |
| Request/error visibility | Cloudflare Workers Logs | Short-retention diagnostics with query strings redacted |
| Error grouping | Cloudflare Workers Issues | Production failure triage |
| Search-engine notification | IndexNow | Deployment-time URL notification |
| Repository + CI | GitHub | Source control and website integrity gates |
| Synthetic uptime/smoke check | GitHub Actions | Daily checks of public PCS endpoints |
| Dependency update proposals | GitHub Dependabot | Monthly review-only npm and Actions PRs |

D1 is available on Workers Free. As of October 2026, Cloudflare documents the free allowance as **5 million rows read/day, 100,000 rows written/day, and 5 GB total storage**. The Commons pilot is expected to be many orders of magnitude below those limits, but D1 limit errors must fail visibly rather than degrading authorization semantics.

The repository's `scripts/check_free_infrastructure.py` gate protects this posture. It permits exactly the reviewed `COMMONS_DB` D1 binding and rejects silent addition of other stateful Cloudflare products.

## Account/data boundary

The D1 database is a **coordination and authorization plane**, not the scientific data plane.

Stored Commons state includes:
- name + email;
- password verifier/salt and recovery-code hash (never plaintext password/recovery code);
- verified PCS level and task-specific skill status;
- self-reported availability/interests;
- task applications, AI-use/verification plans, reservation/checkpoint state;
- contribution summaries and optional external artifact/PR links;
- review decisions, notifications, audit events, and abuse-rate-limit counters.

The browser Project Mapper, package inspection, verifier fixtures, scientific package tools, and pilot-intake tooling remain local-first. Do not send PHI, regulated data, signing keys, confidential partner datasets, or unpublished scientific artifacts into the Commons account API.

## Authentication / task-abuse controls

The current pilot uses:
- PBKDF2-SHA256 password derivation at 250,000 iterations;
- random 256-bit session tokens, stored server-side only by SHA-256 hash;
- `HttpOnly; Secure; SameSite=Lax` session cookies;
- one-time recovery codes displayed once, stored only by hash;
- same-origin checks on state-changing requests;
- failed-login lockouts;
- D1-backed per-IP rate limiting (IP is salted+hashed before storage);
- a registration honeypot;
- no user-editable contributor level;
- exact verified-skill gates for high-trust tasks;
- pending high-tier applications never reserve work;
- 24-hour first progress checkpoints and automatic stale reservation release.

Turnstile is a sensible later addition if public abuse warrants it. If added, server-side Siteverify validation is mandatory; displaying a widget without Siteverify is not considered protection.

## Email

The application always stores durable in-app notifications.

`src/worker.js` also contains a transactional-email adapter for Resend:
- `ADMIN_EMAIL` is the founder notification destination;
- `RESEND_API_KEY` is a Worker secret;
- `MAIL_FROM` is the configured transactional sender;
- no email credential is committed to Git.

Until those sender credentials are configured, email delivery is reported as `disabled`, while the in-app decision remains available.

Cloudflare Email Service can send to arbitrary recipients on Workers Paid. Free-plan sends to verified destination addresses are possible, but a sender address still requires an onboarded domain. PCS currently uses the `workers.dev` hostname, so a verified custom email sender or a separate transactional provider is still required for automatic approval emails to arbitrary contributors.

## Deliberately not provisioned

KV, R2, Queues, Durable Objects, Vectorize, Workers AI, Browser Rendering, Hyperdrive, Containers, and similar services are not enabled merely because a free allocation may exist. Each adds cost/privacy/operational surface and requires deliberate review.

## Safety rules

No automated dependency update is merged automatically. Dependabot may open a pull request, but normal PCS checks and human review remain required.

No financial sponsor, contributor rank, or backend role can cause a technical PCS assurance claim to pass. The Commons coordinates work; the proof/replay/review boundary remains authoritative.
