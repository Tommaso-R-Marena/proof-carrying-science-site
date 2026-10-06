# Proof-Carrying Science Website

Public-facing static site for Proof-Carrying Science.

Live preview:

`https://proof-carrying-science-site.marenatommaso.workers.dev`

## What is real

The site uses a deliberately small Cloudflare Worker + D1 backend only for the AI Safety Commons account/coordination layer. Scientific package inspection, project mapping, claim drafting, and verifier/browser tooling remain local-first and do not upload selected scientific files to the Commons database.

- **PCS AI Safety Commons** — a public-good contributor hub that maps bounded AI-safety work into an auditable task → obligation → claim path. The governing principle is “crowdsource the work, never the truth.”
- **Contributor accounts + verified progression** — every new account starts at L0. Users may self-report interests and availability, but cannot self-select L2–L6. Level and exact task skills are controlled by reviewed evidence. L2 opens general paid-task eligibility; L4 is the start of reviewer-authority eligibility. Technical progression ends at L6; the unique protected Founder/Owner is displayed as L7 but stored separately from technical level.
- **Anti-squatting task control** — L0/L1 work is open and non-exclusive. For L2+ work, contributors may either pass a variable auto-scored competency screening or submit the task application directly for manual competency review. Auto-scoring never grants authority: final skill/task approval remains manual. Pending applications do not reserve work. L4/L5 work is high-trust founder-assigned work. Approved reserved work has a first progress checkpoint within 24 hours and automatically releases when stale.
- **AI-assisted contribution policy** — AI tools are permitted, but higher-trust submissions require disclosure, an independent verification note, and an explanation of what the work establishes, what it does not establish, and what assumptions remain.
- **Founder review queue** — task applications and competency reviews target a decision within one business day and no later than two business days. Variable evaluations are generated from randomized parameters and shuffled choices, objectively auto-scored, and then queued for human approval if they pass. Manual evidence/application is always an alternative. Decisions, checkpoints, skill reviews, level changes, and submission reviews are persisted and audited.

- **Separate Admin Center** — administration uses a dedicated `/admin-login.html` flow and a separate 8-hour HttpOnly, Secure, SameSite=Strict admin session. A normal contributor session cannot authorize `/api/admin/*` operations.
- **Append-only audit archive** — every audit event is copied into `audit_archive` with actor identity snapshots and a SHA-256 hash chain. Database triggers reject archive UPDATE/DELETE operations, and the Admin Center verifies the chain while exposing paginated approval history, admin-action history, and the full audit feed. This is application/database immutability, not a claim that a Cloudflare account owner cannot destroy the underlying database.
- **Account security** — PBKDF2-SHA256 password derivation, random session tokens stored only by hash, HttpOnly/Secure/SameSite cookies, one-time recovery codes stored only by hash, login lockout, same-origin mutation checks, and D1-backed per-IP rate limiting for public auth/application endpoints.
- **Curated needed-work marketplace** — the public task list is default-deny: a task must be explicitly marked `published + needed` by the Founder/Owner before it can appear or be started. Bounded research, engineering, operations, administrative, marketing, outreach, documentation, and community work can all be represented.
- **Ongoing role applications** — recurring operations, communications, and outreach responsibilities are separated from bounded tasks. Role approval does not raise technical level, verify a scientific skill, or grant assurance-review authority.
- **Rich task dependency graph** — hard and informative edges carry semantic relation labels, artifact contracts, criticality, required outcomes, and logical gate groups (`ALL`, `ANY`, `AT_LEAST(k)`). The Admin Center can edit the graph with cycle rejection and audited reasons for every change.
- **PCS Arena** — experimental Foldit-inspired challenge layer with challenge-local scoring only. There is no global task-count leaderboard; only independently validated entries appear, and Arena rank never automatically changes contributor level or skill authority.
- **Public-good funding model** — proposed PCS Safety Bounty Fund, grant/donation/sponsorship/commercial cross-subsidy model, funding firewall, and explicit rule that sponsorship cannot purchase a green result.
- **Organization access model** — broad free public-interest/community participation with paid enterprise value for private deployment, scale, governance, and support; final licensing structure remains subject to legal review.

