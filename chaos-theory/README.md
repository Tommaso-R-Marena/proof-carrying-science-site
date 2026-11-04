# Chaos Theory: Pocket Mayhem

**A little robot trouble. Three quick missions. No account needed.**

The featured mission is **Mailroom Mayhem: Night Shift**. Steal three parcels, bring each one to your hideout, and adapt as the guard calls backup. Redirect a courier quietly, intercept it with foam, or hack a faster route. An illustrated postal depot, expressive robots, impact bursts, and original layered sound give each trick a visible response. Ordinary play needs no model, server, API key, PCS installation, or research participation.

![Actual title screen](evidence/mailroom-v2/menu-chromium.png)

## Play locally

Install **Node.js 24 LTS**. In this directory, run:

```text
npm ci
npm run dev
```

Open **http://127.0.0.1:5178**. Click **Play now**. Follow the pulsing marker and the instruction above the arena. On Windows, the same commands work in PowerShell; use `npm.cmd` if your execution policy blocks `npm.ps1`.

To test everything locally, install the test browsers once, then verify:

```text
npx playwright install chromium firefox
npm run verify
npm run test:e2e:firefox
npm run test:soak
```

Linux hosts without browser libraries may also need Playwright's documented `install --with-deps` setup. Browser tests use a separate local test server; stop an existing dev server on port 5178 first. The test controller exists only in the `e2e` build mode. `npm run build` produces a normal `dist/` without that controller. `npm run preview` serves it locally.

## One focused heist, four tricks

| Mission         | Your job                                                                            |
| --------------- | ----------------------------------------------------------------------------------- |
| Mailroom Mayhem | Stash **three** parcels at home. Each haul raises security; the last brings backup. |
| Vault Panic     | Open the gate, grab the moon relic, return to the green exit.                       |
| Reactor Rush    | Disable three relays and shut down the core before the technician resets them.      |

| Control                            | Action                                           |
| ---------------------------------- | ------------------------------------------------ |
| WASD / arrows                      | Move                                             |
| Mouse                              | Aim                                              |
| Left click / J                     | Use selected gadget                              |
| 1–4 / mouse wheel / gadget buttons | Select foam, decoy, hacker, or fake notice       |
| Right click / K                    | Use a decoy                                      |
| Space / Shift                      | Dash, with brief protection                      |
| E                                  | Interact near the goal                           |
| Escape                             | Pause / resume                                   |
| Phone                              | Direction pad, tap arena to aim, Fire / Dash / E |

In the mailroom, an orange bay holds redirected parcels. Press E to collect one, then return to your green hideout and press E again. Holding a parcel slows normal movement slightly; dash still works. Guards give a suspicion warning before chasing. Their visible cones stop at walls, and a small close-range ring shows where they can hear you.

Gadgets recharge. Foam stuns and bumps robots; a decoy draws the guard away; hacking flips nearby devices; a fake notice changes the sign. Device gadgets show their range. Walls block movement and shots. Three hits or a timeout end a run; retry immediately with the same seed. Menus offer reduced motion, larger text, high contrast, mute, and local data deletion. A daily seed, local score history, medals, and earned scarf colors give reasons to replay. No online ranking or multiplayer is claimed. Vault and Reactor remain earlier prototype missions; this pass concentrates on the mailroom.

![Actual gameplay](evidence/mailroom-v2/live-arena-chromium.png)

[Watch the actual silent automated replay](evidence/mailroom-v2/automated-replay.webm). This is a verified input replay at 60 ticks/s, not a human playtest or real-model result. `npm run demo:record -- evidence/mailroom-v2/winning-replay.json` reproduces the recording with the current source and test browsers.

## Optional research, honestly labeled

In **Options**, enable **Keep research scenarios this session**. Use gadget 4 near a sign, finish the round, then open **Research Lab**. Inspect the synthetic task, compare two scripted fixture agents, and export its JSON. Nothing uploads automatically. Ordinary fights without a mapped sign event produce no research scenario.

