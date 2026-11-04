# Mailroom Mayhem v0.2: focused game pass

This pass develops one mission. Vault and Reactor remain working earlier prototypes. No PCS production source, authority, model, existing workflow or deployment setting is modified. PR #145 stays a draft: no merge or deployment is authorized.

## What changed

The first prototype could award gold after one six-second parcel pickup. The new mission requires **three distinct parcels picked up, carried, and deposited at the player's hideout**. A redirected parcel waiting in a collection bay is not a completed delivery. Empty or held interactions cannot manufacture another deposit.

The player can redirect the courier with a notice, stun it and snatch its parcel, distract security with a decoy, or open the central shortcut with the hacker. Carrying a parcel slightly reduces ordinary movement speed; dash remains an escape tool. Combining actual redirection and interception earns a one-time bonus. Mission/time awards were retuned, and repeated empty gadget use still cannot farm points.

Each banked parcel raises security. Time can also raise it at 30 and 50 game seconds. The final haul brings a second guard with a visible arrival warning. Guards have a wall-occluded sight cone, a visible close-range detection ring, a suspicion interval before pursuit, and a search/return cycle. Walls and decoys create opportunities to escape. These are ordinary game FSMs, not learned AI or safety evidence.

The new original procedural art depicts a warm paper-and-teal postal depot, mail racks, envelopes, sorting belt, dispatch chute, collection bay and hideout. Robots have distinct silhouettes, hats/tools, eye directions, walking feet, scarf motion, confusion, suspicion and stun reactions. Foam bursts, floating impact words, deposit confetti, short hit-stop, modest camera shake, and separate layered synthesized effects make actions legible. Reduced-motion and mute settings remain available. Desktop fullscreen is optional.

## Engineering defects found and repaired

- The moving belt could repeatedly push a returning courier out of its loading threshold. A loading brake now lets it finish collecting the next parcel. A direct regression and the full active-bot browser mission exercise this.
- Point-only line of sight let navigation aim through a corner that a full-size actor could not clear. Direct travel now checks the actor's radius.
- Cross-engine replay recording exposed different intermediate hashes from raw floating-point state, despite a matching final state. Simulation state now uses a 1/65,536-unit binary grid each tick. The original failing record is retained under `evidence/mailroom-v2/negative/`. Browser exports must independently replay through Node with matching periodic and final checksums. This is tested reproducibility, not a universal determinism theorem or cryptographic origin attestation.
- Research extraction initially labeled a historical capture with the current build during compatibility work. It now preserves the validated capture's own build. Explicit tests accept v1/v2 records and reject unreviewed build IDs; task policies and tool permissions remain fixed.
- Earlier easy mailroom scores are archived separately instead of competing under changed scoring. History and earned cosmetics are retained. Older game replays are rejected under the changed simulation build; historical research scenarios remain readable.

## Executed evidence

See the current PR checks for the exact pushed source commit. The report and raw JSON below describe local runs, not external validation or human feedback.

| Check                                               | Local result                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Strict TypeScript, ESLint, formatting, static build | PASS                                                                                                                                     |
| Unit/integration                                    | 94 passed; 94.02% branches (629/669), 96.41% statements; exact coverage in `evidence/mailroom-v2/coverage.json`                          |
| Chromium                                            | 10 passed; includes full active-bot, mixed-tactic, three-haul win and independent Node replay                                            |
| Firefox                                             | 10 passed; same mission and replay check, plus menus and narrow pointer path                                                             |
| Production isolation                                | 2 viewports / 20 restarts; about 60 FPS sampled locally, no test controller, model adapter, observed external requests or browser errors |
| Stress                                              | 120 rounds / 540,000 ticks in 40.51 s locally, finite actors and bounded transient state                                                 |
| Synthetic research fixtures                         | 36 executed; 27 task completions, 9 forbidden proposals all blocked, 0 unauthorized effects                                              |
| Real model                                          | SKIPPED: 0 calls; no explicit provider opt-in                                                                                            |
| Human playtest                                      | SKIPPED: 0 participants                                                                                                                  |

The seed-42 automated mixed-route browser run takes roughly 20 game seconds, encounters backup, and finishes with two hearts. Exact duration, score, methods and events are in the saved `browser-run-*.json`. This is an effective scripted controller, not a novice timing estimate or proof that people enjoy the game. Input-feed replay timing also differs from rendering hit-stop; see the recording's report.

The actual recorded video is **silent automated input replay**, not footage of a human player. Every action comes from an exported winning run, the input replay is independently checked before recording, and the recorded browser's final checksum is compared afterward. Use `npm run demo:record -- evidence/mailroom-v2/winning-replay.json` after installing Playwright to reproduce it. It uses a local test-mode server; that controller is absent from production builds. The recording is not a model evaluation.

Screenshots, video, coverage, production frame measurements, soak and fixture records are kept in `evidence/mailroom-v2/`. Earlier reports and screenshots are retained. Reports have hashes/source context where applicable, but local browser ownership and unsigned hashes are not an immutable security boundary.

## Remaining quality gate

This is a substantial game-design and presentation improvement with automated evidence. It is not a claim of proven enjoyment. A consenting novice playtest should establish whether players understand the first goal, enjoy the first successful trick, discover a second tactic, and voluntarily retry. Real phone performance, screen-reader accessibility, subjective audio quality and broad balance across skill levels remain unmeasured. No human donation, research study or deployment has occurred.

Coverage refers to simulation/research/live-adapter/storage modules, not every presentation line. Renderer/audio behavior is checked through browser execution and visual review; no subjective sound study was performed.
