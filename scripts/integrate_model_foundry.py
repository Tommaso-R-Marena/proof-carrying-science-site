#!/usr/bin/env python3
"""Guarded, transactional installation onto the exact reviewed PCS website base.

No network or GitHub token required. Writes only a small whitelisted set of files,
site test commands and Arena navigation. Performs all integrity preconditions before
writing; --dry-run prints the plan and changes no file. Always use a disposable branch.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

EXPECTED = {
    "public/semantic-gauntlet-core.mjs": "d6a64446bf9650006b43f81bc4971663ff32ac21",
    "public/semantic-repair-core.mjs": "6463e8350a04353b6a89a9a3f3c94bbb94f33571",
    "scripts/semantic_evaluation_firewall.mjs": "e0fd6fb54a8a4cd295fcbb144343b485f9c3e96b",
}
SOURCES = [
    "public/semantic-repair-policy.mjs",
    "public/repair-policy-model-v1.json",
    "public/repair-model-lab.html",
    "public/repair-model-lab.css",
    "public/repair-model-lab.js",
    "scripts/train_semantic_repair_policy.mjs",
    "tests/learned-repair-policy.test.mjs",
    "tests/learned-repair-cli.test.mjs",
    "tests/learned-repair-ui.test.mjs",
    "docs/PCS_MODEL_FOUNDRY_REPAIR_POLICY_V1.md",
]
MODEL_TEST = "node --test tests/learned-repair-policy.test.mjs tests/learned-repair-cli.test.mjs tests/learned-repair-ui.test.mjs"


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def plan(repo: Path, sources: Path) -> dict[str, bytes]:
    repo = repo.resolve()
    sources = sources.resolve()
    for file, expected in EXPECTED.items():
        target = repo / file
        if not target.is_file() or target.is_symlink() or git_blob_sha(target.read_bytes()) != expected:
            raise ValueError(f"VERSION_MISMATCH_REQUIRED_SOURCE: {file}")
    contents = {}
    for filename in SOURCES:
        source = sources / filename
        target = repo / filename
        if not source.is_file() or source.is_symlink() or target.exists():
            raise ValueError(f"INVALID_SOURCE_OR_TARGET_ALREADY_PRESENT: {filename}")
        contents[filename] = source.read_bytes()
    package_path = repo / "package.json"
    arena_path = repo / "public/arena.html"
    if not package_path.is_file() or not arena_path.is_file():
        raise ValueError("REQUIRED_SITE_ENTRY_FILES_MISSING")
    package = json.loads(package_path.read_text())
    scripts = package.get("scripts")
    if not isinstance(scripts, dict) or any(k not in scripts for k in ("ci:zero-minutes", "deploy")):
        raise ValueError("SITE_SCRIPTS_UNEXPECTED")
    if "test:learned-repair" in scripts or any("test:learned-repair" in scripts[k] for k in ("ci:zero-minutes", "deploy")):
        raise ValueError("MODEL_FOUNDRY_ALREADY_INSTALLED")
    scripts["test:learned-repair"] = MODEL_TEST
    for k in ("ci:zero-minutes", "deploy"):
        scripts[k] += " && npm run test:learned-repair"
    contents["package.json"] = (json.dumps(package, indent=2) + "\n").encode()
    arena = arena_path.read_text()
    marker = '<div class="arena-research-cards">'
    if arena.count(marker) != 1 or "repair-model-lab.html" in arena:
        raise ValueError("ARENA_NAVIGATION_MARKER_INVALID")
    card = '''<section class="section" aria-label="PCS learned repair model">
<div class="arena-research-card featured">
<div class="arena-card-top"><span class="arena-game-icon">🧠</span><span class="arena-value-badge">TRAINED MODEL · FINITE CHECKS</span></div>
<h2>Model Foundry: Learned Repair Policy</h2>
<p>See a genuinely trained edit-ranking model propose repairs, then watch independent finite-model checking decide which edits work. No account or upload needed.</p>
<a class="button primary" href="repair-model-lab.html">Try the learned model →</a>
</div></section>
'''
    contents["public/arena.html"] = arena.replace(marker, card + marker).encode()
    model = json.loads(contents["public/repair-policy-model-v1.json"])
    if model.get("provenance", {}).get("human_examples") != 0 or model.get("provenance", {}).get("evaluation_labels_used_for_training") is not False:
        raise ValueError("MODEL_PROVENANCE_UNACCEPTABLE")
    if model["provenance"]["gauntlet_sha256"] != hashlib.sha256((repo / "public/semantic-gauntlet-core.mjs").read_bytes()).hexdigest():
        raise ValueError("MODEL_GAUNTLET_SOURCE_SHA_MISMATCH")
    if model["provenance"]["repair_engine_sha256"] != hashlib.sha256((repo / "public/semantic-repair-core.mjs").read_bytes()).hexdigest():
        raise ValueError("MODEL_REPAIR_ENGINE_SHA_MISMATCH")
    return contents


def main():
    p = argparse.ArgumentParser(description="Guarded PCS Model Foundry site integration")
    p.add_argument("repo", type=Path, help="clean checked-out PCS website repo, on feature branch")
    p.add_argument("--sources", type=Path, default=Path(__file__).resolve().parents[1])
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    changes = plan(a.repo, a.sources)
    if a.dry_run:
        print(json.dumps({"result": "READY_TO_APPLY", "paths": sorted(changes)}, indent=2))
        return
    # All preconditions have passed before ANY write.
    for filename, data in sorted(changes.items()):
        target = a.repo / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    print(json.dumps({"result": "SOURCE_APPLIED_NOT_YET_TESTED", "paths": sorted(changes)}, indent=2))


if __name__ == "__main__":
    main()
