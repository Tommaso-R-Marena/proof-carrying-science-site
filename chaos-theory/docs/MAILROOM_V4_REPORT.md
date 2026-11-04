# Mailroom v0.4: learn, improvise, replay, contribute

This is a review-only update to draft PR #145. The game and its own CI workflow are isolated from the served PCS website. No production authority, Lean statement, model weight, trusted verifier or deployment setting changes. No merge or deployment is authorized by this update.

## Product changes implemented

The existing three-beat heist remains the main game: steal parcels, choose quiet carrying or a noisy express sorter, then catch a tram under pressure. The v0.4 additions make that loop easier to learn and give players different tactics to master.

A playable first-delivery lesson uses actual movement, a fake-notice action, courier redirection, pickup and banking. It opens the shortcut and puts other staff off duty, with no damage and a five-minute cap. It is marked Practice, shows lesson progress rather than official score, and has its own replay mode. One real deposit finishes the lesson. It cannot earn official heist bests, history, job stamps, research mappings or local observation results.

Six optional job stamps encourage replay: escape, sorter use, no damage, mixed stealing methods, the actual decoy/belt/foam combo, and no foam shots. All jobs can be selected from the start, and all tools remain available. Stamps are computed only from a completed three-parcel heist with a tram escape. Selecting a job changes the stated side goal, not the game rules or success conditions. Results show new stamps and offer another tactic. Retry comes before a collapsed score breakdown; both the result heading and primary retry must fit together on the tested phone viewport. Existing scores, history and cosmetics remain; official heist scoring stays at score-rules 3.

Gadget names now say what they do: Foam blaster, Doughnut decoy, Remote switch and Fake notice. The lesson has short, state-driven prompts, visible off-duty staff and a clear transition into the night shift. The existing expressive art, reactions, physical parcel handling, impacts and synthesized audio remain. [Design rationale](GAME_DESIGN.md) separates implemented mechanics from hypotheses about enjoyment.

## An offline game people can open

The portable builder produces one production-mode HTML file with embedded code, styles, art and runtime license notices. A reviewer can extract the provided ZIP and open `odd-post.html` in Chrome or Firefox without Node, a server, an account or an internet connection. The browser build has no test controller or model adapter. It retains a hash-restricted inline script policy and forbids network connections. Its unsigned file/script hashes are comparison records, not an immutable host or origin attestation.

The normal static site's policy and deployment are untouched. The portable browser checks exercise file URLs with the browser offline, real controls, restart, local notice construction and a downloaded pack independently validated in Node. Deliberately changing the inline code while retaining its policy must prevent execution in both tested engines. Actual phone hardware, other operating systems and broader browser compatibility remain unmeasured.

Development found two packaging defects: inserting a license footer after embedding dependency code could alter an HTML-like string inside that code; and Zod's optional JIT capability probe triggered a caught CSP violation in Firefox. The builder now inserts code last and verifies its final inline hash. Shared schemas use Zod's supported interpreted mode, so no eval permission is added. Initial failed packaging logs are retained, along with earlier development timeouts before replacing a long idle replay fixture with a shorter real completed run. No test timeout or CSP permission was relaxed to obtain a pass.

## Useful research inputs, with limits

Help test AI opens a separate notice desk. Authors can create new fictional lower-trust text for a delivery, gate or inspect-before-repair task. The real task, policy, world, capabilities and matched control remain fixed and visible. The original fixed-template scenario verifier is unchanged. A new strict pack format validates exact text, source/build/purpose, whole-pack hash, content fingerprint and an optional completed heist replay.

For an attached replay, the verifier recomputes the actual game state, rejects lessons/unfinished runs, extracts its actual mapped sign event and requires an exact scenario match. Desk-only cases use reviewed presets. A heist with no mapped notice event cannot acquire invented gameplay provenance. Content fingerprints support exact deduplication; they do not establish semantic novelty, human identity or study enrollment.

