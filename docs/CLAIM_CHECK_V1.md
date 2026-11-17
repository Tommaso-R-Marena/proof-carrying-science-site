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
   `research/claimcheck_v1_1/claimcheck_kernel_runner.py` in the core repository). The page shows
   the runner's SHA-256 from the catalog next to the download link, so that someone who receives a
   runner from somebody else can compare it.
2. With Lean 4.28.0 installed: `python claimcheck_kernel_runner.py ClaimCheck-obligation.lean --out kernel-run.json`.
   The runner refuses a file that does not start with the reviewed checker (by SHA-256), and it
   refuses, before starting Lean, any file whose generated part is not in the canonical form of the
   generator's grammar (one data numeral, claims built from literals, one batch theorem, one
   fixed-form theorem per claim, one spelling per value). That grammar is wider than what the page
   writes: it admits claim settings the page never writes (other missing-value tokens, other
   positive scales, other spellings of the printed number), and such settings can force either
   verdict. The receipt therefore lists the settings of each claim and flags those the page never
   writes. Then the runner runs Lean, reads the axioms each theorem depends on, and writes what the
   kernel accepted (receipt schema `pcs-claimcheck-kernel-run-v2`).

   **Correction, 16 November 2026.** The runner served until then (schema v1, SHA-256 `8d9e07b4…`)
   checked the generated part only for a few forbidden words. A hand-written file that defined its
   own `run` and proved the expected equation by `rfl` passed the Lean kernel, and that runner
   reported a match for it, although the theorem said nothing about the reviewed checker (finding
   `research/claimcheck_assurance_v1/findings/RUNNER_TAIL_FORGERY.md` in the core repository). It is
   withdrawn, and the page refuses its receipts with that reason. Proof files the page itself built
   were never affected; the recorded examples were never affected.
3. Optionally open `kernel-run.json` in the page. The page accepts only a report about the exact
   proof file it built when Check was pressed (`kernelRunRefusal` in `claim-check-core.mjs`): schema
   v2 exactly, `accepted` true, the research-only authority label, the SHA-256 of that proof file and
   of the data as they were at Check, the catalog's pinned checker digest (no report is shown if the
   catalog did not load), `checker_pin_overridden` false, `all_settings_as_the_page_writes` true,
   `generated_part_canonical` true, and exactly one theorem per claim, in order, each accepted by
   the kernel, depending on no axiom beyond `propext`, `Classical.choice` and `Quot.sound`, and
   stating exactly the outcome the page wrote for that claim. Anything else is refused with a fixed
   message worded by the page. Receipts of the earlier v2 runner, which lack the settings
   statements, are refused too: run the current runner again. An accepted report is shown under the
   label **"REPORTED BY YOUR LOCAL RUN · NOT VERIFIED BY THIS PAGE"**, worded by the page from its
   own results and naming the data file it is about. No free text from a report is displayed; the
   Lean version and the time are repeated only if they have the exact forms the runner writes.
   Before building any proof file the page checks the fetched checker against the catalog's pinned
   digest and builds nothing if it differs. The page cannot know that Lean ran; anyone who needs to
   know runs the runner on the proof file and reads the settings it lists (plain Lean alone does not
   check that the generated part of a file someone else made is in canonical form).

   **Hardening, 17 November 2026** (independent security review). Before this change the page kept
   showing an earlier result and report after another data file was opened, and its downloads mixed
   the new data with the old outcomes; it repeated text from a report (`lean`, `utc`, `why_not`),
   so a hand-written report could make the page print its own wording; and it ignored fields a
   genuine report always gets right (authority, per-theorem acceptance and axioms, the exact
   outcome). Now any change to the data, the example, the sentence, the number, the statistic, a
   column, a condition or a unit clears the result and the report and disables the downloads; the
   bytes and their digest are taken when Check is pressed and only that snapshot is used for the
   downloads and for checking a report.

What a kernel run verifies, and the page says so beside every reported run: the supplied
mathematical obligation, that is, that this typed statement about the reviewed checker holds for
the exact bytes of the file. What no kernel run verifies: that the obligation faithfully represents
the sentence in the paper, that the printed number is the paper's number, or that the file is the
authors' data.

For a complete record with the v1.1 rules applied (other readings of the sentence, how many
comparable numbers those readings reproduce, support from other numbers) the command-line tool in
the core repository is the route: `python -m research.claimcheck_v1_1 verify …`, replayable with
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
and not verified, with what it does and does not verify, and three altered reports (other data,
other proof file, a receipt of the withdrawn runner) were refused. The forged proof file of the
runner finding was accepted by plain Lean and refused by the served runner before Lean was asked
anything. The recorded Lean file downloaded from the page was accepted by the kernel as well. No external request and no
page error occurred. This is authored automation.

The recorded files predate the hardening of 17 November 2026. The journey now also shows that any
change to the inputs clears the result and the report and disables the downloads, that a receipt
for the previous data file is refused after another file is checked, that no text from a report is
displayed, that a page serving a checker without the pinned digest builds no proof file, and that
the runner's SHA-256 is shown. Run it again (see Reproduce) to see these steps; the recorded
evidence files are not regenerated by this change.

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
