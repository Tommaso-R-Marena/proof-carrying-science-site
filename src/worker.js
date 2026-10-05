const SESSION_COOKIE = "pcs_commons_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100000; // Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
const TERMS_VERSION = "commons-v1";

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
  } else if (skill === "python") {
    add(choiceQuestion("q1", "A checker catches every exception and returns True. What security property does that violate?", "Fail-closed behavior.", ["Deterministic iteration.", "Stable sorting.", "UTF-8 decoding."]));
    add(choiceQuestion("q2", "A risk checker accepts exactly when risk <= budget. Here risk=" + risk + " and budget=" + budget + ". What should it return?", risk <= budget ? "ACCEPT" : "REJECT", risk <= budget ? ["REJECT", "UNKNOWN", "RETRY"] : ["ACCEPT", "UNKNOWN", "RETRY"]));
    add(choiceQuestion("q3", "Authorization token " + token + " has already been consumed. A second request presents the same token. What should a single-use checker do?", "Reject the second use.", ["Accept because the signature is unchanged.", "Reset the consumed set.", "Ignore token state."]));
    add(choiceQuestion("q4", "A test only asserts that valid input passes. Which addition best protects against a fail-open regression?", "A negative test proving malformed/unauthorized input is rejected.", ["A longer variable name.", "A print statement.", "A second positive-only test."]));
  } else if (skill === "security") {
    add(choiceQuestion("q1", "A signed authorization token is reused after consumption. What is the primary threat?", "Replay of previously authorized authority.", ["Lossless compression.", "Floating-point rounding.", "CSS overflow."]));
    add(choiceQuestion("q2", "A token authorizes read:data but is presented for write:data. What should a scope-aware verifier do?", "Reject because the requested scope is not authorized.", ["Accept because the signer is valid.", "Broaden the scope automatically.", "Ignore the operation field."]));
    add(choiceQuestion("q3", "A token expired " + randomInt(1,24) + " hours ago but has a valid signature. What should the verifier do?", "Reject it as expired.", ["Accept it because signatures override expiry.", "Extend it automatically.", "Treat expiry as cosmetic metadata."]));
    add(choiceQuestion("q4", "An insider signs a payload that violates the declared safety invariant. What does signature validity establish?", "Who signed the payload—not that its domain semantics are safe.", ["That the payload is safe.", "That every policy accepts it.", "That replay is unnecessary."]));
  } else if (skill === "ml") {
    const overlap = randomInt(1, 15);
    add(choiceQuestion("q1", "The test split shares " + overlap + "% of examples with training data. What is the main evaluation problem?", "Train/test leakage compromises independence.", ["The metric is automatically conservative.", "The model becomes formally verified.", "The overlap improves provenance."]));
    add(choiceQuestion("q2", "Hyperparameters are repeatedly selected using the final test set. What happens to the test set?", "It is no longer an untouched independent final evaluation.", ["It becomes a training checksum.", "It proves generalization.", "Nothing changes."]));
    add(choiceQuestion("q3", "A rare harmful class is 2% of data and a model predicts the majority class always. Which statement is safest?", "High overall accuracy can hide failure on the rare harmful class.", ["Accuracy alone proves the evaluator is adequate.", "Class imbalance cannot affect interpretation.", "A majority predictor is necessarily safe."]));
    add(choiceQuestion("q4", "A result is signed but the evaluator/dataset identifiers are not bound to the receipt. What attack remains?", "Substituting a different evaluator or dataset while reusing the result.", ["Integer overflow in CSS.", "Loss of email delivery.", "A theorem becoming an axiom automatically."]));
  } else if (skill === "biology") {
    add(choiceQuestion("q1", "A paper uses 1-based residue numbering. Residue " + residue + " corresponds to which zero-based array index?", String(residue - 1), [String(residue), String(residue + 1), String(Math.max(0,residue - 2))]));
    const score = randomInt(60, 95) / 100;
    const thr = randomInt(65, 90) / 100;
    add(choiceQuestion("q2", "A declared score threshold is >= " + thr.toFixed(2) + ". The committed score is " + score.toFixed(2) + ". What does the checker conclude?", score >= thr ? "Threshold satisfied." : "Threshold not satisfied.", score >= thr ? ["Threshold not satisfied.", "Biological function proved.", "Clinical validity proved."] : ["Threshold satisfied.", "Biological function proved.", "Clinical validity proved."]));
    const conserved = randomInt(6, 10), total = 10;
    add(choiceQuestion("q3", conserved + " of " + total + " aligned homologues conserve a residue. What exact empirical fraction is shown?", (conserved/total).toFixed(1), [((conserved-1)/total).toFixed(1), "1.0", "0.0"]));
    add(choiceQuestion("q4", "A committed sequence/score artifact passes its computational checker. What still needs separate evidence?", "That the committed bytes faithfully represent the relevant external biological object and interpretation.", ["That bytes can be hashed.", "That JSON has braces.", "That the checker returned a boolean."]));
  } else if (skill === "lean") {
    add(choiceQuestion("q1", "Lean theorem: theorem keep (h : " + proposition + ") : " + proposition + " := h. What does it establish?", proposition + " under the explicit premise h : " + proposition + ".", ["An unconditional proof of " + proposition + ".", "That every proposition is true.", "That the external world satisfies " + proposition + "."]));
    add(choiceQuestion("q2", "A theorem compiles only because its proof contains sorry. How should PCS treat it?", "Reject it as a proof escape.", ["Accept it because compilation succeeded.", "Treat sorry as a cryptographic signature.", "Upgrade it to L6 authority."]));
    add(choiceQuestion("q3", "A Lean theorem proves x = x by rfl, while prose claims a complex safety property. What is authoritative?", "The exact formal theorem statement, not the stronger prose.", ["The prose automatically expands the theorem.", "Compilation proves every nearby comment.", "The longer sentence is authoritative."]));
    add(choiceQuestion("q4", "Why inspect theorem axiom dependencies after a successful build?", "To detect hidden assumptions or nonstandard trust dependencies behind the theorem.", ["To improve CSS.", "To create more test users.", "To make hashes shorter."]));
  } else if (skill === "review") {
    add(choiceQuestion("q1", "A root obligation depends on child A=PROVED and child B=OPEN. Under conjunctive composition, what is the root?", "Not closed; the OPEN dependency prevents acceptance.", ["PROVED because one child passed.", "Automatically waived.", "Equivalent to reviewer preference."]));
    add(choiceQuestion("q2", "A proof-obligation graph contains two nodes with the same identifier but different claims. What should a fail-closed checker do?", "Reject the graph as ambiguous/invalid.", ["Choose the first silently.", "Average the two claims.", "Mark both proved."]));
    add(choiceQuestion("q3", "A package is valid and the typed claim is supported, but reviewer policy requires a different signer. What can happen?", "The reviewer can decline acceptance while the verified scientific record remains valid.", ["Package validity must become false.", "The claim must be rewritten as true.", "Signer policy is irrelevant."]));
    add(choiceQuestion("q4", "Why bind a receipt to exact package/certificate hashes?", "So the review decision cannot be silently reused for different bytes.", ["To make the font smaller.", "To remove the need for replay.", "To let contributors self-approve."]));
  } else {
    throw new ApiError(400, "This skill does not have an automated competency screening.", "evaluation_unavailable");
  }

  const orderedQuestions = shuffled(questions);
  return {
    variant_token: randomToken(12),
    challenge: {
      version: "pcs-variable-competency-v1",
      skill,
      generated: true,
      objective_questions: orderedQuestions,
      manual_rationale_required: true,
      note: "Questions are generated from randomized parameterized scenarios and shuffled choices. Passing the auto-score is evidence for manual review, never automatic authority."
    },
    answer_key: key,
    max_score: questions.length,
    pass_score: Math.ceil(questions.length * 0.75),
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

function requireSameOrigin(request) {
  if (!STATE_METHODS.has(request.method)) return;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) throw new ApiError(403, "Cross-origin state changes are not allowed.", "bad_origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new ApiError(403, "Cross-site state changes are not allowed.", "bad_fetch_site");
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

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new ApiError(403, "Administrator access required.", "admin_required");
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

async function deleteSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  await env.COMMONS_DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
}

async function audit(env, actorUserId, action, subjectType, subjectId, detail = {}) {
  await env.COMMONS_DB.prepare(
    "INSERT INTO audit_log(id,actor_user_id,action,subject_type,subject_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?)"
  ).bind(crypto.randomUUID(), actorUserId || null, action, subjectType, subjectId, JSON.stringify(detail), nowIso()).run();
}

async function sendMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return { state: "disabled", error: "Transactional email transport is not configured." };
  try {
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
      return { state: "failed", error: `Email provider returned ${response.status}: ${detail}` };
    }
    return { state: "sent", error: null };
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

function eligibilityFor(task, user, skills) {
  if (!user) return { state: "login_required", can_start: false, can_request: false, reason: "Create an account or sign in." };
  if (user.status !== "active") return { state: "locked", can_start: false, can_request: false, reason: "Account is not active." };
  if (Number(user.level) < Number(task.min_level)) {
    return { state: "level_required", can_start: false, can_request: false, reason: `Requires PCS level L${task.min_level}. Your verified level is L${user.level}.` };
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
      "UPDATE task_requests SET status='expired', checkpoint_status=CASE WHEN checkpoint_status='pending' THEN 'missed' ELSE checkpoint_status END WHERE id=? AND status='approved'"
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
  await env.COMMONS_DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now).run();
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
  const session = await createSession(env, id);
  const user = await env.COMMONS_DB.prepare("SELECT * FROM users WHERE id=?").bind(id).first();
  return json({
    ok: true,
    user: publicUser(user),
    recovery_code: recoveryCode,
    recovery_warning: "Save this recovery code now. It cannot be recovered later.",
  }, 201, { "set-cookie": sessionCookie(session) });
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
  if (!user) return json({ authenticated: false, email_transport: Boolean(env.RESEND_API_KEY && env.MAIL_FROM) });
  const [skills, requests, notifications, evaluations] = await Promise.all([
    env.COMMONS_DB.prepare("SELECT skill,status,evidence,verification_note,requested_at,verified_at,review_due_at,source,evaluation_id FROM skills WHERE user_id=? ORDER BY skill").bind(user.id).all(),
    env.COMMONS_DB.prepare(
      `SELECT r.*,t.title,t.min_level,t.claim_mode,t.required_skill,t.compensation_label
       FROM task_requests r JOIN tasks t ON t.id=r.task_id
       WHERE r.user_id=? ORDER BY r.requested_at DESC LIMIT 50`
    ).bind(user.id).all(),
    env.COMMONS_DB.prepare(
      "SELECT id,kind,subject,body,created_at,read_at,email_state FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30"
    ).bind(user.id).all(),
    env.COMMONS_DB.prepare(
      "SELECT id,skill,task_id,created_at,expires_at,submitted_at,score,max_score,auto_pass,status FROM competency_evaluations WHERE user_id=? ORDER BY created_at DESC LIMIT 20"
    ).bind(user.id).all(),
  ]);
  return json({
    authenticated: true,
    user: publicUser(user),
    skills: skills.results || [],
    requests: requests.results || [],
    notifications: notifications.results || [],
    evaluations: evaluations.results || [],
    email_transport: Boolean(env.RESEND_API_KEY && env.MAIL_FROM),
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
    const task = await env.COMMONS_DB.prepare("SELECT id,required_skill FROM tasks WHERE id=? AND status='open'").bind(taskId).first();
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
  await env.COMMONS_DB.prepare(
    `INSERT INTO competency_evaluations(
      id,user_id,skill,task_id,variant_token,challenge_json,answer_key_json,created_at,expires_at,max_score,status
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'open')`
  ).bind(
    id,user.id,skill,taskId,generated.variant_token,
    JSON.stringify(generated.challenge),JSON.stringify(generated.answer_key),
    createdAt,expiresAt,generated.max_score
  ).run();
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
    await env.COMMONS_DB.prepare("UPDATE competency_evaluations SET status='expired' WHERE id=?").bind(row.id).run();
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

  await env.COMMONS_DB.prepare(
    "UPDATE competency_evaluations SET status='submitted',submitted_at=?,answers_json=?,rationale=?,score=?,auto_pass=? WHERE id=?"
  ).bind(submittedAt,JSON.stringify(answers),rationale,score,autoPass?1:0,row.id).run();

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
  const tasks = await env.COMMONS_DB.prepare(
    "SELECT * FROM tasks WHERE status='open' ORDER BY min_level,id"
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
    tasks: (tasks.results || []).map(task => ({
      ...task,
      eligibility: eligibilityFor(task,user,skillSet),
      my_request: requestMap.get(task.id) || null,
    })),
  });
}

async function startOrRequestTask(request, env, user, taskId) {
  await rateLimit(request, env, "task-request", 30, 60);
  const body = await readBody(request);
  const task = await env.COMMONS_DB.prepare("SELECT * FROM tasks WHERE id=? AND status='open'").bind(taskId).first();
  if (!task) throw new ApiError(404,"Task not found or not open.","task_not_found");
  const skills = await verifiedSkills(env,user.id);
  const eligibility = eligibilityFor(task,user,skills);
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
  await env.COMMONS_DB.prepare(
    `INSERT INTO task_requests(
      id,task_id,user_id,status,application_note,ai_use_plan,verification_plan,requested_at,decision_due_at,checkpoint_status,last_progress_at
    ) VALUES(?,?,?,'pending',?,?,?,?,?,'pending',?)`
  ).bind(id,task.id,user.id,application,aiPlan,verificationPlan,now,due,now).run();

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
    `SELECT r.*,t.title,t.id AS task_id,t.min_level,t.claim_mode,t.required_skill,t.calibrates_skill FROM task_requests r JOIN tasks t ON t.id=r.task_id
     WHERE r.id=? AND r.user_id=?`
  ).bind(requestId,user.id).first();
  if (!row || row.status!=="approved") throw new ApiError(404,"Active approved work record not found.","request_not_active");
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

  const id = crypto.randomUUID();
  await env.COMMONS_DB.prepare(
    `INSERT INTO submissions(
      id,request_id,user_id,summary,artifact_url,ai_used,ai_tools,verification_note,understanding_note,submitted_at,status
    ) VALUES(?,?,?,?,?,?,?,?,?,?,'submitted')`
  ).bind(id,row.id,user.id,summary,artifactUrl||null,aiUsed?1:0,aiTools||null,verification,understanding,nowIso()).run();
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
  await audit(env,user.id,"submission_created","submission",id,{task_id:row.task_id,ai_used:aiUsed});
  return json({ok:true,submission_id:id,message:"Submission received for independent review. AI assistance is permitted, but responsibility and verification remain with the contributor."},201);
}

async function withdrawRequest(request, env, user, requestId) {
  const row = await env.COMMONS_DB.prepare("SELECT * FROM task_requests WHERE id=? AND user_id=?").bind(requestId,user.id).first();
  if (!row || !["pending","approved"].includes(row.status)) throw new ApiError(404,"Active request not found.","request_not_active");
  await env.COMMONS_DB.prepare("UPDATE task_requests SET status='withdrawn',decision_at=?,decision_note=? WHERE id=?").bind(nowIso(),"Withdrawn by contributor.",row.id).run();
  await audit(env,user.id,"task_request_withdrawn","task_request",row.id,{task_id:row.task_id});
  return json({ok:true,message:"Task released/withdrawn. No penalty is applied for ordinary withdrawal."});
}

async function adminOverview(request, env) {
  const admin = await requireAdmin(request,env);
  await expireStaleWork(env);
  await remindPendingReviews(env);
  const [pending, checkpoints, submissions, skillReviews, users] = await Promise.all([
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
      `SELECT s.*,r.task_id,t.title,t.calibrates_skill,u.display_name,u.email,u.level
       FROM submissions s JOIN task_requests r ON r.id=s.request_id JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=s.user_id
       WHERE s.status IN ('submitted','needs_changes') ORDER BY s.submitted_at ASC LIMIT 100`
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
  ]);
  return json({
    admin:publicUser(admin),
    email_transport:Boolean(env.RESEND_API_KEY && env.MAIL_FROM),
    pending_requests:pending.results||[],
    checkpoints:checkpoints.results||[],
    submissions:submissions.results||[],
    skill_reviews:skillReviews.results||[],
    users:users.results||[],
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
    await env.COMMONS_DB.prepare(
      `UPDATE task_requests SET status='approved',decision_at=?,decided_by=?,decision_note=?,
       reservation_expires_at=?,checkpoint_due_at=?,checkpoint_status='pending',last_progress_at=? WHERE id=?`
    ).bind(now,admin.id,note,expiry,checkpoint,now,row.id).run();
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

  await env.COMMONS_DB.prepare(
    "UPDATE task_requests SET status='rejected',decision_at=?,decided_by=?,decision_note=?,checkpoint_status='not_required' WHERE id=?"
  ).bind(nowIso(),admin.id,note,row.id).run();
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
     WHERE r.id=? AND r.status='approved'`
  ).bind(requestId).first();
  if (!row) throw new ApiError(404,"Active request not found.","request_not_found");
  if (!row.checkpoint_note) throw new ApiError(409,"Contributor has not submitted a checkpoint.","checkpoint_missing");

  if (decision==="release") {
    await env.COMMONS_DB.prepare(
      "UPDATE task_requests SET status='expired',checkpoint_status='missed',decision_note=? WHERE id=?"
    ).bind(note||"Checkpoint did not justify holding the reservation.",row.id).run();
    await notify(env,{userId:row.user_id,email:row.email_verified?row.email:null,kind:"checkpoint_released",subject:`PCS task released: ${row.task_id}`,body:`PCS released your reservation for ${row.task_id} after checkpoint review.\n\n${note}\n`});
    await audit(env,admin.id,"checkpoint_released","task_request",row.id,{task_id:row.task_id});
    return json({ok:true,status:"expired"});
  }

  if (Number(row.extension_count||0)>=2) throw new ApiError(409,"This reservation has already received the maximum two checkpoint extensions. Review the task manually.","extension_limit");
  const extendHours=Math.min(Math.max(Number(body.extend_hours||168),24),168);
  const expiry=addHoursIso(nowIso(),extendHours);
  await env.COMMONS_DB.prepare(
    "UPDATE task_requests SET checkpoint_status='accepted',reservation_expires_at=?,extension_count=extension_count+1,last_progress_at=? WHERE id=?"
  ).bind(expiry,nowIso(),row.id).run();
  await notify(env,{userId:row.user_id,email:row.email_verified?row.email:null,kind:"checkpoint_accepted",subject:`PCS checkpoint accepted: ${row.task_id}`,body:`Your progress checkpoint for ${row.task_id} was accepted. The reservation now runs through ${expiry}.\n\n${note}\n`});
  await audit(env,admin.id,"checkpoint_accepted","task_request",row.id,{task_id:row.task_id,expiry});
  return json({ok:true,status:"approved",reservation_expires_at:expiry});
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
  const status=decision==="accept"?"accepted":decision==="needs_changes"?"needs_changes":"rejected";
  await env.COMMONS_DB.prepare(
    "UPDATE submissions SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=?"
  ).bind(status,nowIso(),admin.id,note,row.id).run();
  if (decision==="accept") {
    await env.COMMONS_DB.prepare("UPDATE task_requests SET status='completed',decision_note=? WHERE id=?").bind("Submission accepted.",row.task_request_id).run();
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
  const when=status==="verified"?nowIso():null;
  await env.COMMONS_DB.prepare(
    "UPDATE skills SET status=?,verification_note=?,verified_at=?,verified_by=?,review_due_at=NULL WHERE user_id=? AND skill=?"
  ).bind(status,note,when,admin.id,userId,skill).run();
  await notify(env,{userId,email:user.email_verified?user.email:null,kind:"skill_review",subject:`PCS skill review: ${skill}`,body:`Your ${skill} skill review was marked ${status}.\n\n${note}\n`});
  await audit(env,admin.id,"skill_reviewed","user",userId,{skill,status});
  return json({ok:true,status});
}

async function adminSetLevel(request, env, admin, userId) {
  const body=await readBody(request);
  const level=Number(body.level);
  const note=cleanText(body.note,2000);
  const override=body.override===true;
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
  await notify(env,{userId,email:user.email_verified?user.email:null,kind:"level_changed",subject:`PCS contributor level: L${level}`,body:`Your verified PCS technical level is now L${level}.\n\nReason: ${note}\n\nTechnical level does not grant Founder/Owner governance authority, and task-specific skill/assignment requirements still apply.\n`});
  await audit(env,admin.id,"user_level_changed","user",userId,{from:currentLevel,to:level,override,owner_actor:isOwner(admin),accepted_total:acceptedTotal,accepted_high_trust:acceptedHighTrust,verified_skills:[...skills]});
  return json({ok:true,level});
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
      email_transport:Boolean(env.RESEND_API_KEY && env.MAIL_FROM),
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
  if (method==="POST" && path==="/api/auth/recover") return recover(request,env);
  if (method==="POST" && path==="/api/auth/verify-email") return verifyEmail(request,env);
  if (method==="POST" && path==="/api/admin/bootstrap") return bootstrapAdmin(request,env);
  if (method==="POST" && path==="/api/auth/logout") {
    await deleteSession(request,env);
    return json({ok:true},200,{"set-cookie":clearSessionCookie()});
  }
  if (method==="GET" && path==="/api/me") return me(request,env);
  if (method==="GET" && path==="/api/tasks") return listTasks(request,env);

  const user=await requireUser(request,env);

  if (method==="POST" && path==="/api/auth/resend-verification") {
    if (Number(user.email_verified)) return json({ok:true,message:"Email is already verified."});
    const result=await createVerification(env,user,url.origin);
    return json({ok:true,email_state:result.email_state,message:result.email_state==="sent"?"Verification email sent.":"Email transport is not configured yet. You may continue with L0 open tasks; PCS admin can manually verify your address."});
  }
  if (method==="PATCH" && path==="/api/profile") return updateProfile(request,env,user);
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

  let match=path.match(/^\/api\/tasks\/([^/]+)\/request$/);
  if (method==="POST" && match) return startOrRequestTask(request,env,user,decodeURIComponent(match[1]));

  match=path.match(/^\/api\/requests\/([^/]+)\/checkpoint$/);
  if (method==="POST" && match) return submitCheckpoint(request,env,user,decodeURIComponent(match[1]));
  match=path.match(/^\/api\/requests\/([^/]+)\/submit$/);
  if (method==="POST" && match) return submitWork(request,env,user,decodeURIComponent(match[1]));
  match=path.match(/^\/api\/requests\/([^/]+)\/withdraw$/);
  if (method==="POST" && match) return withdrawRequest(request,env,user,decodeURIComponent(match[1]));

  if (path.startsWith("/api/admin/")) {
    if (user.role!=="admin") throw new ApiError(403,"Administrator access required.","admin_required");
    if (method==="GET" && path==="/api/admin/overview") return adminOverview(request,env);

    match=path.match(/^\/api\/admin\/requests\/([^/]+)\/decision$/);
    if (method==="POST" && match) return adminDecision(request,env,user,decodeURIComponent(match[1]));
    match=path.match(/^\/api\/admin\/requests\/([^/]+)\/checkpoint$/);
    if (method==="POST" && match) return adminCheckpoint(request,env,user,decodeURIComponent(match[1]));
    match=path.match(/^\/api\/admin\/submissions\/([^/]+)\/decision$/);
    if (method==="POST" && match) return adminSubmissionDecision(request,env,user,decodeURIComponent(match[1]));
    match=path.match(/^\/api\/admin\/users\/([^/]+)\/skill$/);
    if (method==="POST" && match) return adminSkillDecision(request,env,user,decodeURIComponent(match[1]));
    match=path.match(/^\/api\/admin\/users\/([^/]+)\/level$/);
    if (method==="POST" && match) return adminSetLevel(request,env,user,decodeURIComponent(match[1]));
    match=path.match(/^\/api\/admin\/users\/([^/]+)\/governance$/);
    if (method==="POST" && match) return adminSetGovernance(request,env,user,decodeURIComponent(match[1]));
    match=path.match(/^\/api\/admin\/users\/([^/]+)\/email-verified$/);
    if (method==="POST" && match) return adminVerifyEmail(request,env,user,decodeURIComponent(match[1]));
  }

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
