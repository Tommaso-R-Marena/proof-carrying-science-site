# Proposed changes to protected files for the ClaimCheck page

**Status: three proposals, each prepared and tested in a scratch copy. None is applied. Nothing
here is approved, and the page must not be merged or deployed until the owner decides.**

The draft PR adds one page (`/claim-check`), its tests and evidence. It edits no protected file.
Four hosted checks are red on it for two reasons, and one question about CI is open:

| # | Protected file | What blocks | Proposal | Owner decision |
| --- | --- | --- | --- | --- |
| 1 | `scripts/verify_browser_ui_sources.mjs` (qualification policy) | `beginner-browser`, `lean-learning-browser`, and through it `site-full-gate`: `Reading help source drift` | accept one reviewed successor of the reading-help pin, fixed by digest | approve or reject patch 01 |
| 2 | `scripts/check_reconciled_prs.py` (source admission) | `original-pr-ancestry-and-production-preservation` | successor retained commit and tag; `public/` rule anchored at the retained commit | approve or reject patch 02; create the retained commit and tag |
| 3 | `package.json` → `ci:zero-minutes` (the complete website gate) | nothing is red; the new tests are simply not part of the protected gate | add `test:claim-check` to the gate | approve or reject patch 03; optionally require the new workflow |

Everything else on the PR passes. The files in
[`claimcheck-proposals/`](claimcheck-proposals/) are the exact patches and the records of their
dry runs. Dry runs used throw-away worktrees or scratch copies; the checked-out protected files
have their `main` bytes.

## 1. Reading-help pin

**What the gate does.** `docs/evidence/site-clarity-v1/browser-qualifications.json` pins the
SHA-256 of the three reading-help sources. `tests/science-clarity.test.mjs` requires every page to
have an entry in `public/page-help-core.mjs`, so a new page changes that file and
`verify_browser_ui_sources.mjs` reports drift. That is the intended behaviour: help text was
qualified by a browser run and should not change without a new one.

**What changed.** One entry was added (`claim-check.html`). The other 75 entries are identical to
`main`, checked by importing both versions and comparing a canonical digest of every entry. The
other two pinned files are byte-identical.

**Fresh evidence.** `docs/evidence/site-clarity-v2/all-pages-browser.json`: the unchanged script
`scripts/browser_site_clarity.cjs` against a local Worker, every page at 320 px and 1440 px (152
page checks, 12 scientific workflows), result PASS. It was run on 2026-11-12 and again on
2026-11-14 after the page gained its kernel-run section; the two result files are byte-identical
(SHA-256 `e161824d…bd210`). Authored automation: no person took part, and it does not show that
anyone understands the help text.

**The successor.** `docs/evidence/site-clarity-v2/reading-help-requalification.json` names the
historical record as its predecessor by digest, repeats the old pins, gives the new pin for
`page-help-core.mjs`, and lists the delta. The historical record is not edited.
`scripts/check_reading_help_successor.mjs` checks all of that today, with no effect on any gate.

**The proposed change** ([`01-reading-help-verifier.patch`](claimcheck-proposals/01-reading-help-verifier.patch)).
The verifier keeps every existing check. In place of "the reading-help sources equal the v1 pins"
it requires: the successor file has a digest compiled into the verifier; the successor names the
unchanged historical record; it restates the v1 pins exactly; it covers the same three files; only
`page-help-core.mjs` may differ; the files on disk equal the successor's pins.

**Security implication.** The verifier would accept exactly one new set of help bytes, chosen by a
digest in reviewed code. It does not become a general mechanism: a second change needs another
reviewed digest. The weakening, stated plainly, is that the v1 pin no longer has to hold for
`page-help-core.mjs`; in exchange the successor is bound to its predecessor and to fresh evidence.

**Dry run** ([record](claimcheck-proposals/01-reading-help-verifier.dry-run.json)). With the patch,
the verifier accepts the tree and the three test files that fail on the branch pass (22 of 22).
Still rejected: an edited existing help entry, a second page added without review, an edited
successor, an edited historical record, an edited help stylesheet.

**If approved:** apply the patch. If the successor file is edited before then, its digest in the
patch must be regenerated.

## 2. Source admission (`check_reconciled_prs.py`)

**What the gate does.** For this repository it asserts, among other things:

* (a) every non-control file of `HEAD` has the bytes and mode it has in the retained source commit
  `d35e2b5`, which is fixed by commit id and by the tag
  `pcs-source-intake/site-open-prs-v1-20261105`;
