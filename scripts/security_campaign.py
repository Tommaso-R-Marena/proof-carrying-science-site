from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable

REPO = Path(__file__).resolve().parents[1]
WORKER = REPO / "src" / "worker.js"
ADMIN_JS = REPO / "public" / "admin.js"
HEADERS = REPO / "public" / "_headers"
MAIL_RELAY = REPO / "ops" / "google-apps-script-mail-relay.gs"
MIGRATIONS = REPO / "migrations"

PRODUCTION = "https://proof-carrying-science-site.marenatommaso.workers.dev"


class Campaign:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    def check(self, name: str, condition: bool, detail: str) -> None:
        self.rows.append((name, bool(condition), detail))

    def require(self, name: str, haystack: str, needles: Iterable[str]) -> None:
        missing = [needle for needle in needles if needle not in haystack]
        self.check(name, not missing, "ok" if not missing else "missing: " + ", ".join(missing))

    @property
    def ok(self) -> bool:
        return all(row[1] for row in self.rows)

    def print(self) -> None:
        width = max((len(row[0]) for row in self.rows), default=10)
        for name, passed, detail in self.rows:
            print(f"{'PASS' if passed else 'FAIL'}  {name:<{width}}  {detail}")
        passed = sum(1 for _, ok, _ in self.rows if ok)
        print(f"\n{passed}/{len(self.rows)} checks passed")


