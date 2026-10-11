# Bridge Builder and induction research release

This release adds four playable mathematical missions from actual Lean 4.28 states: implication composition, swapping two facts, list-length append induction and list append associativity. All 58 catalog transitions and six completed proof paths are independently replayable. Browser play uses archived states; the separate public proof request compiles the exact human action path afresh.

The experimental induction policy, symbolic baseline and previous model remain distinct. The 12,924-parameter supervised model solves 4/8 final authored compositions; symbolic search solves 5/8. Graph and bag encoders tie, and two sequential RL generations do not improve solve count. See [all evidence](../public/induction-abstraction/REPORT.md). Core production acceptance still requires kernel evidence; a model registration is not scientific authority.

## Data boundary

Practice is not automatically uploaded. Donation requires a verified PCS account, adult confirmation and explicit CC0 research/training consent. The Worker replays only its fixed catalog, deduplicates stored sessions and enforces storage/rate bounds. Owner-only paginated export omits contributor identity. Fresh independent Lean intake must check labels and held-out separation before any candidate training. Hint exposure, invalid attempts and automatic setup actions remain explicit.

The real Worker/D1/browser integration test uses a synthetic account and scripted moves. It exercises donor rejection, insertion, deduplication, private export, independent Lean intake, actual gradient updates and erasure. Its trained fixture checkpoint is private test output and never promoted or reported as a human research result. No real participant records were used in the published model experiments.

## Reproduce

Activate the prepared toolchain and run:

```bash
npm run ci:zero-minutes
npm run test:lean-research
PCS_LEAN_CORE=/absolute/path/to/proof-carrying-science npm run test:browser:bridge
```

The last command requires the real credential-free backend on port 8766 with both existing registries and the new `--abstraction-models research/induction-abstraction-v2` registry. Core commands:

```bash
python scripts/check_induction_evidence.py
python scripts/check_abstraction_proofs.py
python -m pcs.experimental.prover.bridge_catalog --verify ../proof-carrying-science-site/public/bridge-builder-catalog.json
```

The required website Lean browser job provisions its own disposable Worker/D1 and runs `scripts/browser_bridge_research.cjs`. Do not point synthetic registration, email-verification or owner fixtures at production.

## Protected integration and deployment

Core must pass every protected check and merge normally under Tommaso-R-Marena. Update both `CORE_SHA` in `src/lean-research.js` and the `lean-prover` checkout in the required browser job to the actual protected core merge SHA. The public service deliberately rejects results from a different revision.

The website must then pass all five existing required checks and merge normally. Its existing main-only Cloudflare build runs `bash scripts/cloudflare_build.sh` and `npx --no-install wrangler deploy --keep-vars`. Preserve the Worker, production D1 identity, variables and nine existing bindings. Do not add subscriptions, paid runners, paid model services or financial information.

Production needs only the additive `0025_bridge_research_sessions.sql` migration. The historical D1 ledger remains issue #93: never replay the complete old migration directory or falsely mark old schema as applied. Use a temporary Wrangler configuration that references the existing D1 database and a temporary directory containing only this exact migration, then read back its table/index and ledger entry. This is a release operation after protected review, not automatic setup.

Read back the successful Cloudflare build, changed asset bytes, bindings, free account state and real public proof result. A local test, PR creation, dry run or draft save does not establish deployment. Ordinary protected merges must never be bypassed.

## Limitations

The catalog is a finite teaching/research interface, not a browser Lean kernel or unlimited proof explorer. Public requests are quota-limited protected GitHub jobs; interactive arbitrary-step sessions run against the free local backend. The controlled English list/successor extension uses separate experimental modules, preserving Aristotle's exact source-bound legacy parser/IR. It has tests and actual elaboration but no unrestricted meaning-preservation or source-refinement proof. Novel mathematics, general Mathlib competence, graph superiority and autonomous scientific improvement are not established.

