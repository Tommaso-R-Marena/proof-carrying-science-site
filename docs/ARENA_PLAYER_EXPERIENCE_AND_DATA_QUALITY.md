# PCS Arena: player experience and research-quality contract (October 2026)

## Two games, different scientific uses

**Proof Quest** is an approachable prerequisite-ordering game. Cards are shuffled on each start so their initial visible order does not disclose a solution; undo, hints, repair explanations, stars, and next-mission progression teach the reasoning task. Consented exports are still only ordered step IDs, hint counts, and server-graded outcomes on **eight fixed synthetic puzzles**. They can be used for a narrowly defined next-step dependency planning benchmark, **not** as Lean proof-state/tactic supervision or evidence of real-world alignment. All valid topological orders can be accepted; score isn't a proof.

**Safety Forge** is a replayable finite-state red-team and shield-repair simulator. All local trials (including failures) have independently computable action-state transitions. Completed runs are added to a *local-only* notebook automatically; consenting signed-in adults can choose to donate an entire bounded session. The Worker rebuilds every trace and candidate repair using pinned scenario semantics. The offline converter produces: (1) counterexample-search state/action/outcome trajectories, (2) per-candidate shield reward labels, and (3) pairwise policy preferences **derived from the verifier** between different rewards in the same scenario. Pairwise rows aren't additional independent human examples.

## Consent and accessibility

Both games are open to everyone to play; optional research sharing is only for contributors self-confirming age 18+ with a verified PCS email. A single visible, keyboard-focusable switch clearly combines the self-attestation and research-consent statement. Turning on the switch **never transmits a run**; the separately labeled Share/Donate button submits that session. The existing backend still requires both `adult_confirmation: true` and `consent_training: true`, authenticates the user and verified email, rate-limits submissions and supports erasure. Consent resets for each new mission. Privacy links, owner-only export, and limits of deletion remain available.

Tutorials are three small steps, skippable and replayable. Controls have accessible names and focus outlines. Consent text is compact but legible and always visible; it must never imply the whole game is age-restricted.

## Quality and falsification, not vanity counts

1. **Validate integrity:** independently replay every donated entry, reject forged labels and malformed attempts, and keep PII off model-training exports. Source labels alone do not prove a human acted independently.
2. **Measure actual independent samples:** report distinct consented people and unique scenario seeds separately from derived transitions and preference pairs. Duplicated play must not count as independent evidence.
3. **Control contamination:** distinguish hinted/oracle-assisted attempts from unassisted ones. Keep entire scenario seeds on only one side of train/test splits; a split by seed still shares the same simulator rules.
4. **Compare to strong baselines:** use the existing `scripts/benchmark_safety_forge.mjs` baseline harness; compare trainable suggestions to robust hand-designed guard policies and finite optimal solutions, not merely to the deliberately broken starting guard.
5. **Test unfamiliar semantics:** new held-out agent rules and external human playtests are needed before claiming broad generalization. Improvement on the same toy simulator does not prove AI alignment.
6. **Progress toward Lean:** if the product goal is Lean proof-search RL, introduce a separate verified adapter for exact `(goal-state, tactic, resulting-goal-state, kernel verdict)` from Lean 4 and held-out theorem families. Never relabel these toy games as Lean examples.
7. **Consent and ethics:** do not gather minors' data, silently upload local moves or hide the age/donation limitations. Evaluate independent ethics and privacy review before widening research collection.

## Practical QA

On desktop, mobile and keyboard-only input, confirm: first visit tutorial, Skip, replay tutorial, choose cards in a shuffled bank, undo, hint, check invalid and valid routes, retry/next level, and opt in/out without any request until pressing Share. For Safety Forge: take an unsafe path, observe it recorded in local notebook, proceed to repair, trigger both unsafe and overblocking counterexamples, find valid repairs, then start a new world; consent should reset. Attempt to share while signed out, before two experiments, or with the switch off: no stored donation. Then share while authenticated and verified, inspect the server-derived labels, and test individual erasure. At each step confirm the API retains its existing rate limits and trust boundaries.

Run `npm run test:arena:onboarding`, `npm run test:safety:forge`, `npm run test:quest`, `npm run verify:release` and an actual browser smoke test before promotion. The new onboarding test is a static contract and backend example check, **not** a substitute for visual testing or an end-to-end D1 integration.
