from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = sorted(ROOT.glob("*.html"))
ASSET_RE = re.compile(r"""(?:src|href)=["']([^"'#]+)""", re.I)

IGNORE_SCHEMES = {"mailto", "tel", "data", "blob", "javascript"}

errors: list[str] = []

for html_path in HTML_FILES:
    text = html_path.read_text(encoding="utf-8")
    if "<html" not in text.lower() or "<title>" not in text.lower():
        errors.append(f"{html_path.name}: missing html/title structure")
    for ref in ASSET_RE.findall(text):
        parsed = urlparse(ref)
        if parsed.scheme in IGNORE_SCHEMES:
            continue
        if parsed.scheme in {"http", "https"}:
            errors.append(f"{html_path.name}: external dependency/link not allowed in launch-preview checker: {ref}")
            continue
        path_text = parsed.path
        if not path_text or path_text == "/":
            continue
        local = ROOT / path_text.lstrip("/") if path_text.startswith("/") else html_path.parent / path_text
        if not local.exists():
            errors.append(f"{html_path.name}: missing local reference {ref}")

required = [
    "index.html", "demo.html", "intake.html", "privacy.html", "404.html",
    "styles.css", "demo.js", "intake.js", "_headers", "robots.txt",
]
for name in required:
    if not (ROOT / name).exists():
        errors.append(f"missing required deployable file: {name}")

headers = (ROOT / "_headers").read_text(encoding="utf-8") if (ROOT / "_headers").exists() else ""
for required_header in [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "X-Robots-Tag",
]:
    if required_header not in headers:
        errors.append(f"_headers missing {required_header}")

for js in ROOT.glob("*.js"):
    text = js.read_text(encoding="utf-8")
    if re.search(r"\b(fetch|XMLHttpRequest|WebSocket)\s*\(", text):
        errors.append(f"{js.name}: network API found; static/no-upload posture requires review")

if errors:
    print("SITE CHECK: FAIL")
    for err in errors:
        print(f"- {err}")
    sys.exit(1)

print(f"SITE CHECK: PASS ({len(HTML_FILES)} HTML pages)")
