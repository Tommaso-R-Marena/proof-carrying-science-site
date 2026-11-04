# Mailroom v0.3: three beats and a local playtest flow

This is a review-only update to standalone Chaos Theory in draft PR #145. No PCS production authority, learned model or deployment setting changes. Only the standalone game and its own new CI workflow change; the existing PCS workflows remain untouched. It must not be merged or deployed automatically.

## Implemented design

The first beat teaches a stealing trick: redirect the courier or foam it and collect its parcel. The second introduces a genuine physical route choice: carry the priority parcel home quietly, or reverse the sorting belt, put the parcel on it with E, and collect it from the staff-side catch tray. The express route makes noise and attracts investigation. A closed gate causes a recoverable jam; a technician can reset the belt. The third beat finishes with a separate timed dash to the last tram after banking the third parcel. The tram has an 18-second deadline capped by the original 75-second round. It is announced from the start and visible on the map; depositing three parcels alone no longer grants victory.

Gadgets combine physically. A decoy draws a guard onto the sorting belt, a reversed belt moves it, and a foam hit knocks and stuns it while the belt carries it away. The capped Return to Sender bonus requires an investigating guard actually on a reversed belt when hit. Foam can also push a loose parcel. Closing a gate checks parcel occupancy so it cannot swallow a parcel in transit. The direct carry route remains available; no combo is mandatory.

Courier double takes, raised hands after losing a parcel, mechanic wrench gestures, guard decoy recognition, annoyance and searching eyes are driven by bounded simulation reactions. A guard loses interest in an unchanged decoy. Backup now has a genuine arrival countdown instead of using a fake stun. Reactions are ordinary game FSMs, never learned AI evidence.

Readability uses one priority event banner and one nearby speech bubble rather than stacked messages, a large front-held parcel, three visible mission beats, an explicit tram countdown, and physical sorter/tray landmarks. The visible belt area now defines its E interaction; a hidden small-radius mismatch was caught by Firefox testing and repaired.

## Optional local observations

Play & give feedback opens a consented local flow. Normal play requires no recording. It records first movement, actual gadget use, pickup/deposit timings, hits, methods, route, outcomes, retry/next/home clicks and optional clarity/tactic/another-round answers. Wall time and game ticks are separate; pause, loading and presentation hit-stop can affect wall time. Escape-phase reached is not escape success. A response can be cleared back to Skip, and the feedback form never blocks retry.

Records remain in memory, have no names, raw key logs, IP addresses, browser identity or automatic uploads, and are capped at 20 runs. Export is an explicit local download; deletion/reload clears the recorder. Existing saved scores are independent. Automated test mode is explicitly labeled synthetic; production-local records are unattested and cannot prove a human participated. A retry click and an intention to replay are separate measurements. The analysis CLI validates bounded JSON and reports descriptive counts/medians without inferring enjoyment or treatment effects.

`npm run playtest:analyze -- <local-export.json>` performs no network or model call. The checked-in example observations are from browser automation and must never be counted as human participants. No actual newcomers were recruited or tested in this session. Human-based difficulty tuning remains outstanding; the instrumentation and protocol make that work possible without inventing results.

## Verification

The local checks below were executed. Raw output and machine-readable artifacts are saved in [evidence/mailroom-v3](../evidence/mailroom-v3/). The PR checks bind CI results to the exact pushed source commit.

| Check                                        | Local result                                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, ESLint, formatting, static build | PASS                                                                                                                                                                                    |
| Unit/integration                             | 108 passed across 7 files; 93.23% branches (813/872), 96.02% statements                                                                                                                 |
| Chromium                                     | 12 passed, including complete active-bot carried and sorter routes, real keyboard/touch input and independent Node replay                                                               |
| Firefox                                      | 12 passed, including both routes and independent Node replay; narrow pointer controls are tested, not a real phone                                                                      |
| Production                                   | Two viewports, 20 restarts; 60.00 and 59.51 FPS sampled on this shared executor; zero observed external requests or browser errors; no test controller or live adapter in served assets |
| Deterministic soak                           | 120 rounds / 540,000 ticks in 49.86 seconds; finite in-bounds actors and bounded transient state                                                                                        |
| Synthetic tool fixtures                      | 36 evaluations; 27 task completions, 9 forbidden proposals all blocked, 0 unauthorized effects                                                                                          |
| Local observations                           | Consented opt-in, skipped answers, retry versus intention, export, deletion, record/time caps and strict schema tested; CLI analyzes synthetic E2E output                               |
| Live model                                   | 0 calls; configuration check reports not configured                                                                                                                                     |
| Human newcomer trial                         | 0 participants; not conducted                                                                                                                                                           |

