from __future__ import annotations

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
    "styles.css", "demo.js", "intake.js", "contact.js", "pcs-engine.js", "pcs-reference.js",
    "logo-mark.svg", "pcs-v05-reference-package.json", "_headers", "robots.txt",
]
for name in required:
    if not (ROOT / name).exists():
        errors.append(f"missing required deployable file: {name}")

for page in ["index.html", "demo.html", "intake.html", "contact.html", "privacy.html"]:
    p = ROOT / page
    if p.exists() and CONTACT not in p.read_text(encoding="utf-8"):
        errors.append(f"{page}: real contact address is missing")

headers = (ROOT / "_headers").read_text(encoding="utf-8") if (ROOT / "_headers").exists() else ""
for required_header in ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "X-Robots-Tag"]:
    if required_header not in headers:
        errors.append(f"_headers missing {required_header}")

for js in ROOT.glob("*.js"):
    text = js.read_text(encoding="utf-8")
    if re.search(r"\b(fetch|XMLHttpRequest|WebSocket)\s*\(", text):
        errors.append(f"{js.name}: network API found; local-only posture requires review")

logo = ROOT / "logo-mark.svg"
if logo.exists():
    text = logo.read_text(encoding="utf-8")
    if "<svg" not in text or "Proof-Carrying Science mark" not in text:
        errors.append("logo-mark.svg: expected PCS vector mark metadata missing")

prod_fixture = ROOT / "pcs-v05-reference-package.json"
fixture_obj = None
if prod_fixture.exists():
    try:
        fixture_obj = json.loads(prod_fixture.read_text(encoding="utf-8"))
        if fixture_obj.get("transport_format") != "pcs-browser-virtual-package-v1":
            errors.append("pcs-v05-reference-package.json: unexpected transport format")
        files = fixture_obj.get("files", {})
        for required_name in ["certificate.json", "package_manifest.json", "package_signature.json", "signer-public.pem"]:
            if required_name not in files:
                errors.append(f"pcs-v05-reference-package.json: missing {required_name}")
        cert = json.loads(files["certificate.json"]["content"])
        manifest = json.loads(files["package_manifest.json"]["content"])
        sig = json.loads(files["package_signature.json"]["content"])
        if cert.get("spec_version") != "pcs-0.5":
            errors.append("pcs-v05-reference-package.json: certificate is not pcs-0.5")
        if cert.get("checker_version") != "pcs-python-kernel/0.5.0":
            errors.append("pcs-v05-reference-package.json: unexpected checker version")
        if manifest.get("package_format") != "pcs-package-v1":
            errors.append("pcs-v05-reference-package.json: package manifest format mismatch")
        if sig.get("signature_format") != "pcs-package-ed25519-v1":
            errors.append("pcs-v05-reference-package.json: package signature format mismatch")
        if hashlib.sha256(files["package_manifest.json"]["content"].encode("utf-8")).hexdigest() != sig.get("package_manifest_sha256"):
            errors.append("pcs-v05-reference-package.json: signed manifest SHA-256 mismatch")
        for name, meta in manifest.get("files", {}).items():
            if name not in files:
                errors.append(f"pcs-v05-reference-package.json: manifest file missing from transport: {name}")
                continue
            payload = files[name]["content"].encode("utf-8")
            if hashlib.sha256(payload).hexdigest() != meta.get("sha256"):
                errors.append(f"pcs-v05-reference-package.json: hash mismatch for {name}")
            if len(payload) != meta.get("size"):
                errors.append(f"pcs-v05-reference-package.json: size mismatch for {name}")
        if manifest.get("certificate_semantic_hash") != cert.get("semantic_hash"):
            errors.append("pcs-v05-reference-package.json: certificate semantic binding mismatch")
        if manifest.get("certificate_integrity_hash") != cert.get("integrity_hash"):
            errors.append("pcs-v05-reference-package.json: certificate integrity binding mismatch")
    except Exception as exc:
        errors.append(f"pcs-v05-reference-package.json: invalid production fixture: {type(exc).__name__}: {exc}")

reference_js = ROOT / "pcs-reference.js"
if fixture_obj is not None and reference_js.exists():
    try:
        text = reference_js.read_text(encoding="utf-8").strip()
        prefix = "window.PCS_V05_REFERENCE_PACKAGE = "
        if not text.startswith(prefix) or not text.endswith(";"):
            raise ValueError("unexpected pcs-reference.js wrapper")
        embedded = json.loads(text[len(prefix):-1])
        if embedded != fixture_obj:
            errors.append("pcs-reference.js: embedded package differs from downloadable production fixture")
    except Exception as exc:
        errors.append(f"pcs-reference.js: cannot validate embedded package: {type(exc).__name__}: {exc}")

if errors:
    print("SITE CHECK: FAIL")
    for err in errors:
        print(f"- {err}")
    sys.exit(1)

print(f"SITE CHECK: PASS ({len(HTML_FILES)} HTML pages, production PCS v0.5 fixture bound and consistent)")
