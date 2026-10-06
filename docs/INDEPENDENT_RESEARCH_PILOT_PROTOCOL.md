# PCS independent research pilot protocol — 2026-10-06

Status: **usable local-first intake kit, public research-preview scope only; not a formal-assurance release**.

## Goal

Recruit independent scientists and AI-safety researchers to independently reproduce, falsify, or assess trust boundaries in bounded PCS claims. This is a *research validation* program, not an endorsement campaign, bug bounty with implied payment, or evidence that the complete private core has been independently audited.

## Current external-user workflow

1. Visitor opens `/researcher-pilots.html`. They may try public browser exercises, local-first guided discovery, package inspector, validation registry, and result-anatomy examples without an account.
2. They choose one of three tracks: reproduction, falsification/negative control, or trust boundary assessment. They record the scoped claim, actual or intended version, command/procedure, expected decision, self-reported observation, assumptions and unresolved limitations.
3. JavaScript validates the input and generates a **purely local** `pcs-independent-pilot-draft-v1`. It always sets `signed:false`, `authoritative:false`, `pcs_verdict:NOT_EVALUATED`, `independent_verification:NOT_ATTESTED`. User-provided observations never become system PASS/ACCEPT.
4. User chooses **Save JSON** or **Compose pilot email**, which opens the user's mail client. No background submission, D1 write, CRM entry, upload or automatic email is performed.
5. A trusted PCS reviewer screens the request manually, agrees on a bounded test target and a safe data handling channel when required, and then records a consented review outcome. **Do not** request unpublished source, patient data, institutional credentials, proprietary files or secrets in the public form or email.

## Reviewer qualification and acceptance rubric

A candidate independent evaluation is meaningful when it contains:
- a claim with typed semantic scope and explicit assumptions;
- exact source version/SHA, verifier version, dependencies and execution environment;
- exact input bytes/hashes, invocations and expected outcomes;
- authentic console outputs including successful *executed* CI/Lean steps (not just a label of PASS);
- at least one altered-byte / unsupported-tag / invalid-proof negative control where appropriate;
- a clear distinction between what the kernel proves, Python/browser execution, signature authenticity, and deployed-world fidelity;
- privacy/permission to disclose the observed artifacts, and a written record of any confidential exclusions.

Label each outcome **reproduced**, **falsified**, **inconclusive**, or **not executed** by a human reviewer only after examining evidence. Do not treat external user assertions as PCS authority. Negative findings are welcome; publish consented limitations alongside successes.

## Falsification-oriented example tasks

| Target | Supported public test | Expected negative control | Not established |
|---|---|---|---|
| Browser trace | finite forbidden action + cumulative risk | mutate action to forbidden 7 or exceed risk 4 | signed provenance, `FaithfulLog`, deployed safety |
| Synthetic PK/PD | finite replay of analytic one-compartment equation | perturb observation beyond tolerance | empirical biological model adequacy |
| Guided project | map exact local files to supported typed predicates | change a source artifact after draft | claim truth or authoritative Lean verification |
| PCS package inspector | examine local package members/digests | mutate bound file, invalid ZIP | production authority's final verdict absent Lean |
| Private full-core pilot | owner-arranged, IP-cleared exact-SHA sandbox | signed unknown `check_spec.type` must reject | **NOT AVAILABLE YET** pending Aristotle P0 and genuine CI |

## Privacy, security, ethics

- Source repos remain private; do not expose unpublished CertiForge, AI-safety formalizations or academic collaborator research.
- No automatic access is granted to server-side code execution, paid task assignment, production D1, GitHub write roles or Owner authority.
- Public forms cannot accept uploaded data, cannot claim to send email, and never confer verified status.
- Keep consent and any institutional approvals separate from the site. If a pilot involves human subjects, medical/regulated data or controlled infrastructure, obtain the appropriate review before accepting.
- Do not use a public email to negotiate sensitive data transfer. Avoid duplicating personally identifying records in GitHub issues. For defects in authorization or cryptography, use a private security reporting channel.
- No payment, affiliation or research credit is promised without explicit separate agreement.

## External pilot release gate

Only announce an independently reproduced *PCS kernel* result when a named/consented independent reviewer has actually executed exact-SHA pinned checks and the formal source and compiler/toolchain trust boundary have been documented. Until then the pilot program is a recruitment, documentation and bounded browser-validation experience—not a certified safety service.

## Initial operational metrics

Track with explicit consent (privately, not from website surveillance): invitations sent, responses, selected scoped tests, completed independent reproductions, credible counterexamples, time to closure, and unresolved critical issues. A skeptical failure with a reproducible fixture has at least as much research value as a successful demonstration.

## Outreach email template (not sent automatically)

Subject: Independent evaluation invitation — bounded PCS scientific assurance

Hello,

We are building Proof-Carrying Science, a research platform for verifiable computational claims and explicitly scoped AI-safety checks.

Would you be interested in evaluating one small, falsifiable public example? We would value an independent attempt to reproduce the decision or find a counterexample. The public research-pilot page explains what can be tested now and what is not yet established: https://proof-carrying-science-site.marenatommaso.workers.dev/researcher-pilots.html

Our source repositories are currently private while formal results and intellectual-property boundaries are reviewed. We would not ask for confidential data, and we welcome negative findings and methodological criticism.

If this is relevant to your research, we would be glad to agree on a bounded test and attribution/consent terms in advance.

Best regards,
Proof-Carrying Science

Do not send this broadly as spam, or imply an institutional partnership or an already completed independent audit. Individualize only on concrete research relevance.
