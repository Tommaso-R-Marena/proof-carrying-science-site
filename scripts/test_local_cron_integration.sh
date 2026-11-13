#!/usr/bin/env bash
# Strictly local Worker/D1 scheduled-handler integration. No production access.
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
# GitHub Actions must not inherit cloud credentials for local scheduled testing.
unset CLOUDFLARE_API_TOKEN CF_API_TOKEN CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL CLOUDFLARE_ACCOUNT_ID
temp_base="$(printenv RUNNER_TEMP || printf /tmp)"
temporary="$(mktemp -d "$temp_base/pcs-cron-local.XXXXXX")"
worker_pid=""
cleanup() {
  if [[ -n "$worker_pid" ]]; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
  rm -rf -- "$temporary"
}
trap cleanup EXIT

state="$temporary/state"
mkdir -p "$state"
# --local is mandatory; never add --remote or replace this with production DB.
npx --no-install wrangler d1 migrations apply pcs-commons \
  --local --persist-to "$state" > "$temporary/migrate.log" 2>&1

# Environment fixtures are never uploaded; deliberately invalid origin,
# no user records, and no mail credentials avoid outbound contact.
printf 'RATE_LIMIT_SALT=%s\n' 'synthetic-local-cron-qualification-not-a-secret' > "$temporary/local.env"
chmod 600 "$temporary/local.env"
npx --no-install wrangler dev --local --test-scheduled \
  --ip 127.0.0.1 --port 8798 --persist-to "$state" \
  --env-file "$temporary/local.env" \
  --var PUBLIC_ORIGIN:http://127.0.0.1:8798 \
  > "$temporary/worker.log" 2>&1 &
worker_pid=$!

ready=0
for i in $(seq 1 50); do
  if curl --silent --fail --max-time 2 \
    http://127.0.0.1:8798/api/me > "$temporary/health.json"; then
    ready=1
    break
  fi
  if ! kill -0 "$worker_pid" 2>/dev/null; then
    echo "Local Worker stopped before readiness" >&2
    tail -35 "$temporary/worker.log" >&2
    exit 1
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "Local Worker failed readiness" >&2
  tail -35 "$temporary/worker.log" >&2
  exit 1
fi

curl --silent --show-error --max-time 25 \
  'http://127.0.0.1:8798/cdn-cgi/local/scheduled?format=json' \
  > "$temporary/scheduled-success.json"
node - "$temporary/scheduled-success.json" <<'NODE'
const fs=require('node:fs');
const result=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const outcome=result?.result?.outcome ?? result?.outcome;
if(outcome!=='ok'){
  console.error('Local scheduled empty-data event did not report OK; outcome:',outcome);
  process.exit(1);
}
console.log('PASS: real local Workers scheduled() completed with D1 migration 0026');
NODE

# Seed synthetic *verified* contributor and expired reservation in local D1.
# No human data, credential, mail transport, remote D1 or live account used.
cat > "$temporary/seed.sql" <<'SQL'
INSERT INTO users(id,email,display_name,password_hash,password_salt,
  recovery_hash,password_iterations,level,email_verified,is_owner,created_at,updated_at)