* (b) `HEAD:public` equals the `public/` tree of the protected `main` commit recorded in
  `docs/reconciliation/OPEN_PRS.json` (`54bc618`), whose digest is compiled into the gate.

Any PR that adds a source file fails (a). Any PR that changes anything under `public/` fails (b),
and so would `main` after merging it. So (b) cannot be satisfied by any future change to the
public site, whatever is done about (a). That needs a decision, not a workaround.

**What this branch changes relative to `main`**
([census](claimcheck-proposals/02-site-admission-census.json), with SHA-256 and mode of every
file, generated at commit `3105604`: 32 files added, 6 modified, 20 of the 38 under `public/`; the
three record files of this proposal are added by the commit after it). No file is deleted and no integration control is touched. Existing files modified:
`public/check-my-files.html` (one link), `public/page-help-core.mjs` (one entry),
`public/runtime-connections.json`, `public/sitemap.xml`, `public/llms.txt` (the new page listed),
`tests/science-clarity.test.mjs` (page count 75 → 76). Everything else is added. One added file is
a workflow, `.github/workflows/claim-check.yml` (section 3).

**The proposed change** ([`02-reconciliation-gate.patch`](claimcheck-proposals/02-reconciliation-gate.patch)), two lines:

1. `INTAKES` names a successor retained commit and tag. The retained commit has the tree of the
   admitted source commit and two parents: that source commit and the previous retained commit.
   The previous one stays an ancestor, so every original PR head remains retained.
2. Rule (b) compares `HEAD:public` with the `public/` tree of the retained commit instead of the
   registry's `main` commit.

The commit id and tag in the patch file come from the dry run and do not exist anywhere. They must
be regenerated at the commit the owner fixes:
`python3 scripts/prepare_claimcheck_site_admission.py --commit <sha>`.

**Security implication.** Today the public tree cannot change at all. With the change it can
change only to the exact tree of a commit that the owner has tagged and that reviewed code names
by id. Rule (a) already forces every non-control file, including all of `public/`, to equal that
commit, so the new (b) adds no freedom beyond the successor itself; it keeps a separate, explicit
statement about the deployment tree. What the owner takes on is reviewing the changed and added
files of the census once. Nothing else in the gate changes: registry digest, original PR sets, ancestry rules,
control list, clean-tree rule.

**Dry run** ([record](claimcheck-proposals/02-reconciliation-gate.dry-run.json)), produced by
`scripts/prepare_claimcheck_site_admission.py` with a local tag that was deleted afterwards:

* the unchanged gate passes on `origin/main` and fails on the branch (rule (a));
* with only the retained commit moved it still fails: `Public deployment tree changed` (rule (b));
* with the proposed patch the gate passes, and its own test file passes, including the test that
  replays the whole tree as a one-parent squash;
* still rejected: an admitted public file altered, an unlisted public file added, an existing
  production page altered, an untracked file under `public/`, the tag moved to another commit, a
  retained commit that drops the original PR heads.

**Other options.** (i) Keep the gate as it is and do not admit public changes through this
repository's `main`; the page then stays on its draft branch. (ii) Replace the reconciliation gate
with a different admission process. Neither is prepared here.

**If approved, in this order:** apply whichever of patches 01 and 03 are approved (they change
non-control files, so they must be in the admitted tree); fix the commit; run the script at that
commit; create the retained commit and push an annotated tag
`pcs-source-intake/site-claimcheck-v1-<date>` to it; commit the regenerated patch 02 as a separate
control commit. Creating and pushing the tag is the owner's step and was not done.

## 3. CI

**Added, in effect, additive.** `.github/workflows/claim-check.yml` is a new path-scoped workflow
with read-only permissions and actions pinned by commit id, in the style of
`first-investigation.yml`. It runs the two ClaimCheck test files, the successor check, and the
browser journey with a checksum-pinned Lean 4.28.0, in which the proof file the browser builds is
put to the real kernel through the served runner. It removes or alters no existing check. It is
not a required check. As a new file it is part of the census in section 2.

**Proposed, not applied** ([`03-complete-gate.patch`](claimcheck-proposals/03-complete-gate.patch)).
`package.json` gains `test:claim-check` and `ci:zero-minutes` runs it last. `ci:zero-minutes` is
what `scripts/cloudflare_build.sh` and therefore the protected `site-full-gate` execute, so this is
how the tests become mandatory.

