#!/usr/bin/env python3
"""Fail CI if the PCS website drifts away from its reviewed free-tier Cloudflare posture."""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PUBLIC = REPO / "public"
CONFIG = REPO / "wrangler.jsonc"

errors: list[str] = []

try:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
except Exception as exc:
    raise SystemExit(f"FREE INFRA CHECK: FAIL - cannot parse wrangler.jsonc: {exc}")

if cfg.get("name") != "proof-carrying-science-site":
    errors.append("unexpected Worker name")
if cfg.get("workers_dev") is not True:
    errors.append("workers_dev must remain enabled while PCS has no paid/custom-domain dependency")
if cfg.get("preview_urls") is not False:
    errors.append("preview_urls must remain disabled")

assets = cfg.get("assets", {})
if assets.get("directory") != "./public":
    errors.append("deployable assets must remain scoped to ./public")

obs = cfg.get("observability", {})
if obs.get("enabled") is not True:
    errors.append("free Workers observability must remain enabled")
if obs.get("head_sampling_rate") != 1:
    errors.append("observability sampling must remain explicit at 1 for the demo-stage site")
if obs.get("redact_query_string") is not True:
    errors.append("observability must redact query strings before persistence")
if obs.get("issues", {}).get("enabled") is not True:
    errors.append("Cloudflare Issues must remain enabled")

# The Commons account system deliberately uses one D1 database on Workers Free.
# Every other stateful/paid surface remains forbidden unless separately reviewed.
d1 = cfg.get("d1_databases", [])
if len(d1) != 1:
    errors.append("exactly one reviewed Commons D1 binding is required")
else:
    db = d1[0]
    if db.get("binding") != "COMMONS_DB":
        errors.append("Commons D1 binding must be COMMONS_DB")
    if db.get("database_name") != "pcs-commons":
        errors.append("Commons D1 database name drift")
    if db.get("database_id") != "9e5288c2-efef-4918-b029-7ef001b70064":
        errors.append("Commons D1 production database ID drift")
    if db.get("migrations_dir") != "migrations":
        errors.append("Commons D1 migrations directory drift")

review_required_keys = {
    "r2_buckets",
    "kv_namespaces",
    "durable_objects",
    "queues",
    "vectorize",
    "ai",
    "browser",
    "containers",
    "hyperdrive",
    "services",
}
present = sorted(review_required_keys.intersection(cfg))
if present:
    errors.append("unreviewed Cloudflare resource bindings require explicit free-tier/privacy review: " + ", ".join(present))

assets = cfg.get("assets", {})
if assets.get("binding") != "ASSETS":
    errors.append("Worker asset binding must be ASSETS")
if assets.get("run_worker_first") != ["/api/*"]:
    errors.append("only /api/* should run through the account Worker before static assets")

if cfg.get("main") != "src/worker.js":
    errors.append("Commons Worker entrypoint must be src/worker.js")

if cfg.get("vars", {}).get("ADMIN_EMAIL") != "marenatommaso@gmail.com":
    errors.append("Commons admin notification address drift")

site_js = (PUBLIC / "site.js").read_text(encoding="utf-8")
for required in [
    "proof-carrying-science-site.marenatommaso.workers.dev",
    "https://static.cloudflareinsights.com/beacon.min.js",
    "dataset.cfBeacon",
]:
    if required not in site_js:
        errors.append(f"production Web Analytics wiring missing: {required}")

for required_path in [
    REPO / ".github" / "workflows" / "live-health.yml",
    REPO / ".github" / "dependabot.yml",
    REPO / "FREE_INFRASTRUCTURE.md",
    REPO / "scripts" / "check_live_site.py",
]:
    if not required_path.exists():
        errors.append(f"free infrastructure control missing: {required_path.relative_to(REPO)}")

privacy = (PUBLIC / "privacy.html").read_text(encoding="utf-8")
for required in [
    "Cloudflare Web Analytics",
    "Workers Logs",
    "No scientific file contents are sent to PCS",
    "D1",
    "account",
    "browser localStorage",
]:
    if required not in privacy:
        errors.append(f"privacy disclosure missing: {required}")

if errors:
    print("FREE INFRA CHECK: FAIL")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("FREE INFRA CHECK: PASS (Workers Free + reviewed D1 account state + static assets + observability; no unreviewed paid/stateful bindings)")
