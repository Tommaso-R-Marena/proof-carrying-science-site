# Public hosted verification replaces Cloudflare Builds

GitHub Actions is the authoritative CI for the public repositories. Website
`site-full-gate` and core `verified-public-integration` remain strict required
checks with no bypass. A green deployment, skipped job, or separately failing
Cloudflare status does not substitute for these gates.

The website gate runs frozen dependencies, the complete Node/static/security
suite, a deployment dry run, independent Python game/Omega parity, seven actual
Lean countermodels, and isolated real browser/account/research checks. The
supplemental hosted `site-check.yml` restores the existing responsive layout
gate. Daily/manual `live-health.yml` now runs read-only production checks from
public main, including the live demo and Omega workspace. No CI job receives
Cloudflare deployment credentials.

The layout gate retains all ten geometric cases and drives the local probe with
the existing pinned Playwright dependency, blocking third-party requests. Its
loaded mobile package case exposed a 670px document in a 390px viewport. The
member inventory now scrolls inside a focusable region without widening the
page; the real case passes at 390px. Health checks cover 21 endpoints, and the
stale Arena text assertion is replaced with the current page title.

Archive and promotion workflows in both repositories previously could never
run: they listened for pull requests while requiring a non-PR private-runner
event. They now run on disposable `ubuntu-24.04` runners for public owner
repositories. Existing workflow/job/step identities are preserved because the
Commons backend verifies those actual dedicated jobs before integration.
Core dependency installation uses hash-locked requirements; checkout credentials
are not persisted. Contribution syntax/elaboration is separate from scientific
validity.

`scripts/check_pr_contributions.py` also binds actual changed archive/promotion
file gates into the protected aggregate. It requires an exact base SHA and known
repository, invokes the existing digest and exact-diff validators, and rejects
deletions rather than skipping them. Seven tests use real temporary Git histories
to check valid archives/promotions, tampering, unmapped files, archive removal,
ordinary source changes and missing/invalid metadata.

Cloudflare continues hosting the production Worker/assets and D1 database.
The owner reports disconnecting the redundant `pcs-core-ci-only` and
`pcs-core-ci-gate` Git build integrations. Keep the website's
`proof-carrying-science-site` Git connection active for automatic production
deployment. The intended website policy is protected `main` only, with preview
and pull-request builds disabled; provider readback is still needed to verify
that policy. Its configured build command is `npm run ci:zero-minutes`, deploy
command is `npx wrangler deploy`, and root is `/`. GitHub Actions remains the
required verification gate before changes reach protected `main`.

Do not disconnect the website Git connection unless a replacement automatic
deployment has been implemented and verified. Preserve the Worker, all bindings
and database. An explicit deployment after CI uses `wrangler deploy --keep-vars`
to preserve dashboard variables. No automatic production migration is introduced.

Provider retirement must be read back or otherwise independently observed.
Changing repository YAML does not disconnect Cloudflare. The existing
account-owned deployment token authenticates Worker operations but Builds
administration returns 401/12006. Cloudflare's Builds documentation currently
requires a user-owned token. A separate secure environment binding,
`CLOUDFLARE_BUILDS_API_TOKEN`, is reserved for that credential; its value must
never be committed or pasted into chat. The owner has deferred adding it, so
Builds logs, core disconnection readback, website branch isolation and the latest
website build failure remain unverified. Successful protected CI and explicit
deployment do not establish that Cloudflare Builds passed.
Historical failed Cloudflare check runs are retained as history; do not rewrite
their conclusions to create artificial green evidence.
