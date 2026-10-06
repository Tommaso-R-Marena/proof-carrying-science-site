# PCS website public-source readiness — 2026-10-06

**Status: PRIVATE; publication not approved yet.** The website's public URL does **not** imply the source or git history is safe to disclose.

## Required before changing repository visibility
1. **License/ownership:** This repository currently does **not** have a root `LICENSE` file. Choose an explicit license for the static website, Worker backend and contributions before release. Do not assume the core's Apache-2.0 license automatically applies. Ask for contributor/IP-owner approval where relevant.
2. **Secret/history review:** Verify full Git history and ALL branches/tags, open and closed PR comments, workflows/build artifacts. Audit Cloudflare Worker and D1 identifiers; authorization and API security code, example email addresses, personal contact information, Apps Script email transport credentials, owner credential handling, GitHub token patterns, any accidental `.env`/secrets files, historic private URLs and source maps. Rotate any leaked secret, including if only found in previous commits. Only safe names and placeholders may appear in source.
3. **Secure public PR CI:** `site-check.yml` has read-only `contents: read`, disabled checkout credential persistence, source/static/security/free-infrastructure tests, two isolated Node mock integration suites, and Wrangler dry run. Avoid `pull_request_target` for untrusted PR execution. No Worker secret or D1 production binding must be available to PR jobs.
4. **Live infrastructure separation:** Public GitHub source does not itself publish Cloudflare secret values or D1 rows, but historic commits and misconfigured Actions logs might. Check that public access to `/admin` and `/api/admin` never authorizes privileged actions and that contributor authorization stays server-side. Review CORS, CSRF, rate limits, upload controls and signed claims.
5. **Branch protections and repo settings:** After visibility conversion, review protections: GitHub warns **push rulesets are disabled** by private→public. Re-enable/reassess protection before allowing external contributions. Enable review for outside collaborator PRs, enforce required `PCS website integrity gate / site-check` (and separately applicable promotion/submission checks), linear-history/review expectations, and least-privilege Actions. Confirm that a failing PR cannot merge.
6. **Human review:** Founder approves actual source/history disclosure, selected license, contributor guidelines, policy links and a dated release tag. Nothing in this change makes the repo public.

GitHub docs: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility

## Current open website PR triage
- **#30** `actions/checkout` v4 → v7; diverged, about 217 commits behind `main`. Do **not** merge old branch wholesale; regenerate from current `main` after action-version/supply-chain review.
- **#31** `actions/setup-python` v5 → v7; same age/conflict. Refresh separately, review official release notes and pinned integrity.
- **#32** Wrangler version bump on stale branch, approximately four commits behind `main`, and package dependency currently intentionally pinned. Refresh on current `main` after build compatibility checks.
- **#39** responsive guided UX + CI (~211 commits behind, mergeable=false). Recent site work has changed UI extensively. Compare actual guided-flow behavior and layout test semantics; port only verified missing fixes onto a new PR from `main`.

All 4 PRs were open and reported non-mergeable at audit. **None is to be force-merged.** Historical merged `ux/`, `product/`, `formal/`, `fix/` branches are not to be merged wholesale. A previous squash merge can leave a branch appearing divergent despite its code already being incorporated.

## Relationship to GitHub Actions quota
Standard GitHub-hosted runner use on public repositories is free; on a private repo hosted-minute exhaustion still prevents fresh runner execution. Website production Cloudflare builds can validate a deployed version, but do not replace all exact-head GitHub PR checks. Preserve any existing protections until independent checks execute.
