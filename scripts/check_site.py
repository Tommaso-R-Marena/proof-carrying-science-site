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
    "index.html", "guided-submission.html", "result-anatomy.html", "project-builder.html", "mvp.html", "validation.html", "trust.html", "architecture.html", "demo.html", "model-lab.html", "intake.html", "contact.html", "privacy.html", "404.html",
    "styles.css", "site.js", "guided-submission.js", "result-anatomy.js", "project-builder.js", "mvp.js", "demo.js", "model-lab.js", "intake.js", "contact.js", "pcs-engine.js", "pcs-reference.js",
    "logo-mark.svg", "pcs-v05-reference-package.json", "reviewer-policy.example.json", "review-quorum-policy.example.json", "review-set.example.json", "real-world-validation-2026-09-29.json", "status.json", ".well-known/security.txt", "_headers", "robots.txt",
]
for name in required:
    if not (ROOT / name).exists():
        errors.append(f"missing required deployable file: {name}")

for page in ["index.html", "guided-submission.html", "result-anatomy.html", "project-builder.html", "mvp.html", "validation.html", "trust.html", "architecture.html", "demo.html", "model-lab.html", "intake.html", "contact.html", "privacy.html"]:
    p = ROOT / page
    if not p.exists():
        continue
    page_text = p.read_text(encoding="utf-8")
    if CONTACT not in page_text:
        errors.append(f"{page}: real contact address is missing")
    if 'src="site.js"' not in page_text:
        errors.append(f"{page}: shared navigation script is missing")
    if 'href="trust.html"' not in page_text and page != "trust.html":
        errors.append(f"{page}: Trust Center navigation link is missing")
    if 'href="mvp.html"' not in page_text and page != "mvp.html":
        errors.append(f"{page}: v0.6 MVP navigation link is missing")
    if 'href="project-builder.html"' not in page_text and page != "project-builder.html":
        errors.append(f"{page}: Project Mapper navigation link is missing")



result_anatomy_page = ROOT / "result-anatomy.html"
result_anatomy_js = ROOT / "result-anatomy.js"
if result_anatomy_page.exists():
    text_value = result_anatomy_page.read_text(encoding="utf-8")
    for required_text in [
        "Completed review anatomy",
        "What does a finished PCS result actually mean?",
        "Educational walkthrough:",
        "Valid + accepted",
        "Valid + policy rejected",
        "Valid + claim failed",
        "Invalid package",
        "Actual v0.6 field names",
        "pcs-end-to-end-verifier-v06-v1",
        "bundle_sha256",
        "certificate_semantic_hash",
        "certificate_integrity_hash",
        "normalized_index_semantic_hash",
        "policy_sha256",
        "See executed validation",
        "See runtime evidence",
        "Reviewer workflow",
        "pcs verify-local-v06 delivered.pcs.zip --trust trust.json --receipt receipt.json",
        "pcs-verifier-trust-v1",
        "Single-file verifier",
    ]:
        if required_text not in text_value:
            errors.append(f"result-anatomy.html: result-anatomy contract drift: {required_text}")
    if 'aria-live="polite"' not in text_value:
        errors.append("result-anatomy.html: scenario result changes are not announced")
if result_anatomy_js.exists():
    script_value = result_anatomy_js.read_text(encoding="utf-8")
    for required_text in [
        "COMPUTATIONALLY_SUPPORTED",
        "FALSIFIED_OR_CHECK_FAILED",
        "NOT TRUSTWORTHY FROM THIS RUN",
        "valid:true,accepted:false",
        "history.replaceState",
        "summaryFormal",
        "summaryReplay",
        "summaryTrusted",
        "Bottom line:",
    ]:
        if required_text not in script_value:
            errors.append(f"result-anatomy.js: scenario semantics drift: {required_text}")


index_page = ROOT / "index.html"
if index_page.exists():
    index_text = index_page.read_text(encoding="utf-8")
    for required_text in [
        "Start from your role",
        "What are you here to do?",
        "I have a computation or result to submit.",
        "I need to understand or verify a PCS result.",
        "Start Guided Submission",
        "Understand a PCS Result",
        "producer and reviewer are intentionally separate trust roles",
        "latest hosted CircleCI runtime/restoration gate passed",
    ]:
        if required_text not in index_text:
            errors.append(f"index.html: role-entry/usability drift: {required_text}")
    if 'href="guided-submission.html"' not in index_text:
        errors.append("index.html: producer role route drift")
    if 'href="result-anatomy.html"' not in index_text:
        errors.append("index.html: reviewer role route drift")
    if 'href="guided-submission.html?demo=1"' not in index_text:
        errors.append("index.html: explorer demo route drift")

demo_page = ROOT / "demo.html"
demo_js = ROOT / "demo.js"
if demo_page.exists():
    demo_text = demo_page.read_text(encoding="utf-8")
    for required_text in [
        "30-second reading guide",
        "PCS is answering four different questions.",
        "What this result means",
        "What it does not mean",
        "What to look at next",
    ]:
        if required_text not in demo_text:
            errors.append(f"demo.html: result-interpretation drift: {required_text}")
if demo_js.exists():
    demo_script = demo_js.read_text(encoding="utf-8")
    for required_text in [
        "function explainVerificationResult(result)",
        "Accepted under this reviewer policy",
        "Rejected: package integrity failed",
        "Rejected: required scientific replay failed",
        "Not accepted: at least one claim remains OPEN",
        "Verified evidence, but this reviewer policy does not accept it",
    ]:
        if required_text not in demo_script:
            errors.append(f"demo.js: result-interpretation drift: {required_text}")

