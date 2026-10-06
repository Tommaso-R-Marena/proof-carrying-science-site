# Website CI protection cutover

The website currently uses Cloudflare Workers Builds for production deploy. GitHub Actions can protect PRs independently. The `PCS website integrity gate` workflow runs on pull requests with read-only permissions and no Worker/D1 production secrets.

## Testable checks
- JavaScript syntax for static pages, Worker, GitHub submission gateway and production promotion engine.
- Node integration tests for safe staging and archived-source-to-production gates.
- Static site integrity checks and a static adversarial/security campaign.
- A zero-billing infrastructure posture check and Wrangler dry run.

## Cutover procedure
1. Restore GitHub-hosted runner capacity through a deliberately approved public release or safe isolated runner. Confirm checks actually execute, not merely show pending.
2. Open a disposable test PR from current `main`. Inspect logs and exact SHA. Confirm a known failure is rejected and a correct PR produces a successful **`PCS website integrity gate / site-check`** status from GitHub Actions.
3. Update the repository's branch ruleset to require the executed check, while retaining PR reviews/linear history. Avoid switching privacy or disabling existing checks as a substitute for testing.
4. Independently confirm Cloudflare builds still deploy only authorized `main` changes. GitHub PR tests do not get `PCS_GITHUB_TOKEN` or production D1 access.
5. Document the tested version, rule-set verification and change approval. Do not mix GitHub CI verification, Cloudflare deployment, and Owner-reviewed production-promotion assurance in a single unqualified “green” badge.

**No ruleset settings or repository visibility were changed by this PR.**