VALUES('cron-local-user','cron-fixture@pcs.invalid','Synthetic Cron Fixture',
  'SYNTHETIC_NOT_A_HASH','SYNTHETIC_NOT_A_SALT','SYNTHETIC_NON_CREDENTIAL',
  100000,4,1,0,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z');
INSERT INTO tasks(id,title,summary,claim_mode,expected_hours,created_at,updated_at)
VALUES('cron-local-task','Synthetic Expired Task','No real participant',
  'approval',1,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z');
INSERT INTO task_requests(id,task_id,user_id,status,requested_at,decision_due_at,
  checkpoint_status,checkpoint_due_at,checkpoint_note,reservation_key)
VALUES('cron-local-request','cron-local-task','cron-local-user','approved',
  '2020-01-01T00:00:00Z','2020-01-02T00:00:00Z',
  'pending','2020-01-03T00:00:00Z','','cron-local-task');
SQL
npx --no-install wrangler d1 execute pcs-commons \
  --local --persist-to "$state" --file "$temporary/seed.sql" \
  > "$temporary/seed.log" 2>&1

curl --silent --show-error --max-time 25 \
  'http://127.0.0.1:8798/cdn-cgi/local/scheduled?format=json' \
  > "$temporary/scheduled-mail-outage.json"
node - "$temporary/scheduled-mail-outage.json" <<'NODE'
const fs=require('node:fs');
const result=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const outcome=result?.result?.outcome ?? result?.outcome;
// Mail transport is deliberately unconfigured. Expiry and journal must
// commit, while the retryable outbound failure is visible to operations.
if(outcome==='ok'||!outcome){
  console.error('Unexpected scheduled success when local mail transport is absent');
  process.exit(1);
}
console.log('PASS: actual Worker returns failure on local mail transport outage');
NODE

# A DB CHECK assertion provides machine-readable success even when the CLI
# presents query rows in a human-readable table. All data is isolated/local.
cat > "$temporary/assert-cron.sql" <<'SQL'
CREATE TABLE cron_local_assert (ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO cron_local_assert(ok)
SELECT CASE WHEN
  (SELECT status FROM task_requests WHERE id='cron-local-request')='expired'
  AND (SELECT reservation_key FROM task_requests WHERE id='cron-local-request') IS NULL
  AND (SELECT COUNT(*) FROM audit_log WHERE id='cron-expiry:cron-local-request')=1
  AND (SELECT COUNT(*) FROM audit_archive WHERE event_id='cron-expiry:cron-local-request'
    AND legacy_audit_id='cron-expiry:cron-local-request'
    AND action='task_request_expired')=1
  AND (SELECT COUNT(*) FROM notifications WHERE id='cron-expiry-note:cron-local-request'
    AND kind='task_expired' AND email_state='failed')=1
  AND (SELECT COUNT(*) FROM cron_delivery_attempts
    WHERE notification_id='cron-expiry-note:cron-local-request'
      AND attempt_count=1 AND delivered_at IS NULL)=1
THEN 1 ELSE 0 END;
SQL
npx --no-install wrangler d1 execute pcs-commons \
  --local --persist-to "$state" --file "$temporary/assert-cron.sql" \
  > "$temporary/assert-cron.log" 2>&1
echo 'PASS: local Worker committed synthetic task expiry and matching immutable archive; retry intent remains'

# Simulate two forged Cron-looking notification rows in the local database.
# One carries an admin reminder kind but points to a user; the other has
# a mismatched ID and kind. Neither is permitted into the mail outbox.
cat > "$temporary/forged-mail.sql" <<'SQL'
INSERT INTO notifications(id,user_id,kind,subject,body,created_at,email_state)
VALUES('cron-reminder:task_request_target_admin:forged-user','cron-local-user',
       'task_request_target_admin:forged-user','SYNTHETIC FORGED',
       'Synthetic private body','2026-11-13T00:00:00Z','queued');
INSERT INTO notifications(id,user_id,kind,subject,body,created_at,email_state)
VALUES('cron-reminder:wrong-key',NULL,
       'skill_review_target_admin:mismatched','SYNTHETIC FORGED',
       'Synthetic private body','2026-11-13T00:00:00Z','queued');
SQL
npx --no-install wrangler d1 execute pcs-commons \
  --local --persist-to "$state" --file "$temporary/forged-mail.sql" \
  > "$temporary/forged-mail.log" 2>&1

# A second event before the 5-minute retry window must not recreate events,
# send a new email, or increment the existing attempt counter.
curl --silent --show-error --max-time 25 \
  'http://127.0.0.1:8798/cdn-cgi/local/scheduled?format=json' \
  > "$temporary/scheduled-repeat.json"
node - "$temporary/scheduled-repeat.json" <<'NODE'
const fs=require('node:fs');
const result=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const outcome=result?.result?.outcome ?? result?.outcome;
if(outcome!=='ok'){
  console.error('Expected idempotent replay before email retry deadline; got:',outcome);
  process.exit(1);
}
console.log('PASS: local second scheduled invocation did not retry mail early');
NODE
npx --no-install wrangler d1 execute pcs-commons \
  --local --persist-to "$state" \
  --command "INSERT INTO cron_local_assert(ok) SELECT CASE WHEN (SELECT attempt_count FROM cron_delivery_attempts WHERE notification_id='cron-expiry-note:cron-local-request')=1 AND (SELECT COUNT(*) FROM audit_archive WHERE event_id='cron-expiry:cron-local-request')=1 AND (SELECT COUNT(*) FROM cron_delivery_attempts WHERE notification_id IN ('cron-reminder:task_request_target_admin:forged-user','cron-reminder:wrong-key'))=0 AND (SELECT COUNT(*) FROM notifications WHERE id IN ('cron-reminder:task_request_target_admin:forged-user','cron-reminder:wrong-key') AND email_state='queued')=2 THEN 1 ELSE 0 END" \
  > "$temporary/assert-repeat.log" 2>&1

# Inject an isolated DB fault. A broken maintenance statement must cause
# the scheduled invocation to fail rather than be reported as success.
npx --no-install wrangler d1 execute pcs-commons \
  --local --persist-to "$state" \
  --command "DROP TABLE rate_limits" > "$temporary/fault-injection.log" 2>&1
curl --silent --show-error --max-time 25 \
  'http://127.0.0.1:8798/cdn-cgi/local/scheduled?format=json' \
  > "$temporary/scheduled-failure.json"
node - "$temporary/scheduled-failure.json" <<'NODE'
const fs=require('node:fs');
const result=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const outcome=result?.result?.outcome ?? result?.outcome;
if(outcome==='ok'||!outcome){
  console.error('FAIL: fault-injected scheduled event did not report a failing outcome; outcome:',outcome);
  process.exit(1);
}
console.log('PASS: real local Worker scheduled() reports fault-injected D1 failure');
NODE

echo 'PASS: local Cron success and fail-closed response'
