# Newcomer workflow study

This is a ready-to-run protocol, not a completed human study. There are currently
zero verified human participant results from this implementation. Automated
browser sessions are labeled `automated` and excluded from human findings.

Recruit 5–8 consenting people unfamiliar with PCS. Recruitment and observation
require actual people; software-generated sessions must never substitute for them.
Do not send invitations or collect personal information automatically.

1. Open `/usability-study` in a fresh browser profile. Explain that participation
   is optional, records stay local, and sharing requires an explicit download.
2. Let the participant consent and start. Ask them to complete the five tasks in
   order using only the practice files and on-screen text. Avoid coaching.
3. Observe wrong column choices, interpretation mistakes, correction/recheck
   failures, missing saved settings and requests for help. A hint counts as help.
4. Record task completion, abandonment and observer assistance separately. The
   client quiz is a self-report; a correct answer alone does not prove a task ran.
5. Ask the participant what was unclear. Do not record their private CSV files,
   identity, screenshots of personal data or unrelated browsing.
6. Let them decide whether to export/share `pcs-usability-session.json`. Offer
   **Erase the study record**. Explain that downloaded copies are managed by them.

The UI records only whitelisted action names, bounded elapsed times and multiple
choice answers. First recorded answers are retained. It records no filenames,
CSV contents, headers, IDs, values, user-agent fingerprints or IP addresses.
Browser storage is untouched by instrumentation until explicit study consent.
Standard file-tool saves remain separately opt-in.

Analyze exports with:

```sh
python scripts/analyze_usability_sessions.py session1.json session2.json
```

The output separates automated and unverified volunteer sessions. Software cannot
verify human identity or the honesty of local clocks/answers. For observed human
sessions, provide a separate curator record using `--observer-attestations`:

```json
{"format":"pcs-usability-observer-attestations-v1","sessions":[]}
```

Each actual observation may add `{"session_id":"...","observed_human":true,
"assisted":false}`. Do not fabricate these entries. The analyzer rejects automated
sessions and unknown IDs in this manifest. Attestations remain empirical claims;
the report never labels human identity as software-verified.

Report denominators, abandonment, errors, assistance and first answers. Describe
participant selection and limitations. Compare an earlier workflow only with an
actual controlled baseline; do not infer "easier" merely from passing automation.
Do not train models from these records without separate, explicit authorization.
