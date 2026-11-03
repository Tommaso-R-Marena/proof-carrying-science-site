# A scientific workflow at the front door

Start here now asks a practical research question: **when I add observations,
did I lose or change the data I already had?** It executes the existing PCS
original-file change-review engine on real, published Iris flower observations.

The visitor compares two exports, reads the result, saves the readable report
and replay, then reopens the replay for a fresh calculation. No account,
programming setup or private data is required. The existing made-up ID example
remains explicitly optional practice. The own-data continuation opens What changed?

## Data and the exact question

The source is R. A. Fisher’s Iris dataset, UC Irvine Machine Learning Repository,
DOI 10.24432/C56C76, CC BY 4.0. The archived source SHA-256 is
`daaeb5e3e889d07fbdd44544f5a39fe2372a07172e25899d577be0ad74df9e65`.
The publisher’s CSV was fetched again during this work and matched that digest;
the publisher page contained the license and measurement-discrepancy notes.
The retained source, original provenance and license references are unchanged.

These are **constructed teaching exports from one archived dataset**, not an
account of a historical update or a newly observed error in the study:

- The earlier export has the first 100 observations.
- The larger export has all 150 observations, in reverse row order.
- A source-row ID is added within this frozen snapshot. It is not an identity
  scheme that survives arbitrary future publisher reorderings.
- All five original field strings are compared exactly. New records are allowed;
  removing or editing an existing record is flagged.

The default run finds 50 additions, 100 unchanged records, no removals and no
edits. Two deliberately artificial controls change iris-001’s sepal length from
5.1 to 9.9, or remove that observation. Both are flagged. The webpage labels
these teaching changes before and after the check.

UCI reports discrepancies in source observations 35 and 38. This workflow keeps
the archived values; it does not settle their biological accuracy, validate the
study or measure a model’s predictive performance.

## Actual computation and evidence

`science-workflow-core.mjs` captures both export snapshots, verifies their
reviewed SHA-256 identities, and calls the unchanged `reviewChanges` engine.
The UI fetches only the two literal same-origin public CSV paths. Unknown,
missing, oversized or altered sources cannot enable a confirmed result.

Downloads use the existing `pcs-change-replay-v2` format. Reopening recomputes
file sizes/hashes, selected columns, rules, counts and the decision. The starter
accepts only the declared five-column preservation question; a coherent replay
that silently allows edits or compares IDs alone is rejected. Other settings
belong in the full change-review tool. Imported
receipt objects cannot establish a fresh Lean confirmation. Readable reports
carry attribution, transformations, deliberate-control labels and limits.
The same replay can be opened in the existing local change-review app.

The browser is a JavaScript calculation. It runs no Lean kernel. Separately,
the actual Lean 4.28 native checker was built and executed on the same three
cases: `PASS`, `REVIEW`, `REVIEW`. Its mathematical dependencies remain frozen
at core `f20f3cab2938f2e085f137185e88f4700d5da2ed`. Existing native tests and
four-platform protected CI continue to check its source and request boundary.
No new theorem, model weight, production authority or scientific acceptance is
introduced. Compilation, host execution, file binding and scientific meaning
retain their documented assumptions.

New builds of the portable app include the three new reading-help assets in both its build
manifest and its explicit serving allowlist. They are static help files; no
new verification or mutation endpoint is added. The web-only scientific example
link opens the public website separately rather than a missing local route.
Existing public release archives and tags are not overwritten by this UI work.

## Reproduction

```sh
node --test tests/science-clarity.test.mjs
npm run test:browser:site-clarity  # isolated local Worker on 127.0.0.1:8788
python scripts/run_public_export_experiment.py /path/to/actual/native/bundle
node scripts/verify_browser_ui_sources.mjs
```

The all-page campaign checks 75 pages at 320 and 1440 pixels, then executes all
three scientific cases at 320, 390, 768 and 1440 pixels. It uses real engines,
real downloads and fresh replay, including rejection of an edited decision and
a missing data source. No affirmative verifier response is substituted.

Local validation passed 571 Node tests with zero failures or skips; the complete
website build/dry-run gate passed. Browser checks covered 150 page/context
combinations, 300 layout combinations, 12 scientific workflows, 60 game-guide
journeys and the existing beginner/model/game flows. The actual native browser
check ran seven Lean calls, accepted three matching confirmations and rejected
four negative controls. These are automated results, not a human usability study.
