# Clear first visit: check, understand, recheck

This update connects the existing working tools into a small beginner path and
reduces the first-round interface of the three recommended games. It adds no
production scientific authority or learned weights.

## What a visitor can do

1. Open `experience.html`, check the two fictional groups, and read what the
   matching ID means. Change the inputs to see the non-overlap result.
2. Save a readable report and the original replay format. Reopen the replay
   directly in the walkthrough. The browser verifies the embedded file sizes,
   SHA-256 identities and exact ID columns, recomputes the counts, and rejects
   disagreement. Imported Lean receipts cannot establish a fresh confirmation.
3. Use `check-my-files.html` for their own supported CSV exports. Its result now
   separates the question checked, the next action and what remains unknown.
4. Open `model-walkthrough.html` to run the actual existing 384-weight repair
   ranker. The independent finite evaluator checks each ranked proposal. Compare
   with the original deterministic edit order, save a readable report, and reopen
   a replay to recompute both proposals and checks. This uses reviewed pinned
   weights through `verifiedRepairModel`; absent or altered weights fail closed.
5. Play a starter game to practise the same reasoning idea. Advanced controls and
   research sharing remain accessible in optional panels.

## What each starter game is for

| Game | One task | Why it belongs in PCS |
| --- | --- | --- |
| World Builder | Make the original rule and its rewrite disagree | Practise producing a concrete counterexample to a changed meaning |
| Proof Quest | Put bridge-building cards after the steps they need | Practise placing evidence and prerequisites before a conclusion |
| Safety Forge | Find a fictional bot loophole and repair it while preserving its job | Practise falsification, finite checking and avoiding overblocking |

The board comes before maps, extra missions, model/research tools, notebooks,
sharing and privacy controls. Every original game DOM ID is preserved. The
controllers retain the same algorithms, hint bookkeeping, scores, schemas and
consent handlers. Quest/Forge controller changes are wording only. Pure navigation
help still cannot click a game control, award progress, reveal a solution, persist
or upload anything. The separate usability observer records only explicitly
consented coarse events.

## Actual model demonstration results

These are inspectable public evaluation-family examples, not a new benchmark.
Using the existing frozen weights and existing finite evaluator:

| Example | Learned proposals checked | Original-order proposals checked | Outcome |
| --- | ---: | ---: | --- |
| Permission implication reversal | 1 | 5 | Both find finite agreement; original order rejects four candidates first |
| Everyone versus someone has a key | 1 | 1 | Both find finite agreement |

The model computes rankings before the evaluator is consulted. The demonstration
stops at the first proposal with agreement in every registered world of sizes
1–3, with five proposals at most. Each rejected proposal has a recomputed concrete
countermodel. Exact formulas, finite witnesses, scores, checked-world counts,
bound, strategy and model identity are carried in the replay. Replaying compares
all fields with a deterministic fresh run; changing a result to positive does not
make it accepted. English labels are reviewed renderings of these two registered
formula families, not an arbitrary natural-language formalizer.

No Lean kernel runs in either browser walkthrough. A bounded result does not
prove equivalence in all structures, truthful source assumptions, scientific
validity or real-system AI safety. Browser execution, delivery and correctness of
the host implementation remain trust dependencies. Reports and hashes are not
signatures. No weights, schemas or scientific authority were promoted. The
separate hosted proof workbench and portable native checker remain available.

## Optional newcomer evaluation

`first-visit-study.html` offers six short tasks covering purpose, file-result
interpretation, the model and three starter games. Starting requires an unchecked
consent control and an explicit click. It records only allowlisted coarse UI
codes, elapsed times, closed-choice answers, task-completion self-reports and
clarity/enjoyment ratings. No filenames, CSV contents, IDs, game facts, free text
or personal identity enter this record. No network submission is provided.
Downloading and externally sharing a record are separate voluntary actions.
Unchecking consent or using Erase stops subsequent recording and removes the local record; downloaded
copies are separate files. Existing gameplay research donation remains separate.
Usability records are not authorized as proof/model training data.

For an actual study, invite consenting newcomers separately. Do not coach the
first attempt. Ask them to explain PCS after roughly a minute. Keep independent
observer notes on prior experience, task completion, errors and help given. The
browser records cannot establish human origin or reliable timing. Report human
results only after that study. No participants were recruited and no human
comprehension or enjoyment finding is asserted here.

To inspect records locally:

```sh
node scripts/summarize_first_visit.mjs record.json [another-record.json ...]
```

The summarizer rejects duplicates and malformed records, reports zero verified
human participants, and separates labeled automation from unverified volunteers.
It does not turn self-reports into verified human findings.

## Reproduction

```sh
node --test tests/clear-purpose.test.mjs
npm run test:arena:experience
npm run test:browser:clear-purpose
npm run test:browser:games-start
# With the isolated local Worker on 127.0.0.1:8788:
npm run test:browser:usability
npm run test:world-builder:browser
npm run test:browser:beginner
```

`test:browser:clear-purpose` uses a loopback asset server, real Chromium, the
committed weights and actual controllers. All network mutations are blocked.
Only negative substitution is used: missing or corrupted model files must reject.
Four viewports (320, 390, 768, 1440) cover actual checks, downloads, replay errors,
keyboard use, consent, erasure and overflow. The protected main workflow runs this
campaign together with existing site, native app, proof replay and game tests.
Synthetic practice exports are explicitly marked `participant_kind: automated`.

Local validation: 560 Node tests passed with zero failures or skips; the full
Cloudflare build/dry-run gate passed. Four-width walkthrough and starter-game
campaigns passed, as did all 60 guide journeys, all seven World Builder puzzles
at four widths, and the 12 existing beginner journeys. Source-bound screenshots
and machine reports are in `docs/evidence/clear-purpose-v1/`. These are automated
functional checks, with zero human participants.
