# Source successor qualification review dossier v1

**Status: evidence-generation tool only — not a release approval, source admission, gate replacement, CI override, or policy successor.**

The protected source-intake rule in `scripts/check_reconciled_prs.py` intentionally pins exact source bytes, modes and census to an earlier qualified intake. It currently rejects the new implementation code in PRs #151–#153. This cannot be solved by treating passing independent technical tests as source authorization.

This package adds:
- `scripts/source_successor_review.py`: a read-only offline Git-object reviewer. It accepts only *full 40-character commit IDs*, verifies exact ancestor relation to the reviewer-selected baseline, walks both complete tracked-file trees, and reports changed path, operation, Git object ID, file mode, byte size, raw SHA-256 and risk category.
- `tests/test_source_successor_review.py`: real local Git fixture controls for forged branch name, abbreviated SHA, unrelated history, added files, changed protected policies, symlinks, mode changes, tampered digest/census and forged approval flags.
- `.github/workflows/source-successor-review.yml`: read-only CI job that runs these controls and generates a **non-authoritative** review artifact on this PR. Nothing is merged, published as approved authority or sent to Cloudflare.

The dossier deliberately sets `qualified=false`, `owner_approved=false`, `is_release_authorization=false` and `production_mutated=false`. Its SHA-256 is a content integrity checksum over its JSON statement, **not** an independent signature or grant of trust. Risk categories identify owner-review obligations; their presence does not constitute approval or bypass source reconciliation.

## Reproduction for a concrete candidate

From a checkout containing the selected exact commits:

```sh
python3 -m unittest discover -s tests -p 'test_source_successor_review.py' -v
python3 scripts/source_successor_review.py \
  --repo . \
  --baseline e8136625c463b271364b36b2b8ae76f8777f1967 \
  --candidate FULL_40_HEX_CANDIDATE_SHA \
  --output /PRIVATE/NEW_SOURCE_REVIEW.json
```

The output destination must be new; the script refuses to overwrite a previous artifact. No remote API requests or private source files are required.

## Mandatory review before a real successor can be proposed

1. Identify the exact candidate SHA(s), changed tracked files, policy-sensitive content (especially `public/_headers`), and any dependencies on prior draft PRs.
2. Have an independent reviewer verify every changed implementation source and test against the existing frozen source and existing trust boundary. Additional checks must be meaningful and negative controls must pass.
3. Decide the intended successor's exact authority and scope **with the owner**. Frozen old source-intake, retained tag, old manifest and historical results must remain immutable. A new protected successor would require a distinct reviewed manifest, source hashes, governance approval and new adversarial proof of the succession gate itself.
4. Do not change protected source checker, CI ruleset, authority file, or admission policy merely to make these new PRs pass. The current failed source-reconciliation result remains a valid block.
5. Independently resolve the D1 restore/migration requirements in issue #93 and PR #152; source qualification alone does not authorize a production migration.
6. Since main-push Cloudflare Builds can deploy, treat source acceptance, merge, D1 apply and production deployment as **separate explicit owner decisions**.

Owner review tracking: [issue #154](https://github.com/Tommaso-R-Marena/proof-carrying-science-site/issues/154). No changes to the existing protected gate are included in this PR.
