import {validatePromotionMappings,stagePromotion,verifyPromotion,mergePromotion,closeSupersededPromotionPr} from "./production-promotion.js";
import {
  integrationRepository, validateContributorFiles, hashSubmissionText,
  githubConfigured, createSubmissionPullRequest, readSubmissionChecks,
  mergeStagedPullRequest, githubAccessReport
} from "./contribution-github.js";

const SESSION_COOKIE = "pcs_commons_session";
const SESSION_DAYS = 30;
const ADMIN_SESSION_COOKIE = "pcs_admin_session";
const ADMIN_SESSION_HOURS = 8;
const AUDIT_GENESIS = "PCS-AUDIT-GENESIS-v1";
const PASSWORD_ITERATIONS = 100000; // Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
const TERMS_VERSION = "commons-v1";

const ADMIN_EVIDENCE_MAX_FILES = 4;
const ADMIN_EVIDENCE_MAX_FILE_BYTES = 2 * 1024 * 1024;
const ADMIN_EVIDENCE_MAX_TOTAL_BYTES = 6 * 1024 * 1024;
const ADMIN_EVIDENCE_CHUNK_BYTES = 256 * 1024;
const ADMIN_EVIDENCE_EXTENSIONS = new Set(["pdf","txt","md","csv","json","log","lean","py","png","jpg","jpeg","webp"]);
const ADMIN_EVIDENCE_CONTENT_TYPES = {
  pdf:"application/pdf",
  txt:"text/plain; charset=utf-8",
  md:"text/markdown; charset=utf-8",
  csv:"text/csv; charset=utf-8",
  json:"application/json; charset=utf-8",
  log:"text/plain; charset=utf-8",
  lean:"text/plain; charset=utf-8",
  py:"text/plain; charset=utf-8",
  png:"image/png",
  jpg:"image/jpeg",
  jpeg:"image/jpeg",
  webp:"image/webp",
};

const TRACKS = new Set(["nontechnical","research","python","ml","biology","security","lean","review"]);
const COMP_PREFS = new Set(["either","volunteer","paid-only"]);
const SKILLS = new Set(["nontechnical","research","python","ml","biology","security","lean","review"]);
const STATE_METHODS = new Set(["POST","PUT","PATCH","DELETE"]);

class ApiError extends Error {
  constructor(status, message, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function addHoursIso(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString();
}

function addDaysIso(iso, days) {
  return new Date(new Date(iso).getTime() + days * 86400000).toISOString();
}

function addBusinessDaysIso(iso, count) {
  const d = new Date(iso);
  let remaining = count;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return d.toISOString();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

function cleanText(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function randomInt(min, max) {
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
}

function shuffled(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function choiceQuestion(id, prompt, correct, distractors) {
  const labels = shuffled([correct, ...distractors]);
  const options = labels.map((label, index) => ({ id: String(index + 1), label }));
  const answer = options.find(option => option.label === correct)?.id;
  return { question: { id, type: "single_choice", prompt, options }, answer };
}

function buildCompetencyEvaluation(skill) {
  const questions = [];
  const key = {};
  const add = item => { questions.push(item.question); key[item.question.id] = item.answer; };
  const n = randomInt(12, 47);
  const budget = randomInt(3, 8);
  const risk = randomInt(1, 10);
  const thresholdPct = randomInt(72, 92);
  const observedPct = randomInt(65, 98);
  const token = "tok-" + randomInt(100, 999);
  const residue = randomInt(8, 80);
  const proposition = ["P","Q","Safe","Invariant"][randomInt(0,3)];

  if (skill === "research") {
    add(choiceQuestion("q1", n + " committed evaluation traces satisfy a bounded policy. What is directly supported?", "Those " + n + " committed traces satisfy the bounded policy.", ["All future deployments are safe.", "The model is globally safe.", "The policy is empirically complete."]));
    add(choiceQuestion("q2", "A committed log is safe, but no premise connects it to the deployed run. What is missing?", "An explicit correspondence premise such as a faithful-log assumption.", ["A larger font in the report.", "A second copy of the same log.", "A stronger reviewer preference."]));
    add(choiceQuestion("q3", "A declared metric must be at least " + thresholdPct + "%. The measured value is " + observedPct + "%. How should this exact threshold claim be classified?", observedPct >= thresholdPct ? "Supported by this measurement." : "Falsified by this measurement.", observedPct >= thresholdPct ? ["Falsified by this measurement.", "Globally proved.", "Not measurable."] : ["Supported by this measurement.", "Globally proved.", "Not measurable."]));
    add(choiceQuestion("q4", "A report observes correlation between two variables and concludes one caused the other. What is the main issue?", "The causal conclusion is stronger than the evidence shown.", ["Correlation automatically proves causation.", "The claim becomes formal because it uses numbers.", "No assumptions need to be stated."]));
    add(choiceQuestion("q5", "A result is reproduced on the same committed dataset but no evidence addresses a new population. What is the safest conclusion?", "Reproduction supports the bounded result but not automatic generalization to the new population.", ["The new population is proved equivalent.", "Reproduction removes the need for external validity.", "Any replicated computation is universally valid."]));
    add(choiceQuestion("q6", "A hypothesis was chosen only after inspecting the final result. What should a careful reviewer request?", "Clear disclosure that the analysis is post hoc rather than treating it as pre-specified confirmation.", ["Hide the selection step.", "Treat the hypothesis as preregistered.", "Remove the raw evidence."]));
  } else if (skill === "python") {
    add(choiceQuestion("q1", "A checker catches every exception and returns True. What security property does that violate?", "Fail-closed behavior.", ["Deterministic iteration.", "Stable sorting.", "UTF-8 decoding."]));
    add(choiceQuestion("q2", "A risk checker accepts exactly when risk <= budget. Here risk=" + risk + " and budget=" + budget + ". What should it return?", risk <= budget ? "ACCEPT" : "REJECT", risk <= budget ? ["REJECT", "UNKNOWN", "RETRY"] : ["ACCEPT", "UNKNOWN", "RETRY"]));
    add(choiceQuestion("q3", "Authorization token " + token + " has already been consumed. A second request presents the same token. What should a single-use checker do?", "Reject the second use.", ["Accept because the signature is unchanged.", "Reset the consumed set.", "Ignore token state."]));
    add(choiceQuestion("q4", "A test only asserts that valid input passes. Which addition best protects against a fail-open regression?", "A negative test proving malformed/unauthorized input is rejected.", ["A longer variable name.", "A print statement.", "A second positive-only test."]));
    add(choiceQuestion("q5", "A parser receives a required field with the wrong type. What should an assurance checker do?", "Reject the input rather than silently coerce it into a passing value.", ["Guess the intended type.", "Drop the field and continue as PASS.", "Reuse the previous request's value."]));
    add(choiceQuestion("q6", "A mutation test flips one authorization bit but the checker still returns ACCEPT. What is the strongest interpretation?", "The checker or its tests likely have a missing binding or fail-open path that needs investigation.", ["The mutation proves robustness.", "Authorization bits are always irrelevant.", "The test should be deleted."]));
  } else if (skill === "security") {
    add(choiceQuestion("q1", "A signed authorization token is reused after consumption. What is the primary threat?", "Replay of previously authorized authority.", ["Lossless compression.", "Floating-point rounding.", "CSS overflow."]));
    add(choiceQuestion("q2", "A token authorizes read:data but is presented for write:data. What should a scope-aware verifier do?", "Reject because the requested scope is not authorized.", ["Accept because the signer is valid.", "Broaden the scope automatically.", "Ignore the operation field."]));
    add(choiceQuestion("q3", "A token expired " + randomInt(1,24) + " hours ago but has a valid signature. What should the verifier do?", "Reject it as expired.", ["Accept it because signatures override expiry.", "Extend it automatically.", "Treat expiry as cosmetic metadata."]));
    add(choiceQuestion("q4", "An insider signs a payload that violates the declared safety invariant. What does signature validity establish?", "Who signed the payload—not that its domain semantics are safe.", ["That the payload is safe.", "That every policy accepts it.", "That replay is unnecessary."]));
    add(choiceQuestion("q5", "A valid signature is checked against a public key supplied inside the untrusted package itself, with no trusted binding to the expected signer. What attack remains?", "Signer/key substitution: an attacker can provide their own key and matching signature.", ["Compression oracle only.", "CSS injection only.", "The signature becomes information-theoretically secure."]));
    add(choiceQuestion("q6", "A policy is checked, then changed before the protected action executes. Which class of bug is this?", "A time-of-check/time-of-use consistency problem.", ["A typography problem.", "A harmless cache miss.", "A proof that the action is authorized forever."]));
  } else if (skill === "ml") {
    const overlap = randomInt(1, 15);
    add(choiceQuestion("q1", "The test split shares " + overlap + "% of examples with training data. What is the main evaluation problem?", "Train/test leakage compromises independence.", ["The metric is automatically conservative.", "The model becomes formally verified.", "The overlap improves provenance."]));
    add(choiceQuestion("q2", "Hyperparameters are repeatedly selected using the final test set. What happens to the test set?", "It is no longer an untouched independent final evaluation.", ["It becomes a training checksum.", "It proves generalization.", "Nothing changes."]));
    add(choiceQuestion("q3", "A rare harmful class is 2% of data and a model predicts the majority class always. Which statement is safest?", "High overall accuracy can hide failure on the rare harmful class.", ["Accuracy alone proves the evaluator is adequate.", "Class imbalance cannot affect interpretation.", "A majority predictor is necessarily safe."]));
    add(choiceQuestion("q4", "A result is signed but the evaluator/dataset identifiers are not bound to the receipt. What attack remains?", "Substituting a different evaluator or dataset while reusing the result.", ["Integer overflow in CSS.", "Loss of email delivery.", "A theorem becoming an axiom automatically."]));
    add(choiceQuestion("q5", "Overall accuracy improves, but performance on the safety-critical subgroup falls sharply. What should the report do?", "Report the subgroup failure explicitly instead of treating aggregate improvement as sufficient.", ["Hide subgroup metrics.", "Average away the subgroup because it is smaller.", "Declare global safety from overall accuracy."]));
    add(choiceQuestion("q6", "An evaluator is tuned repeatedly until one benchmark score rises, with no held-out confirmation. What risk increases?", "Overfitting the evaluation process to that benchmark.", ["Cryptographic key rotation.", "Lossless data compression.", "Formal completeness of the metric."]));
  } else if (skill === "biology") {
    add(choiceQuestion("q1", "A paper uses 1-based residue numbering. Residue " + residue + " corresponds to which zero-based array index?", String(residue - 1), [String(residue), String(residue + 1), String(Math.max(0,residue - 2))]));
    const score = randomInt(60, 95) / 100;
    const thr = randomInt(65, 90) / 100;
    add(choiceQuestion("q2", "A declared score threshold is >= " + thr.toFixed(2) + ". The committed score is " + score.toFixed(2) + ". What does the checker conclude?", score >= thr ? "Threshold satisfied." : "Threshold not satisfied.", score >= thr ? ["Threshold not satisfied.", "Biological function proved.", "Clinical validity proved."] : ["Threshold satisfied.", "Biological function proved.", "Clinical validity proved."]));
    const conserved = randomInt(6, 10), total = 10;
    add(choiceQuestion("q3", conserved + " of " + total + " aligned homologues conserve a residue. What exact empirical fraction is shown?", (conserved/total).toFixed(1), [((conserved-1)/total).toFixed(1), "1.0", "0.0"]));
    add(choiceQuestion("q4", "A committed sequence/score artifact passes its computational checker. What still needs separate evidence?", "That the committed bytes faithfully represent the relevant external biological object and interpretation.", ["That bytes can be hashed.", "That JSON has braces.", "That the checker returned a boolean."]));
    add(choiceQuestion("q5", "A residue is conserved in the aligned sequences, but the alignment around that position is ambiguous. What is the careful interpretation?", "The conservation claim depends on the alignment and should carry that uncertainty.", ["Ambiguous alignment proves functional conservation.", "Alignment uncertainty can be ignored once a percentage is computed.", "The residue identity proves mechanism."]));
    add(choiceQuestion("q6", "A computational pocket score exceeds its threshold. Which statement goes beyond that checker alone?", "The molecule will bind in vivo with clinically useful affinity.", ["The committed score exceeds the declared threshold.", "The exact score can be compared with the threshold.", "The artifact can be hashed and bound."]));
  } else if (skill === "lean") {
    add(choiceQuestion("q1", "Lean theorem: theorem keep (h : " + proposition + ") : " + proposition + " := h. What does it establish?", proposition + " under the explicit premise h : " + proposition + ".", ["An unconditional proof of " + proposition + ".", "That every proposition is true.", "That the external world satisfies " + proposition + "."]));
    add(choiceQuestion("q2", "A theorem compiles only because its proof contains sorry. How should PCS treat it?", "Reject it as a proof escape.", ["Accept it because compilation succeeded.", "Treat sorry as a cryptographic signature.", "Upgrade it to L6 authority."]));
    add(choiceQuestion("q3", "A Lean theorem proves x = x by rfl, while prose claims a complex safety property. What is authoritative?", "The exact formal theorem statement, not the stronger prose.", ["The prose automatically expands the theorem.", "Compilation proves every nearby comment.", "The longer sentence is authoritative."]));
    add(choiceQuestion("q4", "Why inspect theorem axiom dependencies after a successful build?", "To detect hidden assumptions or nonstandard trust dependencies behind the theorem.", ["To improve CSS.", "To create more test users.", "To make hashes shorter."]));
    add(choiceQuestion("q5", "A theorem proves an implementation result only under hypothesis H. The report omits H and states the result unconditionally. What is wrong?", "The prose overstates the formal theorem by dropping an explicit premise.", ["Lean automatically discharges every omitted premise.", "Comments are stronger than theorem types.", "A compiled theorem has no assumptions."]));
    add(choiceQuestion("q6", "Two executable checkers are claimed equivalent, but no refinement/equality theorem connects them. What remains open?", "Whether the executable behavior really implements the proved specification on all relevant inputs.", ["Whether Lean supports booleans.", "Whether source files can contain whitespace.", "Nothing; matching names prove equivalence."]));
  } else if (skill === "review") {
    add(choiceQuestion("q1", "A root obligation depends on child A=PROVED and child B=OPEN. Under conjunctive composition, what is the root?", "Not closed; the OPEN dependency prevents acceptance.", ["PROVED because one child passed.", "Automatically waived.", "Equivalent to reviewer preference."]));
    add(choiceQuestion("q2", "A proof-obligation graph contains two nodes with the same identifier but different claims. What should a fail-closed checker do?", "Reject the graph as ambiguous/invalid.", ["Choose the first silently.", "Average the two claims.", "Mark both proved."]));
    add(choiceQuestion("q3", "A package is valid and the typed claim is supported, but reviewer policy requires a different signer. What can happen?", "The reviewer can decline acceptance while the verified scientific record remains valid.", ["Package validity must become false.", "The claim must be rewritten as true.", "Signer policy is irrelevant."]));
    add(choiceQuestion("q4", "Why bind a receipt to exact package/certificate hashes?", "So the review decision cannot be silently reused for different bytes.", ["To make the font smaller.", "To remove the need for replay.", "To let contributors self-approve."]));
    add(choiceQuestion("q5", "A dependency graph closes node A using B and closes B using A, with no independent base evidence. What should a reviewer flag?", "Circular support that does not independently discharge either obligation.", ["Two independent proofs.", "A valid quorum.", "Automatic completeness."]));
    add(choiceQuestion("q6", "A reviewer sees a PASS transcript but cannot bind it to the artifact under review. What is the right status?", "Insufficient evidence until the transcript is provenance-bound to the exact artifact.", ["Accept because PASS text is authoritative.", "Treat every transcript as a signature.", "Ignore provenance if the result is convenient."]));
  } else {
    throw new ApiError(400, "This skill does not have an automated competency screening.", "evaluation_unavailable");
  }

  const orderedQuestions = shuffled(questions).slice(0, Math.min(4, questions.length));
  const selectedKey = {};
  for (const question of orderedQuestions) selectedKey[question.id] = key[question.id];
  return {
    variant_token: randomToken(12),
    challenge: {
      version: "pcs-variable-competency-v1",
      skill,
      generated: true,
      objective_questions: orderedQuestions,
      manual_rationale_required: true,
      note: "Each attempt samples from a larger skill-specific scenario bank, randomizes scenario parameters and question order, and shuffles answer choices. Passing the auto-score is evidence for manual review, never automatic authority."
    },
    answer_key: selectedKey,
    max_score: orderedQuestions.length,
    pass_score: Math.ceil(orderedQuestions.length * 0.75),
  };
}

function b64url(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function randomToken(bytes = 32) {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return b64url(out);
}

async function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return b64url(await crypto.subtle.digest("SHA-256", bytes));
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

function evidenceExtension(name) {
  const safe = String(name || "").trim();
  const dot = safe.lastIndexOf(".");
  return dot > 0 ? safe.slice(dot + 1).toLowerCase() : "";
}

function evidenceName(name) {
  return String(name || "evidence")
    .replace(/[\\/\0\r\n]/g, "_")
    .trim()
    .slice(0, 180) || "evidence";
}

function looksLikeUtf8Text(bytes) {
  if (!bytes?.length) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 65536));
  let controls = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) controls++;
  }
  return controls <= Math.max(2, Math.floor(sample.length * 0.01));
}

function evidenceContentMatches(ext, bytes) {
  if (ext === "pdf") {
    return bytes.length >= 5 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (ext === "png") {
    const sig=[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a];
    return bytes.length>=8 && sig.every((value,index)=>bytes[index]===value);
  }
  if (ext === "jpg" || ext === "jpeg") {
    return bytes.length>=3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff;
  }
  if (ext === "webp") {
    return bytes.length>=12 &&
      String.fromCharCode(...bytes.subarray(0,4))==="RIFF" &&
      String.fromCharCode(...bytes.subarray(8,12))==="WEBP";
  }
  return looksLikeUtf8Text(bytes);
}

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function validateEvidenceRefs(env, admin, ids) {
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map(v => String(v || "").trim()).filter(Boolean))];
  if (unique.length > ADMIN_EVIDENCE_MAX_FILES) throw new ApiError(400,"Too many evidence references.","too_many_evidence_files");
  if (!unique.length) return [];
  const placeholders = unique.map(() => "?").join(",");
  const rows = await env.COMMONS_DB.prepare(
    `SELECT id,original_name,content_type,extension,size_bytes,sha256_hex,created_at
     FROM admin_evidence_files
     WHERE id IN (${placeholders}) AND uploader_user_id=?`
  ).bind(...unique,admin.id).all();
  if ((rows.results || []).length !== unique.length) {
    throw new ApiError(400,"One or more evidence files are missing or were uploaded by a different administrator.","bad_evidence_reference");
  }
  const byId = new Map((rows.results || []).map(row => [row.id,row]));
  return unique.map(id => byId.get(id));
}

function auditEvidenceSummary(rows) {
  return (rows || []).map(row => ({
    id:row.id,
    name:row.original_name,
    content_type:row.content_type,
    size_bytes:Number(row.size_bytes),
    sha256:row.sha256_hex,
  }));
}

async function adminUploadEvidence(request, env, admin) {
  await rateLimit(request,env,"admin-evidence-upload",30,60);
  let form;
  try { form = await request.formData(); }
  catch { throw new ApiError(400,"Evidence upload must be multipart form data.","bad_evidence_upload"); }

  const purpose = cleanText(form.get("purpose"),100) || "admin_action";
  const subjectUserId = cleanText(form.get("subject_user_id"),80) || null;
  const rawFiles = form.getAll("files").filter(value => typeof File !== "undefined" && value instanceof File);
  if (!rawFiles.length) throw new ApiError(400,"Choose at least one evidence file.","no_evidence_files");
  if (rawFiles.length > ADMIN_EVIDENCE_MAX_FILES) {
    throw new ApiError(400,`Attach at most ${ADMIN_EVIDENCE_MAX_FILES} files per action.`,"too_many_evidence_files");
  }

  let total = 0;
  for (const file of rawFiles) {
    if (file.size <= 0) throw new ApiError(400,`${file.name || "A file"} is empty.`,"empty_evidence_file");
    if (file.size > ADMIN_EVIDENCE_MAX_FILE_BYTES) {
      throw new ApiError(400,`${file.name || "A file"} exceeds the 2 MiB per-file limit.`,"evidence_file_too_large");
    }
    total += file.size;
  }
  if (total > ADMIN_EVIDENCE_MAX_TOTAL_BYTES) {
    throw new ApiError(400,"Evidence files exceed the 6 MiB total limit.","evidence_total_too_large");
  }

  const uploader = await env.COMMONS_DB.prepare("SELECT email,display_name FROM users WHERE id=?").bind(admin.id).first();
  const createdAt = nowIso();
  const stored = [];

  for (const file of rawFiles) {
    const name = evidenceName(file.name);
    const ext = evidenceExtension(name);
    if (!ADMIN_EVIDENCE_EXTENSIONS.has(ext)) {
      throw new ApiError(400,`${name}: unsupported file type. Allowed: PDF, TXT, MD, CSV, JSON, LOG, LEAN, PY, PNG, JPG/JPEG, WEBP.`,"unsupported_evidence_type");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!evidenceContentMatches(ext,bytes)) {
      throw new ApiError(400,`${name}: file contents do not match the allowed ${ext.toUpperCase()} format.`,"evidence_type_mismatch");
    }
    const sha = await sha256Hex(bytes);
    const id = crypto.randomUUID();
    const chunkCount = Math.ceil(bytes.length / ADMIN_EVIDENCE_CHUNK_BYTES);
    const contentType = ADMIN_EVIDENCE_CONTENT_TYPES[ext] || "application/octet-stream";
    await env.COMMONS_DB.prepare(
      `INSERT INTO admin_evidence_files(
        id,uploader_user_id,uploader_email,uploader_name,purpose,subject_user_id,
        original_name,content_type,extension,size_bytes,sha256_hex,chunk_count,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,admin.id,uploader?.email||"",uploader?.display_name||"",purpose,subjectUserId,
      name,contentType,ext,bytes.length,sha,chunkCount,createdAt
    ).run();
    for (let index = 0; index < chunkCount; index++) {
      const start = index * ADMIN_EVIDENCE_CHUNK_BYTES;
      const end = Math.min(bytes.length,start + ADMIN_EVIDENCE_CHUNK_BYTES);
      await env.COMMONS_DB.prepare(
        "INSERT INTO admin_evidence_chunks(file_id,chunk_index,data_base64) VALUES(?,?,?)"
      ).bind(id,index,bytesToBase64(bytes.subarray(start,end))).run();
    }
    stored.push({id,original_name:name,content_type:contentType,extension:ext,size_bytes:bytes.length,sha256_hex:sha,created_at:createdAt});
  }

  await audit(env,admin.id,"admin_evidence_uploaded",subjectUserId?"user":"admin_action",subjectUserId||admin.id,{
    purpose,
    files:auditEvidenceSummary(stored),
  });
  return json({
    ok:true,
    files:stored.map(row=>({
      id:row.id,
      name:row.original_name,
      content_type:row.content_type,
      size_bytes:row.size_bytes,
      sha256:row.sha256_hex,
      download_url:`/api/admin/evidence/${encodeURIComponent(row.id)}`,
    })),
    limits:{max_files:ADMIN_EVIDENCE_MAX_FILES,max_file_bytes:ADMIN_EVIDENCE_MAX_FILE_BYTES,max_total_bytes:ADMIN_EVIDENCE_MAX_TOTAL_BYTES},
  },201);
}

async function adminDownloadEvidence(request, env, admin, fileId) {
  const file = await env.COMMONS_DB.prepare(
    `SELECT * FROM admin_evidence_files WHERE id=?`
  ).bind(fileId).first();
  if (!file) throw new ApiError(404,"Evidence file not found.","evidence_not_found");
  const chunks = await env.COMMONS_DB.prepare(
    "SELECT chunk_index,data_base64 FROM admin_evidence_chunks WHERE file_id=? ORDER BY chunk_index ASC"
  ).bind(fileId).all();
  if ((chunks.results || []).length !== Number(file.chunk_count)) {
    throw new ApiError(500,"Evidence file is incomplete.","evidence_corrupt");
  }
  const parts = (chunks.results || []).map(row => base64ToBytes(row.data_base64));
  const total = parts.reduce((sum,part)=>sum+part.length,0);
  if (total !== Number(file.size_bytes)) throw new ApiError(500,"Evidence file length does not match its immutable metadata.","evidence_corrupt");
  const bytes = new Uint8Array(total);
  let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const sha = await sha256Hex(bytes);
  if (sha !== file.sha256_hex) throw new ApiError(500,"Evidence file hash verification failed.","evidence_corrupt");

  await audit(env,admin.id,"admin_evidence_downloaded","evidence",file.id,{sha256:file.sha256_hex,name:file.original_name});
  return new Response(bytes,{
    status:200,
    headers:{
      "content-type":file.content_type || "application/octet-stream",
      "content-length":String(bytes.length),
      "content-disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      "cache-control":"no-store",
      "x-content-type-options":"nosniff",
    },
  });
}

async function derivePassword(password, saltB64, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64url(saltB64), iterations },
    key,
    256
  );
  return b64url(bits);
}

function fixedEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAge = SESSION_DAYS * 86400) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function adminSessionCookie(token, maxAge = ADMIN_SESSION_HOURS * 3600) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function clearAdminSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function requireSameOrigin(request) {
  if (!STATE_METHODS.has(request.method)) return;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new ApiError(403, "Cross-origin state changes are not allowed.", "bad_origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new ApiError(403, "Only same-origin browser state changes are allowed.", "bad_fetch_site");
  }
}

async function readBody(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 64000) throw new ApiError(413, "Request body is too large.", "body_too_large");
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "Expected JSON request body.", "bad_json");
  }
}


async function rateLimit(request, env, scope, maxCount, windowMinutes) {
  if (!env.RATE_LIMIT_SALT) {
    throw new ApiError(503, "Account abuse protection is not configured.", "rate_limit_unconfigured");
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = await sha256(`${env.RATE_LIMIT_SALT}:${scope}:${ip}`);
  const now = nowIso();
  const cutoff = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const row = await env.COMMONS_DB.prepare(
    `INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1)
     ON CONFLICT(key) DO UPDATE SET
       count=CASE WHEN rate_limits.window_start<? THEN 1 ELSE rate_limits.count+1 END,
       window_start=CASE WHEN rate_limits.window_start<? THEN excluded.window_start ELSE rate_limits.window_start END
     RETURNING count,window_start`
  ).bind(key, now, cutoff, cutoff).first();
  if (Number(row?.count || 0) > maxCount) {
    throw new ApiError(429, "Too many requests. Please wait and try again.", "rate_limited");
  }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    level: Number(row.level),
    technical_level: Number(row.level),
    display_level: Number(row.is_owner) ? 7 : Number(row.level),
    is_owner: Boolean(row.is_owner),
    governance_role: Number(row.is_owner) ? "owner" : row.role,
    role: row.role,
    status: row.status,
    email_verified: Boolean(row.email_verified),
    ai_policy_ack: Boolean(row.ai_policy_ack),
    availability_hours: Number(row.availability_hours || 1),
    track: row.track || "nontechnical",
    compensation_preference: row.compensation_preference || "either",
    profile_note: row.profile_note || "",
    created_at: row.created_at,
  };
}

async function currentUser(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.COMMONS_DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`
  ).bind(tokenHash, nowIso()).first();
  return row || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new ApiError(401, "Please sign in first.", "login_required");
  return user;
}

async function currentAdminUser(request, env) {
  const token = parseCookies(request)[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.COMMONS_DB.prepare(
    `SELECT u.* FROM admin_sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' AND u.role='admin'`
  ).bind(tokenHash, nowIso()).first();
  if (!row) return null;
  await env.COMMONS_DB.prepare("UPDATE admin_sessions SET last_seen_at=? WHERE token_hash=?").bind(nowIso(), tokenHash).run();
  return row;
}

async function requireAdmin(request, env) {
  const user = await currentAdminUser(request, env);
  if (!user) throw new ApiError(401, "Administrator sign-in required.", "admin_login_required");
  return user;
}

function isOwner(user) {
  return Boolean(Number(user?.is_owner || 0));
}

function protectOwnerTarget(user) {
  if (isOwner(user)) {
    throw new ApiError(403, "The PCS Founder/Owner account is protected and cannot be modified through delegated administration.", "owner_protected");
  }
}

async function requireOwner(request, env) {
  const user = await requireAdmin(request, env);
  if (!isOwner(user)) throw new ApiError(403, "PCS Founder/Owner authority required.", "owner_required");
  return user;
}

async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const created = nowIso();
  const expires = addDaysIso(created, SESSION_DAYS);
  await env.COMMONS_DB.prepare(
    "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)"
  ).bind(tokenHash, userId, created, expires, created).run();
  return token;
}

async function createAdminSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const created = nowIso();
  const expires = addHoursIso(created, ADMIN_SESSION_HOURS);
  await env.COMMONS_DB.prepare(
    "INSERT INTO admin_sessions(token_hash,user_id,created_at,expires_at,last_seen_at) VALUES(?,?,?,?,?)"
  ).bind(tokenHash, userId, created, expires, created).run();
  return token;
}

