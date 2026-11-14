# Check a number in a paper (ClaimCheck page, v1 checker with v1.1 verdicts)

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

The researcher can download the Lean file for their own claim. The file is the fixed checker from
the PCS core repository (`research/claimcheck_v1/formal/ClaimCheck.lean`, served unchanged as
`public/claim-check/ClaimCheck.lean`), the data as one numeral, the claim and the expected outcome.
The Lean kernel parses the bytes and recomputes the statistic itself.

## Getting an actual kernel result

The browser never runs Lean and never says it did. The route to a real result is:

1. Download the Lean file and the runner (`public/claim-check/claimcheck_kernel_runner.py`, one
   Python file, standard library only, no network use; the same bytes as
   `research/claimcheck_v1_1/claimcheck_kernel_runner.py` in the core repository).
2. With Lean 4.28.0 installed: `python claimcheck_kernel_runner.py ClaimCheck-obligation.lean --out kernel-run.json`.
   The runner refuses a file that does not start with the reviewed checker (by SHA-256) or that
   contains `sorry`, `axiom` and similar; it runs Lean, reads the axioms each theorem depends on, and
   writes what was proved.
3. Optionally open `kernel-run.json` in the page. The page compares the proof-file, data and checker
   digests in it with the ones it built and shows the outcome under the label
   **"REPORTED BY YOUR LOCAL RUN · NOT VERIFIED BY THIS PAGE"**. A report for other data or another
   proof file is refused. The page cannot know that Lean ran; anyone who needs to know runs Lean on
   the proof file, which is the evidence.

For a complete record with the v1.1 rules applied (other readings of the sentence, chance of
coincidence, support from other numbers) the command-line tool in the core repository is the
route: `python -m research.claimcheck_v1_1 verify …`, replayable with
`replay_independent_v1_1.py`.

## What can be said: the v1.1 verdicts

Recorded examples show, beside the recorded Lean result, the verdict the v1.1 policy
(`pcs-claimcheck-semantic-policy-v1.1`) allows:

| Shown | Meaning |
| --- | --- |
| Number reproduced | the kernel proved the match and the mechanical rules support the reading |
| Discrepancy for a person to review | the kernel proved a mismatch and another confirmed number in the same sentence supports the reading; never "the paper is wrong" |
| A person must review the reading | a kernel result exists and is kept, but nothing here supports saying the sentence means it |
| Unknown | no kernel result |

A verdict can only be weaker than the recorded Lean result (`tests/claim-check-page.test.mjs`).
Across the six examples: 25 reproduced, 92 for a person to review, 10 unknown, no discrepancy.
The rules were designed on these same documents, so these counts are development evidence, not a
test. The prospective evaluation has not been run.

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

To regenerate the examples from the core repository's results (the second command adds the v1.1
verdicts and copies the runner):

```sh
python -m research.claimcheck_v1.tools.export_site --bundles research/claimcheck_v1/benchmark/results/bundles \
  --summary research/claimcheck_v1/benchmark/results/heldout/summary.json \
  --adversarial research/claimcheck_v1/benchmark/results/adversarial/adversarial.json \
  --site ../proof-carrying-science-site/public
python -m research.claimcheck_v1_1.export_site_v11 --site ../proof-carrying-science-site/public
```

## Recorded browser evidence

`docs/evidence/claim-check-v1/browser-journey.json` and `claim-check-desktop.png` come from
`scripts/browser_claim_check.cjs` run in Chromium at 390 px and 1280 px with `PCS_LEAN` set: a
recorded example opened and rebuilt, the user's own data with a true statement, a
convention-dependent standard deviation, a false statement, a reading the sentence does not
support, and a malformed file. The Lean file the browser generated was put to the real Lean 4.28.0
kernel through the served runner, the runner's report was opened in the page and shown as reported
and not verified, and two altered reports (other data, other proof file) were refused. The recorded
Lean file downloaded from the page was accepted by the kernel as well. No external request and no
page error occurred. This is authored automation.

No human usability study has been run on this page. A protocol is prepared in the core repository
(`research/claimcheck_v1_1/usability/`); nobody has been asked to take part.

## Protected gates: open owner decisions

Four hosted checks are red on the draft PR, by design of two protected gates (the reviewed
reading-help pin and the source-admission gate), and the new tests are not yet part of the complete
website gate. No protected file was changed. The exact proposed changes, their security
implications and the dry-run evidence are in
[`docs/governance/CLAIMCHECK_PROPOSALS.md`](governance/CLAIMCHECK_PROPOSALS.md). Until the owner
decides, the page must not be merged or deployed.

One existing page was edited: `public/check-my-files.html` gained a single link to this page.
