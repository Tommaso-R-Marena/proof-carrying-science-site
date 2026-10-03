# PCS zero-cost infrastructure policy

The public PCS demo is intentionally deployable without a payment card and without a paid infrastructure dependency.

## Active, card-free services

| Capability | Service | PCS use |
| --- | --- | --- |
| Static hosting + edge delivery | Cloudflare Workers Free static assets | Public PCS website |
| TLS / workers.dev hostname | Cloudflare Workers Free | HTTPS production endpoint |
| Aggregate visitor/performance analytics | Cloudflare Web Analytics | Privacy-first traffic and Core Web Vitals |
| Request/error visibility | Cloudflare Workers Logs | Short-retention operational diagnostics |
| Error grouping | Cloudflare Workers Issues | Production failure triage |
| Search-engine notification | IndexNow | Deployment-time URL notification |
| Repository + CI | GitHub | Source control and website integrity gates |
| Synthetic uptime/smoke check | GitHub Actions | Daily checks of public PCS endpoints |
| Dependency update proposals | GitHub Dependabot | Monthly review-only npm and Actions PRs |

The repository's `scripts/check_free_infrastructure.py` gate protects this posture. It fails CI if stateful Cloudflare bindings are introduced without explicit review.

## Deliberately not provisioned

D1, KV, Queues, Durable Objects, Vectorize, AI bindings, Browser Rendering, Hyperdrive, Containers, and similar services are not enabled merely because a free allocation exists. The current public demo has no server-side scientific-data ingestion path, so these services would add complexity and privacy surface without product value.

Turnstile should be added when PCS gains a server-side public form or API that can actually be abused. Until then there is no challenge endpoint to protect.

R2 is excluded from the current no-card architecture because activating it can involve a billing/subscription setup even though it has a free usage allowance.

Cloudflare Email Routing requires a domain in the Cloudflare account. PCS currently uses the workers.dev hostname, so routing is deferred until a domain is intentionally attached.

## Safety rule

No automated dependency update is merged automatically. Dependabot may open a pull request, but the normal PCS checks must pass and the change must be reviewed before merge.

No scientific files, signing keys, PHI, regulated records, or confidential customer data belong in the public website stack.
