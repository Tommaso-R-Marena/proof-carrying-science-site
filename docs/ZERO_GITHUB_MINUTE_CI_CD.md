# Zero-GitHub-hosted-minute CI/CD for the private PCS website

## The production path

This repository remains **private**. GitHub Actions jobs no longer use `ubuntu-latest`: all five workflows require a self-hosted Linux x64 runner labeled `pcs-ci` **and** the repository variable `PCS_SELF_HOSTED_CI_ENABLED=true`. Without the runner or this opt-in, these jobs are skipped and consume zero GitHub-hosted runner minutes.

Primary automated CI/CD uses **Cloudflare Workers Builds** (the Cloudflare build quota, not GitHub Actions):
- GitHub repository `Tommaso-R-Marena/proof-carrying-science-site`, production branch `main`.
- Production **build** command: `npm run ci:zero-minutes`.
- Production **deploy** command: `npx wrangler deploy`, only after a successful build; no build on failed checks.
- Preview **build** command: `npm run ci:zero-minutes`.
- Preview **deploy** command: `npx wrangler preview`, on non-main branches only; cannot promote a PR to production.
- Node 22 and Python 3.12 are pinned in `.node-version` / `.python-version`.
- `ci:zero-minutes` runs syntax checks, static release/zero-billing checks, security campaign, all existing Node test families and a Wrangler deployment dry-run. It does **not** require secrets or deploy from inside the check step.
- `wrangler.jsonc` keeps the live production D1 binding exactly as before but explicitly **does not bind D1 to previews**. This protects production data. Public static pages and games can be previewed; account-backed APIs will not work in previews until a separate staging D1 database and associated secrets are deliberately provisioned.

Cloudflare Workers Builds free tier currently has a **3,000 build-minute/month shared limit** with one concurrent build, and the build stops when quota is exhausted. This **is not unlimited CI**, but it avoids GitHub's hosted minutes. Monitor Cloudflare Workers > your Worker > Builds for check logs and the free quota. Production deploys may still use normal free-tier Worker/D1 request/write quotas.

### One-time configuration, performed through the Cloudflare Builds API

Existing Cloudflare worker: `proof-carrying-science-site`. Existing GitHub repository connection and build token are reused. The Cloudflare dashboard under Workers & Pages → proof-carrying-science-site → Settings → Builds displays the production and preview triggers. **Do not** recreate production Secrets in Preview, and never set the Preview D1 database to the production database ID.

### Optional self-hosted runner

A Windows 11 laptop with WSL2 Ubuntu can run a Linux GitHub Actions runner, using your own CPU and no hosted-minute allocation. Important: the runner executes code from this private repository with access to its filesystem and network. Use an isolated non-admin WSL user or VM, no saved cloud/SSH credentials, no checkout of untrusted PRs into privileged contexts, and no permanent sensitive keys on the machine.

1. Open the private repository → Settings → Actions → Runners → New self-hosted runner → Linux / x64. Follow GitHub's exact setup commands *on your own WSL Ubuntu instance*. Registration tokens expire and must not be committed.
2. When prompted for labels, add `pcs-ci` alongside GitHub's automatic `self-hosted`, `linux`, and `x64` labels.
3. Install Node 22 and Python 3.12. Keep the runner process available when checks are needed; jobs wait while it is offline.
4. Only after registration, add repository variable `PCS_SELF_HOSTED_CI_ENABLED` with value `true` under Settings → Secrets and variables → Actions → Variables.
5. In the short term, rely on Cloudflare Builds for continuous website CI. Leave the self-hosted variable disabled unless and until the runner is ready. GitHub workflow jobs will then run on your computer, and will be subject to its uptime.

GitHub's **current** self-hosted runner documentation says self-hosted jobs consume no Actions runner minutes. The proposed 2026 self-hosted platform fee was postponed; recheck terms before relying on this indefinitely.

### Scientific and release safeguards

- Cloudflare checks apply to the full website **repository**, not the external Lean core. Core Lean `lake build` belongs on an equipped separate self-hosted machine or HPC.
- The website CI includes server-side replay, synthetic game dataset, and security tests; it does not certify real AI safety or Lean proof correctness.
- Because GitHub Actions contribution/promotion checks are disabled until you opt into the self-hosted runner, **do not merge** any staged `contributions/pcs-submissions/**` or `contributions/pcs-promotions/**` changes without running the exact checks `scripts/check_contribution_bundle.py` / `scripts/check_promotion_bundle.py` with the correct base SHA. Cloudflare site CI is not a substitute for exact per-PR signed/bundle verification.
- If Cloudflare Builds cannot connect or its quota is exceeded, run `npm install --ignore-scripts --no-audit --no-fund && npm run ci:zero-minutes` on your own computer. After green checks, deploy through an explicitly approved path. Do **not** bypass verifier failures or make a private repo public solely to evade quota.
