# PCS controlled public research preview — 2026-10-06

## Release posture

This rollout publishes **only additional static, client-side educational tools** on the already-public PCS website. Both PCS GitHub repositories remain private; no proprietary Lean, CertiForge, AI-safety implementation source, secrets, private scientific files, production D1 data, or program-execution endpoints are exposed.

Do not describe the browser exercises as certificate validation or an independent PCS kernel execution. The read-only local exercise is useful precisely because a visitor can **falsify a bounded claim**.

## Verifiable exercises

1. `research-preview.html` → `research-preview-engine.mjs`: evaluate an explicit finite JSON trace with forbidden action 7 and cumulative risk bound 4. Validates all event schemas and computes each prefix. Positive and adversarial fixtures included.
2. Synthetic one-compartment PK/PD prediction: recompute `C(t) = dose / volume * exp(-k*t)` and compare against a declared per-observation tolerance. Positive and perturbed fixtures included.
3. Link to the existing local-only guided draft flow, package inspector, and result anatomy. These routes do not silently assert Lean, signing, or independent replay where not actually performed.

The exported JSON assessment is explicitly marked `signed:false`, `lean_checked:false` and `independently_replayed:false`. It must **never** be fed directly into a production approval route or trusted as a signed PCS receipt. All example inputs are parsed as data; no `eval`, user code execution or server-side untrusted compute.

## Privacy and security limits

- The exercises require no account. Research JSON stays in the visitor's browser and is not POSTed to PCS. Global navigation may read same-origin session state; this does not transmit the scientific input.
- Input size capped at 16,000 characters in the editor, at most 64 events/observations, finite bounded numeric values, with unsupported fields rejected.
- No application credentials or GitHub token are available to any preview client code.
- Existing Commons account, contributor submission, Owner promotion and Cloudflare Worker security policies remain unchanged.
- A public website is not the same as open-source access or source-license approval; `docs/PUBLIC_RELEASE_READINESS_2026-10-06.md` remains a separate gate.

## Release gates and rollback

Automatic Cloudflare build/deploy must run:
- `npm run test:submissions` and `npm run test:promotions` (5 + 6 tests as previously reported).
- `npm run test:preview` (positive, adversarial, invalid input and boundary checks).
- JavaScript syntax checks for preview engine, page and existing worker.
- Existing static site integrity and security checks in the site GitHub Actions workflow.
- Run a manual public read-only smoke check: page loads, passing case succeeds, mutated trace/model cases fail, invalid JSON displays error, narrow-screen layout is readable, links work, no network POST from the exercise.

If the preview causes regression, revert its merge commit via a fresh PR to `main`, trigger a Cloudflare rebuild and verify the old homepage. Do not reset, rewrite, or bypass protected history.

## External pilot readiness (not yet accomplished)

An external proof-carrying workflow is **not verified** until a second machine independently reproduces Lean and Python checks on a pinned core SHA, the proof scope and TCB are compared to the claims, and a researcher reproduces the evidence and validates the acceptance policy. The latest Aristotle golden theorem has not yet been merged to core main. Continue to distinguish computed in-browser PASS from authoritative PCS package validity and policy acceptance.

## Independent validation scorecard

Record external pilot results only with:
- exact source version and artifact SHA,
- precise typed claim and independent policy,
- environment and replay contract,
- verifier outputs and negative controls,
- accepted assumptions, failures and unresolved limitations,
- reviewer name or pseudonym and explicit permission to publish.

Do not publish unpublished partner research, user files or reviewer contact details without consent.