mapper_page = ROOT / "project-builder.html"
mapper_js = ROOT / "project-builder.js"

guided_page = ROOT / "guided-submission.html"
guided_js = ROOT / "guided-submission.js"
if guided_page.exists():
    guided_text = guided_page.read_text(encoding="utf-8")
    for required_text in [
        "From scientific project to review-ready PCS draft in five steps.",
        "Choose project folder",
        "What should PCS verify?",
        "Review what PCS found",
        "Prepare the verifiable package handoff",
        "Your PCS claim contract is prepared for authoritative verification.",
        "project-builder.js",
        "guided-submission.js",
        "Nothing is uploaded",
        "confirm-v06",
        "attest-v06",
        "Open Advanced Mapper",
        "What can PCS formalize today?",
        "PCS does not turn arbitrary prose directly into a trusted formal claim.",
        "Describe what you want to check",
        "Draft ready · not yet verified",
        "How to read a PCS result",
        "COMPUTATIONALLY_SUPPORTED",
        "FALSIFIED_OR_CHECK_FAILED",
        "OPEN",
        "ACCEPTED",
        "Where you are",
        "Nothing has been verified, executed, signed, or accepted.",
        "Claim translation",
        "Authoritative check",
    ]:
        if required_text not in guided_text:
            errors.append(f"guided-submission.html: guided flow contract drift: {required_text}")
if guided_js.exists():
    guided_script = guided_js.read_text(encoding="utf-8")
    for required_text in [
        "window.PCSProjectMapper",
        "setRecommendationSelected",
        "formal_explanation",
        "api.downloadDraft",
        "api.downloadReview",
        "ZIP archives",
        "demoMode",
        "URLSearchParams",
        'get("demo")==="1"',
        "Demo checkpoint",
        "SUPPORTED TEMPLATE FOUND",
        "NOT YET FORMALIZED",
        "No predicate generated — fail closed.",
        "renderGuide(step)",
    ]:
        if required_text not in guided_script:
            errors.append(f"guided-submission.js: guided controller drift: {required_text}")
if mapper_js.exists():
    mapper_script = mapper_js.read_text(encoding="utf-8")
    if "window.PCSProjectMapper" not in mapper_script:
        errors.append("project-builder.js: reusable Guided Submission API is missing")
    for required_text in [
        "function explainPredicate(predicate)",
        "Dataset separation",
        "Chemical reaction balance",
        "Unit compatibility",
        "PK/PD model contract",
        "PK/PD output reproduction",
        "formal_explanation",
    ]:
        if required_text not in mapper_script:
            errors.append(f"project-builder.js: formal claim explanation drift: {required_text}")

if mapper_page.exists():
    mapper_text = mapper_page.read_text(encoding="utf-8")
    for required_text in [
        "pcs confirm-v06",
        "pcs discover-v06",
        "non-attestable",
        "Nothing is uploaded",
        "Inferred workflow",
        "No code execution",
        "Load synthetic example",
        "R workflow",
        "Download review Markdown",
    ]:
        if required_text not in mapper_text:
            errors.append(f"project-builder.html: missing explicit draft confirmation boundary: {required_text}")
if mapper_js.exists():
    mapper_script = mapper_js.read_text(encoding="utf-8")
    for required_text in [
        "pcs-manifest-draft-v1",
        "pcs-project-discovery-v1",
        "pcs_discovery_sha256",
        "requires_confirmation:true",
        "pcs-static-workflow-map-v1",
        "user_code_executed:false",
        "browser_heuristic:true",
        "multiple_static_producers",
        "loadSyntheticExample",
        "analyzeBrowserRSource",
        "pcs-discovery-review.md",
    ]:
        if required_text not in mapper_script:
            errors.append(f"project-builder.js: guided intake contract drift: {required_text}")

    for required_text in [
        "read_paths,write_paths",
        "Array.isArray(w.read_paths)",
        "Array.isArray(w.write_paths)",
    ]:
        if required_text not in mapper_script:
            errors.append(f"project-builder.js: workflow display-shape regression: {required_text}")

if mapper_page.exists():
    mapper_text = mapper_page.read_text(encoding="utf-8")
    for required_text in [
        "Reproducibility environment",
        "Download environment plan",
        "NO EXECUTION",
        "authoritative Python capture",
    ]:
        if required_text not in mapper_text:
            errors.append(f"project-builder.html: environment capture contract drift: {required_text}")
if mapper_js.exists():
    mapper_script = mapper_js.read_text(encoding="utf-8")
    for required_text in [
        'ENVIRONMENT_FORMAT="pcs-environment-capture-v1"',
        'ENVIRONMENT_PLAN_FORMAT="pcs-environment-replay-plan-v1"',
        "automatic_execution_permitted_by_pcs:false",
        "detectBrowserEnvironment",
        "downloadEnvironmentPlan",
    ]:
        if required_text not in mapper_script:
            errors.append(f"project-builder.js: environment capture contract drift: {required_text}")

for page in ["trust.html", "architecture.html"]:
    p = ROOT / page
    if p.exists():
        text_value = p.read_text(encoding="utf-8")
        for required_text in [
            "Claim semantics boundary",
            "Natural language explains the claim. The typed predicate defines it.",
            "csv_disjoint",
            "reaction_balance",
            "unit_compatible",
            "pkpd_contract",
            "pkpd_reference_match",
        ]:
            if required_text not in text_value:
                errors.append(f"{page}: claim-semantics explanation drift: {required_text}")