def static_campaign(c: Campaign) -> None:
    worker = WORKER.read_text(encoding="utf-8")
    admin_js = ADMIN_JS.read_text(encoding="utf-8")
    headers = HEADERS.read_text(encoding="utf-8")
    mail_relay = MAIL_RELAY.read_text(encoding="utf-8")
    m4 = (MIGRATIONS / "0004_admin_sessions_immutable_audit.sql").read_text(encoding="utf-8")
    m5 = (MIGRATIONS / "0005_admin_action_evidence.sql").read_text(encoding="utf-8")
    m7 = (MIGRATIONS / "0007_reserved_task_exclusivity.sql").read_text(encoding="utf-8")
    m8 = (MIGRATIONS / "0008_contributor_concurrency_guards.sql").read_text(encoding="utf-8")
    m9 = (MIGRATIONS / "0009_curated_work_and_roles.sql").read_text(encoding="utf-8")
    m10 = (MIGRATIONS / "0010_rich_task_dependency_graph.sql").read_text(encoding="utf-8")
    m11 = (MIGRATIONS / "0011_pcs_arena.sql").read_text(encoding="utf-8")
    m12 = (MIGRATIONS / "0012_dependency_edge_enrichment.sql").read_text(encoding="utf-8")
    m1 = (MIGRATIONS / "0001_commons_auth.sql").read_text(encoding="utf-8")

    c.require("origin guard", worker, [
        "function requireSameOrigin(request)",
        'origin && origin !== url.origin',
        '!["same-origin", "none"].includes(fetchSite)',
        'requireSameOrigin(request);',
    ])
    c.check(
        "no sibling-site CSRF allowance",
        '"same-origin", "same-site", "none"' not in worker,
        "same-site is not accepted by Fetch Metadata guard",
    )
    c.require("separate admin session", worker, [
        'const ADMIN_SESSION_COOKIE = "pcs_admin_session"',
        "SameSite=Strict",
        "async function currentAdminUser",
        "async function requireAdmin",
        "Administrator sign-in required.",
    ])
    c.check(
        "admin APIs gated before contributor session",
        worker.index('if (path.startsWith("/api/admin/"))') < worker.index("const user=await requireUser(request,env);"),
        "admin router executes before contributor-session router",
    )
    c.require("owner invariants", worker + m1, [
        "protectOwnerTarget",
        "owner_required",
        "owner_delete_protected",
        "idx_users_single_owner",
        "WHERE is_owner=1",
    ])
    c.require("session revocation on governance loss", worker, [
        'DELETE FROM admin_sessions WHERE user_id=?',
        'DELETE FROM sessions WHERE user_id=?',
        "sessions_revoked",
    ])
    c.require("evaluation replay/attempt controls", worker, [
        "evaluation_attempt_limit",
        "status='open'",
        "evaluation_closed",
        "evaluation_expired",
        "3-attempt daily evaluation limit",
    ])
    c.require("task anti-squatting controls", worker, [
        "already_active",
        "pending_limit",
        "open_task_limit",
        "Application received. It does not reserve the task.",
    ])
    c.require("database reservation exclusivity", worker + m7, [
        "reservation_key",
        "idx_task_requests_unique_reservation",
        "task_already_reserved",
        "request_already_decided",
        "WHERE id=? AND status='pending'",
    ])
    c.require("stale authority fails closed", worker, [
        "reservation_released_after_level_demotion",
        "reservation_released_after_skill_revocation",
        "Your verified level no longer meets this task requirement.",
        "Your required verified skill is no longer active for this task.",
        "released_reservations",
    ])
    c.require("database contributor concurrency caps", worker + m8, [
        "idx_task_requests_one_active_per_user_task",
        "task_requests_pending_cap",
        "task_requests_reserved_cap",
        "competency_evaluations_daily_cap",
        "idx_competency_one_open_per_skill",
        "PCS pending high-tier application limit",
        "PCS active reserved task limit",
        "PCS daily evaluation attempt limit",
    ])
    c.require("one-shot evaluation submission", worker, [
        "evaluation_already_submitted",
        "WHERE id=? AND user_id=? AND status='open'",
    ])
    c.require("verified skill revocation cannot use review API", worker, [
        "Only a pending skill review can be decided here.",
        "skill_not_pending",
        "skill_already_decided",
        "AND status='pending'",
    ])
    c.require("review decisions are one-shot", worker, [
        "checkpoint_already_decided",
        "submission_already_decided",
        "request_already_decided",
    ])
    c.require("marketplace publication is default-deny", worker + m9, [
        "UPDATE tasks SET publication_state='draft'",
        "publication_state='published'",
        "need_status='needed'",
        "adminCurateTask",
        "Only the Founder/Owner can publish or retire marketplace work.",
        "adminCreateTask",
        "publication_state:\"draft\"",
    ])
    c.require("ongoing roles cannot masquerade as task authority", worker + m9, [
        "role_openings",
        "role_applications",
        "applyForRole",
        "adminRoleDecision",
        "This is an ongoing role application, not a task reservation.",
    ])
    c.require("dependency graph carries explicit gate semantics", worker + m10, [
        "task_dependency_groups",
        "dependencyState",
        "artifact_contract",
        "criticality",
        "mode TEXT NOT NULL CHECK(mode IN ('all','any','at_least'))",
    ])
    c.require("dependency graph editing fails closed", worker + m12, [
        "dependencyWouldCycle",
        "dependency_cycle",
        "Only the Founder/Owner can change task dependencies.",
        "Only the Founder/Owner can change task dependency gates.",
        "informative_group_not_allowed",
        "dependency_group_not_empty",
        "adminUpsertDependency",
        "adminDeleteDependency",
        "positive_fixture_baseline",
        "countermodel_for_assumption",
    ])
    game = (REPO / "public" / "arena-proof-quest.js").read_text(encoding="utf-8")
    puzzle = (REPO / "public" / "proof-order-core.mjs").read_text(encoding="utf-8")
    migration = (MIGRATIONS / "0016_proof_quest_adult_consent.sql").read_text(encoding="utf-8")
    c.require("Proof Quest practice does not auto-upload", game, [
        "questAdult", "questConsent", "proofQuestApi",
        '"/api/arena/proof-order/attempt"', '"/api/arena/proof-order/erase"',
    ])
    c.require("Proof Quest research requires adult consent and verified email", worker, [
        "adult_confirmation!==true", "consent_training!==true",
        "email_verification_required", "proof_quest_daily_cap",
        "gradeOrder(body.puzzle_id,body.order,body.hints_used)",
    ])
    c.require("Proof Quest Owner export excludes account identity", worker, [
        "if(!isOwner(admin))", "pcs-proof-order-optin-research-dataset-v1",
        '"user_id","email","IP address","name"',
        "DELETE FROM proof_order_research_attempts WHERE user_id=?",
    ])
    c.require("Proof Quest data limits and deletion are enforced by database", migration + puzzle, [
        "ON DELETE CASCADE", "UNIQUE(user_id,puzzle_id,puzzle_version,ordering_json)",
        "score BETWEEN 0 AND 100", "PUZZLE_VERSION", "mistakes",
    ])
    c.require("Arena leaderboard is verification-gated", worker + m11, [
        "challenge_entries",
        "WHERE e.status='verified'",
        "adminChallengeDecision",
        "Arena entry received. The score is provisional until a reviewer validates",
        "challenge_scorer_unavailable",
        "Leaderboard placement still requires validity review.",
    ])
    c.require("Arena score is server-side and challenge-specific", worker, [
        'challengeId!==\"ARENA-INV-001\"',
        "challengeScore(challenge.id,counts)",
        "challengeScore(row.challenge_id,counts)",
        "leaderboard_alias_taken",
    ])

    c.require("immutable audit archive", worker + m4, [
        "audit_archive",
        "audit_archive_no_update",
        "audit_archive_no_delete",
        "event_hash",
        "prev_hash",
        "verifyAuditArchive",
    ])
    c.require("immutable admin evidence", worker + m5, [
        "admin_evidence_files_no_update",
        "admin_evidence_files_no_delete",
        "admin_evidence_chunks_no_update",
        "admin_evidence_chunks_no_delete",
        "sha256_hex",
    ])
    c.require("evidence upload bounds", worker, [
        "ADMIN_EVIDENCE_MAX_FILES = 4",
        "ADMIN_EVIDENCE_MAX_FILE_BYTES = 2 * 1024 * 1024",
        "ADMIN_EVIDENCE_MAX_TOTAL_BYTES = 6 * 1024 * 1024",
        "evidenceContentMatches",
        "evidence_type_mismatch",
    ])
    c.require("private evidence downloads", worker, [
        "adminDownloadEvidence",
        'if (path.startsWith("/api/admin/"))',
        "/api/admin/evidence/",
        '"content-disposition"',
        '"x-content-type-options":"nosniff"',
    ])
    c.require("skill revocation fails closed", worker, [
        "adminRevokeSkill",
        "Only the Founder/Owner may revoke",
        "reservation_released_after_skill_revocation",
        "skill_revoked",
    ])
    c.require("mail relay authentication", worker, [
        "HMAC",
        "MAIL_RELAY_SECRET",
        "timestamp",
        "nonce",
        "hmacHex",
    ])
    c.require("mail relay replay resistance", mail_relay, [
        "LockService.getScriptLock",
        "PropertiesService.getScriptProperties",
        "PCS_NONCE_PREFIX",
        "replay_detected",
        "stale_request",
        "constantTimeEqual_",
    ])
    c.check(
        "mail replay authority is not best-effort cache",
        "CacheService.getScriptCache" not in mail_relay,
        "nonce authority uses persistent locked properties, not CacheService",
    )
    c.require("admin audit evidence UI", admin_js, [
        "openAdminAction",
        "uploadActionEvidence",
        "auditEvidenceLinks",
        "revokeSkill",
    ])
    c.require("admin pages not cached/indexed", headers, [
        "/admin.html",
        "/admin-login.html",
        "Cache-Control: no-store",
        "X-Robots-Tag: noindex, nofollow, noarchive",
    ])

    # Absence checks: no route should offer destructive audit/evidence mutation.
    destructive = re.findall(r'method==="(?:DELETE|PATCH|PUT)"[^\n]*?/api/admin/(?:audit|evidence)', worker)
    c.check("no audit/evidence mutation API", not destructive, "no DELETE/PATCH/PUT audit/evidence route")


