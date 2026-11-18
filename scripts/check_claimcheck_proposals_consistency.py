"""Check that the site's ClaimCheck proposal records are mutually consistent.  Read-only; creates no ref.

    python3 scripts/check_claimcheck_proposals_consistency.py

The dry runs of patches 01, 02 and 03 and the admission census are generated at one source commit S
and committed in a following commit that changes only them.  This checks, independently of the
scripts that wrote them:

  1. all three dry runs and the census name the same commit S, and every dry run passed;
  2. the census lists exactly the files S adds to or changes in `main` (as recorded), with their
     identities at S;
  3. each recorded patch digest is the digest of the committed patch file;
  4. patch 02 applies cleanly to S's gate and names the recorded retained commit and the proposed
     tag; the retained commit is reproducible from S (same tree, same parents, fixed identity, date
     and message), using `git commit-tree`, which writes an object but no ref;
  5. the successor browser-journey record (docs/evidence/claim-check-v2) is bound to exactly the
     bytes of S, so it is evidence about the admitted page and not about older bytes;
  6. HEAD is S, or differs from S only in the proposal records.
Not an approval.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
P = ROOT / 'docs/governance/claimcheck-proposals'
RECORDS = {'docs/governance/claimcheck-proposals/' + n for n in (
    '01-reading-help-verifier.dry-run.json', '02-reconciliation-gate.dry-run.json', '02-reconciliation-gate.patch',
    '02-site-admission-census.json', '03-complete-gate.dry-run.json')}
JOURNEY = 'docs/evidence/claim-check-v2/SOURCE.json'


def git(*args, raw=False, env=None):
    out = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, check=True, env={**os.environ, **(env or {})}).stdout
    return out if raw else out.decode().strip()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def blob_sha(commit, path):
    try:
        return sha(git('show', f'{commit}:{path}', raw=True))
    except subprocess.CalledProcessError:
        return None


def main():
    sys.path.insert(0, str(ROOT / 'scripts'))
    import prepare_claimcheck_site_admission as prep
    r1 = json.loads((P / '01-reading-help-verifier.dry-run.json').read_text())
    r2 = json.loads((P / '02-reconciliation-gate.dry-run.json').read_text())
    r3 = json.loads((P / '03-complete-gate.dry-run.json').read_text())
    census = json.loads((P / '02-site-admission-census.json').read_text())
    s = r2['source_commit']
    checks = {}
    checks['same_source_commit'] = r1['source_commit'] == s == r3['source_commit'] == census['source_commit']
    checks['all_dry_runs_passed'] = r1.get('all_as_expected') is True and r2.get('all_as_expected') is True and r3.get('all_as_expected') is True
    # 2
    main_ref = census['against_origin_main']
    changed = {}
    for line in git('diff', '--name-status', '--no-renames', main_ref, s).splitlines():
        status, path = line.split('\t', 1)
        changed[path] = status
    files = {f['path']: f for f in census['files']}
    checks['census_is_exactly_the_change_against_main'] = {p: f['status'] for p, f in files.items()} == changed
    checks['census_identities_match_the_commit'] = all(f['status'] == 'D' or f.get('sha256') == blob_sha(s, p) for p, f in files.items())
    # 3
    checks['patch_digests_recorded'] = (r1['patch_sha256'] == sha((ROOT / 'docs/governance/claimcheck-proposals' / r1['patch']).read_bytes())
                                        and r3['patch_sha256'] == sha((ROOT / 'docs/governance/claimcheck-proposals' / r3['patch']).read_bytes())
                                        and r2['proposed_change']['patch_sha256'] == sha((P / '02-reconciliation-gate.patch').read_bytes()))
    # 4
    succ = r2['successor']
    with tempfile.TemporaryDirectory() as tmp:
        t = Path(tmp)
        subprocess.run(['git', 'init', '-q', str(t)], check=True)
        (t / 'scripts').mkdir()
        (t / prep.GATE).write_bytes(git('show', f'{s}:{prep.GATE}', raw=True))
        ok = subprocess.run(['git', '-C', str(t), 'apply', str(P / '02-reconciliation-gate.patch')], capture_output=True).returncode == 0
        gate = (t / prep.GATE).read_text()
    checks['patch_02_applies_to_the_commit'] = ok
    checks['patch_02_names_the_retained_commit_and_proposed_tag'] = (f"'{prep.NAME}':('{succ['retained_commit']}','{prep.PROPOSED_TAG}')" in gate
                                                                     and "intake+':public'" in gate and prep.DRY_TAG not in gate)
    again = git('commit-tree', git('rev-parse', s + '^{tree}'), '-p', s, '-p', succ['previous_retained_commit'], '-m', prep.RETAINED_MESSAGE,
                env=prep.RETAINED_ENV)
    checks['retained_commit_reproducible'] = (again == succ['retained_commit'] and succ['retained_tree'] == git('rev-parse', s + '^{tree}')
                                              and succ['retained_commit_parents'] == [s, succ['previous_retained_commit']]
                                              and succ.get('tag_created') is False)
    # 5
    journey = json.loads((ROOT / JOURNEY).read_text())
    differing = sorted(p for p, d in journey['bound_files'].items() if blob_sha(s, p) != d)
    checks['journey_record_bound_to_the_commit'] = not differing
    # 6
    head = git('rev-parse', 'HEAD')
    since = sorted(set(git('diff', '--name-only', s, head).splitlines()) - {''})
    checks['head_is_the_commit_or_differs_only_in_records'] = head == s or set(since) <= RECORDS
    report = {'source_commit': s, 'head': head, 'files_since_source_commit': since, 'census_files': len(files),
              'retained_commit': succ['retained_commit'], 'proposed_tag': prep.PROPOSED_TAG, 'journey_source_commit': journey['source_commit'],
              'journey_files_differing_from_the_commit': differing, 'checks': checks, 'consistent': all(checks.values())}
    print(json.dumps(report, indent=1))
    return 0 if report['consistent'] else 1


if __name__ == '__main__':
    sys.exit(main())
