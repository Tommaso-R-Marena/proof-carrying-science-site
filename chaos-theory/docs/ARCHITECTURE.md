# Architecture

One TypeScript package keeps setup small. `src/sim.ts` owns fixed 60 Hz state transitions, seeded xorshift choices, geometry/LOS/BFS, gadgets, goals, timers, and capped score components. Props use center coordinates; wall rectangles use top-left coordinates. `step` normalizes bounded typed input. Substeps prevent dash tunneling. Door closures check actor overlap. Navigation returns an explicit unreachable result.

`scene.ts` uses Phaser 4.2.1 Canvas to render that state with original shapes, shadows, device previews, effects, and reusable text objects. It decides no gameplay verdict. `main.ts` handles semantic HTML menus, input, lifecycle, local state, and lab presentation. Audio is separate original synthesis after a gesture. The renderer loads lazily after Play. A delta clamp limits catch-up work; pause/focus loss stops simulation. Replay reflects simulation ticks, not wall-clock latency.

`contracts.ts` is the narrow mapping contract: versioned run metadata and bounded typed events. `research.ts` validates it, emits fixed synthetic scenarios, canonicalizes/hashes them, checks policy, evaluates structured tools in memory, and grades final sandbox state. No renderer is an authorization authority. `live.ts` is imported only by Node scripts. Browser builds are scanned for the adapter, secret-variable names, and the test controller.

Replays contain mission, seed, build identifier, bounded inputs, periodic 60-tick checksums and a final checksum. `verifyReplay` recomputes the simulation. The checksum is a noncryptographic reproducibility check. Scenario SHA-256 detects changes to a record and binds its supplied source capture; neither authenticates a human, device, build binary, or trustworthy origin. Compatible deterministic behavior is tested, not kernel-proved. Source/lockfile/commit must travel with research evidence.

The test harness in the `e2e` build mode can advance valid player inputs and inspect state. It cannot write state or award a win. Production constant folding removes it. It is deliberately not an anti-cheat mechanism: browser owners can change their own program.

Progress version 1 stores bounded best scores, recent outcome/seed/score summaries, selected earned scarf, and settings. Raw event records remain session-only. No live game is resumed after reload. Corrupt or blocked storage falls back to defaults. All missions and gadgets are open regardless of scores.

The optional HTTP server listens on 127.0.0.1:8788, accepts only exact-host GET /status without Origin, and executes no evaluation. Model runs are explicit local CLI actions; model-selected tools cannot access network, shell or files. This is process separation from the browser, not an immutable root, isolated operating-system sandbox, or formal proof of the host implementation.