for page in ["mvp.html", "trust.html", "architecture.html"]:
    p = ROOT / page
    if p.exists() and "prepare-environment-v06" not in p.read_text(encoding="utf-8"):
        errors.append(f"{page}: verified replay workspace command is missing")

receipt_pages = ["index.html", "mvp.html", "trust.html", "architecture.html"]
for page in receipt_pages:
    p = ROOT / page
    if p.exists() and "reviewer" not in p.read_text(encoding="utf-8").lower():
        errors.append(f"{page}: reviewer-signed receipt surface is missing")

validation_pages = ["index.html", "mvp.html", "trust.html", "architecture.html", "demo.html"]
for page in validation_pages:
    p = ROOT / page
    if p.exists() and 'href="validation.html"' not in p.read_text(encoding="utf-8"):
        errors.append(f"{page}: real-world validation navigation/link is missing")

validation_page = ROOT / "validation.html"
if validation_page.exists():
    validation_text = validation_page.read_text(encoding="utf-8")
    for required_text in [
        "Canonical demo suite",
        "Three deterministic examples tell the whole PCS story.",
        "Valid package + supported claim",
        "Valid package + failed scientific claim",
        "Environment-bound replay",
        "python scripts/run_golden_examples_v06.py -o golden-demo-run",
        "Demo-only cryptographic identity:",
    ]:
        if required_text not in validation_text:
            errors.append(f"validation.html: golden-demo contract drift: {required_text}")

validation_result = ROOT / "real-world-validation-2026-09-29.json"
if validation_result.exists():
    try:
        validation = json.loads(validation_result.read_text(encoding="utf-8"))
        if validation.get("format") != "pcs-public-real-world-validation-v1":
            errors.append("real-world validation: unexpected format")
        summary = validation.get("summary", {})
        if summary != {
            "cases": 5,
            "matched_expected": 5,
            "unexpected": 0,
            "expected_pass": 3,
            "expected_fail": 2,
        }:
            errors.append("real-world validation: summary drift")
        by_id = {case.get("id"): case for case in validation.get("cases", [])}
        if by_id.get("iris_contaminated_split", {}).get("actual") != "FAIL":
            errors.append("real-world validation: Iris negative control drift")
        if by_id.get("indometh_subject1_single_exponential", {}).get("actual") != "FAIL":
            errors.append("real-world validation: Indometh negative control drift")
        if validation.get("execution_mode") != "direct_checker_logic_execution":
            errors.append("real-world validation: execution-boundary drift")
    except Exception as exc:
        errors.append(f"real-world validation: invalid JSON: {type(exc).__name__}: {exc}")

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
            errors.append("pcs-v05-reference-package.json: browser reference must remain on released checker 0.5.0")
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

