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
actions/version remain the authority for finite replay. The version-2 search
donation/export routes below reuse the existing table; no database migration or
production scientific-verification authority is changed. This does not
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
required. The UI now lets the player select one of their own tested rounds, including
failed and unfinished searches. It sends only the three-field opt-in payload to
`/api/arena/countermodel/search-donate`, snapshots that exact selected round,
refuses redirects, times out after 15 seconds, and prevents concurrent submissions.
Changing the selection clears consent. Imported notebooks cannot donate. A static
review gate permits only this single opt-in fetch and checks snapshot/consent guards;
it is a review tripwire, not a proof against arbitrary malicious JavaScript.

The Worker independently replays, canonicalizes typed actions and their replay,
and stores the actual outcome with consent `pcs-countermodel-search-adult-optin-v2`.
It requires at least one requested test. No client verdict or score is accepted.
Deduplication uses the same account/session digest across versions; an identical
old donation retains its original consent. The verified-email, origin, rate and daily
limits remain, as do self-service withdrawal and account deletion.

The owner-only `/api/admin/arena/countermodel/search-dataset` export uses
`pcs-countermodel-search-optin-v2`. Admin Center downloads and replays bounded pages,
without account identifiers or timestamps. The legacy donation endpoint and trainer
keep their success-only contract. The legacy export explicitly selects original-v1
consent and successful rows, so failed v2 rounds cannot poison it.

```sh
node scripts/analyze_search_research.mjs owner-search-export.json quality.json
node scripts/train_search_research.mjs owner-search-export.json model.json evaluation.json
# Original v1 exports retain their original trainer:
node scripts/train_countermodel_search_policy.mjs owner-export.json model.json evaluation.json
```

The v2 trainer retains failures in quality analysis but fits behavioral cloning only
on completed, unassisted training-family rounds, using the unchanged numerical fitter.
Its report explicitly counts exclusions. A file with no eligible fitting data fails
instead of inventing examples. Input has an 8 MiB document budget and each bounded replay retains the shared
30,000-node strict-parser budget; duplicate keys are rejected both in the envelope
and each replay. Admin Center exports 20-round batches and keeps the cursor for
the next click, so larger datasets do not require one unbounded download. A local notebook is not a consent
export and is deliberately not accepted as one by either trainer. Do not treat scripted CI fixtures as human training data.
No Aristotle proof-generation traces are collected, exported or used for fitting.

## Visual shortest-route coach and research labels

An optional coach records a real clue before revealing a route from the current
world. It shows illustrated, read-only example frames; proposed actions never enter
the player notebook. Every world edit/navigation invalidates the example, and delayed
results cannot overwrite a new round. It awards no stars, issues no proof verdict,
and never applies moves automatically. A direct return control closes the example
and restores keyboard focus to the player board without erasing assistance. Explicit player actions and requested tests
are still required. Entire clue-assisted episodes remain excluded from fitting.

`pcs-finite-search-route-v1` certificates include complete-state integer potentials,
a source-graph digest, an exact start, a legal path and its goal. Both verifiers
reconstruct every registered edge; a client cannot omit a shortcut. JavaScript
checks local goal/edge/descent criteria without rerunning shortest-path search.
The independent stdlib Python checker additionally runs forward BFS from every state.
The generic Lean theorem and its limitations are in
[the search-quality research report](../research/search-quality-v1/REPORT.md).
No Lean kernel runs in the browser, and concrete codec/graph correspondence is
exhaustively tested, not formally proved.

Quality reports keep pre-action observations separate from post-action oracle labels.
They record remaining world-edit distance and nonnegative edit regret, preserving
failed checks and unfinished rounds. Distance counts fully informed edits, excluding
tests/clues; it does not measure optimal human learning, motivation or intelligence.
Zero remaining edits can coexist with no requested successful test. These negative
controls are retained as independently replayable evidence.

## Validation and scope

```sh
npm run test:world-builder
npm run test:search-quality
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
finite countermodel theorem generator; the new abstract distance theorems are audited separately. The browser never says Lean ran there or that PCS authority was granted.

The protected real-browser research test additionally uses the actual Worker and
disposable local D1: scripted visual choices → finite replay → deduplicated storage
→ separate versioned owner export → quality analysis → genuine numerical model fitting
→ held-out evaluation → withdrawal. It verifies that a standalone failed tested round
is stored and excluded from solved behavioral cloning, and that original-v1 exports
remain unchanged.
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

## Toolchain dependency audit

The protected dependency audit identified three undici advisories in the existing Miniflare dependency: GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472 and GHSA-xjj6-f33q-929c. A narrow override pins undici 7.30.1 under exactly Miniflare 5.20261006.1-alpha, keeping Wrangler 4.149.0 and the existing browser version pinned. The lockfile includes the published tarball integrity. The resulting dependency audit reports zero known findings; this is not a general security proof. The release gate and actual local Worker/D1 flow are rerun with the patched, isolated installation.
