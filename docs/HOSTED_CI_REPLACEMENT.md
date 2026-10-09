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
Cloudflare **Builds** can be disconnected once these required GitHub checks pass.
Disconnect only the Git build integrations for `pcs-core-ci-only`,
`pcs-core-ci-gate`, and `proof-carrying-science-site`; preserve the website Worker,
all bindings and database. The separate protected deployment remains an explicit
operation after CI and preserves dashboard variables with `wrangler deploy
--keep-vars`. No automatic production migration is introduced.

Provider retirement must be read back or otherwise independently observed.
Changing repository YAML does not disconnect Cloudflare. At preparation time
the existing deployment token authenticated Worker operations but Builds
administration returned 401/12006, so disconnection was not yet verified.
Historical failed Cloudflare check runs are retained as history; do not rewrite
their conclusions to create artificial green evidence.