- **Completed Result Anatomy** — educational v0.6 result walkthrough showing `valid`, claim status, and `accepted` as separate axes, using the real verifier/receipt field names while explicitly labeling scenario values as illustrative rather than a live verification.\n- **Guided Submission** — beginner-first five-step flow (`Project → Claim → Review → Prepare → Ready`) that reuses the exact browser Project Mapper engine, keeps files local, maps human intent only to supported typed claim templates, renders plain-language explanations from the formal predicate, progressively discloses the exact machine contract, and stops honestly at the authoritative CLI confirmation/signing boundary.\n- **Trust Center** — distinguishes the legacy PCS 0.5 browser fixture, the machine-checked v0.6/v2 theorem boundary with explicit remaining contracts, the merged v0.6 executable mainline, executed cross-machine/runtime evidence, and explicit non-claims.
- **Machine-readable trust state** — `public/status.json` mirrors the released checker/proof/parity/preview state and is cross-checked against the shipped browser fixture by the deployment gate.
- **Security contact** — `public/.well-known/security.txt` provides a standard disclosure/contact path.
- **Responsive shared navigation** — dependency-free mobile menu and small shared UI helpers in `site.js`.
- **Local Project Mapper** — lets a scientist choose an existing project folder, computes local SHA-256 artifact snapshots, detects supported PK/PD/split/reaction/unit patterns, previews heuristic Python/Jupyter/R artifact flow without executing source code, renders a visual workflow graph, allows independent check/workflow selection, and exports non-attestable machine-readable plus Markdown review artifacts without uploading project files.
- **Independent static-workflow replay** — the production v0.6 verifier reconstructs exact delivered source files and re-runs workflow discovery before scientific replay. Clean AST graphs require exact dependency-set equality; weaker mappings require every signed edge to be rediscovered.
- **v0.6 MVP product surface** — documents the complete `discover-v06 → confirm-v06 → attest-v06 → deterministic self-verified ZIP → verify-v06-bundle → reviewer policy → receipt` loop, the six current executable checks, and the exact formal boundary.
- **Local v0.6 policy lab** — demonstrates the production semantics that PCS package validity and reviewer acceptance are different axes, computes SHA-256 over the exact displayed reviewer-policy bytes, and produces an illustrative receipt without network calls.
- **Adaptive replay scheduler** — documents and demonstrates deterministic ordering baselines plus the experimental contextual-bandit scheduler, shadow mode, telemetry privacy, cold-start thresholds, and the invariant that all mandatory checks execute and scientific verdicts ignore scheduler outputs.
- **Multi-reviewer quorum governance** — documents and publishes a role-aware 2-of-3 review policy: authorized reviewer fingerprints, role-specific policy SHA-256 requirements, duplicate-identity rejection, and exact-subject grouping so reviews over different bundles cannot combine.
- **Real-world validation evidence** — publishes the first 5-case public-data validation set: Haber–Bosch chemistry, clean and contaminated UCI Iris splits, Indometh unit equivalence, and an IV Indometh single-exponential falsification case. All 5 matched predeclared expectations, including 2 expected failures.
- **Executed runtime portability evidence** — fail-closed CircleCI campaigns cover Ubuntu 24/26, amd64/ARM64, Docker/rootful Podman, native R, and repeated deterministic replay.
- **Offline dependency reconstruction** — signed hash-locked NumPy wheels and signed local R repository payloads are restored with network-disabled builds; the base images are checked not to contain the target dependency.
- **Native ABI evidence** — PCS captures native-extension SHA-256 fingerprints and has demonstrated architecture-specific binary differences with byte-identical scientific outputs for the tested workload.
- **Legacy v0.5 browser parity verifier** — validates the frozen PCS 0.5.0 reference package or an extracted v0.5 evidence directory, hashes exact selected file bytes, verifies Ed25519 package signatures when present, replays restricted one-compartment PK + direct Emax PD evidence, reassesses claims, and runs 11 frozen decision-parity vectors. It is intentionally labeled as a parity/transparency fixture rather than the current v0.6 product verifier.
- **PK/PD model lab** — generates the restricted model and prediction trajectory, replays it through the browser engine, and exports production-compatible `manifest.json`, `pk_model.json`, and `predictions.csv` for the Python CLI.
- **Pilot intake builder** — validates claim/assumption IDs, computes a canonical SHA-256 semantic commitment, and exports both `pilot_intake.json` and `pilot_intake.lock.json`.
- **Contact workflow** — direct contact at `marenatommaso@gmail.com`, local clipboard support, and a browser-generated `mailto:` design-partner inquiry.
- **Original PCS logo** — `public/logo-mark.svg`.

