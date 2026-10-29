#!/usr/bin/env python3
"""Generate fresh paper-demo receipts with a real Lean 4.28 kernel + PCS replay.

Writes fresh receipts to a new output directory. Never overwrites published evidence or sets scientific ACCEPT.
Requires Lean 4.28 on PATH (use scripts/activate_lean_428.sh from the core repo)
and a checkout of proof-carrying-science next to this site repo (or PCS_CORE).
"""
from __future__ import annotations

import json
import argparse
import hashlib
import shutil
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

SITE = Path(__file__).resolve().parents[1]
PUBLIC = SITE / "public"
OUT = None  # Initialized by main to a newly created, exclusive output directory.
CORE = Path(os.environ.get("PCS_CORE", SITE.parent / "proof-carrying-science")).resolve()


def die(msg: str, code: int = 1) -> None:
    print(f"PAPER_DEMOS_FAIL: {msg}", file=sys.stderr)
    raise SystemExit(code)


def lean_version() -> str:
    r = subprocess.run(["lean", "--version"], capture_output=True, text=True, timeout=30)
    text = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0 or "4.28.0" not in text:
        die(f"expected Lean 4.28.0, got: {text.strip() or r.returncode}")
    return text.strip().splitlines()[0]


def write_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        stream.write(json.dumps(obj, indent=2, sort_keys=False) + "\n")



def require_package_receipt(receipt: dict) -> None:
    """Metadata checks only; the fixed real receiving command runs separately."""
    for key in ("pcs_package_valid", "independent_replay_consistent", "lean_authority_accepted"):
        if receipt.get(key) is not True:
            raise ValueError(f"{key} must be the boolean true")
    if receipt.get("lean_authority_verdict") != "ACCEPT":
        raise ValueError("actual Lean authority must ACCEPT")
    if receipt.get("scientific_acceptance") is not False:
        raise ValueError("scientific acceptance must stay false")
    checks = receipt.get("domain_checks")
    if (receipt.get("domain_outcome") != "PASS" or type(checks) is not list
            or not checks or any(type(c) is not dict or c.get("outcome") != "PASS" for c in checks)):
        raise ValueError("all reported domain checks must pass")
    obligations = receipt.get("open_obligations")
    if (type(obligations) is not list or any(type(item) is not str for item in obligations)
            or "population_or_causal_validity" not in obligations):
        raise ValueError("population/causal validity must remain explicitly open")


def require_goal_identity(checked: dict, mission: dict) -> None:
    if checked.get("goal_sha256") != mission.get("goal_sha256") or not checked.get("goal_sha256"):
        raise ValueError("checked proof does not bind the catalog goal")


def input_identities() -> dict:
    # Logical labels remain stable when another researcher replays elsewhere.
    paths = {
        "site/scripts/run_paper_demos_kernel.py": Path(__file__).resolve(),
        "site/scripts/verify_countermodel_lean.mjs": SITE / "scripts/verify_countermodel_lean.mjs",
        "site/public/countermodel-core.mjs": PUBLIC / "countermodel-core.mjs",
        "site/public/bridge-builder-catalog.json": PUBLIC / "bridge-builder-catalog.json",
        "site/public/reasoning/scientific-workflow-v2/positive.pcs.zip": PUBLIC / "reasoning/scientific-workflow-v2/positive.pcs.zip",
        "site/public/reasoning/scientific-workflow-v2/producer-public.pem": PUBLIC / "reasoning/scientific-workflow-v2/producer-public.pem",
        "core/scripts/run_scientific_workflow_v2.py": CORE / "scripts/run_scientific_workflow_v2.py",
        "tool/lean": Path(shutil.which("lean") or "missing-lean"),
    }
    return {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in paths.items()}


def run_countermodel_lean() -> dict:
    """Compile each Countermodel Lab witness with the real Lean binary."""
    # Import site modules via node script already in repo.
    node = subprocess.run(
        ["node", str(SITE / "scripts" / "verify_countermodel_lean.mjs")],
        cwd=SITE,
        capture_output=True,
        text=True,
        timeout=180,
        env=dict(os.environ, PCS_LEAN_BIN=str(Path(shutil.which("lean") or "missing-lean").resolve())),
    )
    if node.returncode != 0:
        die(f"countermodel lean failed:\n{node.stdout}\n{node.stderr}")
    verified = [
        line.split(None, 1)[1].strip()
        for line in node.stdout.splitlines()
        if line.startswith("LEAN_KERNEL_VERIFIED ")
    ]
    if len(verified) < 7:
        die(f"expected ≥7 LEAN_KERNEL_VERIFIED, got {verified}")
    receipt = {
        "format": "pcs-paper-demo-lean-receipt-v1",
        "demo_id": "countermodel-lab-witnesses",
        "atlas_links": ["peng-2011", "lean4"],
        "paper_motivation": (
            "Peng (Science 2011) argues for linking claims to a computational trail "
            "reviewers can rerun. Countermodel Lab emits Lean 4 source for each finite "
            "witness; this receipt records a fresh kernel compile of those theorems."
        ),
        "missions_verified": verified,
        "mission_count": len(verified),
        "status": "verified",
        "lean_version": "4.28.0",
        "pcs_authority": False,
        "pcs_scientific_authority": False,
        "issues_accept": False,
        "checked_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "meaning": (
            "Fresh Lean 4.28.0 kernel verification of Countermodel Lab finite witnesses. "
            "Logic education only — not a scientific ACCEPT."
        ),
    }
    print(f"PAPER_DEMOS_OK countermodel {len(verified)} missions")
    return receipt


