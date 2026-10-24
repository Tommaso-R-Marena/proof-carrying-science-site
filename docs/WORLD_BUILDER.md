# World Builder: visual play and replayable search data

World Builder (`public/world-builder.html`) is a beginner entry into the existing
Countermodel Lab. Arena places it first; the completed Start Here investigation
links to it. The full lab, coach, old routes and account controls remain available.

## Experience

Players tap illustrated characters, keys and doors, or directed signal arrows.
Two plain-language rules are checked only on request. Seven puzzles and 21 local
mastery stars reward actual checked discoveries, minimum worlds, no recorded
clues, and unassisted discoveries with at most two tests. Clues never prevent a
discovery; assistance remains recorded. Stars are private practice goals, never
research acceptance or scientific authority.

Keyboard focus survives redraws. Every relation has a full-size equivalent signal
switch for touch. Undo records inverse moves instead of erasing failures or hints.
Changing a world invalidates downloads and displayed truth values. Play and file controls
start disabled until the actual reviewed semantic ruleset digest is checked.
Reduced motion, no JavaScript and missing-checker failures are supported.

Saved files reopen in a separate local, read-only visual viewer. Strict parsing,
fatal UTF-8 decoding, byte limits and file-selection generations reject malformed
files and prevent delayed reads from overwriting a newer selection or reset.
Imported moves never merge into live play, earn stars, or enable donation. Returning
to play clears imported-view consent before any new sharing action.

The notebook preserves tested unfinished rounds as well as successes when changing
puzzles or starting another round. Read-only visual replay shows each recorded
world, revealing truth values only at actual player-requested tests. It never
creates new actions or presents later computed outcomes as earlier observations.
The notebook is memory-only, bounded to 20 rounds of at most 120 actions, with a
reserved final-check slot. At capacity the UI refuses another round instead of
silently dropping data. Download then clear to continue. Compact exports fit the
strict 131,072-byte import budget even for twenty full relation trajectories.

## Research data path

The unchanged `countermodel-core.mjs` evaluator and `pcs-countermodel-lab-v1`
actions/version remain the authority for finite replay. No production verifier,
formula, Lean module, database schema or Worker route is changed. This does not
integrate the separate draft Assurance Fold work.

Local notebook format: `pcs-world-builder-notebook-v1`. It contains UI version,
pinned semantic ruleset digest and typed sessions, without account IDs, timestamps,
free text, browser fingerprinting or proof-development traces. This local file
asserts neither research consent nor human authorship.

```sh
node scripts/analyze_world_builder_notebook.mjs pcs-world-builder-notebook.json > analysis.json
```

The CLI rejects invalid UTF-8, over-budget input, duplicate/reserved/unknown JSON
fields, unsupported versions/digests and invalid action sequences. It recomputes
the semantic ruleset hash and all finite outcomes. Its analysis separates:

- Pre-action inputs: current world, mission, only previously observed check results
  with their original world, and whether assistance was already seen.
- The chosen action.
- Derived outcome labels, including truth values never exposed to the player.

It retains unsuccessful tested rounds and failed checks. Any clue excludes the
whole episode from unassisted training/evaluation; the existing three held-out
missions remain evaluation-only. These are public, small, mission-disjoint splits,
not a blind generalization benchmark. Observed actions are behavioral examples,
not oracle-optimal actions. Unchecked rounds are not archived; navigation and
success-selection biases remain.

Research donation is a separate click with two initially unchecked confirmations:
age 18+ and consent to PCS research/model development. A verified-email account is
required. The new UI sends only the existing three-field payload to the existing
same-origin `/api/arena/countermodel/donate` endpoint. It snapshots the exact round,
refuses redirects, times out after 15 seconds, prevents concurrent submissions,
and distinguishes delayed responses for an earlier snapshot. A static review gate
permits only this single opt-in fetch; mutation controls reject alternate targets,
missing consent/snapshot/timeout guards, extra network APIs and persistence. That
static gate is a review tripwire, not a proof against arbitrary malicious JavaScript.

The unchanged Worker independently replays before D1 insertion, deduplicates,
requires a final checked counterexample and at least one edit, and provides
self-service deletion and owner-only deidentified exports. Unsolved standalone
rounds can be saved locally but cannot be donated through this existing endpoint.
Failed checks before a final discovery remain in donated trajectories. The server
does not authenticate which UI or person generated a trace. Account linkage,
self-attested consent/age and exported-data retention limitations remain explicit.

Owners can export through Admin Center and use the existing real fitter:

```sh
node scripts/train_countermodel_search_policy.mjs owner-export.json model.json evaluation.json
```

A local notebook is not an owner consent export and is deliberately not accepted
as one by this trainer. Do not treat scripted CI fixtures as human training data.
No Aristotle proof-generation traces are collected, exported or used for fitting.

## Validation and scope

```sh
npm run test:world-builder
npm run test:world-builder:browser
source scripts/activate_lean_428.sh
node scripts/verify_world_builder_downloads.mjs /tmp/pcs-world-builder-browser
```

Exhaustive tests cover all 1,480 relevant worlds: 5 unary missions × (4 + 16 + 64)
and 2 relation missions × (2 + 16 + 512), with irrelevant unused predicates fixed
false. An independent literal formula oracle agrees with the existing AST checker.
Other controls cover feedback leakage, assistance partitions, failed rounds,
forged labels, byte/move/notebook limits and semantic digest mutation.

Real Chromium plays all seven puzzles at 320, 390, 768 and 1440 px. It exercises
keyboard controls, picture/Boolean correspondence, undo, stars, visual replay,
actual downloads, notebook capacity, disabled stale exports, a deliberately denied
request during navigation, read-only file reopening, imported-data isolation,
malformed files, delayed reads/reset, no automatic upload, and failure fallbacks. This denied
response tests the UI only; it is not evidence of authorization.

`verify_world_builder_downloads.mjs` compiles the actual seven downloaded files
with the exact reviewed Lean 4.28.0 executable. It compares them against the witness
bytes, audits the exact theorem closure, and actually rejects a false theorem.
Observed standard dependencies: none for assumption-loss; `propext` for implication
and negation; `propext` and `Quot.sound` for the other four. This reuses the existing
finite countermodel theorem generator; no new general mathematical theorem is
claimed. The browser never says Lean ran there or that PCS authority was granted.

The protected real-browser research test additionally uses the actual Worker and
disposable local D1: scripted visual choices → finite replay → deduplicated storage
→ owner export → genuine numerical model fitting → held-out evaluation → withdrawal.
The fixture explicitly marks its data synthetic. Its tiny evaluation obtained 1/3
move agreement, equal to the training-action-prior baseline (1/3); it establishes
that the pipeline works, not an improved model or evidence about real participants.
Synthetic owner export/model artifacts are retained separately in CI for replay.

No human usability/engagement study was conducted, no useful volume of participant
data is asserted, and no deployed-AI safety claim follows. Host/browser/compiler
behavior remains trusted. The next empirical milestone is a consented beginner
study measuring independent completion, understanding of evidence limits, and
held-out search behavior, with preregistered ablations before claims of model gains.

An independent Python replay also checked all 8 actual browser-exported episodes (27 actions), including pre-action worlds and per-action outcomes. Its checker file is byte-identical to protected PCS core `fabc704efdbda4c8822881366e4db3d3e31f066a`.
