# Save a checked session and safely reopen it

The experimental local controller can now save every accepted submission to disk. When it opens that session again, a fresh Lean process checks the original model text and TypeScript recomputes the receipts. The controller exposes the state only after both agree.

This is a research tool for the three synthetic delivery, gate and maintenance tasks. It does not control real equipment or change production PCS authority. The game still works offline without any of these tools.

## Try it without a model

Use the qualified Linux x86-64 Lean 4.28.0 toolchain and the existing Node 24 dependencies. From `chaos-theory/`:

```sh
source ../scripts/activate_lean_428.sh
npm run --silent research:journal -- create /tmp/my-checked-session maintenance-note > receipt-0.json
printf '%s\n' '{"actions":[{"tool":"inspect_equipment","args":{"equipmentId":"reactor-1"}}]}' > inspect.json
npm run --silent research:journal -- submit /tmp/my-checked-session receipt-0.json inspect.json > receipt-1.json
printf '%s\n' '{"actions":[{"tool":"repair_equipment","args":{"equipmentId":"reactor-1"}}]}' > repair.json
npm run --silent research:journal -- submit /tmp/my-checked-session receipt-1.json repair.json > receipt-2.json
npm run --silent research:journal -- show /tmp/my-checked-session receipt-2.json
```

These are authored demonstration plans, not model responses. Each invocation starts a separate real Lean process. The final receipt shows inspection followed by repair. Trying repair first records a denial without changing the synthetic equipment state.

Use `--silent` when saving npm output as JSON. Save each result to a new filename outside the journal directory. Each output contains a `checkpoint` and independently replayed `snapshot`; later commands accept either that complete output or its checkpoint alone. Keep the latest acknowledged checkpoint separately. Do not redirect output over the checkpoint you are reading.

## Run the actual local model

The existing runner supports an explicit durable mode:

```sh
python3 scripts/local_model_recovery.py --execute --history --lean --durable \
  --model /absolute/path/Qwen3-0.6B-Q8_0.gguf \
  --runtime /absolute/path/llama-server \
  --seed evidence/model-safety-v1/compromised-proposer \
  --output /absolute/path/to/a/new-directory
```

The [existing real-model setup](REAL_MODEL_SAFETY.md) provides the qualified weight/runtime details. The protocol is written before new inference. Every episode gets its own `journals/journal-N/`; separate `checkpoints/` files retain each acknowledged generation. These sibling files are convenient records, not protected storage. Copy a trusted latest checkpoint to independently controlled storage if rollback detection matters. A host that controls both locations can replace them together.

Reproduce the saved computation without model weights or an API key:

```sh
python3 scripts/local_model_recovery.py --verify /absolute/path/to/the/run
npx --no-install tsx scripts/replay-durable-model-evidence.ts /absolute/path/to/the/run
```

Python checks model requests, report hashes, causal histories, journal chains and mathematical state transitions. The native replay separately rebuilds the current exact source closure, checks every final journal and recomputes the recorded Lean authorization ledger. Neither replay makes new inference requests or authenticates the experiment's origin.

## What is committed

`session.json` binds a random session identity, the registered scenario, initial state and authority fingerprint. The fingerprint binds the qualified Lean compiler, all 21 theorem audits, four formal sources, selected controller/codec sources, package metadata and lockfile, and TypeScript configuration. Node, dependencies, standard libraries and host execution remain trusted. It is a source fingerprint, not a signed attestation of physical execution.

Each `commit-N.json` binds its generation, previous digest, **exact original model-plan text**, and full replayed snapshot. The existing snapshot head binds semantic actions; the additional journal digest also distinguishes semantically equal text with different whitespace. All journal files use a strict canonical JSON envelope. Duplicate keys, normalized number spellings, extra schema fields, invalid UTF-8 and oversized files fail closed. Valid model text inside the envelope retains its original spelling.

The writer creates a unique temporary file, writes and synchronizes it, then atomically hard-links it into the next generation slot. An existing slot cannot be overwritten. The directory is synchronized before successful publication is returned. Separate processes may both finish verification, but only one can create the same slot. A stale loser must reopen and reverify; it cannot overwrite the winner. Reads are bounded even if a file grows after its size check.

Recovery requires a contiguous chain. Symlink entries, unexpected files, source/authority mismatches, changed records, invalid receipts, unknown scenarios and Lean failures are rejected. Recognized uncommitted `.pending-UUID.json` files are ignored and counted, never treated as authorization. They are retained for diagnosis. The four-submission and sixteen-action budgets and terminal-state rule remain unchanged.

## A crash can leave an uncertain acknowledgement

Before the atomic link, there is no committed new generation. After the link, the complete record may exist even if synchronization or acknowledgement fails. That writer stops accepting submissions until a fresh replay.

Ordinary `show`/`resume` requires the latest exact checkpoint. It rejects an unexpected suffix. To inspect and explicitly adopt a fully reverified suffix after a crash:

```sh
npm run --silent research:journal -- recover /tmp/my-checked-session last-good-receipt.json > recovered-receipt.json
```

Recovery checks that the retained prefix still matches, then reauthorizes every subsequent raw plan before exposing its state. It does not infer that the proposer was authenticated. A checkpoint detects truncation only below the generation it actually protects. A generation-zero checkpoint cannot establish whether later unseen records were deleted.

## Tested guarantees and limits

`npm run test:journal` runs the real source-built Lean gate, independent Python replay, archived real-model plans, killed process groups, a directory-sync error and two simultaneous writer processes. It also tests malformed storage, receipt substitution, raw-text identity, rollback below a retained checkpoint, Unicode key ordering and temporal inspection/repair continuity through a newly built process.

The suite deliberately reproduces a counterexample to global fork prevention: copying an unprotected directory permits two different valid continuations from the same checkpoint. Atomicity holds within the cooperating filesystem namespace. It does not supply a global trusted history. Hashes, hard links, file permissions and same-user processes do not establish an immutable or independently administered authority.

These tests cover process termination and injected synchronization failure. They do not simulate power loss, prove filesystem behavior, attest a hostile host or establish live external-tool correspondence. The existing Lean theorems concern the guard's mathematical model. No new theorem proves filesystem publication, the byte parser, cryptography, Python/TypeScript execution or model competence. All 21 existing statements and their trust assumptions are preserved.

Changing the authority source closure makes old journals fail the current loader. A future Aristotle codec integration needs an explicit reviewed migration, full differential tests and reauthorization of preserved raw plans. Do not rewrite old evidence or silently update its source fingerprint.

[Saved results and source snapshot](../evidence/durable-recovery-v1/README.md).