The browser verifier is a functional demonstration, not the production PCS Python verifier. Its built-in signing key is explicitly demo-only.

The strongest current machine-checked theorem stack targets the exact v0.6/v2 representation. For canonical STORED archives, `PCS.V2.Frontier.pcs_frontier_archive_acceptance_sound` starts from accepted raw archive bytes and reaches `HighAssurance` with a single explicit theorem hypothesis: `NoForgery` for the Lean Ed25519 trust anchor. Lean proves SHA-256 equal to an independent FIPS 180-4 specification, proves canonical ZIP decoding, and independently replays all six built-in checks; the separate Mathlib bridge gives `pkpd_reference_match` a real-valued analytic-model meaning. Python-only acceptance remains non-authoritative. Remaining boundaries include Ed25519 unforgeability and independent RFC 8032/SHA-512 correspondence, workflow-front-end semantics, environment meaning beyond `EnvFacts`, external validators, legacy non-canonical ZIPs, and operational runtime/toolchain components. The frontier layer is integrated on the model `main` branch and checked by Lean 4.28 gates.

## Repository layout

Only `public/` is deployable.

```text
public/
  index.html
  commons.html
  contribute.html
  tasks.html
  roles.html
  task-graph.html
  arena.html
  projects.html
  contributors.html
  fund.html
  governance.html
  organizations.html
  research.html
  account.html
  admin.html
  project-builder.html
  mvp.html
  validation.html
  trust.html
  status.json
  .well-known/security.txt
  architecture.html
  demo.html
  model-lab.html
  intake.html
  contact.html
  privacy.html
  404.html
  styles.css
  site.js
  commons.js
  roles.js
  task-graph.js
  arena.js
  account.js
  admin.js
  project-builder.js
  mvp.js
  demo.js
  model-lab.js
  pcs-engine.js
  pcs-reference.js
  intake.js
  contact.js
  logo-mark.svg
  pcs-v05-reference-package.json
  reviewer-policy.example.json
  review-quorum-policy.example.json
  review-set.example.json
  real-world-validation-2026-09-29.json
  _headers
  robots.txt
```

Repository metadata, scripts, Git objects, the Worker backend (`src/worker.js`), D1 migrations, and documentation remain outside the static asset directory. Wrangler deploys the Worker and `public/` assets as one unit; only `/api/*` runs through the Worker before static asset handling.

## Local preview

```bash
python -m http.server 8000 --directory public
```

Then open `http://localhost:8000/`.

Run the static safety/integrity audit:

```bash
python scripts/check_site.py
```

The checker validates internal assets, the real contact address, local-only JavaScript posture, security headers, logo metadata, the v0.6 MVP/status/policy/quorum/adaptive-scheduler surfaces, the 5-case real-world validation evidence, the Trust Center/shared navigation, and the SHA-256/fingerprint consistency of the legacy 0.5.0 browser fixture.

## Cloudflare deployment

The committed `wrangler.jsonc` is the source of truth:

- Worker: `proof-carrying-science-site`
- Static assets: `./public`
- `workers.dev`: enabled
- Preview URLs: disabled
- Worker observability: enabled (Workers Logs at full demo-stage sampling + Cloudflare Issues)
- Static 404 handling enabled

Git-connected deployments use the pinned local Wrangler toolchain:

```bash
npm run deploy
```

A successful production deploy also submits the public URL set to IndexNow.

The repository also runs `scripts/check_free_infrastructure.py` in CI. The reviewed free-tier posture allows exactly one US-jurisdiction D1 database (`pcs-commons`) for Commons accounts/task coordination plus Workers Free static assets, Web Analytics, Workers Logs, and Issues. Adding any other stateful Cloudflare product still requires explicit cost/privacy review.

