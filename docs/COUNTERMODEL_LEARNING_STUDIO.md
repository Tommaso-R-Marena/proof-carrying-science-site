# Play, fit and independently replay

Countermodel Lab connects actual player choices to a working behavior-cloning
model. The browser and owner-export CLI use the same deterministic fitter,
27 pre-action features, 18 legal action classes and 48 fitting epochs. The
486 coefficients are computed from saved choices; no default participant model,
fabricated training population or prefilled result chart is supplied.

## Player path

1. Use the walkthrough to learn the first counterexample. It records hint
   assistance, so its notebook is excluded from unassisted fitting/evaluation.
2. Restart and solve a training mission without hints; check the final world
   and explicitly save the notebook into the private tab collection.
3. Solve a held-out mission and save it. The fixed held-out IDs are
   `quantifier-switch`, `quantifier-scope` and `variable-capture`; their choices
   never enter fitting.
4. Fit the coach. Download the actual weights and provenance hashes, inspect
   demonstrated-action agreement against action-prior/uniform baselines, or
   request a suggested legal move. Missing evaluation data is shown as missing.
5. A coach suggestion records hint assistance before application. It grants no
   success verdict. Subsequent edits/hints require another final check before
   donation; assisted sessions are excluded from both learning partitions.

The collection is limited to 20 notebooks and stays in memory until reload or
explicit clearing. Training/importing does not upload it. Implementation hashes
use anonymous GETs from three closed same-origin static paths; redirects and
arbitrary targets are rejected. Model files are limited to 64 KiB and checked
for duplicate/reserved fields, exact schema, bounded finite coefficients,
feature/ruleset binding, declared split/count metadata and an integrity digest.
Imported training claims cannot be authenticated offline, even when a digest
matches. Imported weights remain untrusted suggestions.

## Consented owner data and PCS

Existing optional research donations still require an email-verified account,
adult self-attestation and explicit consent. The Worker replays typed choices,
deduplicates normalized sessions and applies rate/daily limits. The owner export
omits account identifiers; deletion removes active rows. No production database
migration or automatic production model replacement is added.

```sh
pcs countermodel-replay-v1 my-local-search.json
node scripts/train_countermodel_search_policy.mjs owner-export.json model.json evaluation.json
```

PCS independently recomputes every action/state/reward/assistance flag using its
Python evaluator. The owner CLI separately validates the server export before
fitting through the shared learning module. Local and owner-trained coefficients
match for the same eligible choices; their provenance correctly distinguishes
private notebooks from an owner export. No input labels or claimed score become
training truth.

## Verification and scope

The protected website gate runs strict model-import/fitting tests, independent
Python trajectory parity, real desktop/mobile game fitting/download/import,
and real isolated Worker/D1 donation/export/refitting/deletion. The research
browser check actually donates an imported-model-assisted session, then verifies
that the server preserved assistance and the resulting owner model/evaluation
are unchanged. These scripted fixture choices are validation data, not real
participant research data or evidence of population-scale learning.

The standalone `countermodel-lean-kernel` now actually runs on public disposable
hosted runners for every main PR and main push, preserving the check name that
the release consumer requires. Manual readiness review runs only on protected
public main, with read-only GitHub permissions and no deployment credentials.
The authenticated consumer requires all four completed checks (`site-check`,
`site-contract`, `countermodel-lean-kernel`, `site-full-gate`) from the genuine
GitHub Actions app on the exact SHA. Foreign same-name green checks, missing
app identity, skipped checks and an omitted full gate fail closed. Readiness
review does not deploy or establish formal checker correctness.

The model imitates bounded recorded choices; it is not an optimal search policy.
Tiny public missions and syntax overlap limit the held-out comparison. Finite
checking does not prove natural-language grounding, every domain size, real AI
safety or scientific authority. Concrete Lean exports require genuine separate
kernel compilation. Independent replay and assistance flags cannot establish
human authenticity or retract previously exported datasets or learned weights.
