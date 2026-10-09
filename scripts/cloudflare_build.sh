#!/usr/bin/env bash
# Run the complete gate with a working SQLite runtime; never skip migration tests.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

probe_python() {
  "$1" - <<'PY'
import hashlib, json, sqlite3, ssl, sys
if not (3, 12) <= sys.version_info[:2] <= (3, 13):
    raise SystemExit('Website build requires Python 3.12 or 3.13')
with sqlite3.connect(':memory:') as db:
    db.execute('CREATE TABLE readiness (value INTEGER NOT NULL)')
    db.execute('INSERT INTO readiness VALUES (42)')
    assert db.execute('SELECT value FROM readiness').fetchone() == (42,)
ssl.create_default_context()
assert len(hashlib.sha256(b'PCS').digest()) == 32
print('Validated Python', sys.version.split()[0], 'SQLite', sqlite3.sqlite_version)
PY
}

configured_python="$(command -v python3 || true)"
if [[ -n "$configured_python" ]] && probe_python "$configured_python"; then
  selected_python="$configured_python"
elif [[ -x /usr/bin/python3 ]] && probe_python /usr/bin/python3; then
  selected_python=/usr/bin/python3
  echo 'Using the verified system Python: configured runtime failed readiness.'
else
  echo 'No supported SQLite-capable Python; refusing to skip the full gate.' >&2
  exit 1
fi

# Keep the pinned Node/npm PATH while selecting Python for every child process.
python_path="$("$selected_python" -c 'import os,sys; print(os.path.realpath(sys.executable))')"
runtime_dir="$(mktemp -d "${TMPDIR:-/tmp}/pcs-cloudflare-python.XXXXXX")"
trap 'rm -rf -- "$runtime_dir"' EXIT
ln -s "$python_path" "$runtime_dir/python3"
ln -s "$python_path" "$runtime_dir/python"
export PATH="$runtime_dir:$PATH"
npm run ci:zero-minutes