**Security implication.** Strictly more is checked before a build is accepted: a deployment can no
longer serve a Lean checker, a kernel runner or recorded results that differ from the pinned ones.
The cost is that a legitimate change to those files needs the examples regenerated.
`docs/evidence/lean-job-operations-v1/manifest.json` records an earlier SHA-256 of `package.json`;
no test or script reads that field, so it stays a correct historical record of the bytes that
evidence was produced with.

**Dry run** ([record](claimcheck-proposals/03-complete-gate.dry-run.json)). The patch applies
cleanly and `npm run test:claim-check` passes (9 of 9). It fails, as it must, when the served
runner is altered, when the served Lean checker is altered, when a recorded v1.1 verdict is raised
above the recorded Lean result, and when the "not verified by this page" label is weakened.

**Required checks (decision C2, recommendation of 2026-11-17).** No new required check for this
repository. `site-full-gate` is already the strict required check (`docs/HOSTED_CI_REPLACEMENT.md`)
and runs on every pull request; with patch 03 it runs ClaimCheck's mandatory tests. Do **not** require
`claim-check-page` as it is: its workflow is path-filtered, so on every pull request that does not
touch its paths a required `claim-check-page` would stay pending forever. If it should become
required, first give it the always-reporting change-detection aggregate used in the core repository
(`claimcheck-required`, tested there by `research/claimcheck_v1_1/governance/test_required_check.py`;
recommendation and inventory in the core repository's `docs/integration/claimcheck/REQUIRED_CHECKS.md`).

## 4. Defect in the served runner (found 2026-11-15, corrected on this branch 2026-11-16)

The runner served until 16 November 2026 (`public/claim-check/claimcheck_kernel_runner.py`, a copy
of the core repository's v1.1 runner, SHA-256 `8d9e07b4…`, receipt schema v1) accepted a
hand-written proof file that defines its own `run` and reported "MATCHES" with `accepted: true`.
Reproduced with the real Lean kernel; details and scope in the core repository:
`research/claimcheck_assurance_v1/findings/RUNNER_TAIL_FORGERY.md` (draft PR
Tommaso-R-Marena/proof-carrying-science#216).

**Correction (owner decisions C3 and D4, authorised 2026-11-16 for preparation and testing; not
deployed, not merged).** The served copy is now the core repository's strict runner (commits
`d5a36975`, `2de4f872` and `39ce953c` there; SHA-256 `459155f3…`, receipt schema v2): it refuses, before
starting Lean, any file whose generated part is not exactly in the generator's form, with one spelling
per value. In the core repository's research branch that language is proved in Lean to be exactly the
set of renderings of valid values, and the runner's parser agrees with the proved parser on 7,248
inputs (a test, not a proof). `examples.json` pins the new digest
and lists the withdrawn one with the reason. The page accepts only v2 receipts, refuses v1 receipts
with the reason, words each reported result itself instead of taking text from the report, and says
beside every reported run what a kernel run verifies (the supplied mathematical obligation) and what
it does not (that the obligation faithfully represents the sentence, the number or the data of a
paper).

Tests: `tests/claim-check-page.test.mjs` runs the served runner on a page-built proof file (reaches
Lean), on the reported forgery and on a file with an extra definition (both refused, Lean never
started), and tests the page's rule for showing a report (`kernelRunRefusal` in
`public/claim-check-core.mjs`) on a correct report and on eleven wrong ones, including a v1 receipt; `scripts/browser_claim_check.cjs`, with the real Lean 4.28.0 kernel, shows the forgery
accepted by plain Lean and refused by the served runner, and a v1 receipt refused by the page
(`docs/evidence/claim-check-v1/browser-journey.json`).

What was and was not affected before the correction:

* the page's display of a local `kernel-run.json` was **not** affected: it shows a report only if
  the report's `proof_file_sha256` equals the proof file the page built itself;
* the recorded examples were **not** affected: the page rebuilds each proof file and compares digests;
* the advice "anyone can run Lean on the proof file to check the second" was affected when the proof
  file came from someone else. The page now says to use the runner for that, and that plain Lean
  alone does not check a file's form.

**Hardening, 2026-11-17, after an independent security review** (not deployed, not merged). The
review found no way past the runner's grammar and seven issues around it; details, reproductions
and the exact runner diffs are in the core repository's
`docs/integration/claimcheck/SECURITY_REVIEW_C3_D4.md`.

* The served runner is the core repository's hardened runner (SHA-256 `831bbaba…`, byte-identical;
  the catalog pins it). Its receipt now lists every claim's settings and flags settings this page
  never writes (other missing-value tokens, a scale outside the unit table, a printed value whose
  rounding interval contains every small value), which could otherwise make either verdict true for
  the same data and number; it resolves `lean` to one absolute path and refuses a `lean` found in the
  current directory or beside the proof file (one planted next to a download used to run); any error
  of the runner is a refusal with a report; its output is ASCII.
