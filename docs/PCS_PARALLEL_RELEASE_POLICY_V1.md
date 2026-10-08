# PCS research-data and website release evidence policy

## What is implemented
- \`assemble_arena_research_release.mjs\`: loads ONLY owner-exported, adult-opt-in game datasets; invokes the existing source-specific replay/dataset preparers for Countermodel Lab, Safety Forge, Proof Quest, ProofLab and Forge Duel; rejects identity-bearing keys and email-like strings, creates per-game deidentified output and a SHA256 manifest. No data is fabricated; zero real contributions produce zero records.
- \`verify_website_review_gate.mjs\`: offline *policy sanity check* on exact-SHA GitHub check-run records. Missing, skipped, cancelled and neutral statuses are **not** equivalent to passed. This does not authenticate untrusted JSON: production release requires querying GitHub directly with approved credentials and a reviewer verifying the true workflow provenance.
- \`semantic-audit.html\`: read-only interactive showcase of 13 exact Aristotle v1 fixture verdict expectations. Links to Countermodel Lab. Displays the source-fixture index SHA256 and explicitly says a live Lean kernel run has **not** occurred.
- Countermodel Lab: local private session export, inspectable move history, linked research consent. No new automatic research upload.
- No production D1 changes. Countermodel migration 0024 from PR #82 still needs owner-approved dry-run, backup and application.

## Research data source and verification boundaries
Data can contain **real consenting human choices**, but the game worlds and labels are synthetic deterministic simulations except for source-grounded graph tasks. The owner-only research exports perform deterministic server replay. The offline exporters independently replay/recheck labels again and retain input provenance, feedback exposure and split policy. Neither the exporter nor its SHA hashes prove that a participant is a person, that consent can be retracted from past offline copies, or that Lean's kernel validated any game move.

Example, on a private machine holding legitimate owner exports:

\`\`\`bash
node scripts/assemble_arena_research_release.mjs --out-dir private-output \
  --countermodel private-countermodel-export.json \
  --safety_forge private-safety-export.json \
  --proof_quest private-proof-quest-export.json
\`\`\`

\`private-output\` must remain access-controlled. Audit human-consent governance, license/data usage, data quality and held-out leakage before any training. Never commit actual user submissions, raw exports or private model-training data to this repository.

## Non-negotiable complete production gates
1. Merge upstream drafts in their correct order, with independent reviews.
2. Execute all local tests \`npm run ci:zero-minutes\` and browser/mobile accessibility testing on exact head, including Worker identity/consent/erase/admin-export cases.
3. On an isolated Lean 4.28-capable runner, \`node scripts/verify_countermodel_lean.mjs\` must produce 7 genuine kernel-checked successes for exact source. A skipped job fails release review.
4. Back up D1, apply \`0024_countermodel_lab.sql\` in staging, smoke test, then apply production only on explicit owner approval. No automatic migration in public PR CI.
5. Confirm core PCS full Lean tests and proof-translation authority independently. Website static fixtures cannot substitute for this.
6. Query protected GitHub checks and source commits from GitHub's authenticated API. A local JSON snapshot is only supplemental diagnostic evidence; do not self-authorize production deployment using it.
7. Verify data privacy, backup restore, retention and revocation operations. Explicitly disclose offline export withdrawal limitations.
8. Promote release only on a reviewer-approved, authenticated exact SHA. Keep CF website token segregated from untrusted public core CI.

**Current status:** This branch is a DRAFT demonstration + tooling implementation, not a production release. GitHub's required checks on the predecessor website branch were previously SKIPPED. No claim of production readiness is made.
