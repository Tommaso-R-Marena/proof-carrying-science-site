# First Investigation: a beginner path into PCS

The homepage's primary action and shared navigation now lead to the existing
`experience.html` tour. Its first task is a guided investigation with one concrete
outcome: find a difference between two rules, understand the scope of that finding,
and carry the exact facts to another checker.

The intended rule says, “If a tool is used, it must have permission.” The rewrite
says, “If a tool has permission, it must be used.” Two yes/no facts produce four
worlds. A learner predicts which rule rejects a world, runs the existing finite
logic evaluator, and explains what a counterexample establishes. A wrong prediction
gets an explanation and another attempt. No account, scientific vocabulary or
programming is required to complete the browser exercise.

Later steps appear only when relevant. The older trace/scientific examples and
contribution routes remain available under an expandable section, including their
existing deep links. The file reader is accessible independently so a recipient
can recheck shared evidence without repeating the lesson.

## Implemented behavior

* Reuses `countermodel-core.mjs`, its pinned `implication-flip` mission, and the
  existing `pcs-countermodel-witness-v1` format. No mathematical specification,
  production authority, Worker route or database schema changes.
* Downloads an exact witness JSON and genuine Lean proof source. The proof imports
  only `Std` and uses ordinary `decide`. Its browser metadata continues to say
  `lean_kernel_checked: false` and `pcs_authoritative: false`.
* Locally reopens a witness, rejects duplicate keys/unknown fields/unsupported
  versions/malformed worlds/over-budget files, and recomputes both truth values.
  It accepts no supplied success flag, signature claim or proof source.
* Editing facts, predictions or the learner's conclusion disables stale downloads.
  Reset clears the lesson and file reader. Selection generations prevent a delayed
  old file read from overwriting a newer selection or reset.
* Initial controls are disabled until listeners are ready. Keyboard operation,
  live status messages, a no-JavaScript fallback, and 320–1440 px layouts are
  covered by real Chromium tests. No learner facts are uploaded or persisted.
  Ordinary page/account requests and infrastructure logs are separate from the
  local example; the journey also works with the account API unavailable.

## Reproduce

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/first-investigation.test.mjs tests/arena-experience.test.mjs
npm run test:first-investigation:browser
source scripts/activate_lean_428.sh
npm run verify:first-investigation:lean
```

The browser runner uses an installed `/usr/bin/chromium` or the lockfile-pinned
Playwright browser. Set `PCS_CHROMIUM` to an existing executable or run
`npx --no-install playwright install --with-deps chromium`. Screenshots, actual
downloaded files and machine-readable results are retained in
`PCS_FIRST_EVIDENCE_DIR` (default `/tmp/pcs-first-investigation-browser`).
CI uses the hosted runner's installed Chromium/Chrome, as the existing protected
browser gate does, and records its actual version. A missing executable fails the
job; the browser tests are never replaced by static checks or skipped.

The formal runner checks the reviewed Linux x86_64 Lean 4.28.0 executable hash,
compiles both possible counterexample downloads, audits the exact theorem's
assumptions, and requires a deliberate false theorem to fail. The two valid proof
closures use only `propext`. Missing tools or an unexpected binary produce failure,
never a fabricated affirmative verdict. This runner is a test, not a production
authority interface or immutable security root.

For a separate implementation, install the PCS core and run:

```sh
pcs countermodel-check-v1 pcs-first-witness.json
```

The actual Chromium-produced witness was independently checked with the Python
core, and the actual downloaded `.lean` file compiled with Lean 4.28.0. The Python
checker source matches protected core `fabc704efdbda4c8822881366e4db3d3e31f066a`.
No changed core library or experimental Aristotle branch is required.

The existing `test:arena:experience` gate includes the new pure tests. The protected
countermodel Lean workflow also checks the two new download paths. A focused
browser workflow retains the four-width journey, malformed-file controls,
download equivalence, delayed-read/reset tests and no-JavaScript fallback. The
complete existing website gate, syntax checks, security tests and Wrangler build
remain enabled.

## What the evidence establishes

This is a finite mathematical counterexample, a browser calculation and a
portable artifact workflow. Browser rechecking uses the same JavaScript semantics;
Python provides a separate implementation, and compiling the source supplies a
Lean kernel check of the stated finite proposition. None authenticates a producer,
checks a deployed AI, establishes empirical safety, or creates a signed PCS
acceptance receipt. Host/compiler/browser behavior remains trusted.

No human learning or adoption study was run. The “about three minutes” label is an
estimated activity length, not a measured completion result. The next usability
milestone is a consented beginner study: task completion, explanation of the
evidence boundary, and successful replay of someone else's file on an unseen
example. The implementation collects no such study data automatically.
