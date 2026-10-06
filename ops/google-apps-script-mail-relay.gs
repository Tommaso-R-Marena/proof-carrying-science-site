/**
 * PCS Gmail relay for Google Apps Script.
 *
 * Required Script Property:
 *   PCS_MAIL_SECRET = the same long random secret stored in Cloudflare as MAIL_RELAY_SECRET
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * The web endpoint is public, but every request must carry a fresh timestamp,
 * nonce, and valid HMAC-SHA256 signature. The shared secret is never sent.
 */

const PCS_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const PCS_NONCE_TTL_MS = 10 * 60 * 1000;
const PCS_NONCE_PREFIX = "PCS_MAIL_NONCE_V1_";
const PCS_MAX_SUBJECT_CHARS = 200;
const PCS_MAX_BODY_CHARS = 100000;

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function hex_(bytes) {
  return bytes.map(function (value) {
    const n = value < 0 ? value + 256 : value;
    return n.toString(16).padStart(2, "0");
  }).join("");
}

function constantTimeEqual_(a, b) {
  a = String(a || "");
  b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "pcs-mail-relay",
    mail_quota_remaining: MailApp.getRemainingDailyQuota()
  });
}

function doPost(e) {
  try {
    const secret = PropertiesService.getScriptProperties().getProperty("PCS_MAIL_SECRET");
    if (!secret || secret.length < 32) {
      return jsonResponse_({ ok: false, error: "relay_not_configured" });
    }

    let data;
    try {
      data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    } catch (_) {
      return jsonResponse_({ ok: false, error: "invalid_json" });
    }

    const timestamp = String(data.timestamp || "");
    const nonce = String(data.nonce || "");
    const to = String(data.to || "").trim();
    const subject = String(data.subject || "");
    const text = String(data.text || "");
    const signature = String(data.signature || "").toLowerCase();

    if (!/^\d{13}$/.test(timestamp)) {
      return jsonResponse_({ ok: false, error: "bad_timestamp" });
    }
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(nonce)) {
      return jsonResponse_({ ok: false, error: "bad_nonce" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return jsonResponse_({ ok: false, error: "bad_recipient" });
    }
    if (!subject || subject.length > PCS_MAX_SUBJECT_CHARS) {
      return jsonResponse_({ ok: false, error: "bad_subject" });
    }
    if (!text || text.length > PCS_MAX_BODY_CHARS) {
      return jsonResponse_({ ok: false, error: "bad_body" });
    }

    const age = Math.abs(Date.now() - Number(timestamp));
    if (!Number.isFinite(age) || age > PCS_MAX_CLOCK_SKEW_MS) {
      return jsonResponse_({ ok: false, error: "stale_request" });
    }

    const canonical = [timestamp, nonce, to, subject, text].join("\n");
    const expected = hex_(Utilities.computeHmacSha256Signature(
      canonical,
      secret,
      Utilities.Charset.UTF_8
    ));

    if (!constantTimeEqual_(expected, signature)) {
      return jsonResponse_({ ok: false, error: "bad_signature" });
    }

    const remaining = MailApp.getRemainingDailyQuota();
    if (remaining < 1) {
      return jsonResponse_({ ok: false, error: "daily_mail_quota_exhausted" });
    }

    // CacheService is intentionally not used for replay authority: it is best-effort
    // and may evict early. Serialize nonce consumption with a script-wide lock and
    // persist each live nonce in Script Properties.
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return jsonResponse_({ ok: false, error: "relay_busy" });
    }
    try {
      const props = PropertiesService.getScriptProperties();
      const now = Date.now();
      const all = props.getProperties();
      Object.keys(all).forEach(function (key) {
        if (key.indexOf(PCS_NONCE_PREFIX) !== 0) return;
        const expiresAt = Number(all[key] || 0);
        if (!Number.isFinite(expiresAt) || expiresAt <= now) props.deleteProperty(key);
      });

      const nonceKey = PCS_NONCE_PREFIX + nonce;
      if (props.getProperty(nonceKey)) {
        return jsonResponse_({ ok: false, error: "replay_detected" });
      }

      // Consume before send. If MailApp later fails, the request stays consumed:
      // retries must be newly signed with a fresh nonce.
      props.setProperty(nonceKey, String(now + PCS_NONCE_TTL_MS));
    } finally {
      lock.releaseLock();
    }

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: text,
      name: "Proof-Carrying Science"
    });

    return jsonResponse_({
      ok: true,
      sent: true,
      mail_quota_remaining: MailApp.getRemainingDailyQuota()
    });
  } catch (err) {
    console.error(err);
    return jsonResponse_({
      ok: false,
      error: "relay_exception",
      detail: String(err).slice(0, 300)
    });
  }
}

/**
 * Run this once manually from the Apps Script editor before deploying.
 * It forces the MailApp authorization prompt and sends a test to your own account.
 */
function authorizeAndTest() {
  const to = Session.getEffectiveUser().getEmail();
  if (!to) throw new Error("Could not determine the effective Google account email.");
  MailApp.sendEmail({
    to: to,
    subject: "PCS Gmail relay authorization test",
    body: "Google Apps Script MailApp authorization is working for the PCS relay.",
    name: "Proof-Carrying Science"
  });
  console.log("Authorization test sent to " + to);
}
