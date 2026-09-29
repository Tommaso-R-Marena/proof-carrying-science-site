from __future__ import annotations

import base64
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "public"
HTML_FILES = sorted(ROOT.glob("*.html"))
ASSET_RE = re.compile(r"""(?:src|href)=["']([^"'#]+)""", re.I)
IGNORE_SCHEMES = {"mailto", "tel", "data", "blob", "javascript"}
CONTACT = "marenatommaso@gmail.com"

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
            errors.append(f"{html_path.name}: external runtime dependency/link requires review: {ref}")
            continue
        path_text = parsed.path
        if not path_text or path_text == "/":
            continue
        local = ROOT / path_text.lstrip("/") if path_text.startswith("/") else html_path.parent / path_text
        if not local.exists():
            errors.append(f"{html_path.name}: missing local reference {ref}")

required = [
    "index.html", "demo.html", "intake.html", "contact.html", "privacy.html", "404.html",
    "styles.css", "demo.js", "intake.js", "contact.js",
    "logo-mark.svg", "demo-reference.json", "_headers", "robots.txt",
]
for name in required:
    if not (ROOT / name).exists():
        errors.append(f"missing required deployable file: {name}")

for page in ["index.html", "demo.html", "intake.html", "contact.html", "privacy.html"]:
    p = ROOT / page
    if p.exists() and CONTACT not in p.read_text(encoding="utf-8"):
        errors.append(f"{page}: real contact address is missing")

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
        errors.append(f"{js.name}: network API found; local-only posture requires review")

fixture_path = ROOT / "demo-reference.json"
if fixture_path.exists():
    try:
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        payload = fixture["signed_payload"].encode("utf-8")
        if hashlib.sha256(payload).hexdigest() != fixture["certificate_sha256"]:
            errors.append("demo-reference.json: certificate SHA-256 does not match signed payload")
        raw_key = base64.b64decode(fixture["public_key_raw_b64"], validate=True)
        if hashlib.sha256(raw_key).hexdigest() != fixture["public_key_fingerprint_sha256"]:
            errors.append("demo-reference.json: public-key fingerprint does not match key bytes")
        if fixture.get("signature_format") != "Ed25519":
            errors.append("demo-reference.json: unsupported signature format")
        base64.b64decode(fixture["signature_b64"], validate=True)
        cert = json.loads(fixture["signed_payload"])
        if cert.get("format") != "pcs-browser-demo-v1":
            errors.append("demo-reference.json: unexpected certificate format")
    except Exception as exc:
        errors.append(f"demo-reference.json: invalid fixture: {type(exc).__name__}: {exc}")

logo = ROOT / "logo-mark.svg"
if logo.exists():
    text = logo.read_text(encoding="utf-8")
    if "<svg" not in text or "Proof-Carrying Science mark" not in text:
        errors.append("logo-mark.svg: expected PCS vector mark metadata missing")

if errors:
    print("SITE CHECK: FAIL")
    for err in errors:
        print(f"- {err}")
    sys.exit(1)

print(f"SITE CHECK: PASS ({len(HTML_FILES)} HTML pages, signed fixture hashes consistent)")