public_status = ROOT / "status.json"
if public_status.exists() and fixture_obj is not None:
    try:
        status = json.loads(public_status.read_text(encoding="utf-8"))
        if status.get("status_format") != "pcs-public-status-v1":
            errors.append("status.json: unexpected status_format")
        released = status.get("released", {})
        formal = status.get("formal", {})
        browser = status.get("browser_profile", {})
        preview = status.get("next_refinement", {})
        cert = json.loads(fixture_obj["files"]["certificate.json"]["content"])
        if released.get("specification") != cert.get("spec_version"):
            errors.append("status.json: released specification differs from browser fixture")
        if released.get("checker") != cert.get("checker_version"):
            errors.append("status.json: released checker differs from browser fixture")
        mvp = status.get("mvp_candidate", {})
        if formal.get("lean_version") != "4.28.0":
            errors.append("status.json: unexpected verified Lean version")
        if formal.get("raw_wire_bytes_to_assures") != "MACHINE_CHECKED_PASS":
            errors.append("status.json: formal raw-wire assurance status drift")
        if formal.get("mainline_integrated") is not True:
            errors.append("status.json: formal theorem layer not marked integrated on model main")
        if formal.get("model_main_commit") != "3e93573e0875da422340ad5e8d5e29f623c1eadc":
            errors.append("status.json: formal model-main commit drift")
        if formal.get("circleci_lean_gate") != "PASS":
            errors.append("status.json: formal CircleCI Lean gate drift")
        if formal.get("exact_v06_v2_port") != "OPEN":
            errors.append("status.json: exact v0.6 formal-port boundary drift")
        mainline = mvp.get("mainline", {})
        if mainline.get("current_head") != "3e93573e0875da422340ad5e8d5e29f623c1eadc":
            errors.append("status.json: model main head drift")
        if mainline.get("formal_wire_gate_passed") is not True or mainline.get("runtime_main_gate_passed") is not True:
            errors.append("status.json: model main gate status drift")
        if mvp.get("specification") != "pcs-0.6" or mvp.get("checker") != "pcs-python-kernel/0.6.0-dev":
            errors.append("status.json: v0.6 MVP identity drift")
        if mvp.get("producer_command") != "pcs attest-v06" or mvp.get("reviewer_command") != "pcs verify-v06-bundle":
            errors.append("status.json: v0.6 MVP command contract drift")
        if mvp.get("reviewer_policy", {}).get("valid_separate_from_accepted") is not True:
            errors.append("status.json: reviewer-policy separation drift")

        guided_submission = mvp.get("guided_submission", {})
        if guided_submission.get("format") != "pcs-guided-submission-ui-v1":
            errors.append("status.json: guided submission format drift")
        for key in [
            "uses_project_mapper_engine",
            "local_only_browser_discovery",
            "folder_selection",
            "individual_file_selection",
            "synthetic_example",
            "plain_language_claim_rendering",
            "free_text_used_only_for_template_suggestion",
            "structured_predicate_preview",
            "raw_predicate_progressive_disclosure",
            "unsupported_claims_fail_closed",
            "progressive_disclosure",
            "advanced_mapper_preserved",
            "authoritative_confirmation_required",
            "draft_download_available",
            "review_download_available",
            "cli_handoff_generated",
            "persistent_stage_explanation",
            "each_stage_states_what_is_not_yet_verified",
            "live_claim_translation_panel",
            "no_supported_template_generates_no_predicate",
        ]:
            if guided_submission.get(key) is not True:
                errors.append(f"status.json: guided submission invariant drift: {key}")
        if guided_submission.get("user_code_executed_during_browser_discovery") is not False:
            errors.append("status.json: guided submission code-execution boundary drift")
        if guided_submission.get("zip_silently_unpacked") is not False:
            errors.append("status.json: guided submission ZIP boundary drift")
        if guided_submission.get("browser_attestation_claimed") is not False:
            errors.append("status.json: guided submission browser-attestation overclaim")
        if guided_submission.get("plain_language_claim_editing") is not False:
            errors.append("status.json: free-text claim editing must not define formal semantics")
        if guided_submission.get("free_text_defines_formal_predicate") is not False:
            errors.append("status.json: free text must not define formal predicate")
        if guided_submission.get("claim_translation_model") != "intent -> supported template -> typed fields -> exact predicate/check -> generated explanation":
            errors.append("status.json: guided claim translation model drift")
        if guided_submission.get("supported_formal_claim_types") != [
            "csv_disjoint",
            "reaction_balance",
            "unit_compatible",
            "pkpd_contract",
            "pkpd_reference_match",
        ]:
            errors.append("status.json: supported formal claim type set drift")
        if guided_submission.get("steps") != ["project", "claim", "review", "prepare", "ready"]:
            errors.append("status.json: guided submission step contract drift")
        if guided_submission.get("live_claim_translation_axes") != [
            "user_words", "supported_typed_meaning", "authoritative_predicate"
        ]:
            errors.append("status.json: live claim-translation axes drift")

        demo_clarity = mvp.get("demo_clarity", {})
        result_anatomy = demo_clarity.get("completed_result_anatomy", {})
        if result_anatomy.get("page") != "result-anatomy.html" or result_anatomy.get("script") != "result-anatomy.js":
            errors.append("status.json: completed result anatomy surface drift")
        for key in [
            "based_on_real_v06_field_names",
            "illustrative_values_not_live_verification",
            "distinguishes_valid_claim_status_accepted",
            "links_to_executed_validation",
            "links_to_runtime_evidence",
            "thirty_second_assurance_summary",
        ]:
            if result_anatomy.get(key) is not True:
                errors.append(f"status.json: result anatomy invariant drift: {key}")
        if result_anatomy.get("scenarios") != [
            "valid_and_accepted",
            "valid_policy_rejected",
            "valid_failed_claim",
            "invalid_package",
        ]:
            errors.append("status.json: result anatomy scenario set drift")
        if result_anatomy.get("reviewer_receipt_bindings_explained") != [
            "bundle_sha256",
            "certificate_semantic_hash",
            "certificate_integrity_hash",
            "normalized_index_semantic_hash",
            "policy_sha256",
            "valid",
            "accepted",
        ]:
            errors.append("status.json: reviewer receipt binding explanation drift")


        if demo_clarity.get("format") != "pcs-demo-interpretation-ui-v1":
            errors.append("status.json: demo clarity format drift")
        if demo_clarity.get("one_click_guided_demo") != "guided-submission.html?demo=1":
            errors.append("status.json: one-click guided demo drift")
        for key in [
            "demo_mode_labels_synthetic_example",
            "preparation_not_presented_as_verification",
            "package_validity_distinguished_from_claim_support",
            "reviewer_acceptance_distinguished_from_validity",
            "scientific_truth_overclaim_rejected",
            "legacy_verifier_dynamic_result_explanation",
            "thirty_second_result_summary",
            "scenario_aware_result_summary",
        ]:
            if demo_clarity.get(key) is not True:
                errors.append(f"status.json: demo clarity invariant drift: {key}")
        if demo_clarity.get("preparation_state_label") != "PREPARED DRAFT":
            errors.append("status.json: prepared-draft label drift")
        if demo_clarity.get("result_layers") != [
            "claim_intent",
            "typed_predicate",
            "evidence_replay",
            "derived_claim_status",
            "reviewer_acceptance",
        ]:
            errors.append("status.json: demo result-layer model drift")
        if demo_clarity.get("result_summary_axes") != [
            "formally_established",
            "freshly_reproduced",
            "still_trusted",
        ]:
            errors.append("status.json: 30-second result-summary axes drift")
        if demo_clarity.get("exact_claim_statuses_explained") != [
            "COMPUTATIONALLY_SUPPORTED",
            "FALSIFIED_OR_CHECK_FAILED",
            "OPEN",
        ]:
            errors.append("status.json: demo claim-status explanation drift")

        usability = mvp.get("usability", {})
        role_entry = usability.get("role_entry", {})
        if role_entry.get("format") != "pcs-role-entry-ui-v1":
            errors.append("status.json: role-entry format drift")
        if role_entry.get("producer_route") != "guided-submission.html":
            errors.append("status.json: producer route drift")
        if role_entry.get("reviewer_route") != "result-anatomy.html":
            errors.append("status.json: reviewer route drift")
        if role_entry.get("explorer_route") != "guided-submission.html?demo=1":
            errors.append("status.json: explorer route drift")
        for key in [
            "producer_and_reviewer_roles_separated",
            "producer_cannot_self_accept",
            "reviewer_policy_controls_acceptance",
            "role_copy_uses_plain_language",
        ]:
            if role_entry.get(key) is not True:
                errors.append(f"status.json: role-entry invariant drift: {key}")

        guided_discovery = mvp.get("guided_discovery", {})
        if guided_discovery.get("discovery_format") != "pcs-project-discovery-v1":
            errors.append("status.json: guided discovery format drift")
        if guided_discovery.get("manifest_draft_format") != "pcs-manifest-draft-v1":
            errors.append("status.json: guided manifest-draft format drift")
        if guided_discovery.get("discover_command") != "pcs discover-v06" or guided_discovery.get("confirm_command") != "pcs confirm-v06":
            errors.append("status.json: guided discovery command drift")
        if guided_discovery.get("browser_mapper") != "project-builder.html":
            errors.append("status.json: guided browser mapper drift")
        for key in [
            "local_only",
            "private_key_material_excluded",
            "explicit_confirmation_required",
            "artifact_snapshot_rehashed_on_confirmation",
            "artifact_snapshot_rechecked_on_attestation",
        ]:
            if guided_discovery.get(key) is not True:
                errors.append(f"status.json: guided discovery invariant drift: {key}")
        if guided_discovery.get("confirmation_provenance_in_signed_artifact_metadata") is not True:
            errors.append("status.json: guided confirmation provenance drift")
        if guided_discovery.get("workflow_discovery_format") != "pcs-static-workflow-map-v1":
            errors.append("status.json: static workflow discovery format drift")
        for key in [
            "cli_python_ast_analysis",
            "cli_jupyter_code_cell_analysis",
            "browser_visual_graph",
            "browser_synthetic_example",
            "static_workflow_human_confirmation_required",
            "source_code_snapshot_bound",
            "source_change_after_confirmation_rejected",
            "cli_r_literal_workflow_analysis",
            "browser_r_literal_workflow_preview",
            "human_readable_discovery_review",
        ]:
            if guided_discovery.get(key) is not True:
                errors.append(f"status.json: static workflow invariant drift: {key}")
        if guided_discovery.get("user_code_executed_during_discovery") is not False:
            errors.append("status.json: workflow discovery execution-boundary drift")
        if guided_discovery.get("dynamic_paths_guessed") is not False:
            errors.append("status.json: dynamic-path guessing drift")
        if guided_discovery.get("ambiguous_multiple_producers_guessed") is not False:
            errors.append("status.json: multiple-producer guessing drift")
        if guided_discovery.get("static_workflow_proves_program_correctness") is not False:
            errors.append("status.json: static workflow correctness overclaim")
        if guided_discovery.get("default_workflow_confidence") != 0.95:
            errors.append("status.json: workflow default confidence drift")
        if guided_discovery.get("clean_ast_workflow_confidence") != 0.98:
            errors.append("status.json: clean AST workflow confidence drift")
        if guided_discovery.get("partial_ast_workflow_confidence") != 0.90:
            errors.append("status.json: partial AST workflow confidence drift")
        if guided_discovery.get("browser_heuristic_workflow_confidence") != 0.90:
            errors.append("status.json: browser workflow confidence drift")
        if guided_discovery.get("r_workflow_confidence") != 0.88:
            errors.append("status.json: R workflow confidence drift")
        if guided_discovery.get("r_workflow_auto_selected_by_default") is not False:
            errors.append("status.json: R workflow default-selection drift")
        for key in [
            "workflow_replay_stage",
            "workflow_replay_from_exact_delivered_source_bytes",
            "workflow_replay_before_scientific_replay",
            "claimed_edges_must_be_rediscovered",
            "signed_source_path_validated_as_canonical_relative",
            "forged_resigned_workflow_claim_adversarial_test_committed",
        ]:
            if guided_discovery.get(key) is not True:
                errors.append(f"status.json: workflow replay invariant drift: {key}")
        if guided_discovery.get("exact_ast_dependency_mode") != "exact_resolved_set":
            errors.append("status.json: exact workflow dependency mode drift")
        if guided_discovery.get("partial_dependency_mode") != "claimed_subset":
            errors.append("status.json: subset workflow dependency mode drift")
        if guided_discovery.get("forged_resigned_workflow_claim_runtime_executed") is not False:
            errors.append("status.json: workflow replay runtime evidence overclaim")
        if guided_discovery.get("automated_discovery_affects_scientific_verdict") is not False:
            errors.append("status.json: guided discovery entered scientific verdict boundary")
        environment_capture = guided_discovery.get("environment_capture", {})
        if environment_capture.get("capture_format") != "pcs-environment-capture-v1":
            errors.append("status.json: environment capture format drift")
        if environment_capture.get("binding_format") != "pcs-environment-binding-v1":
            errors.append("status.json: environment binding format drift")
        if environment_capture.get("contract_namespace") != "pcs-manifest-environment-contract-v1":
            errors.append("status.json: environment contract namespace drift")
        if environment_capture.get("replay_plan_format") != "pcs-environment-replay-plan-v1":
            errors.append("status.json: environment replay-plan format drift")
        for key in [
            "captures_python_dependencies",
            "captures_r_dependencies",
            "captures_conda_dependencies",
            "captures_lockfiles",
            "captures_interpreter_constraints",
            "captures_container_specs",
            "captures_nix_specs",
            "container_digest_pinning_distinguished",
            "human_confirmation_required",
            "reconstruction_plan_available",
            "review_before_run_script_available",
            "browser_preview_local_only",
        ]:
            if environment_capture.get(key) is not True:
                errors.append(f"status.json: environment capture invariant drift: {key}")
        if environment_capture.get("reviewer_rederivation_stage") != "environment_replay":
            errors.append("status.json: environment replay stage drift")
        if environment_capture.get("replay_precedes_workflow_replay") is not True:
            errors.append("status.json: environment replay ordering drift")
        if environment_capture.get("authoritative_recapture_at_confirmation") is not True:
            errors.append("status.json: authoritative environment recapture drift")
        if environment_capture.get("browser_preview_authoritative") is not False:
            errors.append("status.json: browser environment preview authority drift")
        if environment_capture.get("automatic_environment_execution_during_verification") is not False:
            errors.append("status.json: environment verification execution boundary drift")
        if environment_capture.get("verified_workspace_format") != "pcs-environment-workspace-v1":
            errors.append("status.json: verified environment workspace format drift")
        if environment_capture.get("prepare_workspace_command") != "pcs prepare-environment-v06":
            errors.append("status.json: verified environment workspace command drift")
        for key in [
            "full_bundle_verification_before_materialization",
            "materializes_signed_source_path_tree",
            "workspace_bound_to_bundle_sha256",
            "workspace_bound_to_certificate_hashes",
            "atomic_staging_then_publish",
            "rechecks_bundle_sha256_before_materialization",
        ]:
            if environment_capture.get(key) is not True:
                errors.append(f"status.json: environment workspace invariant drift: {key}")
        if environment_capture.get("workspace_execution_by_pcs") is not True:
            errors.append("status.json: explicit environment execution capability drift")
        if environment_capture.get("sandbox_execution_available") is not True:
            errors.append("status.json: sandbox execution availability drift")
        if environment_capture.get("execute_workspace_command") != "pcs execute-environment-v06":
            errors.append("status.json: environment execution command drift")
        if environment_capture.get("automatic_environment_execution_during_verification") is not False:
            errors.append("status.json: verification must not auto-execute environments")
        if environment_capture.get("binds_vendored_restoration_artifacts") is not True:
            errors.append("status.json: signed restoration-artifact binding drift")


        runtime_evidence = mvp.get("runtime_evidence", {})
        three_host = runtime_evidence.get("three_host_oci", {})
        if three_host.get("passed") is not True or three_host.get("architecture_variation") is not True or three_host.get("host_os_variation") is not True:
            errors.append("status.json: three-host OCI evidence drift")
        engines = runtime_evidence.get("oci_engines", {})
        if engines.get("docker_vs_rootful_podman_passed") is not True or engines.get("runtime_identity_captured") is not True:
            errors.append("status.json: OCI engine evidence drift")
        if engines.get("rootless_podman_container_execution_established") is not False:
            errors.append("status.json: rootless Podman portability overclaim")
        restoration = runtime_evidence.get("dependency_restoration", {})
        for key in [
            "python_hash_locked_wheel_restore_passed",
            "r_renv_lock_restore_passed",
            "offline_network_disabled_builds",
            "vendored_restoration_artifacts_signed",
            "native_extension_hashes_captured",
            "native_extension_binary_differs_across_architecture",
            "scientific_output_byte_identical_across_architecture",
        ]:
            if restoration.get(key) is not True:
                errors.append(f"status.json: restoration/runtime evidence drift: {key}")

        adaptive_scheduler = mvp.get("adaptive_scheduler", {})
        if adaptive_scheduler.get("scheduler_format") != "pcs-replay-scheduler-v1":
            errors.append("status.json: adaptive scheduler format drift")
        if adaptive_scheduler.get("telemetry_format") != "pcs-replay-telemetry-v1":
            errors.append("status.json: scheduler telemetry format drift")
        if adaptive_scheduler.get("report_format") != "pcs-scheduler-report-v1":
            errors.append("status.json: scheduler report format drift")
        if adaptive_scheduler.get("default_strategy") != "manifest":
            errors.append("status.json: scheduler default strategy drift")
        if adaptive_scheduler.get("all_mandatory_checks_execute") is not True:
            errors.append("status.json: scheduler mandatory-check invariant drift")
        if adaptive_scheduler.get("scientific_verdict_uses_scheduler") is not False:
            errors.append("status.json: scheduler entered scientific verdict boundary")
        if adaptive_scheduler.get("persisted_evidence_ids_sha256_derived") is not True:
            errors.append("status.json: scheduler telemetry privacy drift")
        cold = adaptive_scheduler.get("cold_start_guard", {})
        if cold.get("minimum_total_observations") != 20 or cold.get("minimum_per_current_check_type") != 3:
            errors.append("status.json: scheduler cold-start threshold drift")
        if cold.get("fallback_strategy") != "failure-per-second":
            errors.append("status.json: scheduler fallback strategy drift")
        runtime_scheduler = adaptive_scheduler.get("direct_runtime_check", {})
        if runtime_scheduler.get("bandit_ready") is not True:
            errors.append("status.json: scheduler runtime readiness evidence drift")
        if runtime_scheduler.get("all_mandatory_checks_preserved") is not True:
            errors.append("status.json: scheduler runtime mandatory-check evidence drift")
        if runtime_scheduler.get("counterfactual_speedup_vs_manifest") != 11.0:
            errors.append("status.json: scheduler direct-runtime estimate drift")
        if runtime_scheduler.get("cold_start_fallback_verified") is not True:
            errors.append("status.json: scheduler cold-start runtime evidence drift")
        if adaptive_scheduler.get("production_workload_speedup_established") is not False:
            errors.append("status.json: scheduler overclaims production speedup")
        reviewer_receipts = mvp.get("reviewer_receipts", {})
        if reviewer_receipts.get("signature_format") != "pcs-reviewer-receipt-ed25519-v1":
            errors.append("status.json: reviewer receipt signature format drift")
        if reviewer_receipts.get("exact_receipt_sha256_bound") is not True:
            errors.append("status.json: reviewer receipt exact-byte binding drift")
        if reviewer_receipts.get("separate_reviewer_identity") is not True:
            errors.append("status.json: reviewer identity separation drift")
        if reviewer_receipts.get("independent_verify_command") != "pcs verify-receipt-v06":
            errors.append("status.json: reviewer receipt verify-command drift")
        reviewer_quorum = mvp.get("reviewer_quorum", {})
        if reviewer_quorum.get("policy_version") != "pcs-review-quorum-policy-v1":
            errors.append("status.json: reviewer quorum policy version drift")
        if reviewer_quorum.get("review_set_format") != "pcs-review-set-v1":
            errors.append("status.json: reviewer review-set format drift")
        if reviewer_quorum.get("result_format") != "pcs-review-quorum-result-v1":
            errors.append("status.json: reviewer quorum result format drift")
        if reviewer_quorum.get("command") != "pcs verify-quorum-v06":
            errors.append("status.json: reviewer quorum command drift")
        if reviewer_quorum.get("role_specific_policy_hashes") is not True:
            errors.append("status.json: reviewer quorum role-policy binding drift")
        if reviewer_quorum.get("duplicate_reviewer_identity_disqualified") is not True:
            errors.append("status.json: duplicate reviewer protection drift")
        if reviewer_quorum.get("cross_bundle_reviews_never_combined") is not True:
            errors.append("status.json: cross-bundle quorum isolation drift")
        quorum_runtime = reviewer_quorum.get("direct_runtime_check", {})
        for key in [
            "two_of_three_with_required_roles_passed",
            "cross_bundle_reviews_not_combined",
            "duplicate_identity_not_double_counted",
            "role_specific_policy_hash_enforced",
        ]:
            if quorum_runtime.get(key) is not True:
                errors.append(f"status.json: reviewer quorum runtime evidence drift: {key}")
        runtime_receipt = reviewer_receipts.get("runtime_scheme_check", {})
        if runtime_receipt.get("valid_signature_verified") is not True or runtime_receipt.get("one_byte_tamper_rejected") is not True or runtime_receipt.get("wrong_reviewer_key_rejected") is not True:
            errors.append("status.json: reviewer receipt runtime scheme evidence drift")
        product_gate = mvp.get("product_hardening_gate", {})
        if product_gate.get("status") != "PASS":
            errors.append("status.json: product hardening gate not marked PASS")
        if product_gate.get("tested_checkpoint") != "9a17359b99517d97ef484e143337af3f82d35d4d":
            errors.append("status.json: product hardening checkpoint drift")
        if product_gate.get("focused_attack_cases") != 12:\n            errors.append("status.json: focused adversarial attack-count drift")\n        for key in [\n            "golden_examples_passed",
            "adversarial_hardening_passed",
            "local_trust_profile_verification_passed",
            "standalone_linux_verifier_built_and_smoke_tested",
        ]:
            if product_gate.get(key) is not True:
                errors.append(f"status.json: product hardening invariant drift: {key}")
        golden = mvp.get("golden_examples", {})
        if golden.get("format") != "pcs-golden-examples-v06-v1":
            errors.append("status.json: golden example format drift")
        if golden.get("cases") != ["pkpd-supported", "pkpd-falsified", "environment-bound"]:
            errors.append("status.json: golden example case set drift")
        if golden.get("byte_determinism_tested") is not True:
            errors.append("status.json: golden example determinism drift")
        reviewer_verifier = mvp.get("reviewer_verifier", {})
        if reviewer_verifier.get("trust_profile_format") != "pcs-verifier-trust-v1":
            errors.append("status.json: reviewer trust-profile format drift")
        if reviewer_verifier.get("one_command_cli") != "pcs verify-local-v06":
            errors.append("status.json: reviewer one-command CLI drift")
        if reviewer_verifier.get("linux_single_file_ci_smoke_tested") is not True:
            errors.append("status.json: Linux standalone verifier CI evidence drift")
        if reviewer_verifier.get("schema_resources_explicitly_bundled") is not True:
            errors.append("status.json: standalone verifier schema bundling drift")

        gate = mvp.get("latest_hosted_gate", {})
        if gate.get("provider") != "CircleCI" or gate.get("status") != "PASS" or gate.get("code_result") != "PASS" or gate.get("full_runtime_executed") is not True:
            errors.append("status.json: hosted runtime-gate evidence drift")
        if gate.get("tested_checkpoint") != "3e93573e0875da422340ad5e8d5e29f623c1eadc":
            errors.append("status.json: runtime-gate checkpoint drift")
        if mvp.get("released") is not False:
            errors.append("status.json: v0.6 MVP candidate marked released")
        if browser.get("specification") != "pcs-0.5":
            errors.append("status.json: legacy browser profile version drift")
        if browser.get("decision_vectors_passed") != 11 or browser.get("decision_vectors_total") != 11:
            errors.append("status.json: browser decision parity count drift")
        if preview.get("target") != "full-v0.6-runtime-gate-external-design-partner-pilot-real-scheduler-telemetry-and-exact-v0.6-v2-formal-port" or preview.get("status") != "OPEN":
            errors.append("status.json: next refinement status drift")
        if preview.get("released") is not False:
            errors.append("status.json: open refinement marked released")
        real_world = status.get("real_world_validation", {})
        if real_world.get("cases") != 5 or real_world.get("matched_expected") != 5 or real_world.get("unexpected") != 0:
            errors.append("status.json: real-world validation summary drift")
        if real_world.get("full_attest_verify_roundtrip_executed") is not False:
            errors.append("status.json: real-world validation overclaims full round trip")
        if real_world.get("hosted_runner_status") != "RUNNER_UNAVAILABLE":
            errors.append("status.json: real-world hosted-runner caveat drift")
        if status.get("contact") != CONTACT:
            errors.append("status.json: contact address drift")
    except Exception as exc:
        errors.append(f"status.json: invalid public status: {type(exc).__name__}: {exc}")