Coverage measures simulation, research, live adapter, storage and local recorder modules. It does not claim every renderer, audio or UI line is unit covered. The 120-round soak is an active scripted simulation campaign, not a human skill study or proof of leak-free browser rendering. Frame samples measure requestAnimationFrame scheduling on headless Linux, not actual phone CPU/GPU performance. The build retains Vite's large lazy Phaser-chunk warning; no warning threshold was raised to conceal it.

Both second-haul routes complete with backup and ordinary robot AI active. With tick-zero scheduling, Chromium and Firefox exported byte-identical input replays for each route: the sorter run takes 1,485 ticks (24.75 game seconds), the carried run 1,748 ticks (29.13 seconds), each with three hearts left. The cross-engine hashes and checksums are in `cross-engine-replays.json`. Route run JSON files report exact ticks, hearts, scores and methods. These are feasibility examples of a scripted policy, not a fair comparison of route difficulty or novice completion times. Scheduling is frozen before tick 1 for deterministic manual controllers; real input and production tests run separately. No state setter, fabricated win or disabled guard is used for either integration playthrough.

Two development failures remain under [negative](../evidence/mailroom-v3/negative/README.md): an attack-only controller lost while ignoring guards, and an earlier Firefox controller exhausted its interception decision budget while alive. The final controller defends and remains bounded by the unchanged round timer. Neither failure is removed from the evidence or counted as a human result.

The checked-in [video](../evidence/mailroom-v3/automated-replay.webm) is silent automated playback of [winning-replay.json](../evidence/mailroom-v3/winning-replay.json). Inputs are independently verified before recording; the actual browser's final checksum must match afterward. The watermark, report and README identify automation. Rendering hit-stop does not delay its input feed. This recording measured 31.391 wall seconds to feed 1,485 ticks (24.75 game seconds), illustrating why video duration and game time are distinct. The optional recorder's sample exports and summaries are likewise labeled synthetic.

The release checks include strict types, lint/format, unit/integration, Chromium/Firefox, independent Node replay of actual browser input exports, static production isolation/performance, deterministic soak, and synthetic tool-guard fixtures. Game build changes to chaos-v3; historical game replays are not silently reinterpreted. Research scenarios explicitly accept reviewed v1/v2/v3 sources and preserve their original build. Score rules 3 archive prior scores and retain history/earned cosmetics.

Original v0.1/v0.2 data and the earlier cross-engine counterexample are retained. Simulation remains quantized to the tested binary grid. No universal determinism theorem, origin attestation, immutable host, formal proof of the game, external model experiment, or human enjoyment result is claimed.

## Source and remaining work

Changed runtime modules are `sim.ts`, `mailroom-art.ts`, `main.ts`, `ui.css`, `storage.ts`, `contracts.ts`, `research.ts` and new `playtest.ts`. The new local analysis CLI, updated replay recorder, mission/observation regressions, route integration tests, coverage configuration, package version/lock and research documentation travel together. The standalone game CI now also executes the local observation analysis CLI after browser export. Production PCS authority, Lean modules, model weights and source-critical gates are outside this change.

Game build is chaos-v3 and score rules are 3. Earlier game replay builds are rejected rather than replayed under different rules. Reviewed v1/v2 research source records remain accepted and retain their original build. Source-file SHA-256 inventory is provided for comparison, not as origin authentication or an immutable trusted root.

The next quality gate is 5–8 consenting first-time players following [the protocol](PLAYTEST_PROTOCOL.md), with help recorded separately and losses/abandonments retained. Adjust onboarding and balance from repeated observations, then test the changed build. Real-device performance, full screen-reader play, subjective audio quality, longer-term replay interest and broad difficulty balance remain unmeasured. No deployment, merge, data donation, learned-model improvement or formal AI-safety finding follows from these game tests.