The lab separates **a forbidden proposal** from **a forbidden action actually executed**. Its deterministic guards check every synthetic tool call. The cartoon bots are ordinary game logic. Their mistakes are not AI-safety evidence, and no Lean or PCS authority certifies this game.

Run the actual offline fixture suite:

```text
npm run research:offline
npm run research:offline -- --scenario evidence/scenario-delivery-sign.json --captures evidence/synthetic-source-cohorts.json
npm run research:check
```

Reports go to unique files under ignored `results/`; saved synthetic examples are under `evidence/`. The checked-in 36-evaluation report has 27 completed tasks, 9 forbidden proposals blocked, and zero unauthorized effects. These are intentionally constructed **fixture/simulated** results, not real-model findings. There have been **zero human participants and zero real-model calls** in this release.

### Optional model test: operator CLI only

The browser cannot call a model. `npm run research:server` only exposes a read-only loopback configuration status; it has no evaluation endpoint. The live adapter uses one bounded OpenAI Chat Completions request per control or attack variant, with structured tools and in-memory effects. It is a one-turn tool-plan test, not an autonomous feedback loop.

Use server environment variables, never browser variables or a committed key. `.env.example` is a reference; environment files are **not automatically loaded**. Set `OPENAI_API_KEY` through your normal local secret manager, choose an actual operator-authorized `OPENAI_MODEL`, set `CHAOS_MAX_CALLS=2`, and deliberately opt in with `CHAOS_LIVE_OPT_IN=yes`. Then:

```text
npm run research:check
npm run research:live -- --execute --scenario evidence/scenario-delivery-sign.json
```

This makes **two potentially billable calls**, prints the call/token plan, records provider usage where returned, and imposes a 512-completion-token cap per call, 15-second timeout, and no retries. It does not invent a dollar cost. The cap is per process, not an account-wide spending limit. Not every model supports this API/settings; unsupported models produce provider errors, not safety failures. Without explicit execution, no calls occur. Keep keys out of chat, browser code, and Git. [Method and limitations](docs/RESEARCH_METHOD.md) explain the interpretation.

## Evidence and scope

See the [current Mailroom v0.2 report](docs/MAILROOM_V2_REPORT.md), [historical v0.1 test report](docs/TEST_REPORT.md), [architecture](docs/ARCHITECTURE.md), [privacy](docs/PRIVACY.md), [threat model](docs/THREAT_MODEL.md), and [playtest protocol](docs/PLAYTEST_PROTOCOL.md). All art is original procedural graphics; sound is original Web Audio synthesis. Dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

This is a **review-only standalone addition** to the site repository. Nothing imports it from PCS; it is outside the existing served `public/` directory. Its new CI workflow has no deployment step or credentials. Existing PCS source, authority, CI workflows, dependencies, and production settings are unchanged. **This PR must not be merged or deployed automatically.** It can later move to its own repository without a runtime dependency on PCS.

## Static hosting later

No deployment was performed. A separately authorized static deployment can use Node 24, project root `chaos-theory`, build command `npm ci && npm run build`, and output `dist`. Upload those static files to a separate Cloudflare Pages project or equivalent host. No Worker, database, model key, or paid service is required. The optional operator CLI is not hosted by static files. Keep the current PCS site's deployment configuration unchanged. Test the resulting path and content-security policy before publishing.

## Troubleshooting

- **Blank arena:** enable Canvas support; check browser errors and retry. A renderer error is shown rather than a fictional running game.
- **Gadget did nothing:** check its cooldown, move into the outlined range, then release and fire again. Walls block decoy placement.
- **The door closed:** the technician repairs tampered devices. Hack it again, stun the technician, or use another route.
- **Research list is empty:** enable local scenarios before playing, use the fake-notice gadget at a sign, and finish the round. Reload clears event records by design.
- **Private browser:** scores may not persist; gameplay still works.
- **Port in use:** stop the other server before tests. Set `CHAOS_CHROMIUM` only to a compatible local Chromium executable if the default Playwright download cannot be used.
