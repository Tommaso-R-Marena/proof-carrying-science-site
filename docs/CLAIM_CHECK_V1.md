# Check a number in a paper (ClaimCheck v1 page)

Page: [`/claim-check`](https://proof-carrying-science-site.marenatommaso.workers.dev/claim-check)

A researcher chooses a CSV table, pastes a sentence from a paper, picks the printed number and
says which statistic it is. The page recomputes the statistic with exact fractions and shows three
separate answers:

1. **Is the arithmetic right?** A browser preview, explicitly labelled as not a proof, with the
   exact value, the rows used and every assumption (rounding to the printed digits, missing-value
   tokens, unit conversion). The status stays UNKNOWN until Lean checks it.
2. **Is it linked to the sentence and the data?** Mechanical checks: the number is printed in the
   sentence, the unit after it agrees, the column, group and statistic are named in the sentence, and
   the file is identified by its SHA-256. Whether the sentence means that statistic is the reader's
   judgement and is shown as unreviewed.
3. **Does it support the scientific conclusion?** Always "not assessed", with the open questions
   listed and any interpretive wording in the sentence pointed out.

The researcher can download the Lean file for their own claim and run `lean` on it. The file is the
fixed checker from the PCS core repository (`research/claimcheck_v1/formal/ClaimCheck.lean`, served
unchanged as `public/claim-check/ClaimCheck.lean`), the data as one numeral, the claim and the
expected outcome. The Lean kernel parses the bytes and recomputes the statistic itself.

## Recorded published examples

`public/claim-check/examples.json` lists held-out articles from the ClaimCheck benchmark with their
deposited data (open licences; citation and licence shown with each example). Opening one loads the
data and shows **recorded** results of the real Lean 4.28.0 kernel. The page does not re-prove
anything. It does rebuild the complete Lean obligation file from the data and the recorded readings
and compares its SHA-256 with the recorded one, so recorded results cannot be displayed for
different data or different readings. `tests/claim-check-page.test.mjs` performs the same rebuild
in Node for every example.

Six held-out articles are published as examples. For one of them (a 617-row table) Lean accepts
the checks only a few per proof file, so the example shows four of its eleven selected readings and
says so; the complete evidence bundle is in the core repository.

The page also shows the held-out evaluation table (correct, wrong and abstained results per
proposer, including the adversarial suite). Those numbers come from the core repository's frozen
benchmark and include its failures.

## Trust boundary

* The browser calculation (`claim-check-core.mjs`) has no authority. It is a third implementation
  of the checker's semantics; `tests/claim-check-core.test.mjs` compares it with the core
  repository's Python oracle on 425 cases and requires byte-identical Lean obligations.
* No language model is called from the website and no credential exists in it. Readings in the
  recorded examples were proposed by models or deterministic search in the core benchmark; the page
  says so and says a proposer has no authority.
* Files and text never leave the device. The page only reads same-origin static assets with
  literal paths.
* A recorded "PROVED" covers the stated reading on the stated bytes. It does not establish that the
  file is the authors' data, that the sentence means the reading, or anything about the science. A
  recorded "REFUTED" is a mismatch for that file under that reading, not a finding that a paper is
  wrong.
* Limits: one comma-separated table up to 64 KB; counts, shares, sums, means, medians, minima,
  maxima, standard deviations, standard errors, variances, Pearson correlations and two-variable
  least-squares lines. Nothing else is supported.

## Reproduce

```sh
node --test tests/claim-check-core.test.mjs tests/claim-check-page.test.mjs
PCS_CHROMIUM=/path/to/chromium node scripts/browser_claim_check.cjs   # real-browser journey
```

To regenerate the examples from the core repository's results:

```sh
python -m research.claimcheck_v1.tools.export_site --bundles research/claimcheck_v1/benchmark/results/bundles \
  --summary research/claimcheck_v1/benchmark/results/heldout/summary.json \
  --adversarial research/claimcheck_v1/benchmark/results/adversarial/adversarial.json \
  --site ../proof-carrying-science-site/public
```

## Recorded browser evidence

`docs/evidence/claim-check-v1/browser-journey.json` and `claim-check-desktop.png` come from
`scripts/browser_claim_check.cjs` run in Chromium at 390 px and 1280 px with `PCS_LEAN` set: a
recorded example opened and rebuilt, the user's own data with a true statement, a
convention-dependent standard deviation, a false statement, a reading the sentence does not
support, and a malformed file. The Lean file the browser generated for the user's own claim, and
the recorded Lean file downloaded from the page, were both accepted by the real Lean 4.28.0
kernel. No external request and no page error occurred. This is authored automation.

No human usability study has been run on this page.

## Open item for the site owner: the reviewed reading-help pin

`docs/evidence/site-clarity-v1/browser-qualifications.json` pins the SHA-256 of
`public/page-help-core.mjs` (`reading_help_sources`). Every page must have an entry in that file
(`tests/science-clarity.test.mjs`), so adding this page changes its bytes, and three tests then
report `Reading help source drift`:

* `tests/science-clarity.test.mjs` (fresh scientific viewer qualification)
* `tests/scientific-workflow-v2.test.mjs` (public artifacts match preserved digests)
* `tests/transport-workflow-v3.test.mjs` (retained assets match)

The only change to `page-help-core.mjs` is the added `claim-check.html` entry; no existing entry
was edited. The pin was deliberately **not** updated in this change: it records a reviewed
qualification, and moving it is the owner's decision. Until the owner re-qualifies the help text
and updates the pin, those three tests fail on this branch and the page must not be deployed.

One existing page was edited: `public/check-my-files.html` gained a single link to this page.
