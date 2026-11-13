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
