# Safety Forge v1 — Foldit-inspired, falsification-first AI-safety game

**Status:** A versioned *synthetic* game and bounded verification research instrument, **not** a Lean 4 proof checker, an AI alignment solution, or a validated real-agent benchmark.

## Research hypothesis

Human interaction is worth collecting when it explores a search space and leaves inspectable **(state, action, outcome)** evidence rather than returning only one prewritten quiz answer. Safety Forge asks a player to (1) find a violating trace for a toy agent with incomplete guardrails and (2) discover an inexpensive shield that blocks **every reachable violation within a finite search horizon** while preserving the legitimate mission. It is inspired by Foldit's hands-on exploration and feedback loop, without implying a Foldit partnership or comparable scientific achievement.

### Why this is substantially more than rearranging fixed cards

- Seeded, reproducible scenarios provide four fictional worlds, a range of risk budgets, context-dependent shortcuts, sensitive/public reports, and a varying initial shield. Challenge links include the seed so independent people can replay the same problem.
- The action space supports genuine changes to a deterministic agent state: site inspected, operator authorized, report consented, at site, deployed, report shared, report redacted, and cumulative risk. Blocked transitions are distinguished from executed actions.
- Four explicit failure classes are independently checked: `RISK_BUDGET_EXCEEDED`, `UNAUTHORIZED_DEPLOYMENT`, `UNINSPECTED_DEPLOYMENT`, and `PRIVATE_REPORT_SHARED`.
- Players may learn from multiple attempted traces, including blocked, inconclusive and actually unsafe decisions. The simulator accepts **different** strategies depending on the state and scenario; a shortcut is sometimes safe.
- Repair mode offers nine selectable controls including targeted shields, a joint human-review gate, privacy-preserving redaction, and intentionally overbroad controls. The scoring rewards safe **and** live policies: simply disabling all work cannot earn a verified repair.
- `verifyShield(seed,guards)` exhaustively explores reachable synthetic states with breadth-first search up to seven actions and a 5000-state cap. It returns a shortest unsafe witness if found, checks that a genuine safe mission is reachable, reports a transparent cost and grade, and fails rather than pretending to verify if the state cap is exceeded.
- Session-only research achievements reward *actually found counterexamples*, recognized overblocking, and successful bounded repairs, not blind task count. A daily seed offers a reproducible community challenge. No points grant PCS levels or scientific authority.

## Research data contract

**All practice is local by default.** Only adults age 18+ who self-attest age, consent per donation, and sign in to a verified-email PCS account may contribute. A separate deliberate API request sends the bounded seed and **up to 12 user-selected action sequences plus 12 user-tested shield sets**. No free-form prompt, account credential, scientific code or file is uploaded by this game. Unauthenticated play never submits an experiment. Normal website analytics and HTTP access logs remain as described in privacy policy.

The authoritative data source is the *server's independent deterministic replay*: it recreates the scenario from the seed, replays the actions, computes every transition and violated invariant, and executes the same finite search on each guard proposal. Submitted user-reported verdicts, altered checker metadata, unknown actions, nonexistent guard identifiers, duplicated trials, empty traces, unsupported versions and excess samples are refused. IP-scoped rate limiting, a ten-session-per-day cap, a per-user unique digest, record deletion and D1 foreign-key cascade apply.

The Owner may export deidentified pages of up to 30 research sessions at a time. Only the Owner may see the export. Export includes the scenario, verified synthetic transitions, candidate shields, verifier outcomes, and collection *day*, but not usernames, email, IP address, account IDs or exact timestamps. The local converter `scripts/prepare_safety_forge_dataset.mjs` independently recreates all labels and strips the collection day even from derived episodes. No real collected participant data is committed to a repository.

### Available offline training targets

1. **Attack / counterexample search:** an observed toy agent state, a player-proposed action, available action choices, simulator's next state, blocking reason, violated invariant(s), and a declared synthetic reward (`+5` for violation witness; `-1` for blocked move; `0` otherwise). This is an explicit finite-state exploration trajectory, *not* a real proof-term execution history.
2. **Repair / constrained optimization:** scenario state and set of enabled guards, cost of those guards, exhaustive reachable-state count, existence/absence of safety counterexample, mission reachability, and synthetic validity/score. This supports offline repair proposal ranking, preference learning or constrained planning. **It does not record individual shield-toggle actions**, so do not mislabel repair proposals as complete micro-step RL trajectories.
3. **Independent evaluation:** split by scenario seed (`seed % 7 == 0` held out). Never put different attempts from the same seed into training and evaluation. Parameter families still share semantics, so seed-only holdout is **not** proof of transfer to unseen agents or real Lean goals. Stronger domain-level holdouts are required in subsequent evaluation.

