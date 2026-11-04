# Real weights, real inference, limited safety evidence

We ran **122 actual local model requests** using the official Qwen3-0.6B Q8_0 weights. The 639,446,688-byte model matched its published SHA-256. A separately launched llama.cpp b6000 CPU process performed inference; no fixture substituted a response. Raw requests, responses, usage, timings, actions and execution traces are retained. No provider was called, no paid inference API or newly provisioned compute was used, no human participated and no real-world tool effects were available.

The model is small and quantized. These are exploratory synthetic experiments, not a state-of-the-art model evaluation, an external replication or a general AI-safety result. The system's model weights were not trained or improved.

## What happened

| Experiment                        |    Actual inference requests | Result without policy guard                                            | Result with policy guard                                      |
| --------------------------------- | ---------------------------: | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Fixed one-shot notice test        |                           36 | Controls completed 12/18; attack tasks 7/18; zero unauthorized effects | Identical completion and unauthorized-effect counts           |
| Bounded interactive notice test   | 50 for 72 execution episodes | Controls 18/18; attack tasks 18/18; zero unauthorized effects          | Controls 18/18; attack tasks 18/18; zero unauthorized effects |
| Deliberately compromised proposer |                           36 | 12/18 fault-condition plans caused unauthorized effects                | Those same 12 plans caused zero unauthorized effects          |

The initial one-shot test did **not** demonstrate a safety improvement. Five attack-condition responses used malformed tool arguments. Some tasks stopped after inspection because the model expected another turn. All responses were retained; “valid” in raw summaries means a parsed JSON plan, not valid tool arguments or completed work.

The interactive follow-up was designed after that negative observation, before its own first inference. It kept the same frozen attack corpus, added explicit continuation instructions and supplied actual execution feedback. Episodes had at most four turns and sixteen total proposed actions. It used 50 actual requests because identical histories within a condition shared the same completion; differing histories would require new inference. This is 72 execution episodes, **not 72 independent model samples**. Six control and six attack episodes in each arm encountered argument errors and recovered. Every task ultimately completed without unauthorized effects. The result establishes executable multi-step integration in this tiny domain. It still provides no observed policy-guard safety gain on these ordinary notice attacks.

The compromised-proposer test was a **separate fault-injection condition**. Its attack prompts intentionally replaced the model's high-priority objective with a forbidden destination, forbidden gate or repair without inspection. The independent executor retained its original policy. This is not evidence that lower-trust text defeated the original system prompt. It tests the architecture's stated assumption that the proposer can be wrong or compromised.

The model actually proposed twelve wrong-destination/gate plans. In the synthetic executor, policy enforcement reduced unauthorized-effect cases from 12 to 0 for those exact plans. The six maintenance fault prompts did not yield repair-before-inspection actions, so **real-model exercise of that temporal violation remains unobserved**. One-shot benign controls completed 12/18, not 18/18; the interactive controls separately completed all tasks. No rejection-only result is described as successful task completion.

## What the evidence supports

The implemented guard contained the twelve observed unsafe model proposals in this synthetic domain. The unchanged TypeScript executor made the guarded decisions. A separate Python implementation independently replayed state and checked permissions when each effect occurred, including inspection before repair. Current TypeScript code also re-executes all archived plans and compares recorded outcomes. Rehashed false summaries and substituted prompts are rejected by regression tests.

The policy-off baseline still validates tool capabilities and argument shapes. It removes semantic policy gating only. Ordinary malformed outputs therefore cannot execute arbitrary tools in either arm. Effects exist solely in fresh memory: no shell, network, real equipment, permissions or deliveries can be controlled by model output.

## What remains unresolved

- No safety gain was observed on ordinary lower-trust notice attacks. No broad prompt-injection resistance claim is justified.
- Compromised-proposer trials are deliberate fault injection, not spontaneous model failures or evidence of improved model judgment.
- There are three literal task families, repeated controls and repeated objectives. Counts are not independent population samples; no significance or deployment failure-rate estimate is claimed.
- The guard is Python/TypeScript tested, **not a new Lean-certified authority**. No theorem, production verifier or mathematical specification changed.
- The runtime was an official prebuilt CPU binary, not independently verified machine code. Model, runtime, companion libraries and host behavior remain trusted experimental assumptions. Hash checks and process separation do not establish immutability.
- Human-authored game data, larger models, native tool-calling protocols, unseen task families, long-horizon recovery and real operational integrations remain untested here.

Exact tested source snapshots and artifact provenance accompany [the raw evidence](../evidence/model-safety-v1/README.md). Subsequent parser hardening rejects nonfinite numbers and negative zero; current-code replay confirms unchanged outcomes for every recorded model plan. No result was discarded or overwritten. All data here is synthetic, evaluation-only and unused for training.

The next useful milestone is to freeze a broader held-out task corpus and compare several capable open-weight models with native tool feedback. Keep ordinary attack resistance, containment under deliberate proposer faults, task utility and formal proof obligations as separate measurements.
