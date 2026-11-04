# First human playtest protocol (not yet conducted)

Proposed goal: learn whether new players understand their objective, enjoy a round, and discover more than one tactic. This is not a safety efficacy trial.

Recruit a small consenting adult convenience sample. Start with a blank local profile. Explain no data is uploaded automatically and no model will be called. Let each person play without narration for one minute. Observe time to movement, first gadget, understood objective, successful interaction, retry, and use of alternate tactic. Ask separately for permission to retain a minimal anonymous observation sheet or exported synthetic scenarios. Participants can decline without losing play access.

Three questions matter most:

1. Without reading the docs, what are you trying to do, and what would you do next?
2. Which moment was fun or frustrating enough to make you retry or quit?
3. After seeing the lab, can you explain the difference between a scripted robot, a forbidden proposal, and a blocked effect?

Before collection: decide eligibility, consent and ethics review requirements, retention/deletion policy, pseudonymous assignment, compensation, accessibility support, and complaint/withdrawal route. Do not record names, IP addresses, screens, or audio by default.

Future controlled generator study: preregister equal round/evaluation budgets for consenting player-created, seeded random, and automated scenarios. Use the same template families, fixed model/config, separate held-out wording, blind deterministic grading, and independent task-success/violation measures. Randomize assignment/order. Count all invalid rounds and provider errors. Report denominators, structural novelty definition, time/cost, uncertainty, selection bias, adaptive search, and multiple comparisons. Separate transfer testing from exploratory scores. Current checked-in source cohorts are code-constructed synthetic examples, not pilot participants or evidence that players outperform a baseline.

## Implemented local workflow (v0.3)

From the menu choose Play & give feedback, read the local-data description and opt in. Let the newcomer play without coaching first. Normal retry buttons stay available; the optional feedback form comes afterward. Export only with the participant’s consent, then stop/delete observations on that device. Record assistance separately in an observer note; the application cannot establish whether a player was coached or was human.

The export separates game ticks from wall milliseconds, first movement/gadget use/pickup/deposit, hits, methods, second route, escape phase reached, terminal outcome and result-button clicks. Reaching the escape phase does not mean escaping successfully. Clarity/tactic/another-round answers are optional and can be cleared to Skip. A retry click is a separate observation from a stated intention to retry. Exports contain at most 20 runs, no names/raw keys/browser identity, and no automatic uploads.

Use `npm run playtest:analyze -- export.json` to validate and summarize. Missing timings remain null. Timing includes wall-time pauses/loading while game ticks exclude them; a 24-hour wall-time cap is marked explicitly. The mode distinguishes automated-test from unattested-local; neither is an authenticated human identity. No tool can turn these records alone into evidence of enjoyment, ethical approval or a causal advantage.

Initial tuning plan: observe 5–8 consenting first-time players, log hints separately, and identify repeated points of confusion before changing balance. Look for understood goals, a first successful trick, discovery of a second tactic, avoidable frustration and unprompted result-button choices. Do not optimize only for win rate, and do not discard losing or abandoned runs. No participants have been tested yet.
