# Beginner workflow and copy review

The previous release's first investigation worked in automated tests, but that
was not evidence that a newcomer could find a useful starting point. This review
started from protected site commit `54f216582d545a4341bbfc1b6dfd23ca6a18d002`.
There were **zero human participants**. The [machine-readable record](review.json)
contains the initial source-bound browser results, baseline measurements and copy audit.
It is preserved at its original implementation revision. The subsequent
[clean-URL review](clean-url-review.json) binds the final navigation fix and
records its separate browser checks. The
[qualified-copy restoration](qualified-copy-review.json) records a source-binding
failure caught by the full gate and the exact restoration that followed.

## Changes

The homepage puts its first action before the explanation and offers three paths:
learn how a check works, open a shared package or solve a visual puzzle. The
illustrative console and technical catalogue are expandable. Existing research
bookmarks still open their sections. The games menu consistently recommends
World Builder first, and the inspector explains the difference between a full
PCS package and a first-investigation evidence file.

The first investigation now offers a clearly labeled suggested example. Keyboard
focus moves to the actual result or conclusion feedback, then to the evidence
step when it is completed. A shared skip link lets keyboard users bypass the
navigation. This changes presentation; the rules, witness format and authority
remain unchanged. No gameplay uploads or new analytics were added.

The copy pass rewrites heavy use of prose em dashes in authored HTML, shortens introductory
text and rewrites canned transitions in the result reader and game feedback.
Empty-result placeholders remain. One paired mathematical parenthetical remains
on the exact source-bound calibration page, with its finding and source hash
explicitly disclosed. The copy check covers all 66 HTML pages,
including descriptions and accessible labels. It flags selected phrases and
prose em dashes; it is not an authorship detector or a readability assessment.
Code and mathematical displays are outside this editorial check. Historical
evidence and its source bindings are preserved.

## What was tested

- Reproduced the original first-investigation browser suite at four widths.
- Completed three actual browser journeys at 320, 390, 768 and 1440 pixels:
  find and export an example, reopen it in a fresh page; solve the first visual
  puzzle; inspect a sample package whose exact hash is checked.
- Required the main action to be visible without scrolling in a 900-pixel-high
  viewport. Checked keyboard operation, focused feedback, mobile overflow,
  folded research bookmarks, malformed URL escapes and navigation without JS.
- Confirmed that the wrong real-AI conclusion blocks evidence export and that
  browser inspection still reports authority as unestablished.
- Ran all 477 JavaScript tests with no failures or skips, the complete local
  `scripts/cloudflare_build.sh` release gate, and the existing 48 game tour
  configurations with four keyboard/undo worlds. Tests overlap; these counts
  must not be added as independent observations.

The 390-pixel homepage had 1,766 visible main-content words before this change.
The new browser record contains its current count and the other widths. This is
less content to navigate, not a measured improvement in comprehension or speed.
The baseline homepage was 16,063 pixels tall at that width. These measurements
include the actual loaded page; collapsed content is still available.

Reproduce using the pinned Node version and a Chromium executable:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:copy
PCS_BEGINNER_OUTPUT=/tmp/new-beginner-review npm run test:browser:beginner
PCS_FIRST_EVIDENCE_DIR=/tmp/new-first-review npm run test:first-investigation:browser
bash scripts/cloudflare_build.sh
```

The browser script starts its own loopback server, rejects external requests and
writes, and refuses an existing results file. Set `PCS_CHROMIUM` when Chromium is
not at `/usr/bin/chromium`. CI uploads screenshots and results from fresh runs;
the new journeys also run inside the protected `site-full-gate`.

## Production URL defect found during the review

A read-only live request showed that Cloudflare redirects `experience.html` to
`experience`. The previous shared navigation compared that clean path against
`.html` filenames, so its current-page marker and breadcrumb were absent. The
fix normalizes both URL forms before matching page links.

The new beginner suite serves the observed clean-URL redirects and checks the
current-page marker and breadcrumb at all four widths. The original browser suite
still tests file URLs. A separate Chromium negative control served the exact old
`site.js` at `/experience`: it had no marker and zero breadcrumbs; the new source
had the page marker and one breadcrumb. The clean-URL record includes both source
hashes. No remote verifier or kernel verdict was substituted in this UI test.

## Preserve qualified source when editing copy

The first full hosted gate on `7040ab8` rejected the punctuation edit to
`calibration-lab.html`: that page is one of five inputs bound to its published
browser qualification. Restore the exact page rather than changing the historical
receipt. The source checker and both original qualification receipts are unchanged.
The copy audit now discloses the retained parenthetical only when the complete
page matches the exact qualified hash. Any edit invalidates that exception.

Four Python regression tests cover ordinary prose, the explicit exception, edited
page rejection and all seven existing local qualification source bindings. These
checks now run in the quick release gate too. The independent source check passed
against the actual pinned core checkout; calibration export verification rechecked
22 archived hull receipts, each with 386 theorem identities. This is a recheck of
existing evidence, not a new physical experiment. Earlier browser reports are kept
at their original revisions and do not imply that this failed source gate passed.

## Remaining validation

A useful next study is to observe five consenting adults who have never used PCS.
Do not coach them through the controls. Ask each to (1) find something useful from
the homepage, (2) complete one activity, (3) reopen shared evidence, and (4) explain
what the result does and does not establish. Record completion, requests for help,
wrong turns and their own explanation. Ask permission before recording; do not
collect sensitive files or treat practice as consent to research donation.

The proposed human study has not run. Full scientific verification still requires
a technical reviewer and command-line setup. The browser examples provide
learning and inspection utility, not a claim that end-to-end PCS is already
accessible to every nontechnical user.
