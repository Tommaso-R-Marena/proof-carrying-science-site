# PCS Arena 2.0: Interactive reasoning laboratory and tour

## UX intent
The website is organized around four direct visitor goals: **Start here**, **Play Arena**, **Use PCS**, and **Get involved**. A client-only site-wide page finder (slash or Ctrl/Cmd+K), breadcrumb trail on key pages and prominent three-way homepage routes reduce browsing confusion. These controls are optional enhancements; ordinary links still work when JavaScript is disabled.

The new `experience.html` is the **beginner-facing PCS demo**, while `demo.html` remains the separately labeled legacy v0.5 adversarial browser fixture. `experience.html` presents an editable AI-safety trace and scientific model as everyday range/select controls, using the same deterministic JS functions as `research-preview-engine.mjs`. Visitors can deliberately make a result fail. They then see **four distinct layers**: local arithmetic, actual signed-package replay, a separately built Lean authority, and receiver-owned policy. A PASS in the browser never claims a signed certificate, Lean proof, or empirical model validation.

## What makes the games experimental rather than static quizzes
### Proof Quest
- Original eight hand-authored missions remain intact for beginners.
- New `lab-<seed>` procedural missions are deterministic and shareable. The four **curated** family templates address AI-safety review, scientific-model evidence, package integrity and proof-checking prerequisites. One to three optional supporting tasks introduce different structures. Seeds do not invent arbitrary logical semantics.
- The same generator and puzzle-version rules run on the public page and **independently on the authenticated Worker** before accepting explicitly donated adult-only research records. The server recomputes grades; client scores are discarded.
- The visual DAG X-ray exposes prerequisites, ready states and completed steps. Optional coach and first-prefix repair explain errors. A UTC daily mission provides a common challenge; the attempt diary stays in RAM on the page only. Coach, X-ray and guided correction increment the existing bounded `hints_used` field.
- The model-training converter recomputes synthetic next-step rewards and keeps the *entire package-integrity family* out of training. Other generated families still share templates, and claims about generalization require independent held-out baselines and distribution-shift experiments.

### Safety Forge
- Existing simulator still uses versioned finite worlds with risk budgets, human authorization, inspection, consent/redaction, and bounded exhaustive guard verification.
- New mission path visualization, multi-candidate shield notebook, ranked reward/cost trade-offs, and human-clicked replay theater encourage counterexample discovery and successive repair. Tested policies come from actual `verifyShield` outputs; replays use `replayActions`. A policy that simply stops all actions cannot score a complete mission.
- Loading a prior shield counts as feedback-exposed for future donated repair trials; user-visible replay is local and never auto-uploaded. Synthetic verifier-derived preferences are *not* independent human preference labels.

## Honest boundaries and consent
Anyone may play without login, including children, but the game does not transmit practice inputs by default. Research contribution is limited to separately opted-in, self-attested adults with verified account email, the visible research switch and a separate donation click. The server rechecks generation/version/scoring and per-day limits; donors can delete active linked D1 rows. No additional gameplay telemetry endpoint, automatic upload, new identity-linked cache or Durable Object storage was introduced.

These games teach dependencies, search, counterexamples and bounded policy checks. **They are not Foldit-level scientific evidence or Lean tactic trajectories.** The two offline datasets could support narrow experiments in next-step ordering and synthetic guard search, but *training a useful model is an empirical open question*. This enhancement does not change the core P0 soundness release gate or declare unknown checkers safe.

## Testing/release
- `npm run test:arena:experience` tests generated families, graph bounds, deterministic scoring, malicious IDs, family holdouts and replay rendering contracts.
- `npm run test:arena:onboarding`, existing scientific replay suites, static site/security campaigns, syntax checks and Wrangler dry-run remain in `npm run ci:zero-minutes`.
- Browser smoke requirements: keyboard focus, puzzle generation/reloading, SVG scrolling on mobile, right-column replay theater, menu search and overlay exit, screen-reader semantics, and explicit opt-in after game completion.
- Treat a full Cloudflare green result on the **exact PR head** as the merge gate. Do not replace missing runtime browser testing with claims of having seen a rendered page.
