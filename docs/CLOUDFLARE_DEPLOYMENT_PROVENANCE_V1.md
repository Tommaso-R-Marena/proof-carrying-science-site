# Cloudflare deployment provenance v1 — offline auditor

**Status: draft, non-authoritative provider-metadata consistency checks.** This proposal does not configure Cloudflare, perform API calls, rotate credentials, grant release permission, or replace PCS's existing protected source gate.

## Problem

The live PCS site is a Cloudflare Worker with automatic Builds from protected GitHub `main`. A separate API token can upload a Worker outside that path. Grokbot identified an earlier v321 deployment attributable to some API token, after a canceled Builds run; the exact actor remained unknown. A green GitHub CI result for `main` does not, by itself, establish that the currently deployed Worker corresponds to that release.

## Implementation

`scripts/cloudflare_deployment_provenance.py` accepts a sanitized **offline JSON snapshot** of Cloudflare's read-only `GET /workers/scripts/{name}/deployments` and `GET /builds/builds?version_ids=<active-version>` responses. The operator supplies a frozen exact `main` commit SHA and approved Builds trigger ID. The checker then:

- Orders deployment records by their reported creation timestamps; it does not silently trust response ordering.
- Requires one full, 100-percent active version; split/ambiguous rollout is `UNVERIFIED`.
- Finds the provider-associated successful build for that version.
- Checks that the build has origin type `push_event`, expected branch `main`, exact pinned source commit and exact approved trigger.
- Reports `MATCHED_METADATA`, `UNVERIFIED`, or `MISMATCH`; neither match status establishes independent artifact hash equivalence, protected CI or source approval.

The command refuses to overwrite existing output and exits nonzero for both mismatch and insufficient evidence. No secrets or full account API tokens should ever be included in snapshots.

## Reproduce locally (using previously captured and sanitized GET responses)

```sh
python3 -m unittest discover -s tests -p test_cloudflare_deployment_provenance.py -v
python3 scripts/cloudflare_deployment_provenance.py \
  --snapshot /PRIVATE/PCS_SANITIZED_CLOUDFLARE_READONLY_SNAPSHOT.json \
  --expected-sha e8136625c463b271364b36b2b8ae76f8777f1967 \
  --expected-trigger 06e0acd1-8186-4925-8038-2ba1d7312623 \
  --output /PRIVATE/NEW_OFFLINE_PROVENANCE_REPORT.json
```

Snapshot shape (metadata only):

```json
{
  "deployments": [
    {
      "id": "<deployment ID>",
      "created_on": "<ISO UTC timestamp>",
      "versions": [{"version_id": "<version UUID>", "percentage": 100}]
    }
  ],
  "builds": {
    "<version UUID>": {
      "build_uuid": "<build UUID>",
      "build_outcome": "success",
      "trigger": {"trigger_uuid": "<exact approved trigger UUID>"},
      "build_trigger_metadata": {
        "build_trigger_source": "push_event",
        "branch": "main",
        "commit_hash": "<exact protected source SHA>"
      }
    }
  }
}
```

Only read-only API metadata fields are required. **Do not include environmental secret values, OAuth credentials, API token bodies, sensitive build logs or private Worker code**.

## Known-good reference and risks

The actual read-only Cloudflare check on November 13, 2026 showed current deployment `df474f55-9740-47f4-83bc-d8a645a58481`, version `d76b61d6-b044-4fe3-92bf-0295c00de472` (v325, 100%), associated successful build `9cdd707c-6b78-4a17-a345-fa063a93391a`, and commit `e8136625c463b271364b36b2b8ae76f8777f1967`. The evidence supports only Cloudflare's own metadata association; it is not an independently signed artifact provenance attestation. Cloudflare and GitHub APIs, access controls and reports remain within the operational trust boundary.

The unbounded **GPT API Token** is active, was reported as used before the audit, and has broad write permissions; its consumer may be Codex. The source of the earlier v321 out-of-band deploy remains unproven. **Do not revoke or rotate it before identifying its dependencies and testing replacement credentials.** Interactive administrator MFA is separately confirmed enabled.

## Route to production monitoring (requires separate approval)

1. Define a genuine least-privilege **read-only** monitoring credential, with restricted Cloudflare account/resource scopes and expiry, and establish safe rotation and custody.
2. Connect it to a reviewed monitoring runner. Do not reuse the unrestricted Codex token. Run the checker on a sanitized API response with an explicitly pinned expected protected commit, obtained through independent approved release metadata.
3. Alert on `MISMATCH` or `UNVERIFIED`. Do not silently treat `UNVERIFIED` as success; do not auto-deploy or auto-rollback.
4. Confirm GitHub required source and CI checks for exact SHA; independently compare distributed Worker artifact bytes where supported. Cloudflare's build record alone cannot establish byte equivalence or policy authority.
5. Only with owner approval, consider periodic read-only scheduled monitoring. The current PR only proposes **offline tests**, not a production listener.

The existing `scripts/check_reconciled_prs.py`, protected CI, GitHub rulesets, Cloudflare Worker, D1 and Warrior's Paradise are unchanged.
