# Beginner play and visual countermodels

Eleven Arena games and reasoning demos share a local, three-step guide: try a
move, check or reveal, then read the result and experiment again. Each guide
uses that game's actual controls. Players can jump directly to play, close the
guide, use Escape, or revisit it. Navigation help never executes a hint, alters
an input, reveals a hidden result, or uploads a session. A completed guide is
not a game win. Hidden result panels remain under the game's own control.

Countermodel Lab starts with the same implication-direction mission each time;
explicit mission links and the daily challenge remain available. Its seven
formulas have plain-language projections. The unary facts use an illustrative
key/door vocabulary, with P/Q and their definitions shown alongside the formal
statements. These labels do not establish a real-world protocol interpretation.

Players can toggle relationship arrows with a pointer, Enter or Space. The
existing table supplies an alternative editor. Both surfaces emit the same
replayable relation actions. Re-rendering preserves focus on fact and arrow
controls. Phone layouts place construction before the atlas. Campaign progress
follows the play area; a verified discovery offers a direct next-mission button.
The model fitting controls are available in an optional expandable section.

Undo appends inverse actions instead of rewriting history. Removing an agent
and undoing it restores its facts and all incoming/outgoing relations. Hints,
checker requests, unsuccessful attempts and reversal work remain recorded.
An undo invalidates checked results and exports until another final check.
Compound restoration refuses to start if the entire sequence would exceed the
120-action limit. Existing server replay, consent, training-family partitions
and exclusion of assisted play remain in force. No collection route or database
schema changes are required.

## Validation

`npm run test:arena:experience` includes independent replay of removal/restoration
for all 512 three-agent relation assignments and all 64 three-agent P/Q
assignments. Browser checks use real local Chromium, block network mutations,
visit all eleven guides at 320/390/768/1440 pixels, and exercise keyboard edits,
stale-result invalidation, full undo traces, downloads and mission advancement.

Run `npm run test:browser:usability` against the isolated local Worker using
`PCS_BROWSER_BASE_URL`. The required public site gate runs it alongside the
existing all-page layout, real local training, research collection, independent
Python replay and Lean checks. The guide browser report and trajectories are
retained in the workflow artifact. These are scripted functional checks;
engagement and beginner comprehension still need observation with actual users.
