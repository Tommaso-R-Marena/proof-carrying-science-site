# Check the calculation as well as the permission

A protected dataset can still contain a wrong answer. In the new real-weight experiment, numeric intents produced four permission-allowed writes, all incorrect. The additional conversion gate checks a narrow mathematical requirement: **the proposed value must equal the original input value times the owner's multiplier**. It then uses the existing intent compiler and file authority to publish the exact checked CSV.

This is useful for simple integer unit conversions whose multiplier and source-unit metadata you already trust. It does not establish that a measurement, source-unit label or chosen multiplier is scientifically valid. It is not a general scientific-answer checker.

## Convert a supported local CSV

From `chaos-theory/`, with Node 24 dependencies and qualified Linux x86-64 Lean 4.28.0:

```sh
source ../scripts/activate_lean_428.sh
printf 'id,value\nsample,7\nreference,42\n' > measurements.csv
npx --no-install tsx scripts/conversion-gate/cli.ts init /tmp/my-conversion measurements.csv measurements sample 1000 > receipt0.json
npx --no-install tsx scripts/conversion-gate/cli.ts convert /tmp/my-conversion receipt0.json > receipt1.json
npx --no-install tsx scripts/conversion-gate/cli.ts show /tmp/my-conversion receipt1.json
```

The original input stays unchanged. The checked output contains `sample,7000` and `reference,42`. The result prints its actual CSV path. **No model is used:** Lean computes the candidate, then both conversion and permission checks run before publication. A model is unnecessary for this known multiplication; this deterministic path is a useful baseline, not AI performance.

To check an external or model-proposed answer instead:

```sh
printf '{"value":"7000"}\n' > answer.json
npx --no-install tsx scripts/conversion-gate/cli.ts apply /tmp/my-conversion receipt1.json answer.json > receipt2.json
```

Only a single canonical numeric string is allowed. A wrong value, protected-target override, malformed response or out-of-bounds result is rejected. Rejection exits with status 2, prints structured reasons and leaves the last checked version active. Save every new receipt outside the workspace; later calls need the latest one. Conversion always uses the **original input**, so retrying does not multiply an already converted result again. There are at most four committed proposals per workspace.

Supported input is the same narrow canonical CSV profile as the [file gate](GENERAL_FILE_GATE.md): ASCII IDs, unique rows, natural numbers up to 1,000,000 and LF framing. The owner multiplier is a positive canonical integer up to 1,000,000. Products outside the permitted artifact range fail closed; they are never rounded or truncated. Fractions, arbitrary tables, uncertain units and floating-point conversions are unsupported.

## What is proved

`FileConversion.lean` adds nine Lean theorems:

- `matches_exact`: the executable relation is exactly equality to the original value times the multiplier.
- `rejects_wrong`: an incorrect numeric answer cannot compile under this refinement.
- `accepted_relation`: successful compilation implies that equality.
- `accepted_policy`: successful refined compilation also satisfies the unchanged intent compiler.
- `exact_output`: executing the refined plan yields the required value.
- `protected_output`: protected cells remain unchanged, derived from the existing policy invariant.
- `bounded_output`: initially bounded editable cells remain bounded, derived from the existing invariant.
- `history_exact_output`: the same exact result follows any prior guarded history; the reference remains the original source value.
- `safe_wrong_exists`: a kernel-checked counterexample shows that the permission-only compiler can accept 8 where the required conversion is 7 × 1000.

The new proofs use only standard `propext` and `Quot.sound`; the concrete counterexample is axiom-free. Together with numeric intents and the previous policy/decoder proofs, there are 51 named audits. No earlier theorem is changed. The semantic check is executed by actual source-built Lean, compared with independent exact TypeScript arithmetic, and followed by the original Lean intent compiler and file authority.

Parsing, encoding, cryptographic hashes and physical host execution remain tested implementation assumptions. The theorem's natural-number source must correspond to the parsed original CSV cell; that correspondence is independently tested, not kernel-proved. The scientific meaning of the multiplier and source metadata is an explicit owner assumption.

## Durable job binding

A job fixes the original CSV bytes, selected resource/row, multiplier, enforcement implementation and underlying authority. Its hash is carried in a separately retained wrapper receipt. Model text supplies none of those fields. A changed job, source, implementation, stale receipt or conflicting promotion fails closed. Concurrent submissions use the original expected generation through the final commit; they cannot silently adopt a newer checkpoint.

On reopening, the wrapper rebuilds the checkers, replays the complete underlying receipt chain and verifies **every committed plan** against the fixed conversion relation. A caller who uses the weaker lower-level permission interface to publish a wrong conversion cannot promote that history through this wrapper. The tests perform that bypass and verify rejection.

After an uncertain acknowledgement, use `recover DIRECTORY LAST_GOOD_RECEIPT.json`. Recovery adopts a suffix only after checking its original retained anchor, every physical CSV and every conversion. A semantically incorrect suffix is rejected. There is no automatic stale-state fallback.

These are unsigned local records under a trusted host/filesystem. Hashes, process separation, source pins and POSIX operations do not establish immutable storage, independent administration or protection against a hostile same-user process. Retained checkpoints are necessary for rollback detection; unprotected copies can fork. No power-loss durability proof or production deployment is claimed.

## Evidence and interpretation

The frozen real-model comparison used 96 new actual Qwen3-0.6B Q8_0 CPU requests. Neither interface completed any of its 24 tasks. The numeric interface performed four incorrect writes in two development attack episodes; all other numeric episodes failed the required string profile. The original native ledger is retained. No prompt, policy or decoder was relaxed to improve the result.

A separate conversion-gate campaign reuses the 48 exact saved numeric proposals. All are rejected; all twelve authored correct conversions are accepted and physically written. This is **archival filtering**, not an adaptive live-model counterfactual: the original repair requests were generated using the weaker interface's feedback. It establishes no improved model competence or task-completion rate. Correct authored controls and deterministic CLI conversion are not model successes.

```sh
npx --no-install tsx scripts/conversion-gate/test-parser.ts
npx --no-install tsx scripts/conversion-gate/campaign.ts evidence/file-intents-v1/live
```

The campaign also checks a direct lower-level bypass, multiplier/receipt substitution, concurrent commits and safe/incorrect recovery suffixes. [Raw evidence and full negative findings](../evidence/file-intents-v1/README.md).
