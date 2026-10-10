# Aristotle follow-up: portable kernel proofs for the completed PCS reference package

Use Lean 4.28.0, exact release commit 7e01a1bf5c70fc6167d49c345d3bf80596e9a79b, and Std only. The attached source-only workspace contains the exact 22 sources from run b9577162-8244-44ff-83ca-dc7efe9d95a4 (archive SHA256 5bbe5fdcae4acad3d7bbe48de26559e89bc2eae2c0681a23526e2cedf4ea95a6). Treat logs as submitted evidence, not an independently verified result.

The actual integration independently compiles the general modules, audits all 214 general named theorems with only propext/Classical.choice/Quot.sound, and rejects the three intended false claims. Lean/Python/JavaScript outputs match on 91 finite tasks, with 74 independent exhaustive oracle comparisons. This does NOT establish implementation refinement.

The blocker is independent execution of PCSDecisionDiagram/Controls.lean. Fresh ordinary kernel checks report excessive memory at dm24_decision under 14 GB and 28 GB profiles. The standard public GitHub runner completed the 288-job default library build, then spent almost two hours in Controls without completion despite 32 GiB swap and a 40000 MB Lean limit; it was cancelled. The current cloud machine has a 32 GiB hard memory limit. Your returned build log reports 559 seconds for this module, without a memory measurement; reproduce from empty .lake, never rely on previous oleans.

## Required result

Make the exact existing positive controls independently kernel-check in a reproducible CPU-only profile with at most 6 GiB peak process memory and at most 20 minutes wall time on a standard runner. Do not weaken or omit any original positive or negative control. In particular retain the exact original types of dm24_decision, dm24_equivalent and choices12_summary, DEFAULT_LIMITS, 24-variable balanced De Morgan and 12 disjoint choices, count 4096, minimum 12, reconstruction and all rejection controls. All 226 original named positive declarations and all 66 anonymous positive controls must remain checked.

Prefer changing only proof scripts or adding small, reusable computational certificates/lemmas that the ordinary kernel checks. Break very large reductions into bounded proof steps if necessary. Keep a byte-identical copy of the original package for comparison and record every changed source digest. Preserve declaration names, types and algorithmic contracts. Import only Std, with no dependency, toolchain or lock changes.

Do not use sorry, admit, axiom, unsafe, implemented_by, native_decide, Lean.ofReduceBool, trust-level bypasses, patched kernels, hidden hypotheses, smaller theorem goals, altered test limits, or uploaded compiled artifacts as evidence. Native execution may measure outputs, but cannot discharge proof obligations. Do not suppress errors or convert time/memory exhaustion into success.

## Optional genuinely useful general lemma

Investigate exact fuel stability for PCSDD.apply: with Inv n lim m, valid root indices a,b, and structural fuels f and g at least n+1, prove equality of their complete Except results (including manager/work/error data). A depth bound alone is not enough: preserve cache-hit accounting, operation-limit and node-limit behavior. If reducing applyFuel is necessary, prove universal Lean-to-Lean observational equivalence of the old and new helper/compile/pipeline/check/plan results on the documented valid inputs, including every resource-limit outcome. Do not infer Python/JavaScript refinement from a Lean-to-Lean theorem. If this route does not improve measured kernel performance, retain the original algorithms.

## Required evidence

1. Clean build with exact command, exit status, wall/user/system time and peak RSS.
2. Exact final source manifest; all original theorem types preserved.
3. Complete axiom audit for all 226 original named theorems, plus every new helper theorem.
4. All positive controls execute via ordinary kernel proof checking.
5. Negative files separately fail for the three intended mathematical reasons, not imports or syntax.
6. A short explanation of why the performance change preserves the original statements and evidence boundary.
7. If the budget is unattainable, report the actual failed measurement and exact unresolved lemma/control rather than claiming completion.

No claim about Python/JavaScript refinement, learned model improvements, scientific authority or intelligence is requested. This assignment addresses the concrete kernel-verification release blocker.
