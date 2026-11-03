# Observed workflow pilot: private handoff and model regressions

Status: ready to run; **zero human sessions collected**. Browser campaigns are
engineering tests, not newcomer evidence. This follow-up supplements the frozen
[five-task study](../../NEWCOMER_STUDY_V1.md); do not modify or relabel old records.
No participant recruitment or outreach has been performed by this implementation.

A moderator can invite five to eight consenting adults unfamiliar with PCS.
Explain that observation is optional, only practice data are needed, and they may
stop or erase local records. Obtain separate permission before sharing anything.
Do not collect identities, private CSVs, voice recordings, or browser histories.
Consent to this pilot is not consent to model training or publication of raw data.

Use the actually released version listed on the website. Record its version,
source commit, OS, screen width, and whether this is a first or repeat visit.
Keep any earlier-version comparison on a genuinely separate, randomized group;
the same participant's second attempt is affected by learning.

Give these tasks without describing the controls:

1. “Your weekly observations gained new rows. Find a way to check whether any
   earlier values changed.” Let them find What changed? and load the Iris example.
2. “Keep this work private and check the exact same files in the downloaded app.”
   Observe whether the complete private handoff is found, opened, and rechecked.
   A browser result or imported receipt alone is not a fresh Lean confirmation.
3. “A new model gets two of three answers right; the old one gets one right.
   Does it keep every answer the old model got right?” Use the three practice CSVs
   below. They should find two gains, one regression, and explain that a higher
   total did not preserve all earlier matches.
4. “Share a readable summary without the row IDs or answers, then give a reviewer
   enough to recheck it privately.” Observe default report redaction and deliberate
   choice to include data in the separate private replay.
5. “What does the Lean result tell you about the reference answers, and about
   unseen cases?” Correct interpretation: exact comparison/preservation on these
   files; reference validity and generalization need separate evidence.

For each task record first unprompted completion, abandonment, time to completion,
wrong turns, help offered, and the participant's explanation. Use an anonymous
local session number. Any hint counts as assistance. Record first answers before
explaining errors. Include failed attempts and denominator counts. Do not infer
human comprehension from a correct multiple-choice answer or an automation log.

Practice CSVs, saved as three separate UTF-8 files:

```csv
id,label
a,yes
b,yes
c,yes
```

```csv
id,label
a,yes
b,no
c,no
```

```csv
id,label
a,no
b,yes
c,yes
```

Use one observer worksheet per consenting session:

| Task | First answer / explanation | Completed unaided? | Seconds | Wrong turns / help / abandoned? |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

Summarize unaided completion as n/N per task, all abandonments, median elapsed
time with its denominator, and all interpretation errors. Report convenience
sampling, moderator effects and small sample size. Keep raw free-text observations
private unless participants explicitly authorize their release. Existing v1 JSON
exports can be analyzed by `scripts/analyze_usability_sessions.py`; these follow-up
observations are a separate protocol and must not be silently folded into v1 scores.
