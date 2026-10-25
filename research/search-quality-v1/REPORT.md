# Finite search quality, visual coaching and failed-search intake

This implementation is based on protected site `b2f6a004265f166951640c7bb34c9ad3cdaa8b89`.
It changes no PCS scientific authority, Aristotle result or core proof-gated module.
The new capability is an independently replayable optimal-edit certificate and
quality analysis for all seven existing bounded Countermodel missions, connected
to an explicitly assisted visual coach and versioned opt-in failed-search intake.
It is a finite puzzle capability, not an AI-safety or model-performance breakthrough.

## Exact mathematical result

Lean 4.28.0 compiles `DistanceCertificate.lean`, importing only `Std`:

- `PCS.SearchCertificate.potential_lower_bound`: if goals have potential zero and
  every edge satisfies `p(s) ≤ p(t)+1`, every goal-reaching walk from `s` has length
  at least `p(s)`.
- `PCS.SearchCertificate.descending_witness`: if zero potential implies a goal,
  and every positive-potential state has an edge to potential one smaller,
  a goal-reaching walk of exactly `p(s)` exists.
- `PCS.SearchCertificate.exact_edit_distance`: combines both under the explicit
  zero/goal equivalence, edge bound and descending-successor assumptions.

All three exact theorem closures use only `propext` and `Quot.sound`.
A genuinely false Lean control is rejected. No new axiom, `sorry`, `admit`, unsafe
shortcut or concrete implementation-correspondence claim is introduced.
The explicit hypotheses are mathematical obligations, not facts about arbitrary
Python/JavaScript code. The concrete graph checks below support software evidence.

## Executable correspondence and certificates

The state space fixes unused predicates false. Five unary missions have 84 states
each; two relation missions have 530 each. Exhaustive native-replay differential
checks cover **1,480 worlds and 13,220 directed legal edits**, including add/remove
with discarded character facts and directed relations. The graph is generally
directed: removing a character may discard several facts at cost one.

The proposer uses reverse BFS. Its separate checker reconstructs every source edge
and goal, validates complete potentials and local criteria, and checks a legal path
meeting the lower bound. It does not trust client-supplied adjacency lists. A
separate standard-library Python implementation reconstructs the worlds, moves,
literal formulas and graph digest; forward BFS from **every** state independently
matches all supplied potentials. Malformed worlds/indices, forged distances,
goals, paths, digests, extra fields and authority flags are rejected in both
checkers. Python optimized mode refuses to run rather than disable assertions.
Strict certificate JSON rejects duplicate/reserved keys and exceeds neither 32 KiB
nor its parser complexity budget.

From the initial one-character world, minimum edit counts are:

| Mission | Minimum world edits |
| --- | ---: |
| implication-flip | 1 |
| negation-drop | 1 |
| connective-swap | 1 |
| assumption-loss | 0 |
| quantifier-switch | 2 |
| quantifier-scope | 3 |
| variable-capture | 3 |

All seven complete certificates and the independently checked campaign are in
`evidence/`. Source digests bind that campaign to its exact implementations.
Certificates remain explicitly non-authoritative and not kernel-checked.

## Research data and negative controls

The new v2 route accepts an adult's explicit donation of their own **tested**
round, including failed or unfinished search. The original v1 success-only route,
export and trainer retain their contract and consent version. No migration is
needed. D1 deduplicates the same typed account/session identity across versions;
an old record is not silently relabeled with new consent. Owner exports omit
account identifiers and timestamps. Existing withdrawal removes both versions.

The quality analyzer derives:

`edit_regret = edit_cost + distance(after) - distance(before)`

The edge criterion ensures nonnegativity. Summing these terms gives:

`edit_surplus = edits + final_remaining_distance - initial_distance`.

Oracle labels are separate from pre-action inputs, which contain only the current
world, previously requested check feedback with its world, and prior assistance.
Entire assisted episodes are excluded from unassisted fitting/evaluation; the
three existing public held-out missions remain evaluation only. The v2 fitter
uses the original behavioral-cloning implementation on eligible completed rounds;
failed rounds remain in its quality report and are explicitly counted as excluded.

Retained counterexamples demonstrate why these labels need careful interpretation:

- A two-toggle detour returns to the original world: a later success has surplus 2.
- A world can be a computed counterexample with distance 0 while the player has
  never requested its successful test: final checked success remains false.
- A successful requested check followed by an edit is stale and remains false as
  final authority. Its earlier checked success is retained, not erased.

A fully informed edit lower bound does **not** model human information acquisition,
which includes tests and clues. Checks can be useful while changing no distance.
The labels support bounded search research, not a general ranking of intelligence.

## Reproduced implementation evidence

The real Chromium/Worker/local-D1 pipeline used only a disposable synthetic account:
verified-email enforcement, insertion/deduplication, cross-consent deduplication,
owner-only export/download, replay, actual fitting/evaluation, withdrawal, and
account cleanup. Four v2 rounds contained three final checked successes and one
failed tested round, one assisted round, one evaluation round and three failed tests.
The v1 export stayed empty after v2 insertions. The model fit three eligible actions;
held-out agreement was **1/3**, equal to the training-action-prior baseline **1/3**.
There is no demonstrated model gain or real participant study.

At 320, 390, 768 and 1440 px, actual browser interactions cover all seven puzzles,
keyboard/touch controls, replay/import isolation, actual downloads, opt-in failed
round snapshotting, clue-before-coaching, separate read-only coach frames,
certificate checking, cancellation on edits/navigation and no automatic uploads.
All seven actual browser proof downloads compile in Lean 4.28.0; the existing
witness theorem dependencies remain unchanged. Admin exports resume in bounded 20-round batches. A full-length 20-round relation
export (over 1 MiB) passes the strict per-record reader; duplicate envelope and replay
keys remain rejected without changing the shared parser.
The layout campaign renders all
63 HTML pages at all four widths: **252 layouts, zero failures**.

## Reproduce

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:world-builder
npm run test:search-quality
npm run test:world-builder:browser
source scripts/activate_lean_428.sh
node scripts/verify_search_distance_lean.mjs
node scripts/verify_world_builder_downloads.mjs /tmp/pcs-world-builder-browser
python3 scripts/verify_search_route.py research/search-quality-v1/evidence/*.route.json
node scripts/search_quality_campaign.mjs /tmp/pcs-search-quality-campaign
node scripts/analyze_search_research.mjs owner-search-export.json quality.json
node scripts/train_search_research.mjs owner-search-export.json model.json report.json
```

`browser_research_check.cjs` requires the existing documented disposable local
Worker/D1 fixture; never run its account/role fixture mutations against production.
CI retains fresh browser, formal and graph evidence attached to the exact tested head.
Historical reports and evidence are preserved.

## Remaining boundary and next milestone

The browser/host, compiled runtime, storage and cryptographic implementations are
trusted implementations. No immutable root or human-authorship authentication has
been established. Consent and age are self-attested. Local files cannot prove that
research consent existed; prior exports/backups/model weights cannot automatically
be recalled. Unchecked abandoned searches remain uncollected, and success/engagement
selection biases remain despite accepting tested failures. Public mission splits
are not blind generalization. No external Aristotle traces are used as training data.

Next priorities are a consented beginner pilot with preregistered completion and
understanding measures; genuinely hidden semantic-family evaluation before claims
of model gains; and a separately reviewed Lean checker for concrete serialized
graph certificates, preserving the generic theorem's explicit assumptions.
