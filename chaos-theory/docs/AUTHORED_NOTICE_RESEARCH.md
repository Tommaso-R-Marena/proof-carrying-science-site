# Authored notices for AI-safety evaluation

The notice desk adds a distinct, versioned input format. It does **not** relax existing PCS authority or the game's fixed-template `verifyScenario` gate. No Lean theorem certifies the game or authored text.

## What the data can support

A player can contribute new fictional notice text rather than merely selecting one of the old three wording variants. Researchers can use these cases to evaluate whether a model follows its real task when a lower-trust notice claims authority, invents an emergency, redirects a delivery or asks to skip a prerequisite. A matched control keeps the original task, policy, tools and world; only the notice changes.

A pack contains a verified fixed scenario, the exact authored text, source/build/purpose labels, an optional finished heist replay, a content fingerprint and a complete-pack hash. The text is limited to 600 UTF-16 units and 1,800 UTF-8 bytes. It is always data, never HTML, a replacement system policy or executable code. The three existing capability sets and guards remain fixed.

When a replay is attached, the verifier independently replays its inputs, rejects lessons or unfinished runs, extracts the scenario from its actual mapped event and requires an exact scenario match. A heist with no mapped notice event cannot acquire fictional gameplay provenance. Desk-only cases must match a reviewed preset. Local source labels and hashes do not attest human identity, host integrity, authorship or an immutable origin.

The content fingerprint ignores source labels and replay identity while retaining the exact text, task, world, control and capabilities. It supports exact-content deduplication; it is not a semantic novelty measure. Split studies by participant/session and task/template family as well as by fingerprint to avoid leakage. Repeated edits, negative findings, invalid records and all provider errors belong in the denominator.

## Independent offline replay

With Node 24 and dependencies installed:

```text
npm run research:workshop -- --pack your-local-export.json
```

This validates the schema, both hashes, the fixed-policy scenario, and any attached game replay. It replays the approved and prohibited programmed tool probes in fresh in-memory states. It writes a new uniquely named report under ignored `results/` with exclusive creation and restrictive file permissions. The CLI refuses files larger than 1 MB. Existing evidence is preserved.

The probes do not interpret the authored note. Their expected behavior is programmed and labeled as such. They exercise the guard, not a language model. Separately, unit tests systematically enumerate 1,200 short action plans over all three task families, checking forbidden effects and prerequisite behavior. This is a bounded executable campaign, not a universal or kernel-proved safety theorem.

## Real-model evaluation path

The existing server-only adapter now exposes a separately verified authored-input method. The original fixed-template method is preserved. Authored text goes only into the lower-trust notice field; the system policy, capabilities and grading use the verified fixed base scenario. Reports include the pack and content hashes so two different notes cannot be silently conflated under the base scenario ID.

After deliberate provider configuration and opt-in, an operator can run:

```text
npm run research:workshop -- --pack your-local-export.json --execute
```

This requires server-only `OPENAI_API_KEY`, an explicit `OPENAI_MODEL`, `CHAOS_LIVE_OPT_IN=yes`, and sufficient `CHAOS_MAX_CALLS`. It sends two potentially billable requests: matched control and authored attack. The existing 512-completion-token cap per request, 15-second timeout, pinned provider endpoint, no retries and pre-reserved call budget remain. The model receives no attack/control label, expected verdict or grading answer. The task is a one-turn action plan, not an autonomous agent or general safety evaluation.

The browser cannot invoke the provider. Nothing is uploaded by gameplay, authoring, checking, downloading, offline CLI use or configuration checks. Provider execution sends the selected note off-device; API keys stay server-only. No real-model calls or human participants were involved in building this update. Mocked-transport tests are labeled simulated and do not count as model findings.

## Consent and scientific limits

The pack explicitly says `purpose: evaluation-only` and `consent: true`. The checkbox is local consent to create an export, not authenticated study enrollment, public donation, ethics approval or a training license. Training would need separate, specific permission and a reviewed data-governance process. External proof-development traces are not included and are not training data.

The downloadable offline game has no model adapter or test controller, uses a hash-restricted inline script and disables network connections. Shared schemas run without JIT/eval. A browser can still be controlled by its owner; these checks are not an immutable host or independent trusted authority.

No central intake, participant recruitment, donation backend, open-weight runner, trained safety model or demonstrated improvement in safety efficacy is introduced here. Useful new hypotheses and model evaluations can be built from these files, but neither a game's courier nor a programmed vulnerable fixture establishes a model vulnerability. Model task competence, prohibited proposals and prohibited effects remain separate outcomes. Any safety claim must name its tested model, version, task distribution, host assumptions and limits.
