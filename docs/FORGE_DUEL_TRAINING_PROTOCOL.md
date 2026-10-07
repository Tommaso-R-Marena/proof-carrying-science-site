# Forge Duel: human policy-preference training protocol

## What PCS will train

PCS should ultimately train (a) proof-obligation planning, (b) failure and counterexample search, (c) proof/verification repair, (d) verifier-selection strategy, and (e) uncertainty/rejection judgments. Forge Duel is one **narrow synthetic precursor**: ranking guard policies, with independently replayed safety outcomes, player choice, human-declared reason and confidence.

It is NOT a Lean proof-search dataset, a guarantee of real human input, or evidence of genuine AI alignment. The simulator itself can compute all truth labels without humans. A learning model's only conceivable benefit here is cheaper or better search *heuristics* in new settings.

## Game

Eight rounds; two visible guard configurations; pick A, B or neither before revealing the finite-state checker outcomes. The checker requires both safety and mission completion; if both valid, lower cost wins. Four styles recur: unsafe vs safe, overblocked vs safe, two valid policies with differing costs, and two invalid policies. After a choice, the game displays concrete violating traces or valid mission paths, local XP, accuracy and a streak.

Research donation is NOT automatic. The user must independently attest age 18+, opt in, and explicitly click Donate on a verified PCS account. No free text or reaction-time fingerprint is collected. Adults can erase their linked active rows; Owner-only exports omit identity, IP, precise times and digest.

The backend independently regenerates seed + round, recomputes both policy outcomes, validates choices/confidence/reason, and deduplicates. To respect Cloudflare Free's **10 ms CPU per request**, the one explicit donation click transmits up to three bounded batches of 3, 3, and 2 ballots; retries are idempotent. Migration 0019 creates only an additive D1 table with ON DELETE CASCADE. Apply it before enabling the production route.

## Trainable outputs

- Policy candidate ranker: target = exact simulator outcome, not human vote.
- Human strategy/rationale classifier: target = self-declared reason tags. Do not confuse this with verified explanations.
- Confidence calibrator: confidence vs oracle agreement, with abstention and disapproval visible.
- Search warm start: compare donated preferred candidates to random, hand-built heuristics and the exact finite-state solver.
- Later with expert-grounded, real PCS tasks: train claim→obligation planning, human critique, checker selection and verified repair, using held-out research projects. These **cannot** be obtained from this synthetic game alone.

Export via Founder/Owner admin: /api/admin/arena/forge-duel/dataset . Prepare offline using:

    node scripts/prepare_forge_duel_dataset.mjs OWNER_EXPORT.json DEIDENTIFIED_DATASET.json

The converter independently replays every ballot, rejects unexpected identity fields, and holds out the full lunar/space scenario family. Preliminary preference training is restricted to non-uncertain, confident, oracle-consistent labels. A solver can already compute the toy oracle exactly, so report accuracy versus the exact solver, inference/search cost, transfer to independent real PCS tasks, ablations with and without human preferences, and potential contamination/bots.

**Limitations:** The browser cannot prove the choice was made before the answer was inspected. Data may be scripted or automated; age is self-attested. Deletion cannot automatically retract offline exports or trained model weights. Nothing here guarantees a real-world or Lean-kernel verified outcome.

Foldit motivation: players explored both configuration space and strategy/recipe space (Cooper et al., Nature 2010, https://www.nature.com/articles/nature09304 ; Khatib et al., PNAS 2011, https://pmc.ncbi.nlm.nih.gov/articles/PMC3223433/). PCS should eventually let experts contribute **audited search recipes** for real proof tasks, not only static candidate comparisons.
