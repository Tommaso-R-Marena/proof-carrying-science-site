"""Provider deployment attribution controls; no Cloudflare API calls."""
from __future__ import annotations
import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from cloudflare_deployment_provenance import evaluate,EvidenceError

SHA="e8136625c463b271364b36b2b8ae76f8777f1967"
TRIGGER="06e0acd1-8186-4925-8038-2ba1d7312623"
GOOD_VERSION="d76b61d6-b044-4fe3-92bf-0295c00de472"
OTHER_VERSION="b77404b9-2222-4333-8888-aaaaaaaaaaaa"

def fixture():
    return {
      "deployments":[{
        "id":"df474f55-9740-47f4-83bc-d8a645a58481",
        "created_on":"2026-11-05T21:11:53.609706Z",
        "source":"wrangler",
        "versions":[{"version_id":GOOD_VERSION,"percentage":100}]
      }],
      "builds":{GOOD_VERSION:{
        "build_uuid":"9cdd707c-6b78-4a17-a345-fa063a93391a",
        "build_outcome":"success",
        "trigger":{"trigger_uuid":TRIGGER},
        "build_trigger_metadata":{
          "build_trigger_source":"push_event",
          "branch":"main",
          "commit_hash":SHA
        }
      }}
    }

def check(data):
    return evaluate(data,expected_sha=SHA,expected_trigger=TRIGGER)

class CloudflareDeploymentProvenanceTests(unittest.TestCase):
    def test_good_provider_metadata_still_is_not_release_authorization(self):
        result=check(fixture())
        self.assertEqual(result["result"],"MATCHED_METADATA")
        for key in ("production_mutated","verified_artifact_bytes",
                    "verified_protected_ci","source_admitted","release_authorized"):
            self.assertFalse(result[key])

    def test_direct_token_deployment_without_build_origin_is_unverified(self):
        x=fixture()
        x["deployments"].append({
            "id":"unattributed-token-deployment",
            "created_on":"2026-11-06T12:00:00Z",
            "source":"api_token",
            "versions":[{"version_id":OTHER_VERSION,"percentage":100}]
        })
        r=check(x)
        self.assertEqual(r["result"],"UNVERIFIED")
        self.assertTrue(any("build record" in i for i in r["unverified_reasons"]))

    def test_wrong_commit_is_mismatch_even_with_successful_build(self):
        x=fixture()
        x["builds"][GOOD_VERSION]["build_trigger_metadata"]["commit_hash"]="f"*40
        r=check(x)
        self.assertEqual(r["result"],"MISMATCH")
        self.assertTrue(any("commit" in i for i in r["mismatch_reasons"]))

    def test_wrong_branch_or_trigger_or_source_detected(self):
        cases=[
          ("branch","feature",False),
          ("build_trigger_source","manual",False),
          ("trigger_uuid","forged",True),
        ]
        for key,val,on_trigger in cases:
            with self.subTest(key=key):
                x=fixture()
                target=x["builds"][GOOD_VERSION]["trigger" if on_trigger else "build_trigger_metadata"]
                target[key]=val
                self.assertEqual(check(x)["result"],"MISMATCH")

    def test_failed_build_does_not_qualify(self):
        x=fixture();x["builds"][GOOD_VERSION]["build_outcome"]="failure"
        self.assertEqual(check(x)["result"],"MISMATCH")

    def test_rollout_split_is_not_treated_as_full_verified_deployment(self):
        x=fixture()
        x["deployments"][0]["versions"]=[
            {"version_id":GOOD_VERSION,"percentage":50},
            {"version_id":OTHER_VERSION,"percentage":50}
        ]
        self.assertEqual(check(x)["result"],"UNVERIFIED")

    def test_old_deployment_cannot_hide_new_unattributed_deploy(self):
        x=fixture()
        x["deployments"].append({
          "id":"newer-unauthorized",
          "created_on":"2026-11-13T23:00:00Z",
          "versions":[{"version_id":OTHER_VERSION,"percentage":100}]
        })
        self.assertEqual(check(x)["current_version_id"],OTHER_VERSION)

    def test_build_record_without_trigger_metadata_is_not_a_match(self):
        x=fixture()
        del x["builds"][GOOD_VERSION]["build_trigger_metadata"]
        self.assertEqual(check(x)["result"],"UNVERIFIED")

    def test_malformed_or_unpinned_evidence_fails(self):
        for x in ({}, {"deployments":[],"builds":{}},
                  {"deployments":[{"created_on":None}],"builds":{}}):
            with self.subTest(x=x),self.assertRaises(EvidenceError):
                check(x)
        with self.assertRaises(EvidenceError):
            evaluate(fixture(),expected_sha="main",expected_trigger=TRIGGER)

    def test_non_latest_successful_deployment_cannot_shadow_current_failure(self):
        x=fixture()
        newer=copy.deepcopy(x["deployments"][0])
        newer["created_on"]="2026-11-13T12:00:00Z"
        newer["versions"][0]["version_id"]=OTHER_VERSION
        x["deployments"].insert(0,newer)
        x["builds"][OTHER_VERSION]=copy.deepcopy(x["builds"][GOOD_VERSION])
        x["builds"][OTHER_VERSION]["build_trigger_metadata"]["branch"]="unprotected"
        self.assertEqual(check(x)["result"],"MISMATCH")

if __name__=="__main__":
    unittest.main()