async function deleteSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  await env.COMMONS_DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
}

async function deleteAdminSession(request, env) {
  const token = parseCookies(request)[ADMIN_SESSION_COOKIE];
  if (!token) return;
  await env.COMMONS_DB.prepare("DELETE FROM admin_sessions WHERE token_hash=?").bind(await sha256(token)).run();
}

function auditHashInput({prevHash,eventId,actorUserId,actorEmail,actorName,actorRole,action,subjectType,subjectId,detailJson,createdAt}) {
  return [
    "pcs-audit-v1",
    prevHash,
    eventId,
    actorUserId || "",
    actorEmail || "",
    actorName || "",
    actorRole || "",
    action,
    subjectType,
    subjectId,
    detailJson,
    createdAt,
  ].join("\n");
}

async function appendAuditArchive(env, {eventId,legacyAuditId=null,actorUserId=null,action,subjectType,subjectId,detailJson,createdAt}) {
  const actor = actorUserId
    ? await env.COMMONS_DB.prepare("SELECT email,display_name,role,is_owner FROM users WHERE id=?").bind(actorUserId).first()
    : null;
  const actorEmail = actor?.email || "";
  const actorName = actor?.display_name || "";
  const actorRole = Number(actor?.is_owner) ? "owner" : (actor?.role || "");

  for (let attempt = 0; attempt < 4; attempt++) {
    const latest = await env.COMMONS_DB.prepare("SELECT event_hash FROM audit_archive ORDER BY seq DESC LIMIT 1").first();
    const prevHash = latest?.event_hash || AUDIT_GENESIS;
    const eventHash = await sha256Hex(auditHashInput({
      prevHash,eventId,actorUserId,actorEmail,actorName,actorRole,action,subjectType,subjectId,detailJson,createdAt
    }));
    try {
      await env.COMMONS_DB.prepare(
        `INSERT INTO audit_archive(
          event_id,legacy_audit_id,actor_user_id,actor_email,actor_name,actor_role,
          action,subject_type,subject_id,detail_json,created_at,prev_hash,event_hash
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        eventId,legacyAuditId,actorUserId,actorEmail,actorName,actorRole,
        action,subjectType,subjectId,detailJson,createdAt,prevHash,eventHash
      ).run();
      return eventHash;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

async function audit(env, actorUserId, action, subjectType, subjectId, detail = {}) {
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const detailJson = JSON.stringify(detail);
  await env.COMMONS_DB.prepare(
    "INSERT INTO audit_log(id,actor_user_id,action,subject_type,subject_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?)"
  ).bind(id, actorUserId || null, action, subjectType, subjectId, detailJson, createdAt).run();
  await appendAuditArchive(env,{
    eventId:id,
    legacyAuditId:id,
    actorUserId:actorUserId||null,
    action,
    subjectType,
    subjectId,
    detailJson,
    createdAt,
  });
}

function mailRelayConfigured(env) {
  return Boolean(env.MAIL_RELAY_URL && env.MAIL_RELAY_SECRET);
}

function resendConfigured(env) {
  return emailTransportConfigured(env);
}

function emailTransportConfigured(env) {
  return mailRelayConfigured(env) || resendConfigured(env);
}

function emailTransportName(env) {
  if (mailRelayConfigured(env)) return "gmail_apps_script";
  if (resendConfigured(env)) return "resend";
  return "disabled";
}

async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return [...signature].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sendRelayMail(env, to, subject, text) {
  const timestamp = String(Date.now());
  const nonce = randomToken(18);
  const canonical = [timestamp, nonce, to, subject, text].join("\n");
  const signature = await hmacHex(env.MAIL_RELAY_SECRET, canonical);
  const response = await fetch(env.MAIL_RELAY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      timestamp,
      nonce,
      to,
      subject,
      text,
      signature,
    }),
  });
  const responseText = (await response.text()).slice(0, 1000);
  if (!response.ok) {
    return { state: "failed", error: `Gmail relay returned ${response.status}: ${responseText}` };
  }
  let payload = null;
  try { payload = JSON.parse(responseText); } catch {}
  if (!payload?.ok) {
    return { state: "failed", error: `Gmail relay rejected the message: ${responseText || "unknown error"}` };
  }
  return { state: "sent", error: null, provider: "gmail_apps_script" };
}

async function sendResendMail(env, to, subject, text) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      reply_to: env.ADMIN_EMAIL || undefined,
      subject,
      text,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    return { state: "failed", error: `Resend returned ${response.status}: ${detail}` };
  }
  return { state: "sent", error: null, provider: "resend" };
}

async function sendMail(env, to, subject, text) {
  if (!emailTransportConfigured(env)) {
    return { state: "disabled", error: "Transactional email transport is not configured." };
  }
  try {
    if (mailRelayConfigured(env)) {
      const relay = await sendRelayMail(env, to, subject, text);
      if (relay.state === "sent" || !resendConfigured(env)) return relay;
    }
    if (resendConfigured(env)) return await sendResendMail(env, to, subject, text);
    return { state: "failed", error: "All configured email transports failed." };
  } catch (error) {
    return { state: "failed", error: String(error).slice(0, 500) };
  }
}

async function notify(env, { userId = null, email = null, kind, subject, body }) {
  const id = crypto.randomUUID();
  await env.COMMONS_DB.prepare(
    "INSERT INTO notifications(id,user_id,kind,subject,body,created_at,email_state) VALUES(?,?,?,?,?,?,?)"
  ).bind(id, userId, kind, subject, body, nowIso(), "queued").run();
  const mail = email ? await sendMail(env, email, subject, body) : { state: "disabled", error: "No destination email." };
  await env.COMMONS_DB.prepare(
    "UPDATE notifications SET email_state=?, email_error=? WHERE id=?"
  ).bind(mail.state, mail.error, id).run();
  return { id, email_state: mail.state };
}

async function createVerification(env, user, origin) {
  const raw = randomToken(32);
  const hash = await sha256(raw);
  const created = nowIso();
  const expires = addHoursIso(created, 24);
  await env.COMMONS_DB.prepare("DELETE FROM email_verification_tokens WHERE user_id=?").bind(user.id).run();
  await env.COMMONS_DB.prepare(
    "INSERT INTO email_verification_tokens(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)"
  ).bind(hash, user.id, created, expires).run();
  const link = `${origin}/account.html?verify=${encodeURIComponent(raw)}`;
  const result = await notify(env, {
    userId: user.id,
    email: user.email,
    kind: "verify_email",
    subject: "Verify your PCS Commons email",
    body: `Hello ${user.display_name},\n\nVerify your email for the PCS AI Safety Commons:\n${link}\n\nThe link expires in 24 hours. L0 public tasks remain available before email verification; higher-level task applications require a verified email.\n`,
  });
  return result;
}

function exclusiveLimit(level) {
  if (level < 2) return 0;
  if (level < 4) return 1;
  return 2;
}

async function verifiedSkills(env, userId) {
  const result = await env.COMMONS_DB.prepare(
    "SELECT skill FROM skills WHERE user_id=? AND status='verified'"
  ).bind(userId).all();
  return new Set((result.results || []).map(r => r.skill));
}

function dependencyState(edges=[],groups=[]) {
  const normalizedEdges=edges||[];
  const normalizedGroups=groups||[];
  const groupResults=[];
  const grouped=new Set();

  for(const group of normalizedGroups){
    const members=normalizedEdges.filter(edge=>edge.group_id===group.id);
    members.forEach(edge=>grouped.add(edge.depends_on_task_id+"|"+edge.task_id));
    const satisfied=members.filter(edge=>edge.completed).length;
    const required=group.mode==="all"?members.length:group.mode==="any"?1:Math.max(1,Number(group.min_satisfied||1));
    const complete=satisfied>=required;
    groupResults.push({
      ...group,
      satisfied,
      total:members.length,
      required,
      complete,
      missing:members.filter(edge=>!edge.completed).map(edge=>edge.depends_on_task_id),
    });
  }

  const legacyHard=normalizedEdges.filter(edge=>
    edge.dependency_type==="hard" &&
    !edge.group_id &&
    !edge.completed
  );

  const blockedGroups=groupResults.filter(group=>!group.complete);
  return {
    complete:legacyHard.length===0&&blockedGroups.length===0,
    blocked_edges:legacyHard,
    groups:groupResults,
    blocked_groups:blockedGroups,
  };
}

function eligibilityFor(task, user, skills, dependency={complete:true,blocked_edges:[],blocked_groups:[]}) {
  if (!user) return { state: "login_required", can_start: false, can_request: false, reason: "Create an account or sign in." };
  if (user.status !== "active") return { state: "locked", can_start: false, can_request: false, reason: "Account is not active." };
  if (Number(user.level) < Number(task.min_level)) {
    return { state: "level_required", can_start: false, can_request: false, reason: `Requires PCS level L${task.min_level}. Your verified level is L${user.level}.` };
  }
  if (!dependency.complete) {
    const labels=[
      ...(dependency.blocked_groups||[]).map(group=>group.label+" ("+group.satisfied+"/"+group.required+")"),
      ...(dependency.blocked_edges||[]).map(edge=>edge.depends_on_task_id),
    ];
    return {
      state:"dependency_required",
      can_start:false,
      can_request:false,
      reason:"Prerequisite gate remains open: "+labels.join(", ")+". The dependency graph shows exactly which accepted outputs unlock this work."
    };
  }
  if (task.claim_mode !== "open" && !Number(user.email_verified)) {
    return { state: "verify_email", can_start: false, can_request: false, reason: "Verify your email before requesting reserved work." };
  }
  if (task.required_skill && !skills.has(task.required_skill)) {
    if (task.claim_mode !== "open") {
      return {
        state: "skill_or_application",
        can_start: false,
        can_request: true,
        reason: `Verified ${task.required_skill} skill is not on file. You may either pass a variable competency evaluation or submit this task application now for manual competency review. Final approval is manual.`
      };
    }
    return {
      state: "skill_required",
      can_start: false,
      can_request: false,
      reason: `Requires verified ${task.required_skill} skill. Take a variable competency evaluation or submit manual skill evidence for review.`
    };
  }
  if (task.claim_mode === "open") {
    return { state: "open", can_start: true, can_request: false, reason: "Open, non-exclusive work. Starting it never blocks anyone else." };
  }
  if (task.claim_mode === "approval") {
    return { state: "approval", can_start: false, can_request: true, reason: "Application required. Requesting does not reserve the task." };
  }
  return { state: "invite", can_start: false, can_request: true, reason: "High-trust application. PCS must explicitly approve and assign it." };
}

async function taskDependencies(env, taskId) {
  const [edgeRows,groupRows]=await Promise.all([
    env.COMMONS_DB.prepare(
      `SELECT d.task_id,d.depends_on_task_id,d.dependency_type,d.rationale,d.group_id,d.relation,
              d.required_outcome,d.artifact_contract,d.criticality,t.title AS depends_on_title,
              CASE WHEN t.need_status='satisfied' OR EXISTS(
                SELECT 1 FROM task_requests r WHERE r.task_id=d.depends_on_task_id AND r.status='completed'
              ) THEN 1 ELSE 0 END AS completed
       FROM task_dependencies d
       JOIN tasks t ON t.id=d.depends_on_task_id
       WHERE d.task_id=?
       ORDER BY d.criticality DESC,d.depends_on_task_id`
    ).bind(taskId).all(),
    env.COMMONS_DB.prepare(
      `SELECT id,task_id,label,mode,min_satisfied,description,sort_order
       FROM task_dependency_groups WHERE task_id=? ORDER BY sort_order,id`
    ).bind(taskId).all(),
  ]);
  const edges=(edgeRows.results||[]).map(row=>({...row,completed:Boolean(Number(row.completed))}));
  const groups=groupRows.results||[];
  return {edges,groups,state:dependencyState(edges,groups)};
}

async function publicTaskGraph(env) {
  const [tasks,edges,groups]=await Promise.all([
    env.COMMONS_DB.prepare(
      `SELECT id,title,summary,min_level,claim_mode,required_skill,program_id,program_step,category,
              priority,why_now,deliverable,verification_rule,acceptance_criteria,success_metric
       FROM tasks
       WHERE status='open' AND publication_state='published' AND need_status='needed'
       ORDER BY priority DESC,COALESCE(program_id,''),COALESCE(program_step,999),id`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT d.task_id,
              CASE WHEN source.publication_state='published' THEN d.depends_on_task_id ELSE 'INTERNAL-PREREQUISITE' END AS depends_on_task_id,
              d.dependency_type,d.group_id,d.relation,d.required_outcome,
              d.artifact_contract,d.criticality,d.rationale,
              CASE WHEN source.publication_state='published' THEN source.title ELSE 'Internal prerequisite' END AS depends_on_title,
              source.publication_state AS source_publication_state,source.need_status AS source_need_status,
              CASE WHEN source.need_status='satisfied' OR EXISTS(
                SELECT 1 FROM task_requests r WHERE r.task_id=d.depends_on_task_id AND r.status='completed'
              ) THEN 1 ELSE 0 END AS completed
       FROM task_dependencies d
       JOIN tasks target ON target.id=d.task_id
       JOIN tasks source ON source.id=d.depends_on_task_id
       WHERE target.publication_state='published' AND target.need_status='needed'
       ORDER BY d.criticality DESC,d.task_id,d.depends_on_task_id`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT g.* FROM task_dependency_groups g
       JOIN tasks t ON t.id=g.task_id
       WHERE t.publication_state='published' AND t.need_status='needed'
       ORDER BY g.task_id,g.sort_order,g.id`
    ).all(),
  ]);
  return {
    tasks:tasks.results||[],
    edges:(edges.results||[]).map(row=>({...row,completed:Boolean(Number(row.completed))})),
    groups:groups.results||[],
  };
}

async function remindPendingReviews(env) {
  const pending = await env.COMMONS_DB.prepare(
    `SELECT r.id,r.task_id,r.requested_at,r.decision_due_at,t.title,u.display_name,u.email,u.level
     FROM task_requests r
     JOIN tasks t ON t.id=r.task_id
     JOIN users u ON u.id=r.user_id
     WHERE r.status='pending'
     ORDER BY r.decision_due_at ASC
     LIMIT 200`
  ).all();
  const pendingSkills = await env.COMMONS_DB.prepare(
    `SELECT sk.user_id,sk.skill,sk.requested_at,sk.review_due_at,sk.source,u.display_name,u.email,u.level
     FROM skills sk JOIN users u ON u.id=sk.user_id
     WHERE sk.status='pending'
     ORDER BY COALESCE(sk.review_due_at,sk.requested_at) ASC
     LIMIT 200`
  ).all();

  const now = new Date();
  for (const row of pending.results || []) {
    const targetAt = new Date(addBusinessDaysIso(row.requested_at, 1));
    const hardAt = new Date(row.decision_due_at);
    const overdue = now >= hardAt;
    const targetMissed = now >= targetAt;
    if (!targetMissed) continue;
    const kind = (overdue ? "task_request_overdue_admin:" : "task_request_target_admin:") + row.id;
    const already = await env.COMMONS_DB.prepare("SELECT 1 AS ok FROM notifications WHERE kind=? LIMIT 1").bind(kind).first();
    if (already) continue;
    await notify(env, {
      kind,
      email: env.ADMIN_EMAIL || null,
      subject: (overdue ? "[PCS OVERDUE] Task request " : "[PCS 1-day target] Task request ") + row.task_id + " — " + row.display_name,
      body: [
        row.display_name + " <" + row.email + "> is waiting for a decision on " + row.task_id + " — " + row.title + ".",
        "Verified level: L" + row.level,
        "Requested: " + row.requested_at,
        "Hard decision deadline: " + row.decision_due_at,
        overdue ? "The 2-business-day review deadline has passed. Please approve or reject now." : "The 1-business-day response target has been reached. Please review before the hard 2-business-day deadline.",
        "",
        "Admin dashboard: " + (env.PUBLIC_ORIGIN || "https://proof-carrying-science-site.marenatommaso.workers.dev") + "/admin.html#requests",
      ].join("\n"),
    });
  }

  for (const row of pendingSkills.results || []) {
    const requestedAt = row.requested_at || nowIso();
    const targetAt = new Date(addBusinessDaysIso(requestedAt, 1));
    const hardIso = row.review_due_at || addBusinessDaysIso(requestedAt, 2);
    const hardAt = new Date(hardIso);
    const overdue = now >= hardAt;
    const targetMissed = now >= targetAt;
    if (!targetMissed) continue;
    const subjectKey = row.user_id + ":" + row.skill;
    const kind = (overdue ? "skill_review_overdue_admin:" : "skill_review_target_admin:") + subjectKey;
    const already = await env.COMMONS_DB.prepare("SELECT 1 AS ok FROM notifications WHERE kind=? LIMIT 1").bind(kind).first();
    if (already) continue;
    await notify(env,{
      kind,
      email:env.ADMIN_EMAIL || null,
      subject:(overdue ? "[PCS OVERDUE] Competency review " : "[PCS 1-day target] Competency review ") + row.skill + " — " + row.display_name,
      body:[
        row.display_name + " <" + row.email + "> is waiting for manual " + row.skill + " competency review.",
        "Source: " + (row.source || "manual"),
        "Verified level: L" + row.level,
        "Requested: " + requestedAt,
        "Hard review deadline: " + hardIso,
        overdue ? "The 2-business-day review deadline has passed. Please decide now." : "The 1-business-day response target has been reached. Please review before the hard 2-business-day deadline.",
        "",
        "Admin dashboard: " + (env.PUBLIC_ORIGIN || "https://proof-carrying-science-site.marenatommaso.workers.dev") + "/admin.html#skills",
      ].join("\n"),
    });
  }
  return (pending.results?.length || 0) + (pendingSkills.results?.length || 0);
}

async function expireStaleWork(env) {
  const now = nowIso();
  const stale = await env.COMMONS_DB.prepare(
    `SELECT r.id,r.user_id,u.email,u.email_verified,t.title,t.id AS task_id
     FROM task_requests r
     JOIN tasks t ON t.id=r.task_id
     JOIN users u ON u.id=r.user_id
     WHERE r.status='approved' AND t.claim_mode!='open' AND (
       (r.checkpoint_status='pending' AND r.checkpoint_due_at IS NOT NULL AND r.checkpoint_due_at<=? AND COALESCE(r.checkpoint_note,'')='')
       OR (r.reservation_expires_at IS NOT NULL AND r.reservation_expires_at<=?)
     )`
  ).bind(now, now).all();
  for (const row of stale.results || []) {
    await env.COMMONS_DB.prepare(
      "UPDATE task_requests SET status='expired', checkpoint_status=CASE WHEN checkpoint_status='pending' THEN 'missed' ELSE checkpoint_status END,reservation_key=NULL WHERE id=? AND status='approved'"
    ).bind(row.id).run();
    await notify(env, {
      userId: row.user_id,
      email: row.email_verified ? row.email : null,
      kind: "task_expired",
      subject: `PCS task released: ${row.task_id}`,
      body: `Your reservation for ${row.task_id} — ${row.title} was released because the progress checkpoint or reservation deadline passed. This releases the work so another qualified contributor can take it. You may apply again later.\n`,
    });
    await audit(env, null, "task_request_expired", "task_request", row.id, { task_id: row.task_id });
  }
  await env.COMMONS_DB.prepare("UPDATE competency_evaluations SET status='expired' WHERE status='open' AND expires_at<=?").bind(now).run();
  await env.COMMONS_DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now).run();
  await env.COMMONS_DB.prepare("DELETE FROM admin_sessions WHERE expires_at<=?").bind(now).run();
  await env.COMMONS_DB.prepare("DELETE FROM email_verification_tokens WHERE expires_at<=? OR used_at IS NOT NULL").bind(now).run();
  await env.COMMONS_DB.prepare("DELETE FROM rate_limits WHERE window_start<?").bind(addDaysIso(now, -2)).run();
  return stale.results?.length || 0;
}

async function register(request, env) {
  await rateLimit(request, env, "register", 5, 60);
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const displayName = cleanText(body.display_name, 80);
  const password = String(body.password || "");
  if (!validEmail(email)) throw new ApiError(400, "Enter a valid email address.", "bad_email");
  if (email === normalizeEmail(env.ADMIN_EMAIL)) throw new ApiError(400, "This address is reserved for PCS administration.", "admin_email_reserved");
  if (displayName.length < 2) throw new ApiError(400, "Enter your name.", "bad_name");
  if (!validPassword(password)) throw new ApiError(400, "Password must be 12–128 characters.", "weak_password");
  if (body.website) throw new ApiError(400, "Registration rejected.", "bot_trap");
  if (body.ai_policy_ack !== true) throw new ApiError(400, "Acknowledge the AI-use and verification policy.", "policy_required");
  if (body.terms_version !== TERMS_VERSION) throw new ApiError(400, "Please accept the current Commons terms.", "terms_required");

  const existing = await env.COMMONS_DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if (existing) throw new ApiError(409, "An account already exists for that email.", "account_exists");

  const id = crypto.randomUUID();
  const salt = randomToken(16);
  const passwordHash = await derivePassword(password, salt);
  const recoveryCode = randomToken(24);
  const recoveryHash = await sha256(recoveryCode);
  const now = nowIso();
  await env.COMMONS_DB.prepare(
    `INSERT INTO users(
      id,email,display_name,password_hash,password_salt,password_iterations,recovery_hash,
      level,role,status,ai_policy_ack,created_at,updated_at,availability_hours,track,compensation_preference,
      profile_note,email_verified,terms_version
    ) VALUES(?,?,?,?,?,?,?,0,'contributor','active',1,?,?,?,?,?,?,0,?)`
  ).bind(
    id,email,displayName,passwordHash,salt,PASSWORD_ITERATIONS,recoveryHash,
    now,now,1,"nontechnical","either","",TERMS_VERSION
  ).run();

  await audit(env, id, "account_created", "user", id, { level: 0 });
  const token = await createSession(env, id);
  const user = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  const verification = await createVerification(env, user, new URL(request.url).origin);
  return json({
    ok: true,
    user: publicUser(user),
    recovery_code: recoveryCode,
    recovery_warning: "Save this recovery code now. PCS stores only a hash and cannot show it again.",
    email_delivery: verification.email_state,
    message: "Account created at L0. L0 open tasks are available immediately; you cannot self-select a higher level.",
  }, 201, { "set-cookie": sessionCookie(token) });
}

async function bootstrapAdmin(request, env) {
  await rateLimit(request, env, "admin-bootstrap", 10, 60);
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const tokenValue = String(body.bootstrap_token || "");
  const password = String(body.password || "");
  const displayName = cleanText(body.display_name, 80);
  if (!env.ADMIN_BOOTSTRAP_TOKEN) throw new ApiError(503, "Admin bootstrap is not configured.", "bootstrap_disabled");
  if (email !== normalizeEmail(env.ADMIN_EMAIL)) throw new ApiError(403, "Admin email does not match configured owner.", "bad_admin_email");
  if (!fixedEqual(tokenValue, env.ADMIN_BOOTSTRAP_TOKEN)) throw new ApiError(403, "Invalid bootstrap token.", "bad_bootstrap");
  if (!validPassword(password)) throw new ApiError(400, "Password must be 12–128 characters.", "weak_password");
  if (displayName.length < 2) throw new ApiError(400, "Enter your name.", "bad_name");

  const admin = await env.COMMONS_DB.prepare("SELECT id FROM users WHERE is_owner=1 OR role='admin' LIMIT 1").first();
  if (admin) throw new ApiError(409, "PCS owner/admin account already exists.", "admin_exists");

  const id = crypto.randomUUID();
  const salt = randomToken(16);
  const passwordHash = await derivePassword(password, salt);
  const recoveryCode = randomToken(24);
  const recoveryHash = await sha256(recoveryCode);
  const now = nowIso();
  await env.COMMONS_DB.prepare(
    `INSERT INTO users(
      id,email,display_name,password_hash,password_salt,password_iterations,recovery_hash,
      level,role,status,ai_policy_ack,created_at,updated_at,availability_hours,track,compensation_preference,
      profile_note,email_verified,terms_version,is_owner
    ) VALUES(?,?,?,?,?,?,?,6,'admin','active',1,?,?,?,?,?,?,1,?,1)`
  ).bind(id,email,displayName,passwordHash,salt,PASSWORD_ITERATIONS,recoveryHash,now,now,5,"review","either","PCS owner/admin",TERMS_VERSION).run();
  await audit(env, id, "owner_bootstrapped", "user", id, { display_level: 7, technical_level: 6, unique_owner: true });
  const session = await createAdminSession(env, id);
  const user = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  return json({
    ok: true,
    user: publicUser(user),
    recovery_code: recoveryCode,
    recovery_warning: "Save this recovery code now. It cannot be recovered later.",
  }, 201, { "set-cookie": adminSessionCookie(session) });
}

async function login(request, env) {
  await rateLimit(request, env, "login", 30, 15);
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!validEmail(email) || !password) throw new ApiError(401, "Invalid email or password.", "bad_login");

  const user = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if (!user) throw new ApiError(401, "Invalid email or password.", "bad_login");
  if (user.status !== "active") throw new ApiError(403, "Account is not active.", "account_inactive");
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ApiError(429, "Too many failed attempts. Try again later.", "login_locked");
  }

  const computed = await derivePassword(password, user.password_salt, Number(user.password_iterations));
  if (!fixedEqual(computed, user.password_hash)) {
    const failures = Number(user.failed_login_count || 0) + 1;
    const lockMinutes = failures >= 8 ? 30 : failures >= 5 ? 5 : 0;
    const lockedUntil = lockMinutes ? addHoursIso(nowIso(), lockMinutes / 60) : null;
    await env.COMMONS_DB.prepare(
      "UPDATE users SET failed_login_count=?, locked_until=?, updated_at=? WHERE id=?"
    ).bind(failures, lockedUntil, nowIso(), user.id).run();
    throw new ApiError(401, "Invalid email or password.", "bad_login");
  }

  await env.COMMONS_DB.prepare(
    "UPDATE users SET failed_login_count=0, locked_until=NULL, last_login_at=?, updated_at=? WHERE id=?"
  ).bind(nowIso(), nowIso(), user.id).run();
  await env.COMMONS_DB.prepare("DELETE FROM sessions WHERE user_id=? AND expires_at<=?").bind(user.id, nowIso()).run();
  const session = await createSession(env, user.id);
  await audit(env, user.id, "login", "user", user.id, {});
  const fresh = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first();
  return json({ ok: true, user: publicUser(fresh) }, 200, { "set-cookie": sessionCookie(session) });
}

async function adminLogin(request, env) {
  await rateLimit(request, env, "admin-login", 12, 15);
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!validEmail(email) || !password) throw new ApiError(401, "Invalid administrator email or password.", "bad_admin_login");

  const user = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if (!user || user.role !== "admin") throw new ApiError(401, "Invalid administrator email or password.", "bad_admin_login");
  if (user.status !== "active") throw new ApiError(403, "Administrator account is not active.", "account_inactive");
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new ApiError(429, "Too many failed attempts. Try again later.", "login_locked");
  }

  const computed = await derivePassword(password, user.password_salt, Number(user.password_iterations));
  if (!fixedEqual(computed, user.password_hash)) {
    const failures = Number(user.failed_login_count || 0) + 1;
    const lockMinutes = failures >= 8 ? 30 : failures >= 5 ? 5 : 0;
    const lockedUntil = lockMinutes ? addHoursIso(nowIso(), lockMinutes / 60) : null;
    await env.COMMONS_DB.prepare(
      "UPDATE users SET failed_login_count=?,locked_until=?,updated_at=? WHERE id=?"
    ).bind(failures,lockedUntil,nowIso(),user.id).run();
    throw new ApiError(401, "Invalid administrator email or password.", "bad_admin_login");
  }

  await env.COMMONS_DB.prepare(
    "UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=?,updated_at=? WHERE id=?"
  ).bind(nowIso(),nowIso(),user.id).run();
  await env.COMMONS_DB.prepare("DELETE FROM admin_sessions WHERE user_id=? AND expires_at<=?").bind(user.id,nowIso()).run();
  const token = await createAdminSession(env,user.id);
  await audit(env,user.id,"admin_login","admin_session",user.id,{dedicated_admin_session:true});
  const fresh = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first();
  return json({ok:true,user:publicUser(fresh),expires_in_hours:ADMIN_SESSION_HOURS},200,{"set-cookie":adminSessionCookie(token)});
}

async function adminSessionStatus(request, env) {
  const user = await currentAdminUser(request,env);
  return json({authenticated:Boolean(user),user:publicUser(user),session_hours:ADMIN_SESSION_HOURS});
}

async function adminLogout(request, env) {
  const user = await currentAdminUser(request,env);
  if (user) await audit(env,user.id,"admin_logout","admin_session",user.id,{});
  await deleteAdminSession(request,env);
  return json({ok:true},200,{"set-cookie":clearAdminSessionCookie()});
}

async function verifyAuditArchive(env) {
  const result = await env.COMMONS_DB.prepare(
    `SELECT seq,event_id,actor_user_id,actor_email,actor_name,actor_role,action,subject_type,subject_id,detail_json,created_at,prev_hash,event_hash
     FROM audit_archive ORDER BY seq ASC`
  ).all();
  const rows = result.results || [];
  let prev = AUDIT_GENESIS;
  for (const row of rows) {
    if (row.prev_hash !== prev) {
      return {ok:false,count:rows.length,broken_seq:Number(row.seq),reason:"prev_hash_mismatch",head:rows.at(-1)?.event_hash||null};
    }
    const expected = await sha256Hex(auditHashInput({
      prevHash:row.prev_hash,
      eventId:row.event_id,
      actorUserId:row.actor_user_id||"",
      actorEmail:row.actor_email||"",
      actorName:row.actor_name||"",
      actorRole:row.actor_role||"",
      action:row.action,
      subjectType:row.subject_type,
      subjectId:row.subject_id,
      detailJson:row.detail_json||"{}",
      createdAt:row.created_at,
    }));
    if (expected !== row.event_hash) {
      return {ok:false,count:rows.length,broken_seq:Number(row.seq),reason:"event_hash_mismatch",head:rows.at(-1)?.event_hash||null};
    }
    prev = row.event_hash;
  }
  return {ok:true,count:rows.length,broken_seq:null,reason:null,head:rows.at(-1)?.event_hash||null};
}

const APPROVAL_ACTIONS = new Set([
  "task_request_approved","task_request_rejected","checkpoint_accepted","checkpoint_released",
  "submission_reviewed","skill_reviewed","skill_verified_by_task_application","skill_revoked",
  "reservation_released_after_skill_revocation","reservation_released_after_level_demotion",
  "user_level_changed","user_governance_changed","email_manually_verified"
]);

async function adminAuditFeed(request, env) {
  await requireAdmin(request,env);
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || 100);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit)?Math.trunc(rawLimit):100,25),200);
  const before = Number(url.searchParams.get("before_seq") || 0);
  const kind = String(url.searchParams.get("kind") || "all");
  const params = [];
  let where = "1=1";
  if (before > 0) { where += " AND seq<?"; params.push(before); }
  if (kind === "admin") where += " AND actor_role IN ('owner','admin')";
  if (kind === "approvals") {
    const actions=[...APPROVAL_ACTIONS];
    where += " AND action IN ("+actions.map(()=>"?").join(",")+")";
    params.push(...actions);
  }
  const result = await env.COMMONS_DB.prepare(
    `SELECT seq,event_id,actor_user_id,actor_email,actor_name,actor_role,action,subject_type,subject_id,detail_json,created_at,prev_hash,event_hash
     FROM audit_archive WHERE ${where} ORDER BY seq DESC LIMIT ?`
  ).bind(...params,limit).all();
  const rows = result.results || [];
  return json({
    ok:true,
    kind,
    events:rows,
    next_before:rows.length===limit?Number(rows[rows.length-1].seq):null,
    integrity:await verifyAuditArchive(env),
  });
}


async function recover(request, env) {
  await rateLimit(request, env, "recover", 5, 60);
  const body = await readBody(request);
  const email = normalizeEmail(body.email);
  const recoveryCode = String(body.recovery_code || "");
  const password = String(body.new_password || "");
  if (!validEmail(email) || !recoveryCode || !validPassword(password)) {
    throw new ApiError(400, "Provide email, recovery code, and a new 12–128 character password.", "bad_recovery");
  }
  const user = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE email=?").bind(email).first();
  if (!user) throw new ApiError(400, "Recovery information did not match.", "bad_recovery");
  const recoveryHash = await sha256(recoveryCode);
  if (!fixedEqual(recoveryHash, user.recovery_hash)) throw new ApiError(400, "Recovery information did not match.", "bad_recovery");

  const salt = randomToken(16);
  const hash = await derivePassword(password, salt);
  const newRecovery = randomToken(24);
  await env.COMMONS_DB.prepare(
    "UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,recovery_hash=?,failed_login_count=0,locked_until=NULL,updated_at=? WHERE id=?"
  ).bind(hash,salt,PASSWORD_ITERATIONS,await sha256(newRecovery),nowIso(),user.id).run();
  await env.COMMONS_DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id).run();
  await env.COMMONS_DB.prepare("DELETE FROM admin_sessions WHERE user_id=?").bind(user.id).run();
  await audit(env, user.id, "password_recovered", "user", user.id, {});
  return json({ ok: true, recovery_code: newRecovery, message: "Password reset. Save the new recovery code before signing in." });
}

async function verifyEmail(request, env) {
  await rateLimit(request, env, "verify-email", 20, 60);
  const body = await readBody(request);
  const raw = String(body.token || "");
  if (!raw) throw new ApiError(400, "Verification token is required.", "missing_token");
  const hash = await sha256(raw);
  const row = await env.COMMONS_DB.prepare(
    "SELECT * FROM email_verification_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>?"
  ).bind(hash, nowIso()).first();
  if (!row) throw new ApiError(400, "Verification link is invalid or expired.", "bad_verify_token");
  await env.COMMONS_DB.prepare("UPDATE users SET email_verified=1,updated_at=? WHERE id=?").bind(nowIso(), row.user_id).run();
  await env.COMMONS_DB.prepare("UPDATE email_verification_tokens SET used_at=? WHERE token_hash=?").bind(nowIso(), hash).run();
  await audit(env, row.user_id, "email_verified", "user", row.user_id, {});
  return json({ ok: true, message: "Email verified." });
}

async function me(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ authenticated: false, email_transport: emailTransportConfigured(env) });
  const [skills, requests, notifications, evaluations, mySubmissions] = await Promise.all([
    env.COMMONS_DB.prepare("SELECT skill,status,evidence,verification_note,requested_at,verified_at,review_due_at,source,evaluation_id FROM skills WHERE user_id=? ORDER BY skill").bind(user.id).all(),
    env.COMMONS_DB.prepare(
      `SELECT r.*,t.title,t.min_level,t.claim_mode,t.required_skill,t.compensation_label,t.category AS task_category,t.integration_target,t.expected_minutes,t.deliverable,t.verification_rule,t.acceptance_criteria
       FROM task_requests r JOIN tasks t ON t.id=r.task_id
       WHERE r.user_id=? ORDER BY r.requested_at DESC LIMIT 50`
    ).bind(user.id).all(),
    env.COMMONS_DB.prepare(
      "SELECT id,kind,subject,body,created_at,read_at,email_state FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30"
    ).bind(user.id).all(),
    env.COMMONS_DB.prepare(
      "SELECT id,skill,task_id,created_at,expires_at,submitted_at,score,max_score,auto_pass,status FROM competency_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 20"
    ).bind(user.id).all(),
    env.COMMONS_DB.prepare(
      `SELECT s.id,s.request_id,s.status,s.review_note,s.submitted_at,s.github_stage_state,s.github_pr_url,s.github_repo,s.github_branch,s.github_pr_number,
       p.state AS production_promotion_state,p.pr_url AS production_promotion_url,p.merge_sha AS production_merge_sha,
       p.decision_note AS production_review_note
       FROM submissions s LEFT JOIN production_promotions p ON p.id=(
         SELECT latest.id FROM production_promotions latest
         WHERE latest.submission_id=s.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1
       )
       WHERE s.user_id=? ORDER BY s.submitted_at DESC LIMIT 50`
    ).bind(user.id).all(),
  ]);
  return json({
    authenticated: true,
    user: publicUser(user),
    skills: skills.results || [],
    requests: requests.results || [],
    submissions: mySubmissions.results || [],
    notifications: notifications.results || [],
    evaluations: evaluations.results || [],
    email_transport: emailTransportConfigured(env),
  });
}

async function updateProfile(request, env, user) {
  const body = await readBody(request);
  const hours = Number(body.availability_hours);
  const track = String(body.track || "");
  const comp = String(body.compensation_preference || "");
  const profile = cleanText(body.profile_note, 1200);
  if (!Number.isInteger(hours) || hours < 1 || hours > 40) throw new ApiError(400, "Availability must be 1–40 hours/week.", "bad_hours");
  if (!TRACKS.has(track)) throw new ApiError(400, "Unknown contributor track.", "bad_track");
  if (!COMP_PREFS.has(comp)) throw new ApiError(400, "Unknown compensation preference.", "bad_comp");
  await env.COMMONS_DB.prepare(
    "UPDATE users SET availability_hours=?,track=?,compensation_preference=?,profile_note=?,updated_at=? WHERE id=?"
  ).bind(hours,track,comp,profile,nowIso(),user.id).run();
  await audit(env,user.id,"profile_updated","user",user.id,{track,hours,comp});
  const fresh = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first();
  return json({ ok:true, user:publicUser(fresh) });
}


async function startCompetencyEvaluation(request, env, user) {
  await rateLimit(request, env, "competency-evaluation", 12, 60);
  const body = await readBody(request);
  const skill = String(body.skill || "");
  const taskId = cleanText(body.task_id, 64) || null;
  if (!SKILLS.has(skill) || skill === "nontechnical") throw new ApiError(400, "Choose a supported technical/research skill.", "bad_skill");

  const verified = await env.COMMONS_DB.prepare(
    "SELECT 1 AS ok FROM skills WHERE user_id=? AND skill=? AND status='verified'"
  ).bind(user.id, skill).first();
  if (verified) throw new ApiError(409, "This skill is already verified.", "skill_already_verified");

  if (taskId) {
    const task = await env.COMMONS_DB.prepare(
      "SELECT id,required_skill FROM tasks WHERE id=? AND status='open' AND publication_state='published' AND need_status='needed'"
    ).bind(taskId).first();
    if (!task) throw new ApiError(404, "Selected task is not open.", "task_not_found");
    if (task.required_skill && task.required_skill !== skill) {
      throw new ApiError(400, "This evaluation does not match the selected task's required skill.", "skill_task_mismatch");
    }
  }

  const existing = await env.COMMONS_DB.prepare(
    "SELECT id,challenge_json,expires_at,max_score FROM competency_evaluations WHERE user_id=? AND skill=? AND status='open' AND expires_at>? ORDER BY created_at DESC LIMIT 1"
  ).bind(user.id, skill, nowIso()).first();
  if (existing) {
    return json({
      ok:true,
      evaluation:{
        id:existing.id,
        skill,
        task_id:taskId,
        expires_at:existing.expires_at,
        max_score:Number(existing.max_score),
        pass_score:Math.ceil(Number(existing.max_score) * 0.75),
        challenge:JSON.parse(existing.challenge_json),
      },
      reused:true,
      message:"Continuing your current variable competency evaluation. Final approval is still manual."
    });
  }

  const since = addHoursIso(nowIso(), -24);
  const recent = await env.COMMONS_DB.prepare(
    "SELECT COUNT(*) AS n FROM competency_evaluations WHERE user_id=? AND skill=? AND created_at>=?"
  ).bind(user.id, skill, since).first();
  if (Number(recent?.n || 0) >= 3) {
    throw new ApiError(429, "You have reached the 3-attempt daily evaluation limit for this skill. You can still submit a manual application/evidence request now.", "evaluation_attempt_limit");
  }

  const generated = buildCompetencyEvaluation(skill);
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = addHoursIso(createdAt, 1);
  try {
    await env.COMMONS_DB.prepare(
      `INSERT INTO competency_evaluations(
        id,user_id,skill,task_id,variant_token,challenge_json,answer_key_json,created_at,expires_at,max_score,status
      ) VALUES(?,?,?,?,?,?,?,?,?,?,'open')`
    ).bind(
      id,user.id,skill,taskId,generated.variant_token,
      JSON.stringify(generated.challenge),JSON.stringify(generated.answer_key),
      createdAt,expiresAt,generated.max_score
    ).run();
  } catch (error) {
    const message=String(error?.message||error||"");
    if (/PCS daily evaluation attempt limit/i.test(message)) {
      throw new ApiError(429,"You have reached the 3-attempt daily evaluation limit for this skill. You can still submit a manual application/evidence request now.","evaluation_attempt_limit");
    }
    if (/idx_competency_one_open_per_skill|UNIQUE constraint failed: competency_evaluations\.user_id, competency_evaluations\.skill/i.test(message)) {
      const concurrent=await env.COMMONS_DB.prepare(
        "SELECT id,challenge_json,expires_at,max_score,task_id FROM competency_evaluations WHERE user_id=? AND skill=? AND status='open' AND expires_at>? ORDER BY created_at DESC LIMIT 1"
      ).bind(user.id,skill,nowIso()).first();
      if (concurrent) {
        return json({
          ok:true,
          evaluation:{
            id:concurrent.id,
            skill,
            task_id:concurrent.task_id||taskId,
            expires_at:concurrent.expires_at,
            max_score:Number(concurrent.max_score),
            pass_score:Math.ceil(Number(concurrent.max_score)*0.75),
            challenge:JSON.parse(concurrent.challenge_json),
          },
          reused:true,
          message:"Continuing your current variable competency evaluation. Final approval is still manual."
        });
      }
    }
    throw error;
  }
  await audit(env,user.id,"competency_evaluation_started","competency_evaluation",id,{skill,task_id:taskId,variant_token:generated.variant_token});
  return json({
    ok:true,
    evaluation:{
      id,
      skill,
      task_id:taskId,
      expires_at:expiresAt,
      max_score:generated.max_score,
      pass_score:generated.pass_score,
      challenge:generated.challenge,
    },
    reused:false,
    message:"Variable evaluation generated. It is auto-scored, but any passing result still requires manual PCS approval."
  },201);
}

async function submitCompetencyEvaluation(request, env, user, evaluationId) {
  await rateLimit(request, env, "competency-evaluation-submit", 20, 60);
  const body = await readBody(request);
  const answers = body.answers && typeof body.answers === "object" ? body.answers : {};
  const rationale = cleanText(body.rationale, 3000);
  if (rationale.length < 100) {
    throw new ApiError(400, "Explain your reasoning and how you checked your answers in at least 100 characters.", "evaluation_rationale_required");
  }

  const row = await env.COMMONS_DB.prepare(
    "SELECT * FROM competency_evaluations WHERE id=? AND user_id=?"
  ).bind(evaluationId,user.id).first();
  if (!row) throw new ApiError(404, "Evaluation not found.", "evaluation_not_found");
  if (row.status !== "open") throw new ApiError(409, "This evaluation has already been submitted.", "evaluation_closed");
  if (row.expires_at <= nowIso()) {
    await env.COMMONS_DB.prepare("UPDATE competency_evaluations SET status='expired' WHERE id=? AND user_id=? AND status='open'").bind(row.id,user.id).run();
    throw new ApiError(409, "This evaluation expired. Generate a new variable evaluation.", "evaluation_expired");
  }

  const key = JSON.parse(row.answer_key_json || "{}");
  let score = 0;
  for (const [questionId, expected] of Object.entries(key)) {
    if (String(answers[questionId] || "") === String(expected)) score += 1;
  }
  const maxScore = Number(row.max_score || Object.keys(key).length || 4);
  const passScore = Math.ceil(maxScore * 0.75);
  const autoPass = score >= passScore;
  const submittedAt = nowIso();

  const submitted=await env.COMMONS_DB.prepare(
    "UPDATE competency_evaluations SET status='submitted',submitted_at=?,answers_json=?,rationale=?,score=?,auto_pass=? WHERE id=? AND user_id=? AND status='open'"
  ).bind(submittedAt,JSON.stringify(answers),rationale,score,autoPass?1:0,row.id,user.id).run();
  if (Number(submitted?.meta?.changes||0)!==1) {
    throw new ApiError(409,"This evaluation was already submitted by another request.","evaluation_already_submitted");
  }

  if (!autoPass) {
    await audit(env,user.id,"competency_evaluation_failed","competency_evaluation",row.id,{skill:row.skill,score,max_score:maxScore});
    return json({
      ok:true,
      auto_pass:false,
      score,
      max_score:maxScore,
      message:"Auto-score: "+score+"/"+maxScore+". This screening did not pass. You may generate another variable evaluation later or submit the manual application/evidence route now."
    });
  }

  const due = addBusinessDaysIso(submittedAt, 2);
  const existingSkill = await env.COMMONS_DB.prepare(
    "SELECT status FROM skills WHERE user_id=? AND skill=?"
  ).bind(user.id,row.skill).first();
  if (existingSkill?.status !== "verified") {
    const evidence = "Variable competency evaluation "+row.id+" auto-score "+score+"/"+maxScore+". Manual rationale: "+rationale;
    await env.COMMONS_DB.prepare(
      `INSERT INTO skills(user_id,skill,status,evidence,requested_at,review_due_at,source,evaluation_id)
       VALUES(?,?,'pending',?,?,?,?,?)
       ON CONFLICT(user_id,skill) DO UPDATE SET
         status='pending',evidence=excluded.evidence,requested_at=excluded.requested_at,
         review_due_at=excluded.review_due_at,source='evaluation',evaluation_id=excluded.evaluation_id,
         verification_note=NULL,verified_at=NULL,verified_by=NULL`
    ).bind(user.id,row.skill,evidence,submittedAt,due,"evaluation",row.id).run();
    await notify(env,{
      kind:"skill_review_admin",
      email:env.ADMIN_EMAIL || null,
      subject:"[PCS] Passed variable evaluation: "+user.display_name+" — "+row.skill,
      body:user.display_name+" ("+user.email+", current L"+user.level+") passed the auto-scored "+row.skill+" screening "+score+"/"+maxScore+".\n\nManual rationale:\n"+rationale+"\n\nFinal approval is manual. Target response: within 1 business day; no later than 2 business days ("+due+").\n"
    });
    await notify(env,{
      userId:user.id,
      email:user.email_verified?user.email:null,
      kind:"competency_evaluation_passed",
      subject:"PCS competency evaluation passed: "+row.skill,
      body:"Your variable "+row.skill+" evaluation auto-scored "+score+"/"+maxScore+". This is screening evidence only; it does not grant authority automatically. PCS will manually review it, targeting a response within 1 business day and no later than 2 business days. Current deadline: "+due+".\n"
    });
  }

  await audit(env,user.id,"competency_evaluation_passed","competency_evaluation",row.id,{skill:row.skill,score,max_score:maxScore,manual_review_due_at:due});
  return json({
    ok:true,
    auto_pass:true,
    score,
    max_score:maxScore,
    manual_review_due_at:due,
    message:"Auto-score: "+score+"/"+maxScore+" — screening passed. Final skill approval is still manual. PCS targets review within 1 business day and no later than 2 business days."
  });
}

async function requestSkill(request, env, user) {
  const body = await readBody(request);
  const skill = String(body.skill || "");
  const evidence = cleanText(body.evidence, 3000);
  if (!SKILLS.has(skill) || skill === "nontechnical") throw new ApiError(400, "Choose a supported technical/research skill.", "bad_skill");
  if (evidence.length < 80) throw new ApiError(400, "Give enough evidence for a reviewer to assess the skill (at least 80 characters).", "evidence_required");

  const already = await env.COMMONS_DB.prepare(
    "SELECT status FROM skills WHERE user_id=? AND skill=?"
  ).bind(user.id,skill).first();
  if (already?.status === "verified") throw new ApiError(409, "This skill is already verified.", "skill_already_verified");

  const now = nowIso();
  const due = addBusinessDaysIso(now, 2);
  await env.COMMONS_DB.prepare(
    `INSERT INTO skills(user_id,skill,status,evidence,requested_at,review_due_at,source,evaluation_id)
     VALUES(?,?,'pending',?,?,?,'manual',NULL)
     ON CONFLICT(user_id,skill) DO UPDATE SET
       status='pending',evidence=excluded.evidence,requested_at=excluded.requested_at,
       review_due_at=excluded.review_due_at,source='manual',evaluation_id=NULL,
       verification_note=NULL,verified_at=NULL,verified_by=NULL`
  ).bind(user.id,skill,evidence,now,due).run();

  await notify(env,{
    kind:"skill_review_admin",
    email:env.ADMIN_EMAIL || null,
    subject:"[PCS] Manual skill review: "+user.display_name+" — "+skill,
    body:user.display_name+" ("+user.email+", current L"+user.level+") submitted a manual "+skill+" competency application.\n\nEvidence:\n"+evidence+"\n\nTarget response: within 1 business day; no later than 2 business days ("+due+").\n\nReview in the PCS admin dashboard.\n",
  });
  await notify(env,{
    userId:user.id,
    email:user.email_verified?user.email:null,
    kind:"skill_review_received",
    subject:"PCS received your competency application: "+skill,
    body:"PCS received your manual "+skill+" competency application. Final approval is manual. We target a response within 1 business day and no later than 2 business days. Current review deadline: "+due+".\n",
  });
  await audit(env,user.id,"skill_review_requested","user",user.id,{skill,source:"manual",review_due_at:due});
  return json({
    ok:true,
    review_due_at:due,
    message:"Manual competency application received. PCS targets review within 1 business day and no later than 2 business days."
  },201);
}

async function listTasks(request, env) {
  await expireStaleWork(env);
  const user = await currentUser(request, env);
  const skillSet = user ? await verifiedSkills(env,user.id) : new Set();
  const graph=await publicTaskGraph(env);
  const depMap=new Map();
  const groupMap=new Map();
  for(const edge of graph.edges){
    if(!depMap.has(edge.task_id))depMap.set(edge.task_id,[]);
    depMap.get(edge.task_id).push(edge);
  }
  for(const group of graph.groups){
    if(!groupMap.has(group.task_id))groupMap.set(group.task_id,[]);
    groupMap.get(group.task_id).push(group);
  }

  const tasks = await env.COMMONS_DB.prepare(
    `SELECT * FROM tasks
     WHERE status='open' AND publication_state='published' AND need_status='needed'
     ORDER BY priority DESC,COALESCE(program_id,''),COALESCE(program_step,999),min_level,id`
  ).all();

  let requestMap = new Map();
  if (user) {
    const own = await env.COMMONS_DB.prepare(
      "SELECT task_id,status,id,requested_at,decision_due_at,reservation_expires_at,checkpoint_due_at,checkpoint_status FROM task_requests WHERE user_id=? ORDER BY requested_at DESC"
    ).bind(user.id).all();
    for (const row of own.results || []) if (!requestMap.has(row.task_id)) requestMap.set(row.task_id,row);
  }

  return json({
    user: user ? publicUser(user) : null,
    tasks: (tasks.results || []).map(task => {
      const dependencies=depMap.get(task.id)||[];
      const dependency_groups=groupMap.get(task.id)||[];
      const dependency=dependencyState(dependencies,dependency_groups);
      return {
        ...task,
        dependencies,
        dependency_groups:dependency.groups,
        dependency_state:dependency,
        eligibility: eligibilityFor(task,user,skillSet,dependency),
        my_request: requestMap.get(task.id) || null,
      };
    }),
  });
}

async function startOrRequestTask(request, env, user, taskId) {
  await rateLimit(request, env, "task-request", 30, 60);
  const body = await readBody(request);
  const task = await env.COMMONS_DB.prepare(
    "SELECT * FROM tasks WHERE id=? AND status='open' AND publication_state='published' AND need_status='needed'"
  ).bind(taskId).first();
  if (!task) throw new ApiError(404,"Task not found or not open.","task_not_found");
  const skills = await verifiedSkills(env,user.id);
  const dependencyData=await taskDependencies(env,task.id);
  const eligibility = eligibilityFor(task,user,skills,dependencyData.state);
  if (!eligibility.can_start && !eligibility.can_request) throw new ApiError(403,eligibility.reason,eligibility.state);

  const existing = await env.COMMONS_DB.prepare(
    "SELECT id,status FROM task_requests WHERE task_id=? AND user_id=? AND status IN ('pending','approved') ORDER BY requested_at DESC LIMIT 1"
  ).bind(task.id,user.id).first();
  if (existing) throw new ApiError(409,"You already have an active request/work record for this task.","already_active");

  const now = nowIso();
  if (task.claim_mode === "open") {
    const activeOpen = await env.COMMONS_DB.prepare(
      `SELECT COUNT(*) AS n FROM task_requests r JOIN tasks t ON t.id=r.task_id
       WHERE r.user_id=? AND r.status='approved' AND t.claim_mode='open'`
    ).bind(user.id).first();
    if (Number(activeOpen?.n || 0) >= 2) throw new ApiError(409,"Finish or withdraw one of your two active open tasks before starting another.","open_task_limit");
    const id = crypto.randomUUID();
    try {
      await env.COMMONS_DB.prepare(
        `INSERT INTO task_requests(
          id,task_id,user_id,status,application_note,ai_use_plan,verification_plan,requested_at,decision_due_at,
          decision_at,decision_note,checkpoint_status,last_progress_at
        ) VALUES(?,?,?,'approved',?,?,?,?,?,?,?,'not_required',?)`
      ).bind(
        id,task.id,user.id,
        cleanText(body.application_note,2000),
        cleanText(body.ai_use_plan,1500),
        cleanText(body.verification_plan,2000),
        now,now,now,"Open non-exclusive task: automatic start.",now
      ).run();
    } catch (error) {
      const message=String(error?.message||error||"");
      if (/idx_task_requests_one_active_per_user_task|UNIQUE constraint failed: task_requests\.task_id, task_requests\.user_id/i.test(message)) {
        throw new ApiError(409,"You already have an active request/work record for this task.","already_active");
      }
      throw error;
    }
    await audit(env,user.id,"open_task_started","task_request",id,{task_id:task.id});
    return json({
      ok:true,
      request_id:id,
      status:"approved",
      exclusive:false,
      message:"Started immediately. This is non-exclusive: your start does not block anyone else from working on the same task.",
    },201);
  }

  if (!Number(user.email_verified)) throw new ApiError(403,"Verify your email before requesting reserved work.","verify_email");
  const application = cleanText(body.application_note,3000);
  const aiPlan = cleanText(body.ai_use_plan,2000);
  const verificationPlan = cleanText(body.verification_plan,3000);
  if (application.length < 120) throw new ApiError(400,"Explain why you are qualified and what you will do (at least 120 characters).","application_too_short");
  if (aiPlan.length < 60) throw new ApiError(400,"Explain whether/how you will use AI and how you will remain responsible for the work (at least 60 characters).","ai_plan_required");
  if (verificationPlan.length < 120) throw new ApiError(400,"Explain how you will independently check the work (at least 120 characters).","verification_plan_required");

  const pendingCount = await env.COMMONS_DB.prepare(
    `SELECT COUNT(*) AS n FROM task_requests r JOIN tasks t ON t.id=r.task_id
     WHERE r.user_id=? AND r.status='pending' AND t.claim_mode!='open'`
  ).bind(user.id).first();
  if (Number(pendingCount?.n || 0) >= 2) throw new ApiError(409,"You may have at most two high-tier applications awaiting review.","pending_limit");

  const id = crypto.randomUUID();
  const due = addBusinessDaysIso(now, Number(task.review_sla_business_days || 2));
  try {
    await env.COMMONS_DB.prepare(
      `INSERT INTO task_requests(
        id,task_id,user_id,status,application_note,ai_use_plan,verification_plan,requested_at,decision_due_at,checkpoint_status,last_progress_at
      ) VALUES(?,?,?,'pending',?,?,?,?,?,'pending',?)`
    ).bind(id,task.id,user.id,application,aiPlan,verificationPlan,now,due,now).run();
  } catch (error) {
    const message=String(error?.message||error||"");
    if (/idx_task_requests_one_active_per_user_task|UNIQUE constraint failed: task_requests\.task_id, task_requests\.user_id/i.test(message)) {
      throw new ApiError(409,"You already have an active request/work record for this task.","already_active");
    }
    if (/PCS pending high-tier application limit/i.test(message)) {
      throw new ApiError(409,"You may have at most two high-tier applications awaiting review.","pending_limit");
    }
    throw error;
  }

  const adminBody = [
    `New PCS task application: ${task.id} — ${task.title}`,
    `Applicant: ${user.display_name} <${user.email}>`,
    `Verified PCS level: L${user.level}`,
    `Required skill: ${task.required_skill || "none"}`,
    `Decision target: within 1 business day; hard review SLA: by ${due}`,
    "",
    "Application:",
    application,
    "",
    "AI-use plan:",
    aiPlan,
    "",
    "Independent verification plan:",
    verificationPlan,
    "",
    `Admin dashboard: ${new URL(request.url).origin}/admin.html#requests`,
  ].join("\n");
  const mail = await notify(env,{
    kind:"task_request_admin",
    email:env.ADMIN_EMAIL || null,
    subject:`[PCS] Task request ${task.id}: ${user.display_name} (L${user.level})`,
    body:adminBody,
  });
  const acknowledgement = await notify(env,{
    userId:user.id,
    email:user.email,
    kind:"task_request_received",
    subject:`PCS received your task application: ${task.id}`,
    body:`We received your application for ${task.id} — ${task.title}.\n\nIt does NOT reserve or block the task while pending. PCS targets a founder decision within 1 business day and no later than 2 business days. Your current review deadline is ${due}.\n\nYou can see the application status in your PCS account at ${new URL(request.url).origin}/account.html.\n`,
  });
  await audit(env,user.id,"task_request_created","task_request",id,{task_id:task.id,decision_due_at:due});
  return json({
    ok:true,
    request_id:id,
    status:"pending",
    exclusive:false,
    admin_email_state:mail.email_state,
    applicant_email_state:acknowledgement.email_state,
    decision_due_at:due,
    message:"Application received. It does not reserve the task. PCS targets a decision within 1 business day and no later than 2 business days.",
  },201);
}

async function submitCheckpoint(request, env, user, requestId) {
  const body = await readBody(request);
  const note = cleanText(body.note,3000);
  if (note.length < 80) throw new ApiError(400,"Give a concrete progress checkpoint (at least 80 characters).","checkpoint_too_short");
  const row = await env.COMMONS_DB.prepare(
    `SELECT r.*,t.claim_mode,t.title,t.id AS task_id FROM task_requests r JOIN tasks t ON t.id=r.task_id
     WHERE r.id=? AND r.user_id=?`
  ).bind(requestId,user.id).first();
  if (!row || row.status!=="approved") throw new ApiError(404,"Active approved work record not found.","request_not_active");
  if (row.claim_mode==="open") throw new ApiError(400,"Open tasks do not require reservation checkpoints.","checkpoint_not_required");
  if (row.reservation_expires_at && row.reservation_expires_at<=nowIso()) throw new ApiError(409,"Reservation has expired.","reservation_expired");
  await env.COMMONS_DB.prepare(
    "UPDATE task_requests SET checkpoint_note=?,checkpoint_status='pending',last_progress_at=? WHERE id=?"
  ).bind(note,nowIso(),row.id).run();
  await notify(env,{
    kind:"checkpoint_admin",
    email:env.ADMIN_EMAIL || null,
    subject:`[PCS] Progress checkpoint: ${row.task_id} — ${user.display_name}`,
    body:`${user.display_name} submitted a checkpoint for ${row.task_id} — ${row.title}.\n\n${note}\n\nReview in the PCS admin dashboard.\n`,
  });
  await audit(env,user.id,"checkpoint_submitted","task_request",row.id,{task_id:row.task_id});
  return json({ok:true,message:"Checkpoint submitted. The reservation remains active while PCS reviews it, subject to the current reservation deadline."});
}

async function submitWork(request, env, user, requestId) {
  const body = await readBody(request);
  const row = await env.COMMONS_DB.prepare(
    `SELECT r.*,t.title,t.id AS task_id,t.min_level,t.claim_mode,t.required_skill,t.calibrates_skill,t.category,t.integration_target FROM task_requests r JOIN tasks t ON t.id=r.task_id
     WHERE r.id=? AND r.user_id=?`
  ).bind(requestId,user.id).first();
  if (!row || row.status!=="approved") throw new ApiError(404,"Active approved work record not found.","request_not_active");
  if (Number(user.level)<Number(row.min_level)) throw new ApiError(409,"Your verified level no longer meets this task requirement.","level_changed");
  if (row.required_skill) {
    const stillVerified=await env.COMMONS_DB.prepare(
      "SELECT 1 AS ok FROM skills WHERE user_id=? AND skill=? AND status='verified'"
    ).bind(user.id,row.required_skill).first();
    if (!stillVerified) throw new ApiError(409,"Your required verified skill is no longer active for this task.","skill_changed");
  }
  if (row.claim_mode!=="open" && row.reservation_expires_at && row.reservation_expires_at<=nowIso()) {
    throw new ApiError(409,"Reservation expired before submission.","reservation_expired");
  }

  const summary = cleanText(body.summary,4000);
  const artifactUrl = cleanText(body.artifact_url,1000);
  const aiUsed = body.ai_used === true;
  const aiTools = cleanText(body.ai_tools,1000);
  const verification = cleanText(body.verification_note,4000);
  const understanding = cleanText(body.understanding_note,4000);
  if (summary.length < 100) throw new ApiError(400,"Summarize the contribution in at least 100 characters.","summary_too_short");

  const highTrust = Number(row.min_level)>=2 || row.claim_mode!=="open" || Boolean(row.calibrates_skill);
  if (highTrust && verification.length < 150) throw new ApiError(400,"Higher-trust work requires a detailed independent verification note (at least 150 characters).","verification_too_short");
  if (highTrust && understanding.length < 180) throw new ApiError(400,"Higher-trust work requires an explanation showing you understand what the contribution establishes and what it does not (at least 180 characters).","understanding_too_short");
  if (aiUsed && aiTools.length < 2) throw new ApiError(400,"Name the AI tools used.","ai_tools_required");
  if (aiUsed && verification.length < 150) throw new ApiError(400,"AI-assisted work must explain how you independently checked the output.","ai_verification_required");
  if (aiUsed && understanding.length < 180) throw new ApiError(400,"AI-assisted work must explain what the output establishes, what it does not establish, and what assumptions remain.","ai_understanding_required");

  let attachmentFiles;
  try { attachmentFiles=validateContributorFiles(body.files); }
  catch(e){ throw new ApiError(400,e.message,"invalid_submission_files"); }
  const route=String(row.integration_target||"none");
  if(route!=="none"&&!attachmentFiles.length)throw new ApiError(400,"This task requires one or more source/evidence files so PCS can stage a checkable GitHub pull request.","git_artifact_required");
  if(route==="none"&&attachmentFiles.some(x=>/\.(lean|py|js|html|css)$/.test(x.filename))) {
    throw new ApiError(400,"This task is not yet configured for GitHub code contributions. Ask the Owner to set its integration target.","github_route_required");
  }
  const evidenceKind=String(body.evidence_kind||"none");
  const outcomeMetric=cleanText(body.outcome_metric,80)||null;
  const outcomeCount=body.outcome_count==null||body.outcome_count===""?null:Number(body.outcome_count);
  if(!["none","activity","outcome"].includes(evidenceKind))throw new ApiError(400,"Unknown outreach evidence type.","bad_evidence_kind");
  if(evidenceKind==="outcome"){
    if(!["qualified_reply","verified_click","consenting_signup","confirmed_meeting"].includes(outcomeMetric||"")
       || !Number.isInteger(outcomeCount)||outcomeCount<1||outcomeCount>1000000
       || !/^https:\/\//.test(artifactUrl))
      throw new ApiError(400,"Measurable outreach outcomes need a supported metric, a positive count, and a verifiable HTTPS evidence URL.","outcome_evidence_required");
  }
  if(["marketing","outreach"].includes(row.category)&&evidenceKind==="none")throw new ApiError(400,"Outreach work must distinguish a verified activity from a measured outcome.","outreach_evidence_required");
  if(evidenceKind!=="none" && !artifactUrl && !attachmentFiles.length)
    throw new ApiError(400,"Include an evidence URL or text file so an independent reviewer can verify this contribution.","evidence_required");

  const id = crypto.randomUUID();
  await env.COMMONS_DB.prepare(
    `INSERT INTO submissions(
      id,request_id,user_id,summary,artifact_url,ai_used,ai_tools,verification_note,understanding_note,submitted_at,status,
      github_stage_state,evidence_kind,outcome_metric,outcome_count
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'submitted',?,?,?,?)`
  ).bind(id,row.id,user.id,summary,artifactUrl||null,aiUsed?1:0,aiTools||null,verification,understanding,nowIso(),route==='none'?'not_applicable':'pending',evidenceKind,outcomeMetric,outcomeCount).run();
  for(const file of attachmentFiles){
    const digest=await hashSubmissionText(file.content);
    await env.COMMONS_DB.prepare(
      "INSERT INTO submission_files(submission_id,filename,content,sha256,created_at) VALUES(?,?,?,?,?)"
    ).bind(id,file.filename,file.content,digest,nowIso()).run();
  }
  let stageState=route==="none"?"not_applicable":"pending";
  if(route!=="none"){
    try{
      const staged=await stagePersistedSubmission(env,id);
      stageState=staged.state;
    }catch(e){
      stageState=githubConfigured(env)?"error":"not_configured";
      await env.COMMONS_DB.prepare(
        "UPDATE submissions SET github_stage_state=?,github_stage_error=? WHERE id=?"
      ).bind(stageState,String(e.message||"GitHub staging failed").slice(0,400),id).run();
    }
  }
  await env.COMMONS_DB.prepare("UPDATE task_requests SET last_progress_at=? WHERE id=?").bind(nowIso(),row.id).run();
  await notify(env,{
    kind:"submission_admin",
    email:env.ADMIN_EMAIL || null,
    subject:`[PCS] Submission: ${row.task_id} — ${user.display_name}`,
    body:[
      `${user.display_name} submitted work for ${row.task_id} — ${row.title}.`,
      `AI used: ${aiUsed ? "yes" : "no"}`,
      artifactUrl ? `Artifact: ${artifactUrl}` : "Artifact URL: none",
      "",
      "Summary:",
      summary,
      "",
      "Verification note:",
      verification,
      "",
      "Understanding / scope note:",
      understanding,
      "",
      `Admin dashboard: ${new URL(request.url).origin}/admin.html#submissions`,
    ].join("\n"),
  });
  await audit(env,user.id,"submission_created","submission",id,{
    task_id:row.task_id,ai_used:aiUsed,attachments:attachmentFiles.length,github_stage_state:stageState,
    evidence_kind:evidenceKind,outcome_metric:outcomeMetric,outcome_count:outcomeCount
  });
  return json({ok:true,submission_id:id,github_stage_state:stageState,
    message:route==="none"
      ? "Contribution and its evidence have been saved for independent review."
      : stageState==="staged"
        ? "GitHub pull request opened. PCS will show the CI result before integration."
        : "Contribution saved; GitHub staging is pending administrator setup or retry. No passing CI result has been claimed."
  },201);
}

async function withdrawRequest(request, env, user, requestId) {
  const row = await env.COMMONS_DB.prepare("SELECT * FROM task_requests WHERE id=? AND user_id=?").bind(requestId,user.id).first();
  if (!row || !["pending","approved"].includes(row.status)) throw new ApiError(404,"Active request not found.","request_not_active");
  await env.COMMONS_DB.prepare("UPDATE task_requests SET status='withdrawn',decision_at=?,decision_note=?,reservation_key=NULL WHERE id=?").bind(nowIso(),"Withdrawn by contributor.",row.id).run();
  await audit(env,user.id,"task_request_withdrawn","task_request",row.id,{task_id:row.task_id});
  return json({ok:true,message:"Task released/withdrawn. No penalty is applied for ordinary withdrawal."});
}

async function listRoles(request, env) {
  const user=await currentUser(request,env);
  const roles=await env.COMMONS_DB.prepare(
    `SELECT * FROM role_openings WHERE publication_state='published' ORDER BY priority DESC,id`
  ).all();
  let applications=new Map();
  if(user){
    const own=await env.COMMONS_DB.prepare(
      "SELECT id,role_id,status,requested_at,decided_at,decision_note FROM role_applications WHERE user_id=? ORDER BY requested_at DESC"
    ).bind(user.id).all();
    for(const row of own.results||[])if(!applications.has(row.role_id))applications.set(row.role_id,row);
  }
  return json({
    user:user?publicUser(user):null,
    roles:(roles.results||[]).map(role=>({
      ...role,
      eligibility:!user
        ? {state:"login_required",can_apply:false,reason:"Sign in to apply."}
        : user.status!=="active"
          ? {state:"locked",can_apply:false,reason:"Account is not active."}
          : Number(user.level)<Number(role.min_level)
            ? {state:"level_required",can_apply:false,reason:`Requires at least L${role.min_level}; your verified level is L${user.level}.`}
            : {state:"eligible",can_apply:true,reason:"Eligible to submit an application for manual review."},
      my_application:applications.get(role.id)||null,
    })),
  });
}

async function applyForRole(request, env, user, roleId) {
  await rateLimit(request,env,"role-application",12,60);
  const role=await env.COMMONS_DB.prepare(
    "SELECT * FROM role_openings WHERE id=? AND publication_state='published'"
  ).bind(roleId).first();
  if(!role)throw new ApiError(404,"Role opening not found.","role_not_found");
  if(user.status!=="active")throw new ApiError(403,"Account is not active.","account_inactive");
  if(Number(user.level)<Number(role.min_level))throw new ApiError(403,`This role requires at least L${role.min_level}.`,"level_required");
  if(role.required_skill){
    const skill=await env.COMMONS_DB.prepare(
      "SELECT 1 AS ok FROM skills WHERE user_id=? AND skill=? AND status='verified'"
    ).bind(user.id,role.required_skill).first();
    if(!skill)throw new ApiError(403,`This role requires verified ${role.required_skill}.`,"skill_required");
  }
  const existing=await env.COMMONS_DB.prepare(
    "SELECT id FROM role_applications WHERE role_id=? AND user_id=? AND status='pending'"
  ).bind(role.id,user.id).first();
  if(existing)throw new ApiError(409,"You already have a pending application for this role.","role_application_pending");
  const body=await readBody(request);
  const note=cleanText(body.note,3000);
  const experience=cleanText(body.experience,3000);
  const availability=cleanText(body.availability,1000);
  if(note.length<120)throw new ApiError(400,"Explain why you want the role and how you would contribute (at least 120 characters).","role_note_required");
  if(experience.length<80)throw new ApiError(400,"Give relevant experience or equivalent evidence (at least 80 characters).","role_experience_required");
  if(availability.length<20)throw new ApiError(400,"Describe your expected availability.","role_availability_required");
  const id=crypto.randomUUID();
  const now=nowIso();
  await env.COMMONS_DB.prepare(
    `INSERT INTO role_applications(id,role_id,user_id,note,experience,availability,status,requested_at)
     VALUES(?,?,?,?,?,?,'pending',?)`
  ).bind(id,role.id,user.id,note,experience,availability,now).run();
  await notify(env,{
    kind:"role_application_admin",
    email:env.ADMIN_EMAIL||null,
    subject:`[PCS] Role application: ${role.title} — ${user.display_name}`,
    body:[
      `${user.display_name} <${user.email}> applied for ${role.id} — ${role.title}.`,
      `Verified level: L${user.level}`,
      "",
      "Why / contribution plan:",note,
      "",
      "Relevant experience:",experience,
      "",
      "Availability:",availability,
      "",
      `Admin dashboard: ${new URL(request.url).origin}/admin.html#roles`,
    ].join("\n")
  });
  await notify(env,{
    userId:user.id,
    email:user.email_verified?user.email:null,
    kind:"role_application_received",
    subject:`PCS received your role application: ${role.title}`,
    body:`PCS received your application for ${role.title}. This is an ongoing role application, not a task reservation. PCS will review it manually.\n`
  });
  await audit(env,user.id,"role_application_created","role_application",id,{role_id:role.id});
  return json({ok:true,application_id:id,status:"pending",message:"Role application received for manual review."},201);
}

async function withdrawRoleApplication(request, env, user, applicationId) {
  const row=await env.COMMONS_DB.prepare(
    "SELECT * FROM role_applications WHERE id=? AND user_id=?"
  ).bind(applicationId,user.id).first();
  if(!row||row.status!=="pending")throw new ApiError(404,"Pending role application not found.","role_application_not_pending");
  await env.COMMONS_DB.prepare(
    "UPDATE role_applications SET status='withdrawn',decided_at=? WHERE id=? AND status='pending'"
  ).bind(nowIso(),row.id).run();
  await audit(env,user.id,"role_application_withdrawn","role_application",row.id,{role_id:row.role_id});
  return json({ok:true,status:"withdrawn"});
}

async function adminRoleDecision(request, env, admin, applicationId) {
  const body=await readBody(request);
  const decision=String(body.decision||"");
  const note=cleanText(body.note,3000);
  if(!["approve","reject"].includes(decision))throw new ApiError(400,"Decision must be approve or reject.","bad_role_decision");
  if(note.length<20)throw new ApiError(400,"Give a decision rationale of at least 20 characters.","decision_note_required");
  const row=await env.COMMONS_DB.prepare(
    `SELECT a.*,r.title,u.display_name,u.email,u.email_verified
     FROM role_applications a JOIN role_openings r ON r.id=a.role_id JOIN users u ON u.id=a.user_id
     WHERE a.id=?`
  ).bind(applicationId).first();
  if(!row||row.status!=="pending")throw new ApiError(404,"Pending role application not found.","role_application_not_pending");
  const status=decision==="approve"?"approved":"rejected";
  const changed=await env.COMMONS_DB.prepare(
    "UPDATE role_applications SET status=?,decided_at=?,decided_by=?,decision_note=? WHERE id=? AND status='pending'"
  ).bind(status,nowIso(),admin.id,note,row.id).run();
  if(Number(changed?.meta?.changes||0)!==1)throw new ApiError(409,"This role application was already decided.","role_application_already_decided");
  await notify(env,{
    userId:row.user_id,
    email:row.email_verified?row.email:null,
    kind:"role_application_decision",
    subject:`PCS role application: ${row.title}`,
    body:`Your application for ${row.title} was marked ${status}.\n\nDecision note: ${note}\n`
  });
  await audit(env,admin.id,"role_application_decided","role_application",row.id,{role_id:row.role_id,status});
  return json({ok:true,status});
}

async function adminCreateTask(request, env, admin) {
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can create marketplace work.","owner_required");
  const body=await readBody(request);
  const id=String(body.id||"").trim().toUpperCase();
  const title=cleanText(body.title,160);
  const summary=cleanText(body.summary,1200);
  const whyNow=cleanText(body.why_now,2000);
  const deliverable=cleanText(body.deliverable,3000);
  const verification=cleanText(body.verification_rule,3000);
  const criteria=cleanText(body.acceptance_criteria,3000);
  const successMetric=cleanText(body.success_metric,2000);
  const category=String(body.category||"research");
  const claimMode=String(body.claim_mode||"open");
  const requiredSkill=String(body.required_skill||"").trim()||null;
  const minLevel=Number(body.min_level??0);
  const expectedMinutes=Number(body.expected_minutes??Number(body.expected_hours??1)*60);
  const expectedHours=Math.max(1,Math.ceil(expectedMinutes/60));
  const integrationTarget=String(body.integration_target||"none");
  const priority=Math.max(0,Math.min(100,Math.trunc(Number(body.priority??50))));
  const compensationType=String(body.compensation_type||"volunteer");
  const compensationLabel=cleanText(body.compensation_label,120)||"Volunteer";
  const fundingStatus=String(body.funding_status||"open");
  const categories=new Set(["research","engineering","security","review","operations","administrative","marketing","outreach","design","documentation","community"]);
  if(!/^[A-Z][A-Z0-9._-]{2,31}$/.test(id))throw new ApiError(400,"Task ID must be 3–32 uppercase letters/numbers/dashes/dots/underscores.","bad_task_id");
  if(title.length<5||summary.length<30)throw new ApiError(400,"Give the task a clear title and summary.","bad_task_copy");
  if(whyNow.length<30)throw new ApiError(400,"Explain why PCS needs this task now (at least 30 characters).","why_now_required");
  if(deliverable.length<30||verification.length<30||criteria.length<30)throw new ApiError(400,"Deliverable, verification rule, and acceptance criteria must each be specific.","task_contract_required");
  if(!categories.has(category))throw new ApiError(400,"Invalid task category.","bad_task_category");
  if(!["open","approval","invite"].includes(claimMode))throw new ApiError(400,"Invalid claim mode.","bad_claim_mode");
  if(!Number.isInteger(minLevel)||minLevel<0||minLevel>6)throw new ApiError(400,"Minimum level must be L0–L6.","bad_level");
  if(!Number.isInteger(expectedMinutes)||expectedMinutes<10||expectedMinutes>4800)throw new ApiError(400,"Expected duration must be between 10 minutes and 80 hours.","bad_duration");
  if(!["none","core","site"].includes(integrationTarget))throw new ApiError(400,"Invalid GitHub integration target.","bad_integration_target");
  if(requiredSkill&&!SKILLS.has(requiredSkill))throw new ApiError(400,"Required skill is not supported.","bad_skill");
  if(!["volunteer","bounty","review","contract"].includes(compensationType))throw new ApiError(400,"Invalid compensation type.","bad_compensation");
  if(!["open","planned","funded"].includes(fundingStatus))throw new ApiError(400,"Invalid funding status.","bad_funding_status");
  const existing=await env.COMMONS_DB.prepare("SELECT 1 AS ok FROM tasks WHERE id=?").bind(id).first();
  if(existing)throw new ApiError(409,"A task with that ID already exists.","task_exists");
  const now=nowIso();
  await env.COMMONS_DB.prepare(
    `INSERT INTO tasks(
      id,title,summary,min_level,claim_mode,required_skill,calibrates_skill,expected_hours,
      review_sla_business_days,checkpoint_hours,reservation_hours,max_active_per_user,status,
      compensation_type,compensation_label,funding_status,created_at,updated_at,
      deliverable,verification_rule,acceptance_criteria,publication_state,category,work_type,
      need_status,priority,why_now,success_metric,expected_minutes,integration_target
    ) VALUES(?,?,?,?,?,?,NULL,?,2,24,72,1,'open',?,?,?,?,?,?,?,?,'draft',?,'task','needed',?,?,?,?,?)`
  ).bind(
    id,title,summary,minLevel,claimMode,requiredSkill,expectedHours,
    compensationType,compensationLabel,fundingStatus,now,now,
    deliverable,verification,criteria,category,priority,whyNow,successMetric||null,expectedMinutes,integrationTarget
  ).run();
  await audit(env,admin.id,"task_draft_created","task",id,{
    category,min_level:minLevel,claim_mode:claimMode,required_skill:requiredSkill,
    expected_hours:expectedHours,expected_minutes:expectedMinutes,integration_target:integrationTarget,priority,why_now:whyNow
  });
  return json({ok:true,task_id:id,publication_state:"draft",message:"Draft task created. Review it in Marketplace publication before publishing."},201);
}

async function adminCurateTask(request, env, admin, taskId) {
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can publish or retire marketplace work.","owner_required");
  const task=await env.COMMONS_DB.prepare("SELECT * FROM tasks WHERE id=?").bind(taskId).first();
  if(!task)throw new ApiError(404,"Task not found.","task_not_found");
  const body=await readBody(request);
  const publication=String(body.publication_state||task.publication_state||"draft");
  const need=String(body.need_status||task.need_status||"needed");
  const category=String(body.category||task.category||"research");
  const reason=cleanText(body.reason,2000);
  const whyNow=cleanText(body.why_now,2000)||task.why_now||"";
  const minutesRaw=Number(body.expected_minutes??task.expected_minutes??Number(task.expected_hours)*60);
  const integrationTarget=String(body.integration_target||task.integration_target||"none");
  if(!Number.isInteger(minutesRaw)||minutesRaw<10||minutesRaw>4800)throw new ApiError(400,"Duration must be 10–4800 minutes.","bad_duration");
  if(!["none","core","site"].includes(integrationTarget))throw new ApiError(400,"Invalid GitHub target.","bad_integration_target");
  const priorityRaw=Number(body.priority??task.priority??50);
  const priority=Math.max(0,Math.min(100,Number.isFinite(priorityRaw)?Math.trunc(priorityRaw):50));
  const publications=new Set(["draft","published","paused","retired"]);
  const needs=new Set(["needed","satisfied","retired"]);
  const categories=new Set(["research","engineering","security","review","operations","administrative","marketing","outreach","design","documentation","community"]);
  if(!publications.has(publication))throw new ApiError(400,"Invalid publication state.","bad_publication_state");
  if(!needs.has(need))throw new ApiError(400,"Invalid need status.","bad_need_status");
  if(!categories.has(category))throw new ApiError(400,"Invalid task category.","bad_task_category");
  if(reason.length<20)throw new ApiError(400,"Give a curation rationale of at least 20 characters.","curation_reason_required");
  const publishedAt=publication==="published"?(task.published_at||nowIso()):task.published_at;
  const retiredAt=publication==="retired"||need==="retired"||need==="satisfied"?nowIso():null;
  await env.COMMONS_DB.prepare(
    `UPDATE tasks SET publication_state=?,need_status=?,category=?,priority=?,why_now=?,published_at=?,retired_at=?,expected_minutes=?,expected_hours=?,integration_target=?,updated_at=? WHERE id=?`
  ).bind(publication,need,category,priority,whyNow,publishedAt,retiredAt,minutesRaw,Math.ceil(minutesRaw/60),integrationTarget,nowIso(),task.id).run();
  await audit(env,admin.id,"task_curated","task",task.id,{
    from:{publication_state:task.publication_state,need_status:task.need_status,category:task.category,priority:Number(task.priority||50),integration_target:task.integration_target,expected_minutes:task.expected_minutes},
    to:{publication_state:publication,need_status:need,category,priority,integration_target:integrationTarget,expected_minutes:minutesRaw},
    rationale:reason,
    why_now:whyNow
  });
  return json({ok:true,task_id:task.id,publication_state:publication,need_status:need,category,priority});
}

async function dependencyWouldCycle(env, taskId, prerequisiteId) {
  if(taskId===prerequisiteId)return true;
  const row=await env.COMMONS_DB.prepare(
    `WITH RECURSIVE prereq(id) AS (
       SELECT depends_on_task_id FROM task_dependencies WHERE task_id=?
       UNION
       SELECT d.depends_on_task_id
       FROM task_dependencies d JOIN prereq p ON d.task_id=p.id
     )
     SELECT 1 AS cycle FROM prereq WHERE id=? LIMIT 1`
  ).bind(prerequisiteId,taskId).first();
  return Boolean(row);
}

async function adminUpsertDependencyGroup(request, env, admin, taskId) {
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can change task dependency gates.","owner_required");
  const task=await env.COMMONS_DB.prepare("SELECT id,title FROM tasks WHERE id=?").bind(taskId).first();
  if(!task)throw new ApiError(404,"Task not found.","task_not_found");
  const body=await readBody(request);
  const id=String(body.id||"").trim();
  const label=cleanText(body.label,200);
  const mode=String(body.mode||"all");
  const minSatisfied=Number(body.min_satisfied??1);
  const description=cleanText(body.description,1600);
  const sortOrder=Math.max(0,Math.min(999,Math.trunc(Number(body.sort_order??0))));
  const reason=cleanText(body.reason,2000);
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(id))throw new ApiError(400,"Dependency-group ID must be 3–64 safe characters.","bad_dependency_group_id");
  if(label.length<5)throw new ApiError(400,"Give the dependency group a clear label.","dependency_group_label_required");
  if(!["all","any","at_least"].includes(mode))throw new ApiError(400,"Dependency-group mode must be all, any, or at_least.","bad_dependency_group_mode");
  if(!Number.isInteger(minSatisfied)||minSatisfied<1||minSatisfied>100)throw new ApiError(400,"min_satisfied must be an integer from 1 to 100.","bad_dependency_group_threshold");
  if(description.length<20)throw new ApiError(400,"Describe what this gate means in at least 20 characters.","dependency_group_description_required");
  if(reason.length<20)throw new ApiError(400,"Give an audited reason for this graph change.","dependency_change_reason_required");
  const existing=await env.COMMONS_DB.prepare("SELECT * FROM task_dependency_groups WHERE id=?").bind(id).first();
  if(existing&&existing.task_id!==taskId)throw new ApiError(409,"That dependency-group ID already belongs to another task.","dependency_group_conflict");
  await env.COMMONS_DB.prepare(
    `INSERT INTO task_dependency_groups(id,task_id,label,mode,min_satisfied,description,sort_order)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       label=excluded.label,mode=excluded.mode,min_satisfied=excluded.min_satisfied,
       description=excluded.description,sort_order=excluded.sort_order`
  ).bind(id,taskId,label,mode,minSatisfied,description,sortOrder).run();
  await audit(env,admin.id,existing?"dependency_group_updated":"dependency_group_created","task",taskId,{
    group_id:id,label,mode,min_satisfied:minSatisfied,description,sort_order:sortOrder,rationale:reason
  });
  return json({ok:true,group_id:id,task_id:taskId});
}

async function adminDeleteDependencyGroup(request, env, admin, taskId, groupId) {
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can change task dependency gates.","owner_required");
  const group=await env.COMMONS_DB.prepare("SELECT * FROM task_dependency_groups WHERE id=? AND task_id=?").bind(groupId,taskId).first();
  if(!group)throw new ApiError(404,"Dependency group not found.","dependency_group_not_found");
  const body=await readBody(request);
  const reason=cleanText(body.reason,2000);
  if(reason.length<20)throw new ApiError(400,"Give an audited reason for removing this gate.","dependency_change_reason_required");
  const members=await env.COMMONS_DB.prepare("SELECT COUNT(*) AS n FROM task_dependencies WHERE task_id=? AND group_id=?").bind(taskId,groupId).first();
  if(Number(members?.n||0)>0)throw new ApiError(409,"Move or delete the group's dependency edges before deleting the group.","dependency_group_not_empty");
  await env.COMMONS_DB.prepare("DELETE FROM task_dependency_groups WHERE id=? AND task_id=?").bind(groupId,taskId).run();
  await audit(env,admin.id,"dependency_group_deleted","task",taskId,{group_id:groupId,rationale:reason});
  return json({ok:true});
}

async function adminUpsertDependency(request, env, admin, taskId) {
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can change task dependencies.","owner_required");
  const task=await env.COMMONS_DB.prepare("SELECT id,title FROM tasks WHERE id=?").bind(taskId).first();
  if(!task)throw new ApiError(404,"Task not found.","task_not_found");
  const body=await readBody(request);
  const prerequisiteId=String(body.depends_on_task_id||"").trim();
  const dependencyType=String(body.dependency_type||"hard");
  const groupId=String(body.group_id||"").trim()||null;
  const relation=cleanText(body.relation,120)||"requires";
  const requiredOutcome=cleanText(body.required_outcome,120)||"completed";
  const artifactContract=cleanText(body.artifact_contract,3000);
  const rationale=cleanText(body.rationale,2000);
  const criticality=Math.max(0,Math.min(100,Math.trunc(Number(body.criticality??50))));
  const changeReason=cleanText(body.change_reason,2000);
  if(!["hard","informative"].includes(dependencyType))throw new ApiError(400,"Dependency type must be hard or informative.","bad_dependency_type");
  if(relation.length<3)throw new ApiError(400,"Give the edge a semantic relation label.","dependency_relation_required");
  if(artifactContract.length<20)throw new ApiError(400,"Describe the upstream artifact/output this edge consumes.","dependency_artifact_contract_required");
  if(rationale.length<20)throw new ApiError(400,"Explain why this dependency exists.","dependency_rationale_required");
  if(changeReason.length<20)throw new ApiError(400,"Give an audited reason for this graph change.","dependency_change_reason_required");
  const prerequisite=await env.COMMONS_DB.prepare("SELECT id,title FROM tasks WHERE id=?").bind(prerequisiteId).first();
  if(!prerequisite)throw new ApiError(404,"Prerequisite task not found.","prerequisite_task_not_found");
  if(await dependencyWouldCycle(env,taskId,prerequisiteId))throw new ApiError(409,"This edge would create a dependency cycle.","dependency_cycle");
  if(groupId){
    if(dependencyType!=="hard")throw new ApiError(400,"Only hard dependencies may belong to a blocking gate group.","informative_group_not_allowed");
    const group=await env.COMMONS_DB.prepare("SELECT 1 AS ok FROM task_dependency_groups WHERE id=? AND task_id=?").bind(groupId,taskId).first();
    if(!group)throw new ApiError(400,"Selected dependency group does not belong to this task.","dependency_group_mismatch");
  }
  const existing=await env.COMMONS_DB.prepare(
    "SELECT * FROM task_dependencies WHERE task_id=? AND depends_on_task_id=?"
  ).bind(taskId,prerequisiteId).first();
  await env.COMMONS_DB.prepare(
    `INSERT INTO task_dependencies(
       task_id,depends_on_task_id,dependency_type,rationale,group_id,relation,required_outcome,artifact_contract,criticality
     ) VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(task_id,depends_on_task_id) DO UPDATE SET
       dependency_type=excluded.dependency_type,rationale=excluded.rationale,group_id=excluded.group_id,
       relation=excluded.relation,required_outcome=excluded.required_outcome,
       artifact_contract=excluded.artifact_contract,criticality=excluded.criticality`
  ).bind(taskId,prerequisiteId,dependencyType,rationale,groupId,relation,requiredOutcome,artifactContract,criticality).run();
  await audit(env,admin.id,existing?"task_dependency_updated":"task_dependency_created","task",taskId,{
    depends_on_task_id:prerequisiteId,dependency_type:dependencyType,group_id:groupId,
    relation,required_outcome:requiredOutcome,artifact_contract:artifactContract,
    criticality,rationale,change_reason:changeReason
  });
  return json({ok:true,task_id:taskId,depends_on_task_id:prerequisiteId});
}

async function adminDeleteDependency(request, env, admin, taskId, prerequisiteId) {
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can change task dependencies.","owner_required");
  const edge=await env.COMMONS_DB.prepare(
    "SELECT * FROM task_dependencies WHERE task_id=? AND depends_on_task_id=?"
  ).bind(taskId,prerequisiteId).first();
  if(!edge)throw new ApiError(404,"Dependency edge not found.","dependency_not_found");
  const body=await readBody(request);
  const reason=cleanText(body.reason,2000);
  if(reason.length<20)throw new ApiError(400,"Give an audited reason for deleting this dependency.","dependency_change_reason_required");
  await env.COMMONS_DB.prepare(
    "DELETE FROM task_dependencies WHERE task_id=? AND depends_on_task_id=?"
  ).bind(taskId,prerequisiteId).run();
  await audit(env,admin.id,"task_dependency_deleted","task",taskId,{depends_on_task_id:prerequisiteId,rationale:reason});
  return json({ok:true});
}

function challengeScore(challengeId, counts) {
  if(challengeId!=="ARENA-INV-001"){
    throw new ApiError(503,"This challenge does not yet have an executable PCS scoring adapter.","challenge_scorer_unavailable");
  }
  return 10*Number(counts.workflow_nodes||0)
    + 5*Number(counts.dependency_edges||0)
    + 5*Number(counts.evidence_items||0)
    + 5*Number(counts.claims||0);
}

function challengeCounts(body) {
  const fields=["workflow_nodes","dependency_edges","evidence_items","claims"];
  const out={};
  for(const field of fields){
    const value=Number(body[field]);
    if(!Number.isInteger(value)||value<0||value>1000)throw new ApiError(400,"Challenge structure counts must be non-negative integers.","bad_challenge_counts");
    out[field]=value;
  }
  if(out.evidence_items<1||out.claims<2){
    throw new ApiError(400,"Counterexample Golf requires at least one evidence item and two claims.","challenge_structure_too_small");
  }
  return out;
}

function validHttpsUrl(value) {
  try {
    const parsed=new URL(String(value||""));
    return parsed.protocol==="https:" && parsed.hostname.length>0;
  } catch { return false; }
}

async function listChallenges(request, env) {
  const user=await currentUser(request,env);
  const challenges=await env.COMMONS_DB.prepare(
    `SELECT c.*,t.title AS task_title,t.publication_state AS task_publication_state
     FROM challenges c LEFT JOIN tasks t ON t.id=c.task_id
     WHERE c.leaderboard_state IN ('pilot','live')
       AND (c.opens_at IS NULL OR c.opens_at<=?)
       AND (c.closes_at IS NULL OR c.closes_at>?)
     ORDER BY CASE c.leaderboard_state WHEN 'live' THEN 0 ELSE 1 END,c.id`
  ).bind(nowIso(),nowIso()).all();

  const verified=await env.COMMONS_DB.prepare(
    `SELECT e.id,e.challenge_id,e.user_id,e.leaderboard_alias,e.raw_score,e.summary,e.artifact_url,
            e.workflow_nodes,e.dependency_edges,e.evidence_items,e.claims,e.verified_at
     FROM challenge_entries e JOIN challenges c ON c.id=e.challenge_id
     WHERE e.status='verified' AND c.leaderboard_state IN ('pilot','live')
     ORDER BY e.challenge_id,e.raw_score ASC,e.verified_at ASC`
  ).all();

  const bestByChallenge=new Map();
  for(const row of verified.results||[]){
    if(!bestByChallenge.has(row.challenge_id))bestByChallenge.set(row.challenge_id,new Map());
    const byUser=bestByChallenge.get(row.challenge_id);
    const previous=byUser.get(row.user_id);
    const challenge=(challenges.results||[]).find(c=>c.id===row.challenge_id);
    const better=!previous || (challenge?.score_direction==="max" ? Number(row.raw_score)>Number(previous.raw_score) : Number(row.raw_score)<Number(previous.raw_score));
    if(better)byUser.set(row.user_id,row);
  }

  let ownByChallenge=new Map();
  if(user){
    const own=await env.COMMONS_DB.prepare(
      `SELECT id,challenge_id,leaderboard_alias,artifact_url,raw_score,status,submitted_at,verified_at,review_note
       FROM challenge_entries WHERE user_id=? ORDER BY submitted_at DESC`
    ).bind(user.id).all();
    for(const row of own.results||[]){
      if(!ownByChallenge.has(row.challenge_id))ownByChallenge.set(row.challenge_id,[]);
      ownByChallenge.get(row.challenge_id).push(row);
    }
  }

  return json({
    user:user?publicUser(user):null,
    challenges:(challenges.results||[]).map(challenge=>{
      const best=[...(bestByChallenge.get(challenge.id)?.values()||[])].sort((a,b)=>
        challenge.score_direction==="max"
          ? Number(b.raw_score)-Number(a.raw_score)
          : Number(a.raw_score)-Number(b.raw_score)
      ).slice(0,25).map((row,index)=>({
        rank:index+1,
        entry_id:row.id,
        alias:row.leaderboard_alias,
        score:Number(row.raw_score),
        summary:row.summary,
        artifact_url:row.artifact_url,
        workflow_nodes:Number(row.workflow_nodes),
        dependency_edges:Number(row.dependency_edges),
        evidence_items:Number(row.evidence_items),
        claims:Number(row.claims),
        verified_at:row.verified_at,
      }));
      const eligibility=!user
        ? {state:"login_required",can_submit:false,reason:"Sign in to enter this challenge."}
        : user.status!=="active"
          ? {state:"locked",can_submit:false,reason:"Account is not active."}
          : Number(user.level)<Number(challenge.min_level)
            ? {state:"level_required",can_submit:false,reason:`Requires at least L${challenge.min_level}; your verified level is L${user.level}.`}
            : {state:"eligible",can_submit:true,reason:"Eligible to submit. Leaderboard placement still requires validity review."};
      return {...challenge,leaderboard:best,eligibility,my_entries:ownByChallenge.get(challenge.id)||[]};
    })
  });
}

async function submitChallengeEntry(request, env, user, challengeId) {
  await rateLimit(request,env,"challenge-entry",20,60);
  const challenge=await env.COMMONS_DB.prepare(
    `SELECT * FROM challenges WHERE id=? AND leaderboard_state IN ('pilot','live')
       AND (opens_at IS NULL OR opens_at<=?) AND (closes_at IS NULL OR closes_at>?)`
  ).bind(challengeId,nowIso(),nowIso()).first();
  if(!challenge)throw new ApiError(404,"Challenge is not currently open.","challenge_not_open");
  if(user.status!=="active")throw new ApiError(403,"Account is not active.","account_inactive");
  if(Number(user.level)<Number(challenge.min_level))throw new ApiError(403,`This challenge requires at least L${challenge.min_level}.`,"level_required");

  const since=addHoursIso(nowIso(),-24);
  const recent=await env.COMMONS_DB.prepare(
    "SELECT COUNT(*) AS n FROM challenge_entries WHERE challenge_id=? AND user_id=? AND submitted_at>=? AND status!='withdrawn'"
  ).bind(challenge.id,user.id,since).first();
  if(Number(recent?.n||0)>=Number(challenge.max_entries_per_day||5)){
    throw new ApiError(429,`You may submit at most ${challenge.max_entries_per_day} entries to this challenge per 24 hours.`,"challenge_entry_limit");
  }

  const body=await readBody(request);
  const alias=cleanText(body.leaderboard_alias,32);
  const artifactUrl=cleanText(body.artifact_url,1000);
  const summary=cleanText(body.summary,3000);
  const explanation=cleanText(body.hidden_dependency_explanation,4000);
  if(!/^[A-Za-z0-9][A-Za-z0-9 _.-]{1,31}$/.test(alias))throw new ApiError(400,"Leaderboard alias must be 2–32 letters/numbers/spaces/dashes/dots/underscores.","bad_leaderboard_alias");
  if(!validHttpsUrl(artifactUrl))throw new ApiError(400,"Provide a public HTTPS artifact URL that a reviewer can inspect.","bad_artifact_url");
  if(summary.length<100)throw new ApiError(400,"Summarize the candidate counterexample in at least 100 characters.","challenge_summary_required");
  if(explanation.length<120)throw new ApiError(400,"Explain the hidden dependency and why the declared graph misses the affected claim in at least 120 characters.","challenge_explanation_required");
  const counts=challengeCounts(body);
  const aliasConflict=await env.COMMONS_DB.prepare(
    `SELECT 1 AS ok FROM challenge_entries
     WHERE challenge_id=? AND lower(leaderboard_alias)=lower(?) AND user_id!=?
       AND status IN ('pending','verified') LIMIT 1`
  ).bind(challenge.id,alias,user.id).first();
  if(aliasConflict)throw new ApiError(409,"That leaderboard alias is already in use for this challenge.","leaderboard_alias_taken");
  const score=challengeScore(challenge.id,counts);
  const id=crypto.randomUUID(),submittedAt=nowIso();
  await env.COMMONS_DB.prepare(
    `INSERT INTO challenge_entries(
      id,challenge_id,user_id,leaderboard_alias,artifact_url,summary,hidden_dependency_explanation,
      workflow_nodes,dependency_edges,evidence_items,claims,raw_score,status,submitted_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`
  ).bind(
    id,challenge.id,user.id,alias,artifactUrl,summary,explanation,
    counts.workflow_nodes,counts.dependency_edges,counts.evidence_items,counts.claims,score,submittedAt
  ).run();
  await notify(env,{
    kind:"challenge_entry_admin",
    email:env.ADMIN_EMAIL||null,
    subject:`[PCS Arena] Review ${challenge.id}: ${alias} · provisional score ${score}`,
    body:[
      `${user.display_name} <${user.email}> submitted a PCS Arena entry.`,
      `Challenge: ${challenge.id} — ${challenge.title}`,
      `Alias: ${alias}`,
      `Provisional score: ${score} (lower is better)`,
      `Artifact: ${artifactUrl}`,
      "",
      "Summary:",summary,
      "",
      "Hidden-dependency explanation:",explanation,
      "",
      `Admin dashboard: ${new URL(request.url).origin}/admin.html#arena`
    ].join("\n")
  });
  await audit(env,user.id,"challenge_entry_created","challenge_entry",id,{challenge_id:challenge.id,alias,provisional_score:score,counts});
  return json({
    ok:true,entry_id:id,status:"pending",provisional_score:score,
    message:"Arena entry received. The score is provisional until a reviewer validates the counterexample and structure counts."
  },201);
}

async function withdrawChallengeEntry(request, env, user, entryId) {
  const row=await env.COMMONS_DB.prepare(
    "SELECT * FROM challenge_entries WHERE id=? AND user_id=?"
  ).bind(entryId,user.id).first();
  if(!row||row.status!=="pending")throw new ApiError(404,"Pending challenge entry not found.","challenge_entry_not_pending");
  const changed=await env.COMMONS_DB.prepare(
    "UPDATE challenge_entries SET status='withdrawn' WHERE id=? AND user_id=? AND status='pending'"
  ).bind(row.id,user.id).run();
  if(Number(changed?.meta?.changes||0)!==1)throw new ApiError(409,"Challenge entry was already decided.","challenge_entry_already_decided");
  await audit(env,user.id,"challenge_entry_withdrawn","challenge_entry",row.id,{challenge_id:row.challenge_id});
  return json({ok:true,status:"withdrawn"});
}

async function adminChallengeDecision(request, env, admin, entryId) {
  const row=await env.COMMONS_DB.prepare(
    `SELECT e.*,c.title,c.score_direction,u.display_name,u.email,u.email_verified
     FROM challenge_entries e JOIN challenges c ON c.id=e.challenge_id JOIN users u ON u.id=e.user_id
     WHERE e.id=?`
  ).bind(entryId).first();
  if(!row||row.status!=="pending")throw new ApiError(404,"Pending challenge entry not found.","challenge_entry_not_pending");
  const body=await readBody(request);
  const decision=String(body.decision||"");
  const note=cleanText(body.note,3000);
  if(!["verify","reject"].includes(decision))throw new ApiError(400,"Decision must be verify or reject.","bad_challenge_decision");
  if(note.length<20)throw new ApiError(400,"Give a review rationale of at least 20 characters.","decision_note_required");

  let counts={
    workflow_nodes:Number(row.workflow_nodes),
    dependency_edges:Number(row.dependency_edges),
    evidence_items:Number(row.evidence_items),
    claims:Number(row.claims),
  };
  if(decision==="verify"){
    counts=challengeCounts({
      workflow_nodes:body.workflow_nodes??row.workflow_nodes,
      dependency_edges:body.dependency_edges??row.dependency_edges,
      evidence_items:body.evidence_items??row.evidence_items,
      claims:body.claims??row.claims,
    });
  }
  const score=challengeScore(row.challenge_id,counts);
  const status=decision==="verify"?"verified":"rejected";
  const verifiedAt=decision==="verify"?nowIso():null;
  const changed=await env.COMMONS_DB.prepare(
    `UPDATE challenge_entries SET status=?,workflow_nodes=?,dependency_edges=?,evidence_items=?,claims=?,
       raw_score=?,verified_at=?,verified_by=?,review_note=? WHERE id=? AND status='pending'`
  ).bind(
    status,counts.workflow_nodes,counts.dependency_edges,counts.evidence_items,counts.claims,
    score,verifiedAt,admin.id,note,row.id
  ).run();
  if(Number(changed?.meta?.changes||0)!==1)throw new ApiError(409,"Challenge entry was already decided.","challenge_entry_already_decided");
  await notify(env,{
    userId:row.user_id,
    email:row.email_verified?row.email:null,
    kind:"challenge_entry_decision",
    subject:`PCS Arena review: ${row.title}`,
    body:decision==="verify"
      ? `Your PCS Arena entry was validated and is now leaderboard-eligible with verified score ${score}.\n\nReview note: ${note}\n`
      : `Your PCS Arena entry was not validated for the leaderboard.\n\nReview note: ${note}\n`
  });
  await audit(env,admin.id,"challenge_entry_decided","challenge_entry",row.id,{
    challenge_id:row.challenge_id,status,verified_score:decision==="verify"?score:null,counts,rationale:note
  });
  return json({ok:true,status,score:decision==="verify"?score:null});
}

async function adminOverview(request, env) {
  const admin = await requireAdmin(request,env);
  await expireStaleWork(env);
  await remindPendingReviews(env);
  const [pending, checkpoints, submissions, skillReviews, users, verifiedSkills, curatedTasks, roleApplications, challengeEntries, dependencyEdges, dependencyGroups] = await Promise.all([
    env.COMMONS_DB.prepare(
      `SELECT r.*,t.title,t.min_level,t.claim_mode,t.required_skill,t.compensation_label,
              u.display_name,u.email,u.level,u.email_verified,
              CASE WHEN t.required_skill IS NULL THEN 1
                   WHEN EXISTS(SELECT 1 FROM skills sk WHERE sk.user_id=r.user_id AND sk.skill=t.required_skill AND sk.status='verified') THEN 1
                   ELSE 0 END AS required_skill_verified
       FROM task_requests r JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=r.user_id
       WHERE r.status='pending' ORDER BY r.decision_due_at ASC,r.requested_at ASC LIMIT 100`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT r.*,t.title,t.id AS task_id,u.display_name,u.email,u.level,u.email_verified
       FROM task_requests r JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=r.user_id
       WHERE r.status='approved' AND r.checkpoint_status='pending' AND COALESCE(r.checkpoint_note,'')!=''
       ORDER BY r.checkpoint_due_at ASC LIMIT 100`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT s.*,r.task_id,t.title,t.calibrates_skill,t.category,t.integration_target,u.display_name,u.email,u.level,
              (SELECT COUNT(*) FROM submission_files f WHERE f.submission_id=s.id) AS file_count
       FROM submissions s JOIN task_requests r ON r.id=s.request_id JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=s.user_id
       WHERE s.status IN ('submitted','needs_changes') OR (s.status='accepted' AND s.github_stage_state='staged')
       ORDER BY s.submitted_at ASC LIMIT 100`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT sk.*,u.display_name,u.email,u.level,
              ce.score AS evaluation_score,ce.max_score AS evaluation_max_score,
              ce.auto_pass AS evaluation_auto_pass,ce.rationale AS evaluation_rationale,
              ce.task_id AS evaluation_task_id
       FROM skills sk JOIN users u ON u.id=sk.user_id
       LEFT JOIN competency_evaluations ce ON ce.id=sk.evaluation_id
       WHERE sk.status='pending' ORDER BY COALESCE(sk.review_due_at,sk.requested_at) ASC LIMIT 100`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT id,email,display_name,level,role,status,email_verified,track,availability_hours,created_at,last_login_at,is_owner
       FROM users ORDER BY is_owner DESC,created_at DESC LIMIT 200`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT user_id,skill,verified_at,verified_by,verification_note,source
       FROM skills WHERE status='verified' ORDER BY user_id,skill`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT id,title,summary,min_level,claim_mode,required_skill,status,publication_state,category,work_type,
              need_status,priority,why_now,program_id,program_step,published_at,updated_at,expected_minutes,integration_target
       FROM tasks ORDER BY
         CASE publication_state WHEN 'published' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
         priority DESC,id`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT a.*,r.title,r.category,r.expected_hours_per_week,u.display_name,u.email,u.level
       FROM role_applications a JOIN role_openings r ON r.id=a.role_id JOIN users u ON u.id=a.user_id
       WHERE a.status='pending' ORDER BY a.requested_at ASC LIMIT 100`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT e.*,c.title AS challenge_title,c.scoring_rule,c.score_direction,u.display_name,u.email,u.level
       FROM challenge_entries e JOIN challenges c ON c.id=e.challenge_id JOIN users u ON u.id=e.user_id
       WHERE e.status='pending' ORDER BY e.submitted_at ASC LIMIT 100`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT d.*,target.title AS task_title,source.title AS depends_on_title
       FROM task_dependencies d
       JOIN tasks target ON target.id=d.task_id
       JOIN tasks source ON source.id=d.depends_on_task_id
       ORDER BY d.task_id,d.criticality DESC,d.depends_on_task_id`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT * FROM task_dependency_groups ORDER BY task_id,sort_order,id`
    ).all(),
  ]);
  return json({
    admin:publicUser(admin),
    email_transport:emailTransportConfigured(env),
    email_transport_name:emailTransportName(env),
    github_transport_configured:githubConfigured(env),
    pending_requests:pending.results||[],
    checkpoints:checkpoints.results||[],
    submissions:submissions.results||[],
    skill_reviews:skillReviews.results||[],
    users:users.results||[],
    verified_skills:verifiedSkills.results||[],
    tasks:curatedTasks.results||[],
    role_applications:roleApplications.results||[],
    challenge_entries:challengeEntries.results||[],
    dependency_edges:dependencyEdges.results||[],
    dependency_groups:dependencyGroups.results||[],
    policy:{
      response_target:"1 business day",
      hard_sla:"2 business days",
      open_tasks:"non-exclusive; no founder approval",
      reserved_tasks:"do not reserve while pending",
      no_progress_release:"24-hour checkpoint for reserved work; automatic release if missed",
      ai_use:"allowed with disclosure; higher-trust submissions require independent verification and scope explanation",
    },
  });
}

async function adminTestMail(request, env, admin) {
  if (!env.ADMIN_EMAIL) throw new ApiError(500,"ADMIN_EMAIL is not configured.","admin_email_missing");
  const result = await sendMail(
    env,
    env.ADMIN_EMAIL,
    "PCS email transport test",
    "This is a test from the PCS Admin Center.\n\nIf you received this message, transactional email is working through " + emailTransportName(env) + ".\n"
  );
  await audit(env,admin.id,"email_transport_test","email",env.ADMIN_EMAIL,{state:result.state,provider:result.provider||emailTransportName(env),error:result.error||null});
  if (result.state !== "sent") throw new ApiError(502,result.error||"Email test failed.","mail_test_failed");
  return json({ok:true,message:"Test email sent.",provider:result.provider||emailTransportName(env)});
}

async function adminDecision(request, env, admin, requestId) {
  const body = await readBody(request);
  const decision = String(body.decision||"");
  const note = cleanText(body.note,3000);
  if (!["approve","reject"].includes(decision)) throw new ApiError(400,"Decision must be approve or reject.","bad_decision");
  if (note.length < 20) throw new ApiError(400,"Give a short decision rationale (at least 20 characters).","decision_note_required");
  const row = await env.COMMONS_DB.prepare(
    `SELECT r.*,t.title,t.min_level,t.claim_mode,t.required_skill,t.reservation_hours,t.checkpoint_hours,
            u.email,u.display_name,u.level,u.email_verified
     FROM task_requests r JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=r.user_id
     WHERE r.id=?`
  ).bind(requestId).first();
  if (!row || row.status!=="pending") throw new ApiError(404,"Pending request not found.","request_not_pending");

  if (decision==="approve") {
    if (Number(row.level)<Number(row.min_level)) throw new ApiError(409,"Applicant no longer meets the required PCS level.","level_changed");
    if (!Number(row.email_verified)) throw new ApiError(409,"Applicant email must be verified before reserved work is approved.","email_unverified");
    if (row.required_skill) {
      const verified = await env.COMMONS_DB.prepare(
        "SELECT 1 AS ok FROM skills WHERE user_id=? AND skill=? AND status='verified'"
      ).bind(row.user_id,row.required_skill).first();
      if (!verified) {
        if (body.verify_required_skill !== true) {
          throw new ApiError(409,
            "This applicant does not yet have verified "+row.required_skill+" status. Review the application as competency evidence; if it is sufficient, explicitly approve while verifying the required skill.",
            "manual_skill_review_required"
          );
        }
        const verifiedAt = nowIso();
        await env.COMMONS_DB.prepare(
          `INSERT INTO skills(user_id,skill,status,evidence,verification_note,requested_at,verified_at,verified_by,review_due_at,source,evaluation_id)
           VALUES(?,?,'verified',?,?,?,?,?,NULL,'task_application',NULL)
           ON CONFLICT(user_id,skill) DO UPDATE SET
             status='verified',evidence=excluded.evidence,verification_note=excluded.verification_note,
             verified_at=excluded.verified_at,verified_by=excluded.verified_by,
             review_due_at=NULL,source='task_application',evaluation_id=NULL`
        ).bind(
          row.user_id,row.required_skill,
          "Manual competency evidence from task application "+row.task_id+": "+row.application_note,
          "Verified during manual task application review. "+note,
          row.requested_at,verifiedAt,admin.id
        ).run();
        await audit(env,admin.id,"skill_verified_by_task_application","user",row.user_id,{skill:row.required_skill,task_id:row.task_id,task_request_id:row.id});
      }
    }
    const active = await env.COMMONS_DB.prepare(
      `SELECT COUNT(*) AS n FROM task_requests r JOIN tasks t ON t.id=r.task_id
       WHERE r.user_id=? AND r.status='approved' AND t.claim_mode!='open'
       AND (r.reservation_expires_at IS NULL OR r.reservation_expires_at>?)`
    ).bind(row.user_id,nowIso()).first();
    const limit = exclusiveLimit(Number(row.level));
    if (Number(active?.n||0)>=limit) throw new ApiError(409,`Applicant already has the maximum ${limit} active reserved task(s) for L${row.level}.`,"active_limit");

    const now = nowIso();
    const reservationHours = Math.min(Math.max(Number(body.reservation_hours||row.reservation_hours||72),24),168);
    const checkpointHours = Math.min(Math.max(Number(row.checkpoint_hours||24),12),48);
    const expiry = addHoursIso(now,reservationHours);
    const checkpoint = addHoursIso(now,checkpointHours);
    try {
      const claimed=await env.COMMONS_DB.prepare(
        `UPDATE task_requests SET status='approved',decision_at=?,decided_by=?,decision_note=?,
         reservation_expires_at=?,checkpoint_due_at=?,checkpoint_status='pending',last_progress_at=?,
         reservation_key=task_id
         WHERE id=? AND status='pending'`
      ).bind(now,admin.id,note,expiry,checkpoint,now,row.id).run();
      if (Number(claimed?.meta?.changes||0)!==1) {
        throw new ApiError(409,"This application was already decided by another administrator action.","request_already_decided");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const message=String(error?.message||error||"");
      if (/UNIQUE constraint failed|idx_task_requests_unique_reservation/i.test(message)) {
        throw new ApiError(409,"This reserved task is already assigned to another contributor.","task_already_reserved");
      }
      if (/PCS active reserved task limit/i.test(message)) {
        throw new ApiError(409,`Applicant already has the maximum ${limit} active reserved task(s) for L${row.level}.`,"active_limit");
      }
      throw error;
    }
    await notify(env,{
      userId:row.user_id,
      email:row.email_verified?row.email:null,
      kind:"task_approved",
      subject:`PCS task approved: ${row.task_id}`,
      body:`Your request for ${row.task_id} — ${row.title} was approved.\n\nReservation expires: ${expiry}\nFirst progress checkpoint due: ${checkpoint}\n\nThe reservation is released automatically if the checkpoint is missed. AI tools may be used only with disclosure and independent checking.\n\nDecision note: ${note}\n`,
    });
    await audit(env,admin.id,"task_request_approved","task_request",row.id,{task_id:row.task_id,expiry,checkpoint});
    return json({ok:true,status:"approved",reservation_expires_at:expiry,checkpoint_due_at:checkpoint});
  }

  const rejected=await env.COMMONS_DB.prepare(
    "UPDATE task_requests SET status='rejected',decision_at=?,decided_by=?,decision_note=?,checkpoint_status='not_required',reservation_key=NULL WHERE id=? AND status='pending'"
  ).bind(nowIso(),admin.id,note,row.id).run();
  if (Number(rejected?.meta?.changes||0)!==1) throw new ApiError(409,"This application was already decided by another administrator action.","request_already_decided");
  await notify(env,{
    userId:row.user_id,
    email:row.email_verified?row.email:null,
    kind:"task_rejected",
    subject:`PCS task request decision: ${row.task_id}`,
    body:`Your request for ${row.task_id} — ${row.title} was not approved at this time. The request never reserved the task.\n\nReason: ${note}\n\nYou may continue with eligible open tasks and apply again after addressing the reason.\n`,
  });
  await audit(env,admin.id,"task_request_rejected","task_request",row.id,{task_id:row.task_id});
  return json({ok:true,status:"rejected"});
}

async function adminCheckpoint(request, env, admin, requestId) {
  const body = await readBody(request);
  const decision = String(body.decision||"");
  const note = cleanText(body.note,2000);
  if (!["accept","release"].includes(decision)) throw new ApiError(400,"Checkpoint decision must be accept or release.","bad_checkpoint_decision");
  const row = await env.COMMONS_DB.prepare(
    `SELECT r.*,t.id AS task_id,t.title,u.email,u.email_verified,u.display_name
     FROM task_requests r JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=r.user_id
     WHERE r.id=? AND r.status='approved' AND r.checkpoint_status='pending'`
  ).bind(requestId).first();
  if (!row) throw new ApiError(404,"Active request not found.","request_not_found");
  if (!row.checkpoint_note) throw new ApiError(409,"Contributor has not submitted a checkpoint.","checkpoint_missing");

  if (decision==="release") {
    const released=await env.COMMONS_DB.prepare(
      "UPDATE task_requests SET status='expired',checkpoint_status='missed',decision_note=?,reservation_key=NULL WHERE id=? AND status='approved' AND checkpoint_status='pending'"
    ).bind(note||"Checkpoint did not justify holding the reservation.",row.id).run();
    if (Number(released?.meta?.changes||0)!==1) throw new ApiError(409,"This checkpoint was already decided by another administrator action.","checkpoint_already_decided");
    await notify(env,{userId:row.user_id,email:row.email_verified?row.email:null,kind:"checkpoint_released",subject:`PCS task released: ${row.task_id}`,body:`PCS released your reservation for ${row.task_id} after checkpoint review.\n\n${note}\n`});
    await audit(env,admin.id,"checkpoint_released","task_request",row.id,{task_id:row.task_id});
    return json({ok:true,status:"expired"});
  }

  if (Number(row.extension_count||0)>=2) throw new ApiError(409,"This reservation has already received the maximum two checkpoint extensions. Review the task manually.","extension_limit");
  const extendHours=Math.min(Math.max(Number(body.extend_hours||168),24),168);
  const expiry=addHoursIso(nowIso(),extendHours);
  const accepted=await env.COMMONS_DB.prepare(
    "UPDATE task_requests SET checkpoint_status='accepted',reservation_expires_at=?,extension_count=extension_count+1,last_progress_at=? WHERE id=? AND status='approved' AND checkpoint_status='pending'"
  ).bind(expiry,nowIso(),row.id).run();
  if (Number(accepted?.meta?.changes||0)!==1) throw new ApiError(409,"This checkpoint was already decided by another administrator action.","checkpoint_already_decided");
  await notify(env,{userId:row.user_id,email:row.email_verified?row.email:null,kind:"checkpoint_accepted",subject:`PCS checkpoint accepted: ${row.task_id}`,body:`Your progress checkpoint for ${row.task_id} was accepted. The reservation now runs through ${expiry}.\n\n${note}\n`});
  await audit(env,admin.id,"checkpoint_accepted","task_request",row.id,{task_id:row.task_id,expiry});
  return json({ok:true,status:"approved",reservation_expires_at:expiry});
}

async function linkedSubmissionFiles(env,submissionId){
  const result=await env.COMMONS_DB.prepare(
    "SELECT filename,content,sha256 FROM submission_files WHERE submission_id=? ORDER BY filename"
  ).bind(submissionId).all();
  return result.results||[];
}

async function submissionWithFiles(env, submissionId) {
  const submission=await env.COMMONS_DB.prepare(
    `SELECT s.*,r.task_id,t.title,t.integration_target,t.category
     FROM submissions s JOIN task_requests r ON r.id=s.request_id
     JOIN tasks t ON t.id=r.task_id WHERE s.id=?`
  ).bind(submissionId).first();
  if(!submission)throw new ApiError(404,"Submission not found.","submission_not_found");
  const files=await linkedSubmissionFiles(env,submissionId);
  return {submission,files};
}

async function stagePersistedSubmission(env,submissionId) {
  const {submission:s,files}=await submissionWithFiles(env,submissionId);
  const target=String(s.integration_target||"none");
  if(!integrationRepository(target))throw new ApiError(409,"This task is not configured for GitHub.","no_github_target");
  if(!files.length)throw new ApiError(409,"Submission has no attachable source files.","no_submission_files");
  if(s.github_stage_state==="merged")throw new ApiError(409,"This contribution was already merged.","already_merged");
  const expectedRepo=integrationRepository(target);
  if(s.github_pr_number && s.github_repo===expectedRepo) {
    return {state:"staged",repo:s.github_repo,number:s.github_pr_number,url:s.github_pr_url};
  }
  const result=await createSubmissionPullRequest(env,{
    target,taskId:s.task_id,submissionId:s.id,title:s.title,summary:s.summary,
    files:files.map(f=>({filename:f.filename,content:f.content}))
  });
  await env.COMMONS_DB.prepare(
    `UPDATE submissions SET github_stage_state='staged',github_stage_error=NULL,
     github_repo=?,github_branch=?,github_pr_number=?,github_pr_url=? WHERE id=?`
  ).bind(result.repo,result.branch,result.number,result.url,s.id).run();
  await audit(env,s.user_id,"contribution_github_staged","submission",s.id,{
    repo:result.repo,pr_number:result.number,branch:result.branch
  });
  return {state:"staged",...result};
}

async function adminStageSubmission(request,env,admin,submissionId) {
  const {submission:s}=await submissionWithFiles(env,submissionId);
  if(s.status!=="submitted"&&s.status!=="needs_changes")
    throw new ApiError(409,"Only active submissions can be staged.","submission_not_active");
  if(!githubConfigured(env))throw new ApiError(503,"GitHub integration secret PCS_GITHUB_TOKEN is not configured.","github_not_configured");
  try {
    const staged=await stagePersistedSubmission(env,submissionId);
    await audit(env,admin.id,"admin_retried_github_staging","submission",submissionId,{state:staged.state});
    return json({ok:true,...staged});
  }catch(e){
    await env.COMMONS_DB.prepare("UPDATE submissions SET github_stage_state='error',github_stage_error=? WHERE id=?")
      .bind(String(e.message||"Unknown stage error").slice(0,400),submissionId).run();
    throw new ApiError(502,e.message||"GitHub staging failed.","github_stage_failed");
  }
}

async function contributorSubmissionChecks(request,env,user,submissionId){
  await rateLimit(request,env,"contribution-checks",60,60);
  const row=await env.COMMONS_DB.prepare(
    `SELECT s.*,r.task_id FROM submissions s
     JOIN task_requests r ON r.id=s.request_id
     WHERE s.id=? AND s.user_id=?`
  ).bind(submissionId,user.id).first();
  if(!row)throw new ApiError(404,"Submission not found.","submission_not_found");
  if(!row.github_pr_number){
    return json({ok:true,state:row.github_stage_state,
      message:row.github_stage_error||"No GitHub PR has been staged.",verified:false});
  }
  try{
    const files=await linkedSubmissionFiles(env,row.id);
    const result=await readSubmissionChecks(env,{
      repo:row.github_repo,branch:row.github_branch,number:row.github_pr_number,
      taskId:row.task_id,submissionId:row.id,expectedFiles:files
    });
    return json({ok:true,...result});
  }catch(e){
    throw new ApiError(502,"GitHub verification status is unavailable: "+String(e.message).slice(0,180),"github_check_unavailable");
  }
}

async function adminSubmissionFiles(request,env,admin,submissionId) {
  const {submission:s,files}=await submissionWithFiles(env,submissionId);
  await audit(env,admin.id,"admin_inspected_submission_files","submission",submissionId,{count:files.length});
  return json({ok:true,task_id:s.task_id,files},200,{"cache-control":"no-store"});
}

async function adminGithubDiagnostics(request,env,admin){
  if(!githubConfigured(env)) return json({ok:true,...await githubAccessReport(env)});
  const report=await githubAccessReport(env);
  await audit(env,admin.id,"github_connection_diagnostic","integration","github",{
    result:report.repositories.map(r=>({
      target:r.target,contents_read:r.contents_read,actions_read:r.actions_read
    }))
  });
  return json({ok:true,...report},200,{"cache-control":"no-store"});
}

async function adminSubmissionChecks(request,env,admin,submissionId) {
  const {submission:s,files}=await submissionWithFiles(env,submissionId);
  if(!s.github_pr_number) return json({ok:true,state:s.github_stage_state,
    message:s.github_stage_error||"No GitHub PR has been opened.",verified:false});
  try {
    const result=await readSubmissionChecks(env,{
      repo:s.github_repo,branch:s.github_branch,number:s.github_pr_number,
      taskId:s.task_id,submissionId:s.id,expectedFiles:files
    });
    return json({ok:true,...result});
  }catch(e){
    throw new ApiError(502,"Could not verify GitHub CI: "+String(e.message).slice(0,220),"github_check_unavailable");
  }
}

async function adminMergeSubmission(request,env,admin,submissionId) {
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner may merge staged GitHub contributions.","owner_required");
  const {submission:s,files}=await submissionWithFiles(env,submissionId);
  if(s.status!=="accepted"||s.github_stage_state!=="staged"||!s.github_pr_number)
    throw new ApiError(409,"Accept the submission after green CI before integrating.","merge_not_ready");
  const body=await readBody(request);
  const note=cleanText(body.note,1500);
  if(note.length<20)throw new ApiError(400,"Give a final integration rationale (at least 20 characters).","merge_note_required");
  let checked;
  try{
    checked=await readSubmissionChecks(env,{
      repo:s.github_repo,branch:s.github_branch,number:s.github_pr_number,
      taskId:s.task_id,submissionId:s.id,expectedFiles:files
    });
  }catch(e){throw new ApiError(502,"GitHub checks cannot be verified: "+String(e.message).slice(0,180),"github_checks_missing");}
  if(!checked.verified)throw new ApiError(409,"GitHub CI is not green; merging remains blocked.","github_ci_not_passed");
  let merged;
  try{
    merged=await mergeStagedPullRequest(env,{
      repo:s.github_repo,branch:s.github_branch,number:s.github_pr_number,
      taskId:s.task_id,submissionId:s.id
    },checked.head_sha);
  }catch(e){throw new ApiError(502,String(e.message).slice(0,220),"github_merge_failed");}
  await env.COMMONS_DB.prepare(
    "UPDATE submissions SET github_stage_state='merged',github_stage_error=NULL WHERE id=?"
  ).bind(s.id).run();
  await audit(env,admin.id,"submission_github_merged","submission",s.id,{
    repo:s.github_repo,pr_number:s.github_pr_number,merge_sha:merged.merge_sha,reason:note
  });
  return json({ok:true,merged:true,merge_sha:merged.merge_sha,pr_url:merged.pr_url});
}

// Unlike submission acceptance, promotion can change production source.
async function promotionWithFiles(env,id){
  const row=await env.COMMONS_DB.prepare(
    `SELECT p.*,s.status AS source_status,s.github_stage_state AS source_stage,s.github_repo AS source_repo
     FROM production_promotions p JOIN submissions s ON s.id=p.submission_id
     WHERE p.id=?`
  ).bind(id).first();
  if(!row)throw new ApiError(404,"Promotion request not found.","promotion_missing");
  const files=await linkedSubmissionFiles(env,row.submission_id);
  return {row,files};
}
async function adminPromotionOverview(request,env,admin){
  const [promotions,candidates]=await Promise.all([
    env.COMMONS_DB.prepare(
      `SELECT p.id,p.submission_id,p.task_id,p.repo,p.source_pr_number,p.mapping_json,
       p.rationale,p.state,p.attempt,p.created_at,p.staged_at,p.pr_number,p.pr_url,p.base_sha,
       p.head_sha,p.stage_error,p.decision_at,p.decision_note,p.approved_head_sha,p.merged_at,p.merge_sha,
       u.display_name AS contributor
       FROM production_promotions p JOIN submissions s ON s.id=p.submission_id
       JOIN users u ON u.id=s.user_id
       ORDER BY p.created_at DESC LIMIT 100`
    ).all(),
    env.COMMONS_DB.prepare(
      `SELECT s.id AS submission_id,r.task_id,t.title,s.github_repo AS repo,
       s.github_pr_number AS source_pr_number,s.review_note,s.submitted_at,
       u.display_name AS contributor,
       (SELECT GROUP_CONCAT(f.filename,' | ') FROM submission_files f WHERE f.submission_id=s.id) AS filenames
       FROM submissions s JOIN task_requests r ON r.id=s.request_id
       JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=s.user_id
       WHERE s.status='accepted' AND s.github_stage_state='merged'
         AND s.github_repo IN ('Tommaso-R-Marena/proof-carrying-science','Tommaso-R-Marena/proof-carrying-science-site')
         AND EXISTS(SELECT 1 FROM submission_files f WHERE f.submission_id=s.id)
         AND NOT EXISTS(SELECT 1 FROM production_promotions p WHERE p.submission_id=s.id)
       ORDER BY s.submitted_at DESC LIMIT 100`
    ).all()
  ]);
  return json({ok:true,can_manage:isOwner(admin),
    promotions:promotions.results||[],candidates:candidates.results||[]},200,{"cache-control":"no-store"});
}
async function promotionStageRecord(env,p){
  const {row,files}=await promotionWithFiles(env,p.id);
  if(!["requested","stage_error"].includes(row.state))
    throw new ApiError(409,"This promotion cannot be staged again; begin with a new accepted submission.","promotion_already_staged");
  if(row.source_status!=="accepted"||row.source_stage!=="merged"||
     row.source_repo!==row.repo)
    throw new ApiError(409,"Only reviewed, accepted and GitHub-archived submissions may be promoted.","source_not_archived");
  try{
    const stage=await stagePromotion(env,row,files);
    const changed=await env.COMMONS_DB.prepare(
      `UPDATE production_promotions SET state='staged',staged_at=?,base_sha=?,branch=?,head_sha=?,
       pr_number=?,pr_url=?,stage_error=NULL WHERE id=? AND state IN ('requested','stage_error')`
    ).bind(nowIso(),stage.base_sha,stage.branch,stage.head_sha||null,stage.pr_number,stage.pr_url,row.id).run();
    if(Number(changed.meta?.changes||0)!==1)throw new Error("Promotion staging decision raced with another review.");
    await audit(env,p.created_by||row.created_by,"production_promotion_staged","production_promotion",row.id,{
      repo:row.repo,pr_number:stage.pr_number,base_sha:stage.base_sha,paths:JSON.parse(row.mapping_json).map(x=>x.path)
    });
    return {state:"staged",...stage};
  }catch(error){
    await env.COMMONS_DB.prepare(
      `UPDATE production_promotions SET state='stage_error',stage_error=? WHERE id=? AND state IN ('requested','stage_error')`
    ).bind(String(error.message||error).slice(0,340),row.id).run();
    return {state:"stage_error",message:String(error.message||error).slice(0,340)};
  }
}
async function adminPromotionCreate(request,env,admin){
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can request source promotion.","owner_required");
  const body=await readBody(request);
  const submissionId=String(body.submission_id||"");
  const rationale=cleanText(body.rationale,3000);
  if(!/^[a-f0-9-]{36}$/i.test(submissionId))throw new ApiError(400,"Select an accepted submission.","bad_submission_id");
  if(rationale.length<40)throw new ApiError(400,"Explain the production change and trust boundaries (at least 40 characters).","promotion_rationale_required");
  const source=await env.COMMONS_DB.prepare(
    `SELECT s.*,r.task_id,t.integration_target
     FROM submissions s JOIN task_requests r ON r.id=s.request_id
     JOIN tasks t ON t.id=r.task_id WHERE s.id=?`
  ).bind(submissionId).first();
  if(!source||source.status!=="accepted"||source.github_stage_state!=="merged"||
     !integrationRepository(source.integration_target)||
     integrationRepository(source.integration_target)!==source.github_repo||
     !Number.isInteger(Number(source.github_pr_number))||Number(source.github_pr_number)<1)
    throw new ApiError(409,"Promotions require an accepted GitHub-archived submission, never a direct upload.","source_not_eligible");
  const files=await linkedSubmissionFiles(env,source.id);
  let mappings;
  try{mappings=validatePromotionMappings(source.github_repo,files,body.mappings);}
  catch(e){throw new ApiError(400,String(e.message).slice(0,260),"unsafe_production_mapping");}
  const id=crypto.randomUUID(),created=nowIso();
  try{
    await env.COMMONS_DB.prepare(
      `INSERT INTO production_promotions(id,submission_id,task_id,repo,source_pr_number,mapping_json,
       rationale,created_at,created_by,state) VALUES(?,?,?,?,?,?,?,?,?,'requested')`
    ).bind(id,source.id,source.task_id,source.github_repo,source.github_pr_number,
      JSON.stringify(mappings),rationale,created,admin.id).run();
  }catch(e){
    if(/UNIQUE/i.test(String(e.message)))throw new ApiError(409,"This submission already has a promotion case.","promotion_exists");
    throw e;
  }
  await audit(env,admin.id,"production_promotion_requested","production_promotion",id,{
    submission_id:source.id,repo:source.github_repo,mappings,reason:rationale
  });
  const stage=await promotionStageRecord(env,{id,created_by:admin.id});
  return json({ok:true,promotion_id:id,...stage,
    message:stage.state==="staged"
      ?"Production promotion PR opened; fresh tests and explicit Owner approval are still required."
      :"Promotion saved, but GitHub staging is blocked: "+stage.message},201);
}
async function adminPromotionRestage(request,env,admin,id){
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can stage promotion.","owner_required");
  const result=await promotionStageRecord(env,{id,created_by:admin.id});
  return json({ok:true,...result});
}
async function adminPromotionChecks(request,env,admin,id){
  const {row,files}=await promotionWithFiles(env,id);
  if(!["staged","approved"].includes(row.state))
    return json({ok:true,status:row.state,verified:false,message:row.stage_error||"Not staged for production."});
  try{return json({ok:true,...await verifyPromotion(env,row,files)},200,{"cache-control":"no-store"});}
  catch(e){return json({ok:true,status:"blocked",verified:false,message:String(e.message).slice(0,350)},200,{"cache-control":"no-store"});}
}
async function adminPromotionDecision(request,env,admin,id){
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner may approve production promotion.","owner_required");
  const body=await readBody(request),decision=String(body.decision||""),note=cleanText(body.note,3000);
  if(!["approve","needs_changes","reject"].includes(decision))throw new ApiError(400,"Invalid promotion decision.","promotion_decision_invalid");
  if(note.length<40)throw new ApiError(400,"Record a substantive production-risk review (at least 40 characters).","promotion_review_required");
  const {row,files}=await promotionWithFiles(env,id);
  if(row.state!=="staged")throw new ApiError(409,"Promotion must be staged and undecided.","promotion_not_reviewable");
  let head=null;
  if(decision==="approve"){
    let check;
    try{check=await verifyPromotion(env,row,files);}
    catch(e){throw new ApiError(409,"Production checks blocked: "+String(e.message).slice(0,250),"promotion_not_verified");}
    if(!check.verified)throw new ApiError(409,"Fresh, executed CI has not passed on this exact promotion commit.","promotion_ci_required");
    head=check.head_sha;
  }
  const next=decision==="approve"?"approved":decision==="reject"?"rejected":"needs_changes";
  const written=await env.COMMONS_DB.prepare(
    `UPDATE production_promotions SET state=?,decision_at=?,decision_by=?,decision_note=?,approved_head_sha=?
     WHERE id=? AND state='staged'`
  ).bind(next,nowIso(),admin.id,note,head,row.id).run();
  if(Number(written.meta?.changes||0)!==1)throw new ApiError(409,"A concurrent reviewer already decided this promotion.","promotion_race");
  await audit(env,admin.id,"production_promotion_decided","production_promotion",row.id,{
    decision,head_sha:head,reason:note
  });
  if(decision!=="approve"){
    try{
      const contributor=await env.COMMONS_DB.prepare(
        `SELECT u.id,u.email,u.email_verified FROM users u
         JOIN submissions s ON s.user_id=u.id WHERE s.id=?`
      ).bind(row.submission_id).first();
      if(contributor)await notify(env,{
        userId:contributor.id,email:contributor.email_verified?contributor.email:null,
        kind:"production_promotion_review",
        subject:`PCS production promotion ${next}: ${row.task_id}`,
        body:`The proposed production promotion of your accepted contribution was marked ${next}.\n\nReviewer note: ${note}\n\nThe accepted archive remains unchanged. If improvements are requested, submit a new revision for independent review; PCS cannot silently edit a previously accepted artifact.\n`
      });
    }catch(error){
      console.error("Promotion reviewer notification unavailable",String(error?.message||error));
    }
  }
  return json({ok:true,state:next,approved_head_sha:head});
}
async function adminPromotionSupersede(request,env,admin,id){
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can invalidate a production promotion.","owner_required");
  const body=await readBody(request),reason=cleanText(body.reason,3000);
  if(reason.length<40)throw new ApiError(400,"Explain why this PR must be superseded and retested (40+ characters).","supersede_reason_required");
  const {row}=await promotionWithFiles(env,id);
  if(!["requested","stage_error","staged","approved"].includes(row.state))
    throw new ApiError(409,"Only an active, unmerged promotion may start a fresh attempt.","promotion_not_supersedable");
  const attempt=Number(row.attempt||1);
  if(!Number.isInteger(attempt)||attempt>=50)
    throw new ApiError(409,"Maximum promotion retries reached; escalate for manual audit.","promotion_attempt_limit");
  // Never leave a previously approved production PR open. Closing precedes
  // state reinitialization so an interrupted update fails closed.
  try{await closeSupersededPromotionPr(env,row);}
  catch(e){throw new ApiError(502,"Could not close previous PR: "+String(e.message).slice(0,200),"supersede_close_failed");}
  const change=await env.COMMONS_DB.prepare(
    `UPDATE production_promotions SET attempt=attempt+1,state='requested',
       staged_at=NULL,base_sha=NULL,branch=NULL,head_sha=NULL,pr_number=NULL,pr_url=NULL,
       stage_error=NULL,decision_at=NULL,decision_by=NULL,decision_note=NULL,approved_head_sha=NULL
       WHERE id=? AND state IN ('requested','stage_error','staged','approved') AND attempt=?`
  ).bind(id,attempt).run();
  if(Number(change.meta?.changes||0)!==1)
    throw new ApiError(409,"Promotion was modified concurrently. Old PR is closed; reconcile before retry.","promotion_supersede_race");
  await audit(env,admin.id,"production_promotion_superseded","production_promotion",id,{
    previous_attempt:attempt,next_attempt:attempt+1,previous_state:row.state,
    previous_pr_url:row.pr_url,previous_approved_head_sha:row.approved_head_sha,
    source_submission_id:row.submission_id,reason
  });
  const stage=await promotionStageRecord(env,{id,created_by:admin.id});
  return json({ok:true,...stage,attempt:attempt+1,
    message:stage.state==="staged"
      ?"Obsolete PR closed; new baseline-bound promotion PR opened. New CI and new explicit Owner approval are required."
      :"Obsolete PR closed and approval invalidated; next attempt saved but staging failed: "+stage.message
  });
}

async function adminPromotionMerge(request,env,admin,id){
  if(!isOwner(admin))throw new ApiError(403,"Only the Founder/Owner can integrate production code.","owner_required");
  const body=await readBody(request),reason=cleanText(body.reason,3000);
  if(reason.length<40)throw new ApiError(400,"Record the final integration rationale (at least 40 characters).","integration_note_required");
  const {row,files}=await promotionWithFiles(env,id);
  if(row.state!=="approved"||!row.approved_head_sha)
    throw new ApiError(409,"This promotion lacks explicit approval on an exact tested SHA.","promotion_not_approved");
  if(row.source_status!=="accepted"||row.source_stage!=="merged"||row.source_repo!==row.repo)
    throw new ApiError(409,"The archived contribution no longer meets promotion prerequisites.","source_no_longer_eligible");
  let outcome;
  try{outcome=await mergePromotion(env,row,files,row.approved_head_sha);}
  catch(e){throw new ApiError(409,"Production merge blocked: "+String(e.message).slice(0,280),"promotion_merge_blocked");}
  const changed=await env.COMMONS_DB.prepare(
    "UPDATE production_promotions SET state='merged',merged_at=?,merge_sha=? WHERE id=? AND state='approved'"
  ).bind(nowIso(),outcome.sha,id).run();
  if(Number(changed.meta?.changes||0)!==1)throw new ApiError(409,"Promotion status changed during merge; reconcile repository.","promotion_merge_race");
  await audit(env,admin.id,"production_promotion_merged","production_promotion",id,{
    repo:row.repo,pr_number:row.pr_number,sha:outcome.sha,approved_head_sha:row.approved_head_sha,reason
  });
  try{
    await notify(env,{kind:"production_promotion_completed",email:env.ADMIN_EMAIL||null,
      subject:`[PCS] Production promotion completed: ${row.task_id}`,
      body:`PCS production promotion ${id} was merged into ${row.repo}.\nPR: ${outcome.pr_url}\nCommit: ${outcome.sha}\nRationale: ${reason}\n`});
    const recipient=await env.COMMONS_DB.prepare(
      `SELECT u.id,u.email,u.email_verified FROM users u
       JOIN submissions s ON s.user_id=u.id WHERE s.id=?`
    ).bind(row.submission_id).first();
    if(recipient)await notify(env,{userId:recipient.id,email:recipient.email_verified?recipient.email:null,
      kind:"production_contribution_promoted",
      subject:`Your PCS contribution has reached production: ${row.task_id}`,
      body:`Your accepted PCS contribution has been separately reviewed, tested and promoted into production source.\n\nPull request: ${outcome.pr_url}\nCommit: ${outcome.sha}\n\nA passing verification certifies only the stated tests, not external scientific truth.\n`});
  }catch(error){
    console.error("Production promotion notification error (merge already recorded)",String(error?.message||error));
  }
  return json({ok:true,state:"merged",merge_sha:outcome.sha,pr_url:outcome.pr_url});
}

async function adminSubmissionDecision(request, env, admin, submissionId) {
  const body=await readBody(request);
  const decision=String(body.decision||"");
  const note=cleanText(body.note,3000);
  if (!["accept","needs_changes","reject"].includes(decision)) throw new ApiError(400,"Invalid submission decision.","bad_submission_decision");
  if (note.length<20) throw new ApiError(400,"Give a review rationale (at least 20 characters).","review_note_required");
  const row=await env.COMMONS_DB.prepare(
    `SELECT s.*,r.task_id,r.id AS task_request_id,t.title,t.min_level,t.calibrates_skill,u.email,u.email_verified,u.display_name,u.level
     FROM submissions s JOIN task_requests r ON r.id=s.request_id JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=s.user_id
     WHERE s.id=?`
  ).bind(submissionId).first();
  if (!row) throw new ApiError(404,"Submission not found.","submission_not_found");
  if (!["submitted","needs_changes"].includes(row.status)) {
    throw new ApiError(409,"This submission already has a final review decision.","submission_already_decided");
  }
  if(decision==="accept" && row.github_stage_state!=="not_applicable"){
    if(row.github_stage_state!=="staged")
      throw new ApiError(409,"GitHub staging is not ready; retry staging and check CI first.","github_stage_required");
    let check;
    try{check=await readSubmissionChecks(env,{
      repo:row.github_repo,branch:row.github_branch,number:row.github_pr_number,
      taskId:row.task_id,submissionId:row.id,expectedFiles:await linkedSubmissionFiles(env,row.id)
    });}
    catch(e){throw new ApiError(502,"CI verification unavailable: "+String(e.message).slice(0,160),"github_ci_unavailable");}
    if(!check.verified)throw new ApiError(409,"Required PCS Submission Verification is not green. Ask for improvements or rerun CI.","github_ci_not_passed");
  }
  const status=decision==="accept"?"accepted":decision==="needs_changes"?"needs_changes":"rejected";
  const reviewed=await env.COMMONS_DB.prepare(
    "UPDATE submissions SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=? AND status IN ('submitted','needs_changes')"
  ).bind(status,nowIso(),admin.id,note,row.id).run();
  if (Number(reviewed?.meta?.changes||0)!==1) throw new ApiError(409,"This submission was already decided by another administrator action.","submission_already_decided");
  if (decision==="accept") {
    await env.COMMONS_DB.prepare("UPDATE task_requests SET status='completed',decision_note=?,reservation_key=NULL WHERE id=?").bind("Submission accepted.",row.task_request_id).run();
    if (Number(row.level)===0 && Number(row.min_level)===0 && !row.calibrates_skill) {
      await env.COMMONS_DB.prepare("UPDATE users SET level=1,updated_at=? WHERE id=? AND level=0").bind(nowIso(),row.user_id).run();
      await audit(env,admin.id,"automatic_l1_after_first_acceptance","user",row.user_id,{submission_id:row.id});
    }
    if (row.calibrates_skill && SKILLS.has(row.calibrates_skill)) {
      const verifiedAt=nowIso();
      await env.COMMONS_DB.prepare(
        `INSERT INTO skills(user_id,skill,status,evidence,verification_note,requested_at,verified_at,verified_by)
         VALUES(?,?,'verified',?,?,?, ?,?)
         ON CONFLICT(user_id,skill) DO UPDATE SET
           status='verified',verification_note=excluded.verification_note,verified_at=excluded.verified_at,verified_by=excluded.verified_by`
      ).bind(
        row.user_id,row.calibrates_skill,
        `Accepted synthetic calibration ${row.task_id}`,
        `Passed reviewed synthetic calibration ${row.task_id}. ${note}`,
        row.submitted_at,verifiedAt,admin.id
      ).run();
      await audit(env,admin.id,"skill_verified_by_calibration","user",row.user_id,{skill:row.calibrates_skill,task_id:row.task_id,submission_id:row.id});
    }
  }
  const skillMessage = decision==="accept" && row.calibrates_skill ? `\n\nThis accepted synthetic calibration also verified your ${row.calibrates_skill} skill. It does not by itself grant a high contributor level or reserve high-trust work.` : "";
  await notify(env,{userId:row.user_id,email:row.email_verified?row.email:null,kind:"submission_review",subject:`PCS submission review: ${row.task_id}`,body:`Your submission for ${row.task_id} — ${row.title} was marked ${status}.\n\nReview note: ${note}${skillMessage}\n`});
  await audit(env,admin.id,"submission_reviewed","submission",row.id,{task_id:row.task_id,status});
  return json({ok:true,status});
}

async function adminSkillDecision(request, env, admin, userId) {
  const body=await readBody(request);
  const skill=String(body.skill||"");
  const status=String(body.status||"");
  const note=cleanText(body.note,2000);
  if (!SKILLS.has(skill) || !["verified","rejected"].includes(status)) throw new ApiError(400,"Invalid skill decision.","bad_skill_decision");
  const user=await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
  if (!user) throw new ApiError(404,"User not found.","user_not_found");
  protectOwnerTarget(user);
  if (user.role==="admin" && !isOwner(admin)) throw new ApiError(403,"Only the Founder/Owner may modify another administrator's reviewed authority.","owner_required");
  const row=await env.COMMONS_DB.prepare("SELECT * FROM skills WHERE user_id=? AND skill=?").bind(userId,skill).first();
  if (!row) throw new ApiError(404,"Skill request not found.","skill_not_found");
  if (row.status!=="pending") {
    throw new ApiError(409,"Only a pending skill review can be decided here. Verified skills require the Founder/Owner revocation flow.","skill_not_pending");
  }
  const when=status==="verified"?nowIso():null;
  const decided=await env.COMMONS_DB.prepare(
    "UPDATE skills SET status=?,verification_note=?,verified_at=?,verified_by=?,review_due_at=NULL WHERE user_id=? AND skill=? AND status='pending'"
  ).bind(status,note,when,admin.id,userId,skill).run();
  if (Number(decided?.meta?.changes||0)!==1) throw new ApiError(409,"This skill review was already decided by another administrator action.","skill_already_decided");
  await notify(env,{userId,email:user.email_verified?user.email:null,kind:"skill_review",subject:`PCS skill review: ${skill}`,body:`Your ${skill} skill review was marked ${status}.\n\n${note}\n`});
  await audit(env,admin.id,"skill_reviewed","user",userId,{skill,status});
  return json({ok:true,status});
}

async function adminRevokeSkill(request, env, admin, userId) {
  if (!isOwner(admin)) throw new ApiError(403,"Only the Founder/Owner may revoke a previously verified skill.","owner_required");
  const body=await readBody(request);
  const skill=String(body.skill||"");
  const note=cleanText(body.note,3000);
  if (!SKILLS.has(skill) || skill==="nontechnical") throw new ApiError(400,"Choose a verified skill to revoke.","bad_skill");
  if (note.length<20) throw new ApiError(400,"Give an evidence-based revocation rationale (at least 20 characters).","skill_revocation_note_required");
  const evidence=await validateEvidenceRefs(env,admin,body.evidence_ids);

  const user=await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
  if (!user) throw new ApiError(404,"User not found.","user_not_found");
  protectOwnerTarget(user);
  const row=await env.COMMONS_DB.prepare("SELECT * FROM skills WHERE user_id=? AND skill=?").bind(userId,skill).first();
  if (!row || row.status!=="verified") throw new ApiError(409,"That skill is not currently verified.","skill_not_verified");

  const active=await env.COMMONS_DB.prepare(
    `SELECT r.id,r.task_id,t.title
     FROM task_requests r JOIN tasks t ON t.id=r.task_id
     WHERE r.user_id=? AND r.status='approved' AND t.required_skill=?`
  ).bind(userId,skill).all();

  await env.COMMONS_DB.prepare(
    `UPDATE skills SET status='rejected',verification_note=?,verified_at=NULL,verified_by=NULL,
     review_due_at=NULL,source='revoked',evaluation_id=NULL WHERE user_id=? AND skill=?`
  ).bind("Verified skill revoked: "+note,userId,skill).run();

  const now=nowIso();
  for(const task of active.results||[]) {
    await env.COMMONS_DB.prepare(
      `UPDATE task_requests SET status='expired',reservation_expires_at=?,checkpoint_status='not_required',
       decision_note=COALESCE(decision_note,'') || ?,reservation_key=NULL WHERE id=?`
    ).bind(now,"\nSkill "+skill+" was revoked by PCS Owner: "+note,task.id).run();
    await audit(env,admin.id,"reservation_released_after_skill_revocation","task_request",task.id,{
      task_id:task.task_id,skill,user_id:userId
    });
  }

  await notify(env,{
    userId,
    email:user.email_verified?user.email:null,
    kind:"skill_revoked",
    subject:`PCS verified skill revoked: ${skill}`,
    body:`Your previously verified PCS skill "${skill}" has been revoked.\n\nReason: ${note}\n\nAny active reserved work that required this exact skill has been released. You may submit new evidence or retake the variable competency evaluation later.\n`
  });
  await audit(env,admin.id,"skill_revoked","user",userId,{
    skill,
    prior_verified_at:row.verified_at||null,
    prior_verified_by:row.verified_by||null,
    rationale:note,
    evidence:auditEvidenceSummary(evidence),
    released_tasks:(active.results||[]).map(task=>({request_id:task.id,task_id:task.task_id,title:task.title}))
  });
  return json({ok:true,skill,status:"revoked",released_reservations:(active.results||[]).length});
}

async function adminSetLevel(request, env, admin, userId) {
  const body=await readBody(request);
  const level=Number(body.level);
  const note=cleanText(body.note,2000);
  const override=body.override===true;
  const evidence=await validateEvidenceRefs(env,admin,body.evidence_ids);
  if (!Number.isInteger(level)||level<0||level>6) throw new ApiError(400,"Technical level must be L0–L6. L7 is the unique Founder/Owner governance tier and cannot be assigned.","bad_level");
  if (note.length<20) throw new ApiError(400,"Give a promotion/demotion rationale (at least 20 characters).","level_note_required");
  const user=await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
  if (!user) throw new ApiError(404,"User not found.","user_not_found");
  protectOwnerTarget(user);

  const currentLevel=Number(user.level);
  if (!isOwner(admin) && (currentLevel===6 || level===6 || user.role==="admin")) {
    throw new ApiError(403,"Only the Founder/Owner may appoint or demote L6 research leads or modify another administrator's technical authority.","owner_required");
  }

  const skillRows=await env.COMMONS_DB.prepare("SELECT skill FROM skills WHERE user_id=? AND status='verified'").bind(userId).all();
  const skills=new Set((skillRows.results||[]).map(r=>r.skill));
  const work=await env.COMMONS_DB.prepare(
    `SELECT
       COUNT(*) AS accepted_total,
       SUM(CASE WHEN t.min_level>=2 THEN 1 ELSE 0 END) AS accepted_high_trust
     FROM submissions s
     JOIN task_requests r ON r.id=s.request_id
     JOIN tasks t ON t.id=r.task_id
     WHERE s.user_id=? AND s.status='accepted' AND t.calibrates_skill IS NULL`
  ).bind(userId).first();
  const acceptedTotal=Number(work?.accepted_total||0);
  const acceptedHighTrust=Number(work?.accepted_high_trust||0);
  const specialistSkills=[...skills].filter(skill=>!["nontechnical","review"].includes(skill));

  // Evidence gates apply to promotions. Demotions must remain possible when authority needs to be removed.
  if (!override && level>currentLevel) {
    if (level>=2 && skills.size===0) throw new ApiError(409,"L2+ requires at least one verified skill unless an explicit founder calibration override is recorded.","verified_skill_required");
    if (level===2 && acceptedTotal<2) throw new ApiError(409,"Ordinary L2 promotion requires at least two accepted contributions plus a verified skill. Use an audited founder override only after an equivalent calibration.","l2_work_required");
    if (level===3 && (acceptedTotal<3 || acceptedHighTrust<1)) throw new ApiError(409,"Ordinary L3 promotion requires at least three accepted contributions including one high-trust contribution.","l3_work_required");
    if (level===4 && (!skills.has("review") || acceptedHighTrust<2)) throw new ApiError(409,"Ordinary L4 reviewer authority requires verified review skill plus at least two accepted high-trust contributions.","l4_review_required");
    if (level===5 && (specialistSkills.length===0 || acceptedHighTrust<3)) throw new ApiError(409,"Ordinary L5 specialist status requires a verified specialist skill plus at least three accepted high-trust contributions.","l5_specialist_required");
    if (level===6) throw new ApiError(409,"L6 research-lead authority requires an explicit audited Founder/Owner override.","l6_override_required");
  }
  if (level===6 && !isOwner(admin)) throw new ApiError(403,"Only the Founder/Owner may appoint L6 research leads.","owner_required");

  await env.COMMONS_DB.prepare("UPDATE users SET level=?,level_review_note=?,updated_at=? WHERE id=?").bind(level,note,nowIso(),userId).run();
  let releasedForDemotion=[];
  if (level<currentLevel) {
    const active=await env.COMMONS_DB.prepare(
      `SELECT r.id,r.task_id,t.title,t.min_level
       FROM task_requests r JOIN tasks t ON t.id=r.task_id
       WHERE r.user_id=? AND r.status='approved' AND t.claim_mode!='open' AND t.min_level>?`
    ).bind(userId,level).all();
    releasedForDemotion=active.results||[];
    for(const task of releasedForDemotion) {
      await env.COMMONS_DB.prepare(
        `UPDATE task_requests SET status='expired',reservation_expires_at=?,checkpoint_status='not_required',
         reservation_key=NULL,decision_note=COALESCE(decision_note,'') || ? WHERE id=? AND status='approved'`
      ).bind(nowIso(),"\nReservation released because verified level was reduced below L"+task.min_level+".",task.id).run();
      await audit(env,admin.id,"reservation_released_after_level_demotion","task_request",task.id,{
        task_id:task.task_id,user_id:userId,required_level:Number(task.min_level),new_level:level
      });
    }
  }
  await notify(env,{userId,email:user.email_verified?user.email:null,kind:"level_changed",subject:`PCS contributor level: L${level}`,body:`Your verified PCS technical level is now L${level}.\n\nReason: ${note}\n\nTechnical level does not grant Founder/Owner governance authority, and task-specific skill/assignment requirements still apply.${releasedForDemotion.length?"\n\n"+releasedForDemotion.length+" active reserved task(s) above your new level were released.":""}\n`});
  await audit(env,admin.id,"user_level_changed","user",userId,{
    from:currentLevel,to:level,override,owner_actor:isOwner(admin),
    accepted_total:acceptedTotal,accepted_high_trust:acceptedHighTrust,verified_skills:[...skills],
    rationale:note,evidence:auditEvidenceSummary(evidence),
    released_reservations:releasedForDemotion.map(task=>({request_id:task.id,task_id:task.task_id,required_level:Number(task.min_level)}))
  });
  return json({ok:true,level,released_reservations:releasedForDemotion.length});
}

async function adminSetGovernance(request, env, admin, userId) {
  if (!isOwner(admin)) throw new ApiError(403,"Only the Founder/Owner may grant or revoke administrator authority or suspend/restore accounts.","owner_required");
  const body=await readBody(request);
  const note=cleanText(body.note,2000);
  if (note.length<20) throw new ApiError(400,"Give a governance rationale (at least 20 characters).","governance_note_required");

  const user=await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
  if (!user) throw new ApiError(404,"User not found.","user_not_found");
  protectOwnerTarget(user);

  const requestedRole=body.role===undefined?user.role:String(body.role);
  const requestedStatus=body.status===undefined?user.status:String(body.status);
  if (!["contributor","admin"].includes(requestedRole)) throw new ApiError(400,"Role must be contributor or admin.","bad_role");
  if (!["active","suspended","disabled"].includes(requestedStatus)) throw new ApiError(400,"Status must be active, suspended, or disabled.","bad_status");
  if (requestedRole==="admin" && requestedStatus!=="active") throw new ApiError(409,"Administrator authority can only be granted to an active account.","admin_must_be_active");
  if (requestedRole==="admin" && !Number(user.email_verified)) throw new ApiError(409,"Verify the user's email before granting administrator authority.","email_unverified");

  const changedRole=requestedRole!==user.role;
  const changedStatus=requestedStatus!==user.status;
  if (!changedRole && !changedStatus) throw new ApiError(400,"No governance change was requested.","no_change");

  await env.COMMONS_DB.prepare("UPDATE users SET role=?,status=?,updated_at=? WHERE id=?").bind(requestedRole,requestedStatus,nowIso(),userId).run();

  const authorityRemoved=(user.role==="admin" && requestedRole!=="admin") || (user.status==="active" && requestedStatus!=="active");
  if (authorityRemoved) {
    await env.COMMONS_DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId).run();
    await env.COMMONS_DB.prepare("DELETE FROM admin_sessions WHERE user_id=?").bind(userId).run();
  }

  await notify(env,{
    userId,
    email:user.email_verified?user.email:null,
    kind:"governance_changed",
    subject:"PCS account governance changed",
    body:`Your PCS governance state changed.\n\nRole: ${user.role} → ${requestedRole}\nStatus: ${user.status} → ${requestedStatus}\n\nReason: ${note}\n\nFounder/Owner governance authority is separate from technical contributor level.\n`,
  });
  await audit(env,admin.id,"user_governance_changed","user",userId,{
    role_from:user.role,role_to:requestedRole,status_from:user.status,status_to:requestedStatus,
    sessions_revoked:authorityRemoved,note
  });
  return json({ok:true,role:requestedRole,status:requestedStatus,sessions_revoked:authorityRemoved});
}

async function adminVerifyEmail(request, env, admin, userId) {
  const body=await readBody(request);
  if (body.verified!==true) throw new ApiError(400,"This endpoint only performs an explicit manual verification.","bad_manual_verify");
  const user=await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(userId).first();
  if (!user) throw new ApiError(404,"User not found.","user_not_found");
  protectOwnerTarget(user);
  if (user.role==="admin" && !isOwner(admin)) throw new ApiError(403,"Only the Founder/Owner may modify another administrator's account authority.","owner_required");
  await env.COMMONS_DB.prepare("UPDATE users SET email_verified=1,updated_at=? WHERE id=?").bind(nowIso(),userId).run();
  await audit(env,admin.id,"email_manually_verified","user",userId,{email:user.email});
  return json({ok:true});
}

async function handleApi(request, env) {
  requireSameOrigin(request);
  const url=new URL(request.url);
  const path=url.pathname;
  const method=request.method;

  if (method==="GET" && path==="/api/system/status") {
    return json({
      ok:true,
      accounts:true,
      email_transport:emailTransportConfigured(env),
      request_sla:"1–2 business days",
      task_policy:{
        L0_L1:"open, non-exclusive tasks; no founder approval needed",
        L2_L3:"verified level + either verified skill or manual competency review + founder approval; pending requests do not reserve work",
        L4_L5:"high-trust application + competency evidence + verified skill/founder assignment; never self-claimed",
        qualification_routes:"variable auto-scored evaluation OR manual application/evidence; all final approvals are manual",
        L6:"research-lead technical authority; appointment/removal is Owner-only",
        OWNER:"unique Founder/Owner governance authority; displayed as L7 but stored separately from technical L0–L6",
        reservations:"first progress checkpoint within 24 hours; stale reservations release automatically",
      },
    });
  }
  if (method==="POST" && path==="/api/auth/register") return register(request,env);
  if (method==="POST" && path==="/api/auth/login") return login(request,env);
  if (method==="POST" && path==="/api/admin/login") return adminLogin(request,env);
  if (method==="GET" && path==="/api/admin/session") return adminSessionStatus(request,env);
  if (method==="POST" && path==="/api/admin/logout") return adminLogout(request,env);
  if (method==="POST" && path==="/api/auth/recover") return recover(request,env);
  if (method==="POST" && path==="/api/auth/verify-email") return verifyEmail(request,env);
  if (method==="POST" && path==="/api/admin/bootstrap") return bootstrapAdmin(request,env);
  if (method==="POST" && path==="/api/auth/logout") {
    await deleteSession(request,env);
    return json({ok:true},200,{"set-cookie":clearSessionCookie()});
  }
  if (method==="GET" && path==="/api/me") return me(request,env);
  if (method==="GET" && path==="/api/tasks") return listTasks(request,env);
  if (method==="GET" && path==="/api/task-graph") return json({ok:true,...await publicTaskGraph(env)});
  if (method==="GET" && path==="/api/roles") return listRoles(request,env);
  if (method==="GET" && path==="/api/challenges") return listChallenges(request,env);

  if (path.startsWith("/api/admin/")) {
    const admin=await requireAdmin(request,env);
    if (method==="GET" && path==="/api/admin/overview") return adminOverview(request,env);
    if (method==="GET" && path==="/api/admin/audit") return adminAuditFeed(request,env);
    if (method==="POST" && path==="/api/admin/mail/test") return adminTestMail(request,env,admin);
    if (method==="GET" && path==="/api/admin/github/diagnostics") return adminGithubDiagnostics(request,env,admin);
    if(method==="GET"&&path==="/api/admin/promotions")return adminPromotionOverview(request,env,admin);
    if(method==="POST"&&path==="/api/admin/promotions")return adminPromotionCreate(request,env,admin);
    const promotionMatch=path.match(/^\/api\/admin\/promotions\/([^/]+)\/(stage|checks|decision|merge|supersede)$/);
    if(promotionMatch){
      const id=decodeURIComponent(promotionMatch[1]),action=promotionMatch[2];
      if(method==="POST"&&action==="stage")return adminPromotionRestage(request,env,admin,id);
      if(method==="GET"&&action==="checks")return adminPromotionChecks(request,env,admin,id);
      if(method==="POST"&&action==="decision")return adminPromotionDecision(request,env,admin,id);
      if(method==="POST"&&action==="merge")return adminPromotionMerge(request,env,admin,id);
      if(method==="POST"&&action==="supersede")return adminPromotionSupersede(request,env,admin,id);
    }

    let submissionFlowMatch=path.match(/^\/api\/admin\/submissions\/([^/]+)\/(stage|checks|files|merge)$/);
    if(submissionFlowMatch){
      const id=decodeURIComponent(submissionFlowMatch[1]), action=submissionFlowMatch[2];
      if(method==="POST"&&action==="stage")return adminStageSubmission(request,env,admin,id);
      if(method==="GET"&&action==="checks")return adminSubmissionChecks(request,env,admin,id);
      if(method==="GET"&&action==="files")return adminSubmissionFiles(request,env,admin,id);
      if(method==="POST"&&action==="merge")return adminMergeSubmission(request,env,admin,id);
    }
    if (method==="POST" && path==="/api/admin/tasks") return adminCreateTask(request,env,admin);
    let taskCurationMatch=path.match(/^\/api\/admin\/tasks\/([^/]+)\/curation$/);
    if (method==="POST" && taskCurationMatch) return adminCurateTask(request,env,admin,decodeURIComponent(taskCurationMatch[1]));
    let dependencyGroupMatch=path.match(/^\/api\/admin\/tasks\/([^/]+)\/dependency-groups$/);
    if (method==="POST" && dependencyGroupMatch) return adminUpsertDependencyGroup(request,env,admin,decodeURIComponent(dependencyGroupMatch[1]));
    dependencyGroupMatch=path.match(/^\/api\/admin\/tasks\/([^/]+)\/dependency-groups\/([^/]+)$/);
    if (method==="DELETE" && dependencyGroupMatch) return adminDeleteDependencyGroup(request,env,admin,decodeURIComponent(dependencyGroupMatch[1]),decodeURIComponent(dependencyGroupMatch[2]));
    let dependencyMatch=path.match(/^\/api\/admin\/tasks\/([^/]+)\/dependencies$/);
    if (method==="POST" && dependencyMatch) return adminUpsertDependency(request,env,admin,decodeURIComponent(dependencyMatch[1]));
    dependencyMatch=path.match(/^\/api\/admin\/tasks\/([^/]+)\/dependencies\/([^/]+)$/);
    if (method==="DELETE" && dependencyMatch) return adminDeleteDependency(request,env,admin,decodeURIComponent(dependencyMatch[1]),decodeURIComponent(dependencyMatch[2]));
    let roleDecisionMatch=path.match(/^\/api\/admin\/roles\/applications\/([^/]+)\/decision$/);
    if (method==="POST" && roleDecisionMatch) return adminRoleDecision(request,env,admin,decodeURIComponent(roleDecisionMatch[1]));
    let challengeDecisionMatch=path.match(/^\/api\/admin\/challenges\/entries\/([^/]+)\/decision$/);
    if (method==="POST" && challengeDecisionMatch) return adminChallengeDecision(request,env,admin,decodeURIComponent(challengeDecisionMatch[1]));
    if (method==="POST" && path==="/api/admin/evidence") return adminUploadEvidence(request,env,admin);
    let evidenceMatch=path.match(/^\/api\/admin\/evidence\/([^/]+)$/);
    if (method==="GET" && evidenceMatch) return adminDownloadEvidence(request,env,admin,decodeURIComponent(evidenceMatch[1]));

    let adminMatch=path.match(/^\/api\/admin\/requests\/([^/]+)\/decision$/);
    if (method==="POST" && adminMatch) return adminDecision(request,env,admin,decodeURIComponent(adminMatch[1]));
    adminMatch=path.match(/^\/api\/admin\/requests\/([^/]+)\/checkpoint$/);
    if (method==="POST" && adminMatch) return adminCheckpoint(request,env,admin,decodeURIComponent(adminMatch[1]));
    adminMatch=path.match(/^\/api\/admin\/submissions\/([^/]+)\/decision$/);
    if (method==="POST" && adminMatch) return adminSubmissionDecision(request,env,admin,decodeURIComponent(adminMatch[1]));
    adminMatch=path.match(/^\/api\/admin\/users\/([^/]+)\/skill$/);
    if (method==="POST" && adminMatch) return adminSkillDecision(request,env,admin,decodeURIComponent(adminMatch[1]));
    adminMatch=path.match(/^\/api\/admin\/users\/([^/]+)\/skill\/revoke$/);
    if (method==="POST" && adminMatch) return adminRevokeSkill(request,env,admin,decodeURIComponent(adminMatch[1]));
    adminMatch=path.match(/^\/api\/admin\/users\/([^/]+)\/level$/);
    if (method==="POST" && adminMatch) return adminSetLevel(request,env,admin,decodeURIComponent(adminMatch[1]));
    adminMatch=path.match(/^\/api\/admin\/users\/([^/]+)\/governance$/);
    if (method==="POST" && adminMatch) return adminSetGovernance(request,env,admin,decodeURIComponent(adminMatch[1]));
    adminMatch=path.match(/^\/api\/admin\/users\/([^/]+)\/email-verified$/);
    if (method==="POST" && adminMatch) return adminVerifyEmail(request,env,admin,decodeURIComponent(adminMatch[1]));
    throw new ApiError(404,"Admin API endpoint not found.","not_found");
  }

  const user=await requireUser(request,env);

  if (method==="POST" && path==="/api/auth/resend-verification") {
    if (Number(user.email_verified)) return json({ok:true,message:"Email is already verified."});
    const result=await createVerification(env,user,url.origin);
    return json({ok:true,email_state:result.email_state,message:result.email_state==="sent"?"Verification email sent.":"Email transport is not configured yet. You may continue with L0 open tasks; PCS admin can manually verify your address."});
  }
  if (method==="PATCH" && path==="/api/profile") return updateProfile(request,env,user);
  let roleMatch=path.match(/^\/api\/roles\/([^/]+)\/apply$/);
  if (method==="POST" && roleMatch) return applyForRole(request,env,user,decodeURIComponent(roleMatch[1]));
  roleMatch=path.match(/^\/api\/roles\/applications\/([^/]+)\/withdraw$/);
  if (method==="POST" && roleMatch) return withdrawRoleApplication(request,env,user,decodeURIComponent(roleMatch[1]));
  let challengeMatch=path.match(/^\/api\/challenges\/([^/]+)\/submit$/);
  if (method==="POST" && challengeMatch) return submitChallengeEntry(request,env,user,decodeURIComponent(challengeMatch[1]));
  challengeMatch=path.match(/^\/api\/challenges\/entries\/([^/]+)\/withdraw$/);
  if (method==="POST" && challengeMatch) return withdrawChallengeEntry(request,env,user,decodeURIComponent(challengeMatch[1]));
  if (method==="POST" && path==="/api/skills/request") return requestSkill(request,env,user);
  if (method==="POST" && path==="/api/evaluations/start") return startCompetencyEvaluation(request,env,user);
  let evaluationMatch=path.match(/^\/api\/evaluations\/([^/]+)\/submit$/);
  if (method==="POST" && evaluationMatch) return submitCompetencyEvaluation(request,env,user,decodeURIComponent(evaluationMatch[1]));
  if (method==="POST" && path==="/api/account/delete") {
    if (isOwner(user)) throw new ApiError(403,"The Founder/Owner account cannot be deleted through self-service. Ownership must be transferred or PCS governance must be deliberately shut down first.","owner_delete_protected");
    const body=await readBody(request);
    const password=String(body.password||"");
    const computed=await derivePassword(password,user.password_salt,Number(user.password_iterations));
    if (!fixedEqual(computed,user.password_hash)) throw new ApiError(403,"Password did not match.","bad_password");
    await audit(env,user.id,"account_deleted","user",user.id,{});
    await env.COMMONS_DB.prepare("DELETE FROM users WHERE id=?").bind(user.id).run();
    return json({ok:true},200,{"set-cookie":clearSessionCookie()});
  }

  const contributorCheckMatch=path.match(/^\/api\/submissions\/([^/]+)\/checks$/);
  if(method==="GET" && contributorCheckMatch)
    return contributorSubmissionChecks(request,env,user,decodeURIComponent(contributorCheckMatch[1]));

  let match=path.match(/^\/api\/tasks\/([^/]+)\/request$/);
  if (method==="POST" && match) return startOrRequestTask(request,env,user,decodeURIComponent(match[1]));

  match=path.match(/^\/api\/requests\/([^/]+)\/checkpoint$/);
  if (method==="POST" && match) return submitCheckpoint(request,env,user,decodeURIComponent(match[1]));
  match=path.match(/^\/api\/requests\/([^/]+)\/submit$/);
  if (method==="POST" && match) return submitWork(request,env,user,decodeURIComponent(match[1]));
  match=path.match(/^\/api\/requests\/([^/]+)\/withdraw$/);
  if (method==="POST" && match) return withdrawRequest(request,env,user,decodeURIComponent(match[1]));


  throw new ApiError(404,"API endpoint not found.","not_found");
}

export default {
  async fetch(request, env) {
    try {
      const url=new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request,env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof ApiError) return json({ok:false,error:error.code,message:error.message},error.status);
      console.error("PCS Commons worker error",error);
      return json({ok:false,error:"internal_error",message:"Unexpected server error."},500);
    }
  },

  async scheduled(_event, env, _ctx) {
    try {
      await expireStaleWork(env);
      await remindPendingReviews(env);
    } catch (error) {
      console.error("PCS Commons scheduled cleanup failed",error);
    }
  },
};
