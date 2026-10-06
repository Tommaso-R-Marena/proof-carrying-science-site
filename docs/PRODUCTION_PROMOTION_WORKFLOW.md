# PCS: archive → production, with independent approval

A Commons submission that is **accepted** and subsequently **merged into the isolated archive**
is not yet production code. Only the Founder/Owner can open a promotion case and specify exact
production destinations. This is a separate boundary from the original reviewer acceptance.

## Exact state machine

1. **Archived and accepted:** the submission is `accepted`, its GitHub staging state is
   `merged`, and the merged PR really corresponds to that submission and target repository.
   The Worker compares each archived file on current `main` with the originally saved D1
   file and SHA-256 hash, refusing any changed archive.
2. **Owner requests production promotion:** choose the accepted archive in the Admin Center
   under *Production promotions*. Map **each** uploaded filename to one production path.
   These are strictly limited by a server-side allowlist (Lean `formal/PCS/`, core `pcs/`
   and `tests/`; website `public/` / `src/` / site tests; selected documentation).
   No `.github/`, workflow, credentials, `wrangler.jsonc`, arbitrary scripts, hidden
   files, symlinks, path traversal, cross-repo targets, deletions, or renames.
3. **Isolated staging:** use a new branch `pcs/promote/<promotion ID>` from exact
   production `main`. Copy only the accepted text bytes and generate a manifest at
   `contributions/pcs-promotions/<id>/manifest.json`. The manifest records the source
   submission, task ID, original archive PR, full GitHub repository, production path
   mappings, SHA-256 digests and exact baseline commit. A fresh production PR opens.
4. **Fresh checks:** the dedicated GitHub Actions `pcs-promotion.yml` **must** report
   one successfully executed job named `PCS Promotion Verification` on the **exact**
   promotion head SHA, with every required named test step explicitly successful.
   The Worker additionally rechecks the exact PR file list, unchanged original archive,
   target bytes, manifest content and `main` baseline. Core jobs run repository
   integrity, Python regression/adversarial tests, Lean build and proof-source audit;
   site jobs run the site checker, security campaign, syntax and JS integration tests.
5. **Explicit approval:** the Founder/Owner independently examines the code, formal
   interpretation and expected effects; enters a substantive reason. PCS records
   `approved_head_sha` and an audit event. **No approval** is permitted when checks
   are missing, runner-less, failed, skipped, stale or scope-inconsistent.
6. **Explicit integration:** a *separate* Owner click supplies another rationale. The
   service repeats all checks and merges only the exact SHA previously approved,
   using GitHub's conditional SHA check. Existing branch protections still apply.
   This is a production-source PR, not just the archive PR.
7. **Audit / evidence:** the promotion record preserves its source submission, mapping,
   reviewer explanation, immutable approved SHA, PR link, final merge SHA and history.
   Requests for changes are terminal for the current case; use a newly accepted archive
   submission for a revised production proposal.

## Existing CI quota situation

At implementation time, the user reports both GitHub Actions and CircleCI monthly usage
exhausted. That makes fresh automated checks unavailable; **no production promotion
can legitimately pass or merge**. Neither a cached old test result nor Cloudflare's
site-deployment build is a substitute for fresh PR-bound Lean/PCS tests.

The core repo's original archive workflow lives in a separate unmerged
PR (<https://github.com/Tommaso-R-Marena/proof-carrying-science/pull/62>)
blocked by required CircleCI status. The new production promotion workflow likewise
must be merged onto each default branch before any actual promotion can pass.

Do not weaken branch protection or mark a check successful without executing it.
Use isolated/free CI runners in future if available, with untrusted PRs never
running on personal laptops or privileged university systems.

## Threats explicitly checked

- Self-declared levels/reviewer authority: owner session enforced by server, never client.
- Untrusted filenames/path traversal: mapped production paths are owner-selected,
  syntactically validated and explicitly allowlisted.
- Different content in archive, D1 or PR: byte-by-byte equality + SHA-256 checks.
- Post-approval pushes: conditional reviewed SHA rechecked before GitHub merge.
- Wrong base or unrelated changes on main: promotion fails closed when main moved.
- Unrelated file edits: exact promotion PR file-inventory verification in both
  the Worker and CI's `scripts/check_promotion_bundle.py`.
- Stale, missing, failed or runner-less CI: never counted as a passing gate.
- Malicious contributor sources: no automatic code execution in Cloudflare.
  CI uses disposable read-only runners; independent Owner semantic review
  remains mandatory, including for passing Lean proofs.

## Limitations

The trust boundary still includes GitHub, the Worker runtime, D1, administrator identity,
and the CI execution environment. CI success is **not** a proof of real-world scientific
truth. The workflow operates on up to three text files; large/binary/complex multi-file
refactors remain a separate, manually managed engineering review process.
