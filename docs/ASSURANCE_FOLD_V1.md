# Assurance Fold — claim-board game

## Intent

Assurance Fold is a **spatial PCS Arena game**: not a quiz, and not a protein
folding clone. Each mission is a scrambled evidence package. You drag claim
tokens into zones (authority, computational, science-open, reject, limits),
watch board heat fall, and hold a cool layout long enough to lock it. Combos,
stars, personal-best ghosts, and a short campaign make it competitive to
replay.

A locked board still sets `issues_accept: false` and never claims Lean proof,
clinical validity, security certification, or merge readiness.

## Evidence Atlas

`evidence-atlas.html` lists reviewed external sources with real DOIs and
repository URLs (citizen-science search papers, reproducibility studies,
Lean 4, mathlib4, RFC 8032, Zenodo supplements, and related work). Citations
motivate demos; they are not PCS authority, and Assurance Fold is not those
external projects.

## Research data (RL / behavior cloning)

Typed sessions (`pcs-assurance-fold-session-v1`) contain only actions plus an
optional `mode` (`practice` / `campaign` / `daily`).
`replayFoldSession` recomputes heat, rewards, stability, stars, and
assistance — client-supplied `reward`/`score`/`energy` fields are rejected.

Play loop captures denser data:
- Throttled drag samples (~90ms) for continuous-control trajectories
- Auto-save notebooks on lock (local only)
- Combo / star / campaign metadata for preference learning

Exports:
- **Training dataset** — `(state, action, reward, next_state, done, features)` rows
- **Raw sessions** — action notebooks for offline replay
- **Local coach** — tiny masked-softmax BC over zone classes; held-out
  structure `fold-adversarial-nest` never enters fitting; shake/assist
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
