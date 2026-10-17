# Assurance Fold v2 — continuous Foldit-style evidence folding

## Intent

Assurance Fold is a **continuous spatial game**, not a quiz. Players drag
evidence “residues” on a live canvas, feel clash / stretch / pocket / overclaim
energy in real time, optionally wiggle (hint cost), and must **hold** a
low-energy pose to lock the fold—the Foldit pattern of exploring a
configuration space under an objective function.

A locked fold still sets `issues_accept: false` and never claims Lean proof,
clinical validity, security certification, or merge readiness.

## Evidence Atlas

`evidence-atlas.html` lists owner-reviewed external sources with real DOIs and
repository URLs (Foldit Nature 2010, Ioannidis 2005, Peng 2011, OSC 2015,
Lean 4, mathlib4, RFC 8032, Zenodo supplements). Citations motivate demos;
they are not PCS authority.

## Research data (RL / behavior cloning)

Typed sessions (`pcs-assurance-fold-session-v1`) contain only actions.
`replayFoldSession` recomputes energy, rewards, stability, and assistance —
client-supplied `reward`/`score`/`energy` fields are rejected.

Exports:
- **RL dataset** — `(state, action, reward, next_state, done, features)` rows
- **Raw sessions** — action notebooks for offline replay
- **Local fold coach** — tiny masked-softmax BC over pocket classes; held-out
  structure `fold-adversarial-nest` never enters fitting; wiggle-assisted
  notebooks excluded from unassisted fitting

Synthetic expert bootstrap can seed a coach when no human notebooks exist; it
is tagged as non-human. Nothing auto-uploads. `issues_accept` stays false.

## Security

- Pure deterministic grading in `assurance-fold-core.mjs`
- No game network I/O; atlas loads same-origin JSON only
- External `<a href>` targets are allowlisted in `scripts/check_site.py`
- Atlas JS re-validates hosts before rendering dynamic links
- CSP via `public/_headers` unchanged

## Validation

```bash
npm run test:assurance-fold
python3 scripts/check_site.py
python3 scripts/security_campaign.py --static
```