def run_bridge_tutorial() -> dict:
    if str(CORE) not in sys.path:
        sys.path.insert(0, str(CORE))
    from pcs.experimental.prover.environment import LeanEnvironment

    catalog = json.loads((PUBLIC / "bridge-builder-catalog.json").read_text(encoding="utf-8"))
    mission = next(m for m in catalog["missions"] if m["id"] == "tutorial")
    actions = mission["receipts"][0]["actions"]
    env = LeanEnvironment(timeout=90)
    t0 = time.time()
    try:
        checked = env.verify(mission["goal"], actions)
    finally:
        env.close()
    elapsed = round(time.time() - t0, 3)
    require_goal_identity(checked, mission)
    axioms = list(checked.get("kernel", {}).get("axioms") or [])
    if not set(axioms) <= {"propext", "Classical.choice", "Quot.sound"}:
        die(f"unapproved axioms: {axioms}")
    receipt = {
        "format": "pcs-paper-demo-lean-receipt-v1",
        "demo_id": "bridge-tutorial-transitivity",
        "atlas_links": ["lean4", "mathlib4"],
        "paper_motivation": (
            "Lean 4 is the kernel PCS uses for typed proof-action checks. "
            "This receipt re-runs the Bridge Builder tutorial proof on a fresh local kernel."
        ),
        "statement": mission["statement"],
        "goal_sha256": mission["goal_sha256"],
        "action_count": len(actions),
        "status": "verified",
        "kernel_axioms": axioms,
        "elapsed_seconds": elapsed,
        "lean": checked.get("lean"),
        "lean_version": "4.28.0",
        "pcs_authority": False,
        "pcs_scientific_authority": False,
        "issues_accept": False,
        "checked_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "meaning": (
            "Fresh local Lean 4.28.0 kernel verification of the Bridge Builder tutorial. "
            "Educational math only — not a scientific ACCEPT."
        ),
    }
    print(f"PAPER_DEMOS_OK bridge-tutorial axioms={axioms} elapsed={elapsed}s")
    return receipt


def run_penguins_replay() -> dict:
    zip_path = PUBLIC / "reasoning/scientific-workflow-v2/positive.pcs.zip"
    key = PUBLIC / "reasoning/scientific-workflow-v2/producer-public.pem"
    if not zip_path.is_file() or not key.is_file():
        die("scientific-workflow-v2 package or public key missing")
    if not (CORE / "scripts/run_scientific_workflow_v2.py").is_file():
        die(f"PCS core missing at {CORE}")
    with tempfile.TemporaryDirectory(prefix="pcs-paper-penguins-") as tmp:
        out = Path(tmp) / "receiver.json"
        cmd = [
            sys.executable,
            str(CORE / "scripts/run_scientific_workflow_v2.py"),
            "--replay",
            str(zip_path),
            "--public-key",
            str(key),
            "--fingerprint",
            "f7e1184ae513ef6fe9688094fa0d64e2d94bb4f9752d3f7c35a2b44b009146e5",
            "--output",
            str(out),
        ]
        t0 = time.time()
        proc = subprocess.run(cmd, cwd=CORE, capture_output=True, text=True, timeout=180)
        elapsed = round(time.time() - t0, 3)
        if proc.returncode != 0:
            die(f"penguins replay failed:\n{proc.stdout}\n{proc.stderr}")
        full = json.loads(out.read_text(encoding="utf-8"))

    lean_auth = (full.get("pcs_verification") or {}).get("lean_authority") or {}
    domain = full.get("domain_replay") or {}
    obligations = full.get("obligation_results") or {}
    open_nodes = [
        n["id"]
        for n in obligations.get("nodes") or []
        if n.get("status") == "OPEN"
    ]
    receipt = {
        "format": "pcs-paper-demo-package-receipt-v1",
        "demo_id": "palmer-penguins-scientific-workflow-v2",
        "atlas_links": ["zenodo-3960218", "peng-2011"],
        "paper_motivation": (
            "Real Palmer Penguins field measurements (Gorman / Palmer LTER; packaged via "
            "palmerpenguins, Zenodo 10.5281/zenodo.3960218 lineage). PCS shows signed "
            "package replay with Lean-authoritative dimensional checks while leaving "
            "biological/causal claims OPEN."
        ),
        "source_dois": [
            "10.5281/zenodo.3960218",
            "10.1371/journal.pone.0090081",
        ],
        "pcs_package_valid": full.get("pcs_package_valid"),
        "independent_replay_consistent": full.get("independent_replay_consistent"),
        "scientific_acceptance": full.get("scientific_acceptance"),
        "lean_authority_verdict": lean_auth.get("verdict"),
        "lean_authority_accepted": lean_auth.get("accepted"),
        "domain_outcome": domain.get("outcome"),
        "domain_checks": [
            {"id": c.get("id"), "outcome": c.get("outcome")}
            for c in domain.get("checks") or []
        ],
        "open_obligations": open_nodes,
        "bundle_sha256": full.get("bundle_sha256"),
        "elapsed_seconds": elapsed,
        "pcs_authority": False,
        "issues_accept": False,
        "checked_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "meaning": (
            "Independent receiver replay of the signed penguins PCS package. "
            "Lean authority may ACCEPT the computational package while "
            "scientific_acceptance stays false and population/causal validity stays OPEN."
        ),
    }
    require_package_receipt(receipt)
    print(
        f"PAPER_DEMOS_OK penguins lean={receipt['lean_authority_verdict']} "
        f"science_accept={receipt['scientific_acceptance']} open={open_nodes}"
    )
    return receipt


