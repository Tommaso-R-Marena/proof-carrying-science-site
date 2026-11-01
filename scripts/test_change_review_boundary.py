#!/usr/bin/env python3
"""Real original-byte authorization and failure-only tampering controls."""
import copy
import http.client
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'desktop'))
from app import AppServer
from file_check import LocalChecker, canonical
from run_public_export_experiment import request


def main():
    assets = Path(sys.argv[1]).resolve()
    checker = LocalChecker(assets)
    valid = request([b'id,v\nx,1\ny,2\n', b'id,v\nz,3\ny,2\nx,1\n'])
    checks = negative = 0
    receipt = checker.review(valid)
    assert receipt['accepted'] is True and receipt['original_csv_decoding_proved'] is True
    assert receipt['summary']['added'] == 1
    checks += 1
    # Every advertised dimension at once; order changes must not invent edits.
    headings = ['id', *('v'+str(i) for i in range(127))]
    rows = ['a'*250+str(i).zfill(6)+','*127 for i in range(5000)]
    def wide_raw(rs):
        return (','.join(headings)+'\n'+'\n'.join(rs)+'\n').encode()
    wide = request([wide_raw(rows), wide_raw(rows[::-1])])
    started = time.monotonic()
    large = checker.review(wide)
    assert large['accepted'] and large['summary']['same'] == 5000 and large['summary']['compared_columns'] == 127
    checks += 1
    scaling_seconds = round(time.monotonic()-started, 3)
    attacks = [dict(valid, verifier='substitute'), dict(valid, mode='other'), dict(valid, columns=[True, 0]),
               dict(valid, columns=[999, 0]), dict(valid, compare_headers=['v', 'v']),
               dict(valid, compare_headers=['id']), dict(valid, compare_headers=['missing']),
               dict(valid, rules=dict(valid['rules'], allow_changed=1)),
               dict(valid, rules=dict(valid['rules'], verdict=True))]
    bad = copy.deepcopy(valid)
    bad['files'][0]['sha256'] = '0' * 64
    attacks.append(bad)
    attacks.append(request([b'id,v\nx,1\nx,2', b'id,v\nx,1']))
    for attack in attacks:
        try:
            checker.review(attack)
        except ValueError:
            negative += 1
        else:
            raise AssertionError('Ambiguous scope or substitution accepted')

    # This control runs the actual pinned child, then changes its input snapshot.
    # It never creates a positive verifier response or returns a forged verdict.
    actual_run = subprocess.run
    with tempfile.TemporaryDirectory() as tmp:
        damaged = Path(tmp)
        shutil.copy2(assets / 'checker-manifest.json', damaged / 'checker-manifest.json')
        for name in [checker.manifest['binary'], *checker.manifest.get('dependent_files_sha256', {})]:
            shutil.copy2(assets / name, damaged / name)
        own = LocalChecker(damaged)
        for target in ['snapshot', 'binary']:
            def tamper(args, **kwargs):
                r = actual_run(args, **kwargs)
                assert r.returncode == 0 and b'RESULT:PASS\n' in r.stdout
                path = Path(args[-2]) if target == 'snapshot' else own.binary
                with path.open('ab') as f:
                    f.write(b'\n')
                return r
            try:
                with patch('change_review.subprocess.run', side_effect=tamper):
                    own.review(valid)
            except ValueError:
                negative += 1
                checks += 1
            else:
                raise AssertionError('Post-verification mutation was confirmed')

    with AppServer(assets) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            headers = {'Origin': server.origin, 'X-PCS-Session': server.token, 'Content-Type': 'application/json'}
            def post(body):
                c = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=40)
                c.request('POST', '/api/check-files', body, headers)
                r = c.getresponse()
                status, raw = r.status, r.read()
                c.close()
                return status, json.loads(raw)
            status, r = post(canonical(valid))
            assert status == 200 and r['accepted'] is True
            assert set(r) == set(receipt) and r['summary'] == receipt['summary']
            assert all(k not in r for k in ['rows', 'values', 'ids', 'files', 'data_base64'])
            checks += 1
            status, large = post(canonical(wide))
            assert status == 200 and large['accepted'] and large['summary']['same'] == 5000
            checks += 1
            for attack in attacks:
                status, _ = post(canonical(attack))
                assert status == 400
                negative += 1
        finally:
            server.shutdown()
            thread.join(5)
    print(json.dumps({'format': 'pcs-change-boundary-tests-v2', 'actual_native_checks': checks,
                      'negative_controls': negative, 'max_dimensions': {'rows_per_file': 5000, 'columns': 128, 'id_bytes': 256, 'seconds': scaling_seconds, 'also_passed_authenticated_http': True}, 'post_check_snapshot_and_binary_mutation_refused': True,
                      'mock_affirmative_verdicts': 0, 'immutable_host_security_proved': False}))


if __name__ == '__main__':
    main()
