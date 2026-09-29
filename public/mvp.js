const $ = id => document.getElementById(id);

const GOOD = "COMPUTATIONALLY_SUPPORTED";
const FAILED = "FALSIFIED_OR_CHECK_FAILED";
const OPEN = "OPEN";
const FORMAL = "FORMALLY_VERIFIED_UNDER_ASSUMPTIONS";
const DEMO_FINGERPRINT = "65b60673d6ed884bf01c2c222d82ada0740f29ac3355d6a925c81f17f47a27b8";

function setStatus(cardId, valueId, state, value) {
  const card = $(cardId);
  card.classList.remove("pass", "fail", "warn", "na");
  card.classList.add(state);
  $(valueId).textContent = value;
}

function utf8(text) {
  return new TextEncoder().encode(text);
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", utf8(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function policyObject() {
  return {
    policy_version: "pcs-acceptance-policy-v1",
    require_signature: true,
    expected_signer_fingerprint: $("signerMatch").checked ? DEMO_FINGERPRINT : "0".repeat(64),
    required_claims: {
      C_PKPD_CONTRACT: [GOOD],
      C_PKPD_REPLAY: [$("requiredReplayStatus").value]
    }
  };
}

function policyBytes(policy) {
  return JSON.stringify(policy, null, 2) + "\n";
}

function claimDot(id, decision) {
  const dot = $(id);
  dot.className = "dot " + (decision === GOOD || decision === FORMAL ? "pass" : decision === OPEN ? "" : "fail");
}

async function evaluate() {
  const tampered = $("tamperPackage").checked;
  const replayDecision = $("replayDecision").value;
  const policy = policyObject();
  const policyText = policyBytes(policy);
  const policyHash = await sha256Hex(policyText);

  const valid = !tampered;
  const claims = {
    C_PKPD_CONTRACT: GOOD,
    C_PKPD_REPLAY: replayDecision
  };

  const failures = [];
  if (!valid) {
    failures.push({
      type: "package_verification",
      reason: "reviewer policy cannot accept a package that failed PCS verification",
      failed_stage: "package_binding"
    });
    failures.push({
      type: "signature",
      reason: "valid signed package verification required"
    });
  }

  for (const [claimId, allowed] of Object.entries(policy.required_claims)) {
    const actual = claims[claimId] ?? "MISSING";
    if (!allowed.includes(actual)) {
      failures.push({
        type: "claim_status",
        claim_id: claimId,
        actual,
        allowed
      });
    }
  }

  const signerMatches = policy.expected_signer_fingerprint === DEMO_FINGERPRINT;
  if (!signerMatches) {
    failures.push({
      type: "signer",
      reason: "signer fingerprint does not match reviewer policy",
      expected: policy.expected_signer_fingerprint,
      actual: DEMO_FINGERPRINT
    });
  }

  const policyPass = failures.length === 0;
  const accepted = valid && policyPass;

  setStatus("pcsValidityCard", "pcsValidity", valid ? "pass" : "fail", valid ? "VALID" : "INVALID");
  setStatus("acceptanceCard", "acceptanceStatus", accepted ? "pass" : "fail", accepted ? "ACCEPTED" : "REJECTED");
  setStatus("signerPolicyCard", "signerPolicyStatus", signerMatches ? "pass" : "fail", signerMatches ? "MATCH" : "MISMATCH");
  setStatus("policyHashCard", "policyHashShort", "pass", policyHash.slice(0, 12) + "…");

  $("contractPolicyText").textContent = GOOD;
  $("replayPolicyText").textContent = replayDecision;
  claimDot("contractPolicyDot", GOOD);
  claimDot("replayPolicyDot", replayDecision);

  const failureBox = $("policyFailures");
  failureBox.innerHTML = "";
  if (!failures.length) {
    const p = document.createElement("p");
    p.className = "successline";
    p.textContent = "Policy passed. All required claim statuses and signer constraints are satisfied.";
    failureBox.appendChild(p);
  } else {
    const ul = document.createElement("ul");
    ul.className = "errorlist";
    for (const failure of failures) {
      const li = document.createElement("li");
      if (failure.type === "claim_status") {
        li.textContent = `${failure.claim_id}: ${failure.actual}; allowed = ${failure.allowed.join(", ")}`;
      } else if (failure.type === "signer") {
        li.textContent = "Signer fingerprint does not match reviewer policy.";
      } else if (failure.type === "package_verification") {
        li.textContent = "PCS package verification failed before policy acceptance.";
      } else {
        li.textContent = failure.reason || failure.type;
      }
      ul.appendChild(li);
    }
    failureBox.appendChild(ul);
  }

  const receipt = {
    format: "pcs-end-to-end-verifier-v06-v1",
    valid,
    accepted,
    failed_stage: valid ? null : "package_binding",
    public_key_fingerprint: DEMO_FINGERPRINT,
    claims: [
      { claim_id: "C_PKPD_CONTRACT", decision: GOOD },
      { claim_id: "C_PKPD_REPLAY", decision: replayDecision }
    ],
    reviewer_policy: {
      applied: true,
      policy_version: policy.policy_version,
      pass: policyPass,
      policy_sha256: policyHash,
      required_claims: policy.required_claims,
      require_signature: true,
      expected_signer_fingerprint: policy.expected_signer_fingerprint,
      failures
    }
  };

  $("policyReceipt").textContent = JSON.stringify(receipt, null, 2);
  $("policyExample").textContent = policyText.trimEnd();
}

function reset() {
  $("tamperPackage").checked = false;
  $("replayDecision").value = GOOD;
  $("requiredReplayStatus").value = GOOD;
  $("signerMatch").checked = true;
  ["pcsValidityCard", "acceptanceCard", "signerPolicyCard", "policyHashCard"].forEach(id => {
    const card = $(id);
    card.classList.remove("pass", "fail", "warn");
    card.classList.add("na");
  });
  $("pcsValidity").textContent = "NOT RUN";
  $("acceptanceStatus").textContent = "NOT RUN";
  $("signerPolicyStatus").textContent = "NOT RUN";
  $("policyHashShort").textContent = "NOT RUN";
  $("contractPolicyText").textContent = GOOD;
  $("replayPolicyText").textContent = GOOD;
  $("contractPolicyDot").className = "dot pass";
  $("replayPolicyDot").className = "dot pass";
  $("policyFailures").innerHTML = '<p class="tiny">Evaluate the policy to see failures.</p>';
  $("policyReceipt").textContent = '{ "status": "not evaluated" }';
  $("policyExample").textContent = JSON.stringify({
    policy_version: "pcs-acceptance-policy-v1",
    require_signature: true,
    required_claims: {
      C_PKPD_CONTRACT: [GOOD],
      C_PKPD_REPLAY: [GOOD]
    }
  }, null, 2);
}

$("evaluatePolicy").addEventListener("click", evaluate);
$("resetPolicy").addEventListener("click", reset);
$("tamperPackage").addEventListener("change", evaluate);
$("replayDecision").addEventListener("change", evaluate);
$("requiredReplayStatus").addEventListener("change", evaluate);
$("signerMatch").addEventListener("change", evaluate);
$("copyPolicy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("policyExample").textContent + "\n");
    $("copyPolicy").textContent = "Copied";
    setTimeout(() => $("copyPolicy").textContent = "Copy policy JSON", 1200);
  } catch {
    $("copyPolicy").textContent = "Select + copy";
  }
});

reset();
evaluate();