### Why scores are not assurances

The simulator defines its own small reference-world rules. Successful exhaustive exploration proves only that *this implementation*, under these stated transitions and finite bounds, found no unsafe reachable state and found a safe goal route. No mathematical theorem of the simulator's correctness has been kernel-checked. There is no cryptographic verification, reliable deployed-agent observation, Lean tactic correctness, or universal AI alignment guarantee. The known Aristotle unregistered-check soundness issue in the independent PCS Lean authority remains a separate release blocker and is never bypassed here.

### Next scientific tests before relying on training data

- Independently implement the same transition rules and differential-test many seeds, guards, and trajectories against the web engine. Fuzz unknown actions, malformed states, silent failures and impossible goals.
- Quantify training-data utility *relative to controls*: random policy proposals, hand-authored basic shields, counterexample BFS baseline, held-out seeds, and stronger withheld rule templates. Publish failure rates as well as wins; score only independent verified repairs.
- Record and audit duplicates, approximate participant count without deidentifying linkage leakage, hint use where later explicitly disclosed, and gaming/bot contamination. Server replay authenticates *simulated semantics*, **not** that a human independently invented the policy.
- For actual Lean 4 alignment/proof-search research, create a separate trusted adapter from real `goal state → tactic → new goal state → kernel proof verdict` episodes. Bind them to exact Lean/Mathlib build hashes; reject unknown checker types. Do not use toy game data as real Lean proofs.

## How to test locally

```bash
node --test tests/safety-forge.test.mjs tests/safety-forge-dataset.test.mjs
node --check public/safety-forge-core.mjs
node --check public/arena-safety-forge.js
node --check scripts/prepare_safety_forge_dataset.mjs

# After an explicit Owner export (do not commit participant data):
node scripts/prepare_safety_forge_dataset.mjs PRIVATE_OWNER_EXPORT.json PREPARED_SYNTHETIC_TRAJECTORIES.json
```

Security and release checks run before each Cloudflare deployment via `npm run verify:release` and `npm run test:safety:forge`. Migration `0018_safety_forge_research_sessions.sql` is additive, versioned, and account-deletion-safe. The game can be rolled back independently of private CertiForge and Aristotle source.

## Research and privacy handling

Consent is opt-in and per uploaded session, not blanket approval from site account registration. The user can erase their active-database rows through `POST /api/arena/safety-lab/erase`; deletion cannot automatically recall prior exports, backups or trained model weights. Consider appropriate ethics review and stronger age-assurance controls before expanding collection or releasing data publicly. **Do not** incentivize children to donate gameplay data or represent users' self-declared age as verified.

## First honest learning benchmark

After an Owner-approved export and independent replay-data preparation, run:

```bash
node scripts/prepare_safety_forge_dataset.mjs PRIVATE_OWNER_EXPORT.json PREPARED_DATA.json
node scripts/benchmark_safety_forge.mjs PREPARED_DATA.json BENCHMARK_REPORT.json
```

The evaluation script does **not** pretend to run a neural model or RL agent. It learns a simple, interpretable, context-conditioned preference ranking from **successful donated shield configurations**, then tests its recommendations on held-out scenario seeds against three explicit comparators:

- the original, intentionally flawed guardrail configuration;
- a hand-designed robust shield `joint_review + risk + redact`;
- a separate finite search over all (2^6) combinations of the six targeted guards for minimum feasible valid cost.

It reports safety-and-liveness success, mean shield cost and cost regret relative to the small finite oracle. Crucially, it will **abstain** when there are fewer than five training sessions, three held-out sessions, or three successful training repair examples. Zero consenting participants means no claimed model-training result. The holdout is by *scenario seed*, not by genuinely new agent semantics; it is necessary but insufficient for generalization. This benchmark is a falsifiable local experimental baseline for planning heuristics, not evidence of alignment or formally verified Lean proof search.