policy_fixture = ROOT / "reviewer-policy.example.json"
if policy_fixture.exists():
    try:
        policy = json.loads(policy_fixture.read_text(encoding="utf-8"))
        if policy.get("policy_version") != "pcs-acceptance-policy-v1":
            errors.append("reviewer-policy.example.json: policy version drift")
        if policy.get("require_signature") is not True:
            errors.append("reviewer-policy.example.json: signature requirement drift")
        required_claims = policy.get("required_claims", {})
        expected_claims = {"C_PKPD_CONTRACT", "C_PKPD_REPLAY"}
        if set(required_claims) != expected_claims:
            errors.append("reviewer-policy.example.json: required claim set drift")
        for claim_id in expected_claims:
            if required_claims.get(claim_id) != ["COMPUTATIONALLY_SUPPORTED"]:
                errors.append(f"reviewer-policy.example.json: unexpected status requirement for {claim_id}")
    except Exception as exc:
        errors.append(f"reviewer-policy.example.json: invalid policy fixture: {type(exc).__name__}: {exc}")

quorum_policy_fixture = ROOT / "review-quorum-policy.example.json"
if quorum_policy_fixture.exists():
    try:
        qp = json.loads(quorum_policy_fixture.read_text(encoding="utf-8"))
        if qp.get("policy_version") != "pcs-review-quorum-policy-v1":
            errors.append("review-quorum-policy.example.json: policy version drift")
        if qp.get("min_accepted_reviews") != 2:
            errors.append("review-quorum-policy.example.json: threshold drift")
        if qp.get("required_roles") != {"computational": 1, "domain": 1}:
            errors.append("review-quorum-policy.example.json: required role drift")
        reviewers = qp.get("reviewers", [])
        if len(reviewers) != 3:
            errors.append("review-quorum-policy.example.json: reviewer count drift")
    except Exception as exc:
        errors.append(f"review-quorum-policy.example.json: invalid fixture: {type(exc).__name__}: {exc}")