def request(
    url: str,
    *,
    method: str = "GET",
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read()
    except urllib.error.HTTPError as exc:
        return exc.code, {k.lower(): v for k, v in exc.headers.items()}, exc.read()


def json_body(data: dict) -> bytes:
    return json.dumps(data, separators=(",", ":")).encode("utf-8")


def live_campaign(c: Campaign, base_url: str) -> None:
    base = base_url.rstrip("/")
    status, _, payload = request(base + "/api/system/status")
    c.check("live public status", status == 200, f"HTTP {status}")
    if status == 200:
        try:
            parsed = json.loads(payload)
            c.check("live status JSON", parsed.get("ok") is True, "ok=true")
        except Exception as exc:
            c.check("live status JSON", False, f"invalid JSON: {exc}")

    status, _, payload = request(base + "/api/tasks")
    c.check("live curated task endpoint", status == 200, f"HTTP {status}")
    if status == 200:
        try:
            task_data = json.loads(payload)
            tasks = task_data.get("tasks", [])
            forbidden = [row.get("id") for row in tasks if str(row.get("id", "")).startswith(("AS-", "SCI-", "CAL-"))]
            c.check("legacy/generic catalog is not public", not forbidden, "hidden" if not forbidden else "unexpected public IDs: " + ", ".join(forbidden))
            c.check(
                "all public tasks explicitly needed",
                all(row.get("publication_state") == "published" and row.get("need_status") == "needed" for row in tasks),
                f"{len(tasks)} public task(s)",
            )
        except Exception as exc:
            c.check("live curated task JSON", False, f"invalid JSON: {exc}")

    status, _, payload = request(base + "/api/challenges")
    c.check("live Arena endpoint", status == 200, f"HTTP {status}")
    if status == 200:
        try:
            arena = json.loads(payload)
            leaked = [entry for challenge in arena.get("challenges", []) for entry in challenge.get("leaderboard", []) if "status" in entry]
            c.check("Arena leaderboard exposes verified projection only", not leaked, "verified-only public projection")
        except Exception as exc:
            c.check("live Arena JSON", False, f"invalid JSON: {exc}")

    status, _, payload = request(base + "/api/admin/session")
    c.check("unauth admin session is harmless", status == 200, f"HTTP {status}")
    if status == 200:
        try:
            parsed = json.loads(payload)
            c.check("unauth admin session false", parsed.get("authenticated") is False, "authenticated=false")
        except Exception as exc:
            c.check("unauth admin session false", False, f"invalid JSON: {exc}")

    status, _, _ = request(base + "/api/admin/overview")
    c.check("unauth admin overview denied", status == 401, f"HTTP {status}")

    status, _, _ = request(base + "/api/admin/audit")
    c.check("unauth audit denied", status == 401, f"HTTP {status}")

    status, _, _ = request(base + "/api/admin/evidence/not-a-real-id")
    c.check("unauth evidence denied", status == 401, f"HTTP {status}")

    # Cross-origin state changes must fail before any account mutation is attempted.
    headers = {
        "content-type": "application/json",
        "origin": "https://attacker.invalid",
        "sec-fetch-site": "cross-site",
    }
    status, _, payload = request(
        base + "/api/auth/login",
        method="POST",
        body=json_body({"email": "nobody@example.invalid", "password": "not-a-real-password"}),
        headers=headers,
    )
    c.check("cross-origin POST rejected", status == 403, f"HTTP {status}")

    # A sibling/same-site browser context is not enough; only same-origin is accepted.
    headers = {
        "content-type": "application/json",
        "sec-fetch-site": "same-site",
    }
    status, _, _ = request(
        base + "/api/auth/login",
        method="POST",
        body=json_body({"email": "nobody@example.invalid", "password": "not-a-real-password"}),
        headers=headers,
    )
    c.check("same-site non-origin POST rejected", status == 403, f"HTTP {status}")

    # Malformed unauthenticated login is a safe parser test; it cannot mutate account state.
    headers = {
        "content-type": "application/json",
        "origin": base,
        "sec-fetch-site": "same-origin",
    }
    status, _, _ = request(base + "/api/auth/login", method="POST", body=b"{", headers=headers)
    c.check("malformed JSON fails closed", status == 400, f"HTTP {status}")

    status, page_headers, _ = request(base + "/admin-login.html")
    no_store = "no-store" in page_headers.get("cache-control", "").lower()
    robots = page_headers.get("x-robots-tag", "").lower()
    c.check("admin login no-store", status == 200 and no_store, f"HTTP {status}; cache-control={page_headers.get('cache-control','')}")
    c.check("admin login noindex", "noindex" in robots, f"x-robots-tag={robots or '<missing>'}")


def main() -> int:
    parser = argparse.ArgumentParser(description="PCS Commons defensive security campaign")
    parser.add_argument("--static", action="store_true", help="run repository/security-contract checks")
    parser.add_argument("--base-url", help="also run harmless unauthenticated probes against a deployed site")
    args = parser.parse_args()

    c = Campaign()
    if args.static or not args.base_url:
        static_campaign(c)
    if args.base_url:
        live_campaign(c, args.base_url)

    c.print()
    return 0 if c.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
