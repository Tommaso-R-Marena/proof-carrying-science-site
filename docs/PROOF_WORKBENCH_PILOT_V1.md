# Optional beginner pilot v1

Status: toolkit implemented; **zero observed human participants** at release.
Automated browser tests and synthetic records are separate engineering evidence.

Recruit five to eight consenting adults who self-report no programming or proof
assistant experience. The website does not recruit or message people. Explain
that participation, publication of a mathematical statement and sharing a local
study export are three separate choices. No names/emails are needed. A decline,
unsupported claim or unavailable service is a valid recorded outcome.

Use `/proof-workbench-study.html`, start an unverified-volunteer session with
separate adult/study consent, then follow its workbench link in the same tab.
Observe selection, interpretation review, a clearly recorded example, optional
fresh checking, report export and opening the saved evidence. Return to the
study page for five comprehension questions. Export only if the person chooses.
The page never uploads study records. Normal page requests and documented
Cloudflare performance analytics still occur.

A shared client/network has two proof slots/day and the whole service twelve.
Schedule within those limits; do not spoof identities or bypass admission. The
recorded example needs no slot and must remain labeled recorded. Distinguish
recorded-task completion from completion with a fresh public result.

Before seeing data, use these pilot targets for deciding what to fix next:
at least four of five observed beginners complete the recorded workflow without
help; at least four of five answer four comprehension questions correctly.
These are small-pilot product targets, not statistical generalization claims.
Report all attempts, assistance, refusal, service failures, missing responses and
source versions. Keep individual observer timing separate from client clocks.

Observer claims are a second file, not software-certified human identities:

```json
{"format":"pcs-proof-workbench-observer-v1","sessions":[
 {"session_id":"COPY_THE_CONSENTED_SESSION_UUID","observed_human":true,
  "observed_beginner":true,"assisted":false,"completed":true,"elapsed_seconds":300}
]}
```

This is a schema example, not collected evidence. Run:

```sh
python scripts/analyze_proof_workbench_pilot.py participant-*.json \
  --observer-claims observer.json
```

Without observer claims, human completion rates are null. Automated sessions
cannot be elevated into human results even by an observer file. All client and
observer evidence remains unverified empirical input. Study consent authorizes
usability research, not automatic model training. Preserve original exports;
choose one final record per UUID and reject duplicates instead of double counting.
