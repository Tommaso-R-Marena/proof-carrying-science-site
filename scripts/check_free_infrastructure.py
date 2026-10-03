#!/usr/bin/env python3
"""Fail CI if the PCS website drifts away from its zero-billing Cloudflare posture."""

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

# These keys are not categorically bad; they are forbidden here so adding any
# stateful/paid-surface Cloudflare service requires a deliberate review of the
# zero-card architecture and privacy disclosure instead of silently appearing.
review_required_keys = {
    "r2_buckets",
    "d1_databases",
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
    errors.append("Cloudflare resource bindings require explicit zero-billing review: " + ", ".join(present))

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
]:
    if required not in privacy:
        errors.append(f"privacy disclosure missing: {required}")

if errors:
    print("FREE INFRA CHECK: FAIL")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)

print("FREE INFRA CHECK: PASS (Workers Free observability + Issues + Web Analytics; no stateful Cloudflare bindings)")
