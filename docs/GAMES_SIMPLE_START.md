# Simpler game entry and first rounds

The game chooser now starts with three understandable activities:

- **World Builder:** flip keys and doors until two rules give different answers.
- **Proof Quest:** place step cards in a working order.
- **Safety Forge:** find a fictional bot's broken rule, then repair its safeguards.

The chooser's initial visible text is 177 words. More games, advanced labs,
research explanations and reviewed leaderboards remain available in optional
sections. No account or coding is needed for these starter games.

## What changed

Fifteen game/lab pages have a short heading, a concrete goal, a first action,
and a direct play control. Optional three-step help points to the actual
controls and feedback. The original introductions and their IDs are retained
under About the game. Old tutorial buttons remain available there; Proof Quest
and Safety Forge no longer open their additional tutorials before play.
World Builder, Bridge Builder and Memory Workshop now use the same navigation
help as the other games. Entry menus are smaller on game pages that use the
shared navigation. Technical labs remain marked as advanced choices.

`game-guide.mjs` only changes its own help UI, opens enclosing disclosures,
and scrolls/focuses existing controls. It never clicks game buttons, searches for
answers, plays moves, changes a selected puzzle, awards a win, records hints,
stores a session or uploads data. Start is disabled until its board controls
exist. The startup observer disconnects after finding them, avoiding repeated
work during animated games. Game-owned result panels remain hidden until the
game controller establishes them.

## What is preserved

Game engines, theorem statements, catalogues, model weights, replay formats,
scoring, unlocks and consent handlers are unchanged. A guided navigation tour
is not an answer hint; existing clues, coaches and revealed answers still pass
through their existing assistance-recording handlers. Research sharing remains
an explicit separate action with its existing account, adult and consent gates.
No source traces are newly approved for training.

A browser-game win has its displayed scope. A finite simulation does not prove
real-world AI safety. The mathematical bridge games replay recorded Lean states;
fresh kernel checking remains a separate consented action. The repair-model lab
continues to load its real registered numerical model and check its proposals;
ranking itself is not a proof.

## Validation

The updated protected website workflow exercises:

- All 15 guides at 320, 390, 768 and 1440 pixel widths, including keyboard focus,
  help navigation, Escape dismissal and overflow checks.
- Actual first rounds in the three starter games at those four widths.
- State snapshots before and after navigation help, proving that it does not
  mutate the tested rounds, award scores or reveal a game result.
- World Builder agreement and actual counterexample, with an exported notebook
  containing no hint actions from navigation.
- Proof Quest's rejected order, a valid complete order, and advancing a round.
- Safety Forge's actual breach, rejection of an overblocking policy and acceptance
  of a working repair under the unchanged exhaustive finite-state checker.
- No unsolicited sharing requests, unchecked consent and a missing-controller
  case whose Start and witness-export controls remain disabled.
- The original seven World Builder missions, proof-source downloads, replay,
  hostile imports, asynchronous reader attacks and explicit assistance labels.

Static checks preserve the original game control IDs and access to the older
research tools. Public-copy checks and the current native/verifier/source gates
remain required. No mathematical specification or authority check was loosened.

All browser players in this validation are scripted synthetic choices. There
are no human participants or measured comprehension times. The design target is
a clear first move within a minute; independent newcomer testing is still needed
to assess that goal and enjoyment.

Local results: 545 Node tests passed with no skips; the complete Cloudflare
build gate and deployment dry run passed. The 60 navigation journeys, 12 starter
rounds, original 28 World Builder puzzle completions, and the previous 12 beginner
journeys passed. Evidence is under `docs/evidence/games-simple-start-v1/`.
Protected CI independently repeats the required source, native and browser gates.
