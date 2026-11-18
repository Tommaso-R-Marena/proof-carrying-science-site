"""Write or check a successor record of the ClaimCheck browser journey, bound to exact source bytes.

    python3 scripts/claim_check_journey_record.py write --journey DIR --out DIR   # after running the journey
    python3 scripts/claim_check_journey_record.py check --record DIR             # is it still about these bytes?

The journey (`scripts/browser_claim_check.cjs`, real Chromium and the real Lean 4.28.0 kernel) writes
`browser-journey.json`.  That file does not say which page bytes it exercised.  `write` adds
`SOURCE.json` beside it: the SHA-256 of every file the journey depends on, the commit they were
taken from (the working tree must be clean), the journey record's own digest, and the predecessor
record, named and digested but never edited.  `check` exits non-zero if any listed file now differs:
the record then describes other bytes and qualifies nothing about the current ones.  Standard library
only.  A record is authored automation; it is not a human usability study.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREDECESSOR = "docs/evidence/claim-check-v1/browser-journey.json"
BOUND_FILES = ["public/claim-check.html", "public/claim-check.mjs", "public/claim-check-core.mjs", "public/page-help-core.mjs",
               "scripts/browser_claim_check.cjs"]
BOUND_DIRS = ["public/claim-check"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bound() -> dict:
    files = {name: sha(ROOT / name) for name in BOUND_FILES}
    for d in BOUND_DIRS:
        for p in sorted((ROOT / d).rglob("*")):
            if p.is_file():
                files[p.relative_to(ROOT).as_posix()] = sha(p)
    return dict(sorted(files.items()))


def git(*args) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True).stdout.strip()


def write(journey: Path, out: Path) -> int:
    if git("status", "--porcelain", "--", *BOUND_FILES, *BOUND_DIRS):
        raise SystemExit("the bound files have uncommitted changes: commit them first, so the record names one commit")
    record = journey / "browser-journey.json"
    report = json.loads(record.read_text(encoding="utf-8"))
    if report.get("ok") is not True or report.get("external_requests") or report.get("page_errors"):
        raise SystemExit("the journey did not pass; no record is written")
    out.mkdir(parents=True, exist_ok=True)
    if out.resolve() != journey.resolve():
        (out / "browser-journey.json").write_bytes(record.read_bytes())
    pred = ROOT / PREDECESSOR
    source = {
        "format": "pcs-claim-check-journey-successor-v1",
        "what": "The browser journey of the ClaimCheck page with real Chromium and the real Lean 4.28.0 kernel, run against the files below. "
                "It describes exactly these bytes; if any of them changes, run the journey again and write a new successor.",
        "source_commit": git("rev-parse", "HEAD"),
        "bound_files": bound(),
        "journey_record": {"path": "browser-journey.json", "sha256": sha(out / "browser-journey.json")},
        "predecessor": {"path": PREDECESSOR, "sha256": sha(pred) if pred.exists() else None,
                        "note": "historical record of the page before the 2026-11-17 hardening; kept unchanged; it does not qualify the files above"},
        "human_participants": 0,
        "human_usability_established": False,
    }
    (out / "SOURCE.json").write_text(json.dumps(source, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({"written": str(out.relative_to(ROOT)) if out.is_relative_to(ROOT) else str(out),
                      "source_commit": source["source_commit"], "bound_files": len(source["bound_files"])}))
    return 0


def check(record_dir: Path) -> int:
    source = json.loads((record_dir / "SOURCE.json").read_text(encoding="utf-8"))
    now = bound()
    differing = sorted(k for k in set(now) | set(source["bound_files"]) if now.get(k) != source["bound_files"].get(k))
    journey_ok = sha(record_dir / source["journey_record"]["path"]) == source["journey_record"]["sha256"]
    ok = not differing and journey_ok
    print(json.dumps({"record_describes_the_current_bytes": ok, "differing_files": differing, "journey_record_intact": journey_ok,
                      "source_commit": source["source_commit"]}, indent=1))
    return 0 if ok else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("write")
    w.add_argument("--journey", type=Path, required=True, help="directory the journey wrote browser-journey.json into")
    w.add_argument("--out", type=Path, required=True)
    c = sub.add_parser("check")
    c.add_argument("--record", type=Path, required=True)
    args = ap.parse_args(argv)
    return write(args.journey, args.out) if args.cmd == "write" else check(args.record)


if __name__ == "__main__":
    sys.exit(main())
