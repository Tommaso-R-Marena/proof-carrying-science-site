# PCS contribution submission → GitHub → review

## Trusted workflow

1. The Owner creates/publishes only tasks PCS currently needs, choosing an explicit delivery target: `none`, `core`, or `site`. This is **not** chosen by a contributor.
2. A worker starts an allowed task, follows its deliverable/verification/acceptance contract, and submits a summary, independent-check note, explicit AI-use disclosure, and up to 3 UTF-8 text files (20 KB/file, 40 KB total).
3. The Worker saves submission artifacts and their SHA-256 digests in D1. For GitHub-routed tasks, it *tries* to open a new `pcs/submission/<id>` branch from current `main`, uploads only into `contributions/pcs-submissions/<task>/<id>/`, generates a content-bound manifest, and opens a PR.
4. A read-only GitHub Actions job called **PCS Submission Verification** checks the manifest, digest-binding, source-syntax, and repository-specific checks. **Core repo:** run regression tests, build Lean, and elaborate contributed `.lean` files. **Website:** static path checks, script syntax, existing site/security campaigns. These checks are a prerequisite, *not scientific truth*.
5. The reviewer inspects the submitted source, CI result, AI disclosure, semantic scope, and task acceptance rules. They can request changes, reject, or accept. Code-backed submissions cannot be marked accepted without success on the precise checked PR head and exact-byte comparison against the original saved submission.
6. An authorized Owner sees **Integrate checked PR**. That action re-verifies the exact PR head and file byte inventory, then performs a GitHub squash merge and audits the result.

**Important:** Submitted code merges into an isolated `contributions/` archive, not directly into trusted PCS kernel or production website files. Promotion into verified production sources requires a separate qualified review and proof-maintenance change. This prevents the Commons submission path from bypassing the production assurance boundary.

## One-time Worker setup

- Configure a fine-grained GitHub personal access token limited to **only** `Tommaso-R-Marena/proof-carrying-science` and `Tommaso-R-Marena/proof-carrying-science-site`.
- Permissions: repository Contents **Read and write**, Pull requests **Read and write**, Checks **Read-only**, Metadata **Read-only**. Short expiration and regular rotation strongly advised.
- Store it as the Cloudflare Worker secret `PCS_GITHUB_TOKEN` using `npx wrangler secret put PCS_GITHUB_TOKEN` in the website repository root, or the Worker secrets UI. **Never paste it into a website form, GitHub issue, repository file, or ChatGPT conversation.**
- Apply `migrations/0013_submission_automation_microtasks.sql` **before** production code deployment. The existing live D1 schema was manually evolved and has no `d1_migrations` history, so do **not** blindly run all old migrations against it; reconcile migration history first. New empty installations can use Wrangler's normal migrations process. The 0013 SQL is additive and its five task seeds are unpublished drafts.
- Verify that the contributor PR workflows exist on the default branch of both repositories and that GitHub Actions runners execute the jobs. While the runner allocation issue persists, checks will remain PENDING and merges blocked.

If `PCS_GITHUB_TOKEN` is missing or GitHub rejects a request, the submitted work remains saved in D1, the stage state is **not_configured** or **error**, and the Admin Center offers **Stage / retry GitHub PR**. It never falsely reports a check pass.

## Marketing/outreach evidence

- Small marketing/QA activities can be 10 or 30 minute tasks. Ongoing campaigns belong in approved Roles.
- Every outreach submission distinguishes **activity** (e.g., independently reviewed copy, a public link, legitimate contact research) from a measurable **outcome**.
- Measured outcomes require a verified HTTPS evidence reference, specific metric and count. Allowed metrics: qualified replies, verified clicks, consenting signups and confirmed meetings. All remain **claimed** until independent review.
- Do not reward unsolicited message volume, raw post counts, scraped personal data, unverifiable impressions, or fake engagement. Proof of sending is not proof of results.
- The five seeded short tasks start as **drafts**. The Owner decides which are needed and publishes them using the audited Marketplace curation workflow.