review_set_fixture = ROOT / "review-set.example.json"
if review_set_fixture.exists():
    try:
        rs = json.loads(review_set_fixture.read_text(encoding="utf-8"))
        if rs.get("format") != "pcs-review-set-v1":
            errors.append("review-set.example.json: format drift")
        if len(rs.get("reviews", [])) != 3:
            errors.append("review-set.example.json: review count drift")
    except Exception as exc:
        errors.append(f"review-set.example.json: invalid fixture: {type(exc).__name__}: {exc}")

mvp_page = ROOT / "mvp.html"
mvp_js = ROOT / "mvp.js"
if mvp_page.exists() and mvp_js.exists():
    mvp_html = mvp_page.read_text(encoding="utf-8")
    mvp_script = mvp_js.read_text(encoding="utf-8")
    for scheduler_id in [
        "schedulerHistoryMode",
        "evaluateScheduler",
        "schedulerReady",
        "schedulerEffective",
        "schedulerCoverage",
        "schedulerTtf",
        "schedulerTrace",
    ]:
        if f'id="{scheduler_id}"' not in mvp_html:
            errors.append(f"mvp.html: missing adaptive scheduler lab id {scheduler_id}")
    if "function evaluateSchedulerLab()" not in mvp_script:
        errors.append("mvp.js: adaptive scheduler lab function missing")
    if "scientific_verdict_uses_scheduler: false" not in mvp_script:
        errors.append("mvp.js: scheduler verdict-boundary demonstration drift")

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

print(f"SITE CHECK: PASS ({len(HTML_FILES)} HTML pages, v0.6 mainline + cross-machine/runtime/restoration evidence + legacy v0.5 fixture bound)")
