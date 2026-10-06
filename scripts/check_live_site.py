#!/usr/bin/env python3
"""Small dependency-free production smoke test for the public PCS site."""

from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request

BASE = "https://proof-carrying-science-site.marenatommaso.workers.dev"
TIMEOUT = 15

CHECKS = [
    ("/", "text/html", "Proof-Carrying Science"),
    ("/guided-submission.html?demo=1", "text/html", "Try PCS"),
    ("/package-inspector.html", "text/html", "Proof-Carrying Science"),
    ("/account.html", "text/html", "Your level is earned here"),
    ("/tasks.html", "text/html", "Only work PCS actually needs should be here."),
    ("/roles.html", "text/html", "Some useful work is a responsibility, not a ticket."),
    ("/task-graph.html", "text/html", "What unlocks what—and exactly why?"),
    ("/arena.html", "text/html", "Compete on a score only when the score is worth optimizing."),
    ("/api/system/status", "application/json", '"request_sla":"1–2 business days"'),
    ("/api/tasks", "application/json", '"tasks"'),
    ("/api/roles", "application/json", '"roles"'),
    ("/api/task-graph", "application/json", '"edges"'),
    ("/api/challenges", "application/json", '"challenges"'),
    ("/status.json", "application/json", '"contact"'),
    ("/sitemap.xml", "application/xml", "<urlset"),
    ("/robots.txt", "text/plain", "User-agent"),
    ("/.well-known/security.txt", "text/plain", "Contact:"),
]

errors: list[str] = []
context = ssl.create_default_context()

for path, expected_type, expected_text in CHECKS:
    url = BASE + path
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "PCS-Free-Health-Check/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=context) as response:
            status = response.status
            content_type = response.headers.get("Content-Type", "")
            body = response.read(2_000_000).decode("utf-8", errors="replace")
            if status != 200:
                errors.append(f"{path}: expected HTTP 200, got {status}")
            if expected_type not in content_type.lower():
                errors.append(
                    f"{path}: expected Content-Type containing {expected_type!r}, got {content_type!r}"
                )
            if expected_text not in body:
                errors.append(f"{path}: expected marker not found: {expected_text!r}")

            if path == "/":
                headers = {k.lower(): v for k, v in response.headers.items()}
                if headers.get("x-content-type-options", "").lower() != "nosniff":
                    errors.append("/: missing X-Content-Type-Options: nosniff")
                if headers.get("referrer-policy", "").lower() != "no-referrer":
                    errors.append("/: missing Referrer-Policy: no-referrer")
                csp = headers.get("content-security-policy", "")
                if "default-src 'self'" not in csp:
                    errors.append("/: Content-Security-Policy does not contain default-src 'self'")
    except urllib.error.HTTPError as exc:
        errors.append(f"{path}: HTTP error {exc.code}")
    except Exception as exc:
        errors.append(f"{path}: request failed: {type(exc).__name__}: {exc}")

# Public work endpoints have stronger semantic checks than simple marker matching.
try:
    req = urllib.request.Request(
        BASE + "/api/tasks",
        headers={"User-Agent": "PCS-Free-Health-Check/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=context) as response:
        task_doc = json.loads(response.read().decode("utf-8"))
    tasks = task_doc.get("tasks", [])
    leaked = [row.get("id") for row in tasks if str(row.get("id", "")).startswith(("AS-", "SCI-", "CAL-"))]
    if leaked:
        errors.append("/api/tasks: hidden legacy/generic task leaked publicly: " + ", ".join(leaked))
    if any(row.get("publication_state") != "published" or row.get("need_status") != "needed" for row in tasks):
        errors.append("/api/tasks: public task missing published+needed gating")
except Exception as exc:
    errors.append(f"/api/tasks: semantic check failed: {type(exc).__name__}: {exc}")

try:
    req = urllib.request.Request(
        BASE + "/api/challenges",
        headers={"User-Agent": "PCS-Free-Health-Check/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=context) as response:
        arena_doc = json.loads(response.read().decode("utf-8"))
    for challenge in arena_doc.get("challenges", []):
        for entry in challenge.get("leaderboard", []):
            if "status" in entry:
                errors.append("/api/challenges: public leaderboard leaked internal entry status")
except Exception as exc:
    errors.append(f"/api/challenges: semantic check failed: {type(exc).__name__}: {exc}")

# Parse the machine-readable status separately so a syntactically broken status
# page cannot pass merely because it contains the expected marker.
try:
    req = urllib.request.Request(
        BASE + "/status.json",
        headers={"User-Agent": "PCS-Free-Health-Check/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=context) as response:
        status_doc = json.loads(response.read().decode("utf-8"))
    if status_doc.get("contact") != "marenatommaso@gmail.com":
        errors.append("/status.json: public contact field drift")
except Exception as exc:
    errors.append(f"/status.json: invalid JSON: {type(exc).__name__}: {exc}")

if errors:
    print("PCS LIVE HEALTH: FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"PCS LIVE HEALTH: PASS ({len(CHECKS)} public/API endpoints + security headers + status JSON)")
