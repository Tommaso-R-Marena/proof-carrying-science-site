# Assurance Fold v1 — Foldit-inspired evidence folding

## Intent

Assurance Fold is a local, Foldit-style configuration game for PCS assurance
boundaries. Players rearrange evidence-package tiles across lanes:

- Authority
- Computational support
- Scientific adequacy (open)
- Rejected / failed
- Limitations & non-claims

An independent energy function scores the fold. Lower energy is better. A
perfect fold still sets `issues_accept: false` and never claims Lean proof,
clinical validity, security certification, or merge readiness.

## Why this is Foldit-like (and honest)

Foldit worked because players explored a large configuration space under an
objective energy function. Assurance Fold reuses that pattern for evidence
packages: many placements, continuous feedback, and an independent checker that
does not trust a browser-declared win.

It is **not** Foldit-level scientific evidence production. Practice remains
local-only with no auto-upload endpoint in v1.

## Security posture

- Pure deterministic grading in `assurance-fold-core.mjs`
- UI escapes all tile text before HTML insertion
- No `fetch` / XHR / WebSocket from the game module
- CSP remains site-wide via `public/_headers`
- Research donation is intentionally **not** wired in v1 (fail closed)

## Validation

```bash
npm run test:assurance-fold
python3 scripts/check_site.py
python3 scripts/security_campaign.py --static
```

Browser usability includes `assurance-fold` in
`scripts/browser_game_usability.cjs`.
