# Checked Lean action coverage: failures retained, working repairs

Three independently interpreted authored problems exposed missing receiver actions: equality transitivity with zero, disjunction absorption and contraposition. Before repair, the frozen parent graph model, the arithmetic feedback checkpoint and symbolic search each returned `unknown` on all three. Independent manual Lean controls checked afterward prove all three with no axioms. No failed search was relabeled a proof or counterexample.

The receiver now offers introductions for negated goals, applications of negated premises, rewrites through conjunction equality projections and fresh accessible names after disjunction splitting. The constrained case action renders `rcases hypothesis with hN | hN`, keeping both branches as real obligations. An adversarial test closes one branch of the false statement `A ∨ B → A` and requires the remaining branch to stay open and final verification to reject it. Bounded identifier validation continues rejecting tactic injection; existing action encodings remain accepted. Lean, authority imports and registered checkpoint bytes are unchanged.

| Development problem | Parent expansions | Feedback expansions | Symbolic expansions |
|---|---:|---:|---:|
| Equality chain with zero | 33 | 37 | 37 |
| Disjunction absorption | 12 | 12 | 12 |
| Contraposition | 21 | 20 | 19 |

After the action repair, each policy verifies 3/3 under the same maximum 96 expansions, depth 18 and beam 4. Proofs take seven, six and seven steps respectively. Nine completed policy runs on three problems are not nine distinct theorems. Each exported proof passes an additional standalone Lean 4.28 kernel check; eight use no axioms and the feedback equality proof uses only `propext`.

These are development regressions after inspecting the original failures, **not untouched generalization or learned improvement**. No further fitting occurs. The parent uses fewer equality expansions than the feedback checkpoint; neither graph nor RL superiority is established, and the experimental feedback checkpoint is not promoted. Existing frozen model/RL benchmarks retain their original sources and results.

Action-source revision: `1dff9843854c2b3ad99cd2b22b7f6880e6823ac0`. Original frozen diagnostic source: `4190a40831e34d14c878b25d26b23c8cdcbe8638`. The separate arithmetic feedback training snapshot remains `3cfc1fff3bf0c722f968e50cf2cb874fbe44d838`, with its original checkpoint and source artifacts unchanged. Runtime source hashes in this bundle identify the newer action overlay separately.

The post-repair searches and standalone verification use 35.755 wall seconds, 1.034 controller CPU seconds and 34.828 child CPU seconds. The largest completed child reports 2,529,772 KiB maximum RSS on Linux. These intervals exclude Python/framework imports and dependency setup. There are zero additional gradient updates, GPU use, public proof dispatches or production database mutations. Existing CPU resources are used; no paid service is invoked.

Forty-two local Lean-learning/fidelity/integrity regressions pass. The complete local core gate passes all original Lean controls, complete axiom inventories, required false-claim rejections and 1,352 Python tests. Protected release approval is recorded separately in [the integration report](../reasoning/aristotle-omega-dd-integration-REPORT.md), once those checks and the owner merge complete.

The lab includes the three examples, automatic model search and manual branch exploration. Local browser checks at 320, 390, 768 and 1440 pixels complete all three searches and the two-branch exercise without detected horizontal overflow or page errors. Because the prior local service occupied its port outside the current process view, this test routes its isolated browser origin to a new real loopback backend on port 8767. It makes no production transport or origin-security claim. No public statement is submitted or consent inferred.

## Reproduce

[Full failures, successful traces, proofs, checkpoint and runnable evaluator](checked-action-coverage-v1.tar.gz) · [SHA256](checked-action-coverage-v1.sha256) · [measured comparison](checked-action-coverage-summary.json).

The 50-member archive includes every original failed search, independently checked truth controls, all nine post-repair trajectories and standalone proof checks, the original arithmetic feedback checkpoint, runtime source hashes, license and digest manifest. Its README specifies the exact source and commands. Outputs must go to a new directory. The evaluator does not fit these tasks or update the model registry.

English meaning is independently compared with authored typed labels in the supported grammar; unrestricted English fidelity and Python/Lean refinement are not proved. Models propose actions; only the independent verifier can accept a proof of the immutable original statement. Scientific acceptance remains blocked and `pcs_authority` stays false. These elementary results are not claims of new mathematics or autonomous scientific discovery.
