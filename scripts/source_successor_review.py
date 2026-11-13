"""Read-only, exact-byte source successor *review dossier* generator.

Never admits/qualifies/deploys source and never edits protected controls.
A proposed successor remains UNAPPROVED until independently reviewed and
explicitly authorized by the owner through the existing protected governance.

Example:
 python scripts/source_successor_review.py \
   --repo . --baseline e8136625c463b271364b36b2b8ae76f8777f1967 \
   --candidate COMMIT_SHA --output /tmp/fresh-dossier.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

HEX40=re.compile(r"^[0-9a-f]{40}$")
STATUS={"A":"added","M":"modified","D":"deleted","T":"type_changed"}
FORMAT="pcs-source-successor-review-dossier-v1"

def run_git(root,*args):
    p=subprocess.run(["git","-C",str(root),*args],check=False,
                     stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode:
        raise ValueError("Cannot establish requested Git object or ancestry")
    return p.stdout

def exact_commit(root,oid):
    if not isinstance(oid,str) or not HEX40.fullmatch(oid):
        raise ValueError("Only exact full lowercase commit object IDs are accepted")
    if run_git(root,"cat-file","-t",oid).strip()!=b"commit":
        raise ValueError("Object is not a Git commit")
    return oid

def ancestors(root,baseline,candidate):
    p=subprocess.run(["git","-C",str(root),"merge-base","--is-ancestor",baseline,candidate],
                     capture_output=True)
    if p.returncode!=0:
        raise ValueError("Candidate does not descend from exact protected baseline")

def tree(root,sha):
    records={}
    for entry in run_git(root,"ls-tree","-rz",sha).split(b"\0"):
        if not entry:continue
        try:
            meta,path=entry.split(b"\t",1)
            mode,kind,oid=meta.split(b" ")
            if kind!=b"blob":raise ValueError("Submodules and non-blob source entries require separate review")
            name=path.decode("utf-8","strict")
            if not name or name.startswith("/") or "\\" in name or "\0" in name or \
                    any(p in (".","..") for p in name.split("/")):
                raise ValueError("Invalid source path")
            if mode not in (b"100644",b"100755",b"120000"):
                raise ValueError("Unrecognized source mode")
            records[name]={"mode":mode.decode(),"blob":oid.decode()}
        except (UnicodeError,IndexError) as e:
            raise ValueError("Malformed Git tree entry") from e
    return records

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def classify(path,mode,action):
    protected_prefixes=("public/","migrations/",".github/workflows/","formal/")
    protected_exact={
        "scripts/check_reconciled_prs.py",
        "scripts/test_reconciled_prs.py",
        "docs/reconciliation/OPEN_PRS.json",
        "wrangler.jsonc","package-lock.json",
        ".github/CODEOWNERS",
    }
    if path in protected_exact or path.startswith(protected_prefixes):
        return "PROTECTED_REVIEW"
    if mode=="120000" or action in ("deleted","type_changed"):
        return "EXCEPTION_REVIEW"
    if path.startswith(("src/","tests/","scripts/")) or path=="package.json":
        return "IMPLEMENTATION_REVIEW"
    return "SOURCE_REVIEW"

def review(root,baseline,candidate):
    baseline=exact_commit(root,baseline)
    candidate=exact_commit(root,candidate)
    ancestors(root,baseline,candidate)
    old=tree(root,baseline)
    new=tree(root,candidate)
    changes=[]
    for path in sorted(set(old)|set(new)):
        before=old.get(path)
        after=new.get(path)
        if before==after:continue
        if before is None:action="added"
        elif after is None:action="deleted"
        elif before["mode"]!=after["mode"] and before["blob"]==after["blob"]:
            action="mode_changed"
        else:action="modified"
        item={
            "path":path,
            "operation":action,
            "baseline_mode":before["mode"] if before else None,
            "candidate_mode":after["mode"] if after else None,
            "baseline_blob":before["blob"] if before else None,
            "candidate_blob":after["blob"] if after else None,
            "candidate_sha256":None,
            "candidate_bytes":None,
            "review_class":classify(path,after["mode"] if after else before["mode"],action),
        }
        if after:
            raw=run_git(root,"cat-file","blob",after["blob"])
            item["candidate_sha256"]=sha256(raw)
            item["candidate_bytes"]=len(raw)
        changes.append(item)
    if len(changes)>4000:
        raise ValueError("Source diff exceeds bounded review census")
    document={
        "format":FORMAT,
        "baseline_commit":baseline,
        "baseline_tree":run_git(root,"rev-parse",baseline+"^{tree}").decode().strip(),
        "candidate_commit":candidate,
        "candidate_tree":run_git(root,"rev-parse",candidate+"^{tree}").decode().strip(),
        "changed_files":changes,
        "change_count":len(changes),
        "review_classes":sorted(set(x["review_class"] for x in changes)),
        "retained_source_qualification_gate_unchanged_by_this_tool":True,
        "qualified":False,
        "owner_approved":False,
        "is_release_authorization":False,
        "independent_reviewed":False,
        "production_mutated":False,
        "scope":"Exact object-hash census only, not semantic correctness, Lean proof, deployed provenance, or authorized successor",
        "approval_required":"Owner must review and authorize exact successor manifest; existing source gate remains authoritative until an independently approved policy successor",
    }
    # Digest excludes its own field, so the exact statement can be rechecked.
    canonical=json.dumps(document,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode()
    document["dossier_sha256"]=sha256(canonical)
    return document

def validate_dossier(document):
    if document.get("format")!=FORMAT or document.get("qualified") is not False \
            or document.get("owner_approved") is not False \
            or document.get("is_release_authorization") is not False:
        raise ValueError("A review dossier cannot grant source authority")
    expected=document.get("dossier_sha256")
    if not isinstance(expected,str) or not re.fullmatch("[0-9a-f]{64}",expected):
        raise ValueError("Missing dossier digest")
    unsigned={k:v for k,v in document.items() if k!="dossier_sha256"}
    if sha256(json.dumps(unsigned,sort_keys=True,separators=(",",":"),ensure_ascii=False).encode())!=expected:
        raise ValueError("Dossier payload changed")
    if document.get("change_count")!=len(document.get("changed_files",[])):
        raise ValueError("Dossier path census changed")
    return True

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--repo",type=Path,required=True)
    p.add_argument("--baseline",required=True)
    p.add_argument("--candidate",required=True)
    p.add_argument("--output",type=Path,required=True)
    a=p.parse_args()
    report=review(a.repo,a.baseline,a.candidate)
    validate_dossier(report)
    # Exclusive create; fail instead of overwriting an existing evidence file.
    with a.output.open("x",encoding="utf-8") as fp:
        json.dump(report,fp,sort_keys=True,indent=2,ensure_ascii=False)
        fp.write("\n")
    print(json.dumps({"candidate":report["candidate_commit"],"changed":report["change_count"],
                      "dossier_sha256":report["dossier_sha256"],"qualified":False,
                      "production_mutated":False}))

if __name__=="__main__":
    main()