A separate card-free operations layer runs a daily production smoke check through GitHub Actions (`scripts/check_live_site.py`) and uses Dependabot for monthly review-only updates to Wrangler/npm metadata and GitHub Actions. No dependency PR is auto-merged. See `FREE_INFRASTRUCTURE.md` for the current policy and deferred services.

## Security/privacy posture

- one reviewed D1 database stores Commons account/task-control records; it is not a scientific-artifact data plane;
- contributor accounts start at L0 and store only the account/profile/skill/task/review state needed for Commons coordination;
- privacy-first Cloudflare Web Analytics / Core Web Vitals measurement;
- no advertising pixels or behavioral tracking; Cloudflare's analytics beacon is the only third-party runtime script;
- no Commons endpoint accepts arbitrary scientific project-file uploads; task submissions currently record text plus an optional external artifact/PR URL;
- verifier package JSON and extracted-directory selections remain local to the browser;
- Project Mapper file selections, hashes, and manifest drafts remain local to the browser;
- pilot-intake entries remain local to the browser;
- CSP and browser-hardening headers live in `public/_headers`;
- public product/trust pages are indexable; legacy/internal utilities use page-level `noindex`, and previews remain non-indexed.

Never place secrets, customer data, signing private keys, unpublished research artifacts, PHI, or regulated data in this repository.


### Reproducibility environment preview

The Project Mapper now previews Python/R dependency declarations, common lockfiles,
interpreter constraints, Conda/Nix specifications, and Docker/OCI base-image
pinning. It exposes a descriptive hermeticity state and downloadable
`pcs-environment-plan.json`.

The browser preview is intentionally non-authoritative. `confirm-v06` regenerates
the canonical environment capture from the exact reviewed artifact bytes using the
production Python parser before attestation. Reviewer verification independently
re-derives the same signed environment contract at `environment_replay`.

The website never executes package managers, environment installers, container
builds, or project installation hooks.


### Claim semantics

Free-form language is never treated as the formal predicate. The beginner flow may use the user’s words to highlight a supported template, but the rigorous claim is the typed PCS predicate/check. Current built-ins are dataset disjointness, reaction balance, unit compatibility, PK/PD contract validity, and PK/PD reference matching. Unsupported claims remain explicitly unformalized.
\nDemo shortcuts: `guided-submission.html?demo=1` launches the synthetic guided walkthrough; `result-anatomy.html` explains the completed v0.6 review result structure.\n

## Commons account and task authority

The Commons deliberately separates **identity**, **level**, **skill**, and **task assignment**:

- every registration begins at L0;
- L0/L1 tasks are open/non-exclusive, so an inexperienced contributor cannot block other people by “claiming” one;
- L2+ eligibility is based on server-side verified level;
- a high-trust task can additionally require a separately verified skill such as `python`, `ml`, `lean`, `security`, `biology`, or `review`;
- pending L2+ applications do not reserve work;
- approved reserved work receives a short reservation and a 24-hour progress checkpoint;
- stale reservations are released by the hourly Worker cron;
- users cannot edit their own PCS level;
- ordinary administrators cannot modify the protected Founder/Owner account, appoint/demote L6 research leads, or alter peer-admin governance authority;
- only the unique Owner can grant/revoke administrator status, suspend/restore accounts, or appoint/demote L6s;
- revoking admin authority or suspending an account immediately invalidates that user's active sessions;
- the Owner account cannot be self-deleted through the normal account endpoint;
- all level, governance, and override changes are audit-logged.

The Worker implements the public API in `src/worker.js`; schema source of truth is `migrations/0001_commons_auth.sql`, including the partial unique index that permits exactly one `is_owner=1` account.

## Transactional email boundary

The backend always creates durable in-app notifications. It can also send transactional email when `RESEND_API_KEY` and `MAIL_FROM` Worker secrets/config are present. The administrator destination is `marenatommaso@gmail.com`.

No email-provider API key is committed to Git. Until a transactional sender domain/API credential is configured, approvals remain visible in the account dashboard but arbitrary-recipient email delivery is intentionally reported as disabled rather than silently pretending it succeeded.