The on-screen safety lock executes programmed requests. It does not interpret a note or pretend a language model was fooled. Local export requires consent, attaching game inputs is a separate choice, and nothing uploads. The declared purpose is evaluation only, with no grant of training permission. No external proof-generation traces were used.

The offline CLI independently checks the exported case and replays guard probes. A separately opted-in operator can run a matched control/authored-notice pair through the existing bounded server-only adapter. Authored text enters only the lower-trust notice field; the fixed base scenario still governs tools and grading. Reports carry both base-scenario and authored-pack identity. No real-model calls were made here. [Research method](AUTHORED_NOTICE_RESEARCH.md) documents use, costs, provenance and limits.

## Executed checks

The baseline was independently rerun at parent commit `93e19294b8318ab142b9f8828de0c56c6ad1ceb5`: 108 tests passed. All 12 checks on that parent later completed successfully; these are historical parent results, not substituted for current-head CI.

Final local counts, source inventory, console output, portable build, video, replay inputs and JSON reports are in [evidence/mailroom-v4](../evidence/mailroom-v4/). Current PR checks identify the exact pushed source commit. Coverage includes the simulation, jobs/lesson, schema setup, research, authored notices, live adapter, storage and local recorder; it does not claim complete renderer/audio/UI line coverage.

| Check                                            | Executed result                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Types, lint, formatting, normal production build | PASS                                                                                                                                           |
| Unit/integration                                 | 121 passed across 9 files; 93.79% branches (922/983), 96.38% statements                                                                        |
| Chromium / Firefox                               | 15 / 15 passed; both active-bot routes, actual lesson, six selectable jobs, consent/export, exact-text/XSS handling and replay-bound note pack |
| Independent replay                               | Both heist routes replay in Node with periodic/final checksums; Chromium/Firefox exports are byte-identical per route                          |
| Offline distribution                             | 4 browser/viewports passed offline play, restart and downloaded-pack replay; 2/2 modified-script copies blocked by CSP                         |
| Hosted-style production                          | 2 viewports / 20 restarts; 60.00 and 60.00 sampled FPS; no observed external requests, browser errors, model adapter or test controller        |
| Simulation soak                                  | 120 rounds / 540,000 ticks in 41.39 seconds; finite in-bounds actors and bounded transient state                                               |
| Tool-plan campaign                               | 1,200 plans; 0 counterexamples to the tested guard invariants; 2,895 blocked requests; 3/3 approved controls complete                          |
| Existing synthetic fixtures                      | 36 evaluations; 27 task completions, 9 forbidden proposals blocked, 0 unauthorized effects                                                     |
| Authored export CLI                              | Desk-only and completed-replay-bound browser exports independently checked offline; no provider calls                                          |
| Live model / human study                         | 0 calls / 0 participants; not conducted                                                                                                        |

The 1,200-plan campaign enumerates all length-0-to-3 plans over seven explicit tool actions for each of three reviewed task families. It checks final-state permissions and prior inspection before repair. Three approved control tasks must also complete. Finding no counterexample in this bounded set is not a universal safety proof, an AI-alignment result or evidence of model efficacy. The actual report lists the action alphabet, all denominators, blocked requests and any counterexamples.

## Readiness and remaining work

This is an implemented game and research-input prototype with reproducible executable evidence. It has not established enjoyment, addictiveness, retention, market fit or an improvement in AI safety. Human participants: 0. Real-model calls: 0. No central donation backend, participant study, training pipeline or production deployment was introduced.

Next, observe 5–8 consenting newcomers using the offline build, record assistance separately, retain losing/abandoned runs, and tune repeated confusion or frustration. Evaluate subjective audio, full screen-reader play and real devices separately. For research, preregister a budget, use consented original notices, deduplicate/group before splitting, reserve held-out cases, blind condition labels and report competence, forbidden proposals and forbidden effects independently. New game content should follow evidence that this first mission is understood and worth replaying.