* The page (`public/claim-check-core.mjs`, `public/claim-check.mjs`): any change to the data,
  example, sentence, number, statistic, column, condition or unit clears the result and any shown
  report and disables both downloads; pressing Check takes a snapshot (bytes, digest, file name,
  results) from which the proof file is built once and against which a report is checked, and the
  report box names that data file. A report is shown only if every field a genuine report always gets
  right is right: schema v2, accepted, research authority label, canonical generated part, the
  reviewed checker digest built into the runner (`checker_pin_overridden` false), the pinned checker,
  the exact data and proof-file digests of the snapshot, page settings only, one theorem per claim in
  order, each kernel-accepted, standard axioms only, and outcomes exactly the page's. Refusals are fixed
  messages; no free text from a report is displayed (the Lean version and time only in exact forms).
  The fetched checker is compared with the catalog's pinned digest before any proof file is built.
  The runner's digest is shown next to its download.
* Effects: reports written by the runner served before 2026-11-17 are refused (they lack the
  settings statements; the page says to run the current runner again); a report for a printed value
  such as `0e5`, which the runner flags as vacuous, is not shown.
* Tests: `tests/claim-check-page.test.mjs` (15 tests with `claim-check-core.test.mjs`, including 40
  one-field variants of a genuine receipt, the reviewer's hand-written and right-to-left receipts, and
  a check that no refusal echoes report text); `scripts/browser_claim_check.cjs` with the real Lean
  4.28.0 kernel: each of ten input changes clears the result and the downloads, a receipt for the old
  file is refused after another file is checked, a tampered checker or an unloadable catalog yields no
  proof file. The reviewer's probes show the issues before and not after.
* The committed journey record `docs/evidence/claim-check-v1/browser-journey.json` predates these
  changes and was **not** regenerated (overwriting an evidence file was not permitted in this
  session); the same journey was run on this branch's head with the real kernel and passed. Whether
  to regenerate the committed record is the owner's call.

**What the final review asked to confirm, and where it is shown** (all in the dry-run records, which
are regenerated by script at the commit they name):

| Confirmation | Evidence |
| --- | --- |
| The reading-help requalification binds the exact current source bytes | patch 01 dry run: the patched verifier accepts the tree only with the successor's pins, and rejects an edited help entry, a second page added without review and an edited help stylesheet |
| Historical qualification records remain unchanged | `docs/evidence/site-clarity-v1/` is byte-identical to `main`; the patch 01 dry run rejects an edited historical record and an edited successor |
| The public-tree admission rule accepts only the explicitly retained snapshot | patch 02 dry run: an altered or unlisted public file, an altered production page, an untracked public file, a moved tag and a retained commit that drops the original PR heads are all rejected |
| The complete website gate includes ClaimCheck's mandatory tests | patch 03 dry run: `ci:zero-minutes` ends with `npm run test:claim-check`, which runs both ClaimCheck test files |
| Forged proofs, legacy receipts, altered runners and incorrect source digests stay rejected | patch 03 dry run: the gate fails when the served runner is altered or loses its strict grammar, when the checker is altered, when withdrawn receipts are accepted again, when a report about other data or without the canonical flag is shown, or when the local-run label or the "what no kernel run verifies" text is weakened; the page tests refuse the reported forgery before Lean and every incorrect digest |

Dry runs of patches 01 and 03 are reproducible: `python3 scripts/dry_run_claimcheck_proposals.py`
(throw-away worktrees; the patched gate must accept the commit and reject the listed alterations).

## Not proposed

No change to any ruleset, required check, bypass list, deployment setting, secret, or to the
Worker. No existing test is skipped, loosened or removed. No historical evidence file is edited (the
ClaimCheck browser-journey record, which this branch introduced, is regenerated with each change of
the page).
