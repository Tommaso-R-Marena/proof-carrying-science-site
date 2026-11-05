# Numeric intents: frozen real-model results

Actual Qwen3-0.6B Q8_0 CPU inference: **96 new requests**, 48 episodes, 12 new authored tasks (4 development, 8 prospective held-out). Both interfaces use the same unchanged Lean file policy and actual CSV publication. There is no safety-off arm in this phase.

The intent interface asks the model only for a numeric answer. The host selects the trusted target and the actual Lean compiler constructs any required inspection and write. This changes the division of work and restricts model authority. It is not model learning, autonomous protocol planning or proof that an answer is scientifically correct.

| Split | Notice | Interface | Completed | Executed writes | Unsafe versions | Malformed | Policy-ineligible | Profile rejection | Safe wrong final | Recovered | Calls |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| development | benign | tools | 0/4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| development | benign | intent | 0/4 | 0 | 0 | 8 | 0 | 0 | 0 | 0 | 8 |
| development | attack | tools | 0/4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 |
| development | attack | intent | 0/4 | 4 | 0 | 4 | 0 | 0 | 2 | 0 | 8 |
| held-out | benign | tools | 0/8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 |
| held-out | benign | intent | 0/8 | 0 | 0 | 16 | 0 | 0 | 0 | 0 | 16 |
| held-out | attack | tools | 0/8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16 |
| held-out | attack | intent | 0/8 | 0 | 0 | 16 | 0 | 0 | 0 | 0 | 16 |

## Interpretation

All responses, failed proposals and intermediate datasets are retained. Shared cases do not make individual episodes independent statistical samples. This tiny authored prospective split is not a blind external benchmark or a claim about pretraining novelty. Both arms receive all action budgets; malicious notes persist during repairs. The host never inserts the reference answer into a proposal or repair prompt.

Authority/intent-compiler startup including proof builds and audits: 16848 ms.

Greedy generation uses thinking disabled, 384 reply tokens, 4096-token context and two CPU threads. Costs include protocol builds, intent compilation, repeated checking, file publication and model inference. Model-time totals below are observed shared-host measurements, not portable latency promises.

| Split | Notice | Interface | Model ms | Executor ms | Workspace init ms |
| --- | --- | --- | ---: | ---: | ---: |
| development | benign | tools | 47870 | 548 | 189 |
| development | benign | intent | 34863 | 5352 | 183 |
| development | attack | tools | 50851 | 498 | 144 |
| development | attack | intent | 34915 | 5696 | 152 |
| held-out | benign | tools | 93023 | 1060 | 337 |
| held-out | benign | intent | 66264 | 10418 | 342 |
| held-out | attack | tools | 93624 | 988 | 315 |
| held-out | attack | intent | 64729 | 10393 | 291 |

## Proofs and trust

Nine new Lean theorems establish compiler eligibility, bounded plan length, authorization, exact proposed-value reachability, protected-cell/bound invariants, inspection consumption and composition. Together with the unchanged 33 earlier audits there are 42 named theorem audits. Parsing/encoding and host/physical execution correspondence are tested, not kernel-proved. A safe wrong answer is a real accepted negative control.

The original pre-publication native ledger is retained: 248 actual computations. Python verifies its exact causal input order, all saved calls, compilation records and physical CSVs. A fresh native replay recompiles every intent and recomputes every execution result. Replay is not new model inference, origin authentication or a proof against a hostile host.

The source archive was captured before first inference and is checked against frozen hashes. Sources are required to match exactly for native replay; no historical-source fallback is introduced. Host/storage remain trusted, checkpoints are unsigned and need separate retention, directory copies can fork, and process-crash tests do not prove power-loss durability. The authored CSV unit metadata and conversion factors are explicit evaluation assumptions. No production deployment or broad AI-safety result is claimed.
