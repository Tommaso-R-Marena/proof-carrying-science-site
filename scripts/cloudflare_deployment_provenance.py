"""Read-only Cloudflare Worker deployment provenance checker (non-authoritative).

Operates on sanitized Cloudflare GET response snapshots; never accesses a token,
network, account, production Worker, D1, or GitHub. Provider metadata alone
cannot establish binary/source equality, CI success or scientific assurance.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

SHA=re.compile(r"^[0-9a-f]{40}$")
VERSION=re.compile(r"^[0-9a-f]{8}-[0-9a-f-]{27,}$")
FORMAT="pcs-cloudflare-deployment-provenance-v1"

class EvidenceError(ValueError):
    pass

def extract_deployments(snapshot):
    raw=snapshot.get("deployments")
    if isinstance(raw,dict):
        raw=raw.get("deployments")
    if not isinstance(raw,list) or not 1<=len(raw)<=100:
        raise EvidenceError("Missing/bounded deployment list")
    return raw

def extract_builds(snapshot):
    raw=snapshot.get("builds")
    if isinstance(raw,dict) and "builds" in raw:
        raw=raw["builds"]
    if not isinstance(raw,dict) or len(raw)>100:
        raise EvidenceError("Missing/bounded build map")
    return raw

def evaluate(snapshot,*,expected_sha,expected_trigger,expected_branch="main"):
    if not isinstance(snapshot,dict):
        raise EvidenceError("Snapshot must be an object")
    if not SHA.fullmatch(expected_sha) or not expected_trigger:
        raise EvidenceError("Pin exact protected source revision and trigger ID")
    deployments=extract_deployments(snapshot)
    builds=extract_builds(snapshot)
    # Require all provider deployment entries to have a timestamp. Do not trust
    # list order from an unverified/offline snapshot.
    for item in deployments:
        if not isinstance(item,dict) or not isinstance(item.get("created_on"),str):
            raise EvidenceError("Incomplete deployment entry")
    deployments=sorted(deployments,key=lambda x:x["created_on"],reverse=True)
    latest=deployments[0]
    versions=latest.get("versions")
    failures=[]
    undecidable=[]
    current=None
    if not isinstance(versions,list) or len(versions)!=1:
        undecidable.append("Latest deployment has no unique 100-percent version")
    else:
        v=versions[0]
        if not isinstance(v,dict) or v.get("percentage")!=100:
            undecidable.append("Latest deployment is not a complete single-version rollout")
        else:
            current=v.get("version_id")
            if not isinstance(current,str) or not VERSION.fullmatch(current):
                undecidable.append("Deployment version ID missing or malformed")
                current=None
    build=None
    if current:
        build=builds.get(current)
        if not isinstance(build,dict):
            undecidable.append("No provider-associated build record for active version")
        else:
            metadata=build.get("build_trigger_metadata")
            trigger=build.get("trigger")
            if not isinstance(metadata,dict) or not isinstance(trigger,dict):
                undecidable.append("Associated build lacks origin metadata")
            else:
                if build.get("build_outcome")!="success":
                    failures.append("Associated build did not succeed")
                if metadata.get("build_trigger_source")!="push_event":
                    failures.append("Build did not originate from a branch push event")
                if metadata.get("branch")!=expected_branch:
                    failures.append("Build branch does not match expected protected branch")
                if metadata.get("commit_hash")!=expected_sha:
                    failures.append("Build commit differs from pinned protected source revision")
                if trigger.get("trigger_uuid")!=expected_trigger:
                    failures.append("Build trigger differs from approved trigger identity")
                if metadata.get("pull_request") is not None:
                    failures.append("Build metadata unexpectedly associated with a pull request")
    status="MISMATCH" if failures else "UNVERIFIED" if undecidable else "MATCHED_METADATA"
    return {
        "format":FORMAT,
        "result":status,
        "current_deployment_id":latest.get("id"),
        "current_version_id":current,
        "expected_commit_sha":expected_sha,
        "expected_branch":expected_branch,
        "expected_trigger":expected_trigger,
        "observed_build_uuid":build.get("build_uuid") if isinstance(build,dict) else None,
        "mismatch_reasons":failures,
        "unverified_reasons":undecidable,
        "production_mutated":False,
        "verified_artifact_bytes":False,
        "verified_protected_ci":False,
        "source_admitted":False,
        "release_authorized":False,
        "scope":"Provider metadata consistency only; does not prove trusted origin, no credential abuse, binary hash equality or mathematical correctness",
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--snapshot",type=Path,required=True)
    p.add_argument("--expected-sha",required=True)
    p.add_argument("--expected-trigger",required=True)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    snapshot=json.loads(args.snapshot.read_text())
    report=evaluate(snapshot,expected_sha=args.expected_sha,expected_trigger=args.expected_trigger)
    with args.output.open("x",encoding="utf-8") as f:
        json.dump(report,f,sort_keys=True,indent=2);f.write("\n")
    print(json.dumps({"result":report["result"],"current_version":report["current_version_id"],
                      "mismatch_reasons":report["mismatch_reasons"],
                      "unverified_reasons":report["unverified_reasons"],
                      "release_authorized":False}))
    if report["result"]=="MISMATCH":
        raise SystemExit(2)
    if report["result"]=="UNVERIFIED":
        raise SystemExit(3)

if __name__=="__main__":
    main()