def write_manifest(parts: list[dict], identities: dict) -> dict:
    manifest = {
        "format": "pcs-paper-demos-manifest-v1",
        "input_source_sha256": identities,
        "identity_scope": "Demo inputs, wrappers and compiler observed before/after checks; not a complete transitive implementation proof or immutable host root",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lean_version_line": lean_version(),
        "pcs_core": str(CORE),
        "issues_accept": False,
        "pcs_scientific_authority": False,
        "demos": [
            {
                "id": p["demo_id"],
                "format": p["format"],
                "status": p.get("status") or p.get("lean_authority_verdict"),
                "atlas_links": p.get("atlas_links") or [],
                "receipt": f"paper-demos/{p['demo_id'].replace('_', '-')}-receipt.json"
                if False
                else None,
            }
            for p in parts
        ],
        "receipt_files": [
            "paper-demos/countermodel-lean-receipt.json",
            "paper-demos/bridge-tutorial-lean-receipt.json",
            "paper-demos/penguins-package-receipt.json",
        ],
        "walkthrough_page": "paper-demos.html",
        "meaning": (
            "Manifest of fresh local checks used by the Paper Demos walkthrough. "
            "Each demo states its own authority boundary; none issues scientific ACCEPT."
        ),
    }
    # Fix receipt file mapping cleanly
    manifest["demos"] = [
        {
            "id": "countermodel-lab-witnesses",
            "kind": "lean_kernel",
            "status": "verified",
            "atlas_links": ["peng-2011", "lean4"],
            "receipt": "paper-demos/countermodel-lean-receipt.json",
            "play": "arena-countermodel.html",
        },
        {
            "id": "bridge-tutorial-transitivity",
            "kind": "lean_kernel",
            "status": "verified",
            "atlas_links": ["lean4", "mathlib4"],
            "receipt": "paper-demos/bridge-tutorial-lean-receipt.json",
            "play": "bridge-builder.html",
        },
        {
            "id": "palmer-penguins-scientific-workflow-v2",
            "kind": "pcs_package_replay",
            "status": "lean_authority_ACCEPT_scientific_OPEN",
            "atlas_links": ["zenodo-3960218", "peng-2011"],
            "receipt": "paper-demos/penguins-package-receipt.json",
            "play": "scientific-workflow-v2.html",
        },
        {
            "id": "assurance-fold-claim-board",
            "kind": "spatial_training_game",
            "status": "practice_only_no_lean_accept",
            "atlas_links": ["foldit-cooper-2010", "ioannidis-2005", "rfc8032"],
            "receipt": None,
            "play": "assurance-fold.html",
            "note": (
                "Assurance Fold never calls Lean and never issues ACCEPT. "
                "It trains claim-lane honesty; Paper Demos show the real PCS paths."
            ),
        },
    ]
    write_json(OUT / "manifest.json", manifest)
    print("PAPER_DEMOS_OK manifest")
    return manifest


def main() -> None:
    global OUT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="New directory; existing evidence is never overwritten")
    args = parser.parse_args()
    if args.output is None:
        OUT = Path(tempfile.mkdtemp(prefix="pcs-paper-demos-"))
    else:
        OUT = args.output.resolve()
        OUT.mkdir(parents=True, exist_ok=False)
    print("PAPER_DEMOS lean:", lean_version())
    before = input_identities()
    parts = [run_countermodel_lean(), run_bridge_tutorial(), run_penguins_replay()]
    if input_identities() != before:
        die("demo inputs, wrapper or compiler changed while checking")
    for name, receipt in zip(("countermodel-lean-receipt.json", "bridge-tutorial-lean-receipt.json",
                              "penguins-package-receipt.json"), parts):
        write_json(OUT / name, receipt)
    write_manifest(parts, before)
    print("PAPER_DEMOS_COMPLETE", OUT)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        die(str(exc))
