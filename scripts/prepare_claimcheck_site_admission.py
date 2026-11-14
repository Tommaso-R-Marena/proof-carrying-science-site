"""Dry run of a successor source admission for this repository. Changes nothing that is protected.

`scripts/check_reconciled_prs.py` (workflow "Open PR source reconciliation") requires that
  (a) every non-control file equals a retained source commit named by commit id and tag, and
  (b) the `public/` tree equals the `public/` tree of the protected main commit in the registry.
A pull request that adds a page fails both.  This script shows, in a throw-away worktree and with
a local tag that is deleted afterwards, what an owner-approved successor would take and that the
gate still rejects everything it should.  It never edits the checked-out control files, never
pushes, and leaves no tag behind.

  python3 scripts/prepare_claimcheck_site_admission.py [--commit HEAD] [--out DIR]

Not an approval.  The retained commit, its tag and the control change are the owner's to make.
"""
import argparse, hashlib, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GATE = 'scripts/check_reconciled_prs.py'
GATE_TEST = 'scripts/test_reconciled_prs.py'
DRY_TAG = 'pcs-source-intake/site-claimcheck-v1-DRYRUN-LOCAL'
NAME = 'proof-carrying-science-site'
IDENT = ['-c', 'user.name=PCS dry run', '-c', 'user.email=dry-run@example.invalid']


def git(root, *args, check=True):
    run = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True)
    if check and run.returncode:
        raise RuntimeError('git ' + ' '.join(args) + ': ' + run.stderr.strip())
    return run.stdout.strip()


def run_gate(tree):
    run = subprocess.run([sys.executable, GATE, '--site', str(tree)], cwd=tree, capture_output=True, text=True)
    reason = ''
    if run.returncode:
        lines = [line for line in run.stderr.strip().splitlines() if line.strip()]
        reason = lines[-1][:300] if lines else 'non-zero exit'
    return {'passed': run.returncode == 0, 'reason': reason,
            'summary': (json.loads(run.stdout)['checked'][0] if run.returncode == 0 else None)}


def run_gate_tests(tree):
    run = subprocess.run([sys.executable, GATE_TEST], cwd=tree, capture_output=True, text=True)
    tail = (run.stderr.strip().splitlines() or [''])[-1]
    count = re.search(r'Ran (\d+) tests', run.stderr)
    return {'passed': run.returncode == 0, 'tests': int(count.group(1)) if count else None, 'last_line': tail[:200]}


def patch_gate(tree, intake, tag, public_rule):
    path = Path(tree) / GATE
    text = path.read_text()
    old = re.search(r" '" + NAME + r"':\('([0-9a-f]{40})','([^']+)'\),", text)
    assert old, 'site intake entry not found'
    text = text.replace(old.group(0), f" '{NAME}':('{intake}','{tag}'),")
    if public_rule:
        before = "assert git(root,'rev-parse','HEAD:public')==git(root,'rev-parse',main+':public'),'Public deployment tree changed'"
        after = "assert git(root,'rev-parse','HEAD:public')==git(root,'rev-parse',intake+':public'),'Public deployment tree differs from the retained reviewed source'"
        assert text.count(before) == 1, 'public rule not found exactly once'
        text = text.replace(before, after)
    path.write_text(text)
    return old.group(1), old.group(2)


def commit_all(tree, message):
    git(tree, 'add', '-A')
    git(tree, *IDENT, 'commit', '-q', '--no-gpg-sign', '-m', message)
    return git(tree, 'rev-parse', 'HEAD')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--commit', default='HEAD')
    parser.add_argument('--out', default=str(ROOT / 'docs/governance/claimcheck-proposals'))
    args = parser.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    source = git(ROOT, 'rev-parse', args.commit + '^{commit}')
    registry = json.loads((ROOT / 'docs/reconciliation/OPEN_PRS.json').read_text())
    entry = next(e for e in registry['repositories'] if e['repository'].endswith('/' + NAME))
    protected_main = entry['protected']['main']
    scratch = Path(tempfile.mkdtemp(prefix='pcs-site-admission-'))
    trees = []
    report = {'format': 'pcs-claimcheck-site-admission-dry-run-v1', 'approval': False, 'effective': False,
              'source_commit': source, 'protected_main_in_registry': protected_main,
              'note': 'Throw-away worktrees and a local tag, deleted at the end. Nothing pushed. The commit ids of the '
                      'retained commit and of the control commit below exist only in this dry run.'}

    def worktree(name, commit):
        path = scratch / name
        git(ROOT, 'worktree', 'add', '-q', '--detach', str(path), commit)
        trees.append(path)
        return path

    try:
        # 1. the gate as it is, on main and on the source commit
        main_ref = git(ROOT, 'rev-parse', 'origin/main')
        report['gate_unchanged_on_origin_main'] = {'commit': main_ref, **run_gate(worktree('main', main_ref))}
        candidate = worktree('candidate', source)
        report['gate_unchanged_on_source_commit'] = run_gate(candidate)

        # 2. what the source commit adds or changes relative to the retained commit
        text = (candidate / GATE).read_text()
        old_intake, old_tag = re.search(r" '" + NAME + r"':\('([0-9a-f]{40})','([^']+)'\),", text).groups()
        names = git(ROOT, 'diff', '--name-status', '--no-renames', main_ref, source).splitlines()
        census = []
        for row in names:
            status, path = row.split('\t', 1)
            item = {'path': path, 'status': status}
            if status != 'D':
                meta = git(ROOT, 'ls-tree', source, '--', path).split()
                raw = subprocess.check_output(['git', '-C', str(ROOT), 'cat-file', 'blob', meta[2]])
                item.update(mode=meta[0], sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
            census.append(item)
        # main already differs from the retained commit in integration controls only (that is what the gate allows)
        controls = sorted(row.split('\t', 1)[1] for row in
                          git(ROOT, 'diff', '--name-status', '--no-renames', old_intake, main_ref).splitlines())
        report['census'] = {'against_origin_main': main_ref,
                            'added': sum(1 for c in census if c['status'] == 'A'),
                            'modified': sorted(c['path'] for c in census if c['status'] == 'M'),
                            'deleted': sorted(c['path'] for c in census if c['status'] == 'D'),
                            'under_public': sum(1 for c in census if c['path'].startswith('public/')),
                            'workflow_files': sorted(c['path'] for c in census if c['path'].startswith('.github/')),
                            'integration_controls_touched': sorted(c['path'] for c in census if c['path'] in controls),
                            'controls_in_which_main_already_differs_from_the_retained_commit': controls}
        (out / '02-site-admission-census.json').write_text(json.dumps(
            {'format': 'pcs-claimcheck-site-admission-census-v1', 'source_commit': source,
             'against_origin_main': main_ref, 'files': census}, indent=1) + '\n')

        # 3. successor retained commit: same tree as the source; parents = source and the previous retained commit
        tree = git(ROOT, 'rev-parse', source + '^{tree}')
        retained = git(ROOT, *IDENT, 'commit-tree', tree, '-p', source, '-p', old_intake,
                       '-m', 'DRY RUN retained source commit for the ClaimCheck page; not a protected ref')
        git(ROOT, 'tag', '-f', DRY_TAG, retained)
        report['successor'] = {'retained_commit_parents': [source, old_intake], 'retained_tree': tree,
                               'previous_retained_commit': old_intake, 'previous_tag': old_tag,
                               'tag_in_this_dry_run': DRY_TAG,
                               'tag_the_owner_would_create': 'pcs-source-intake/site-claimcheck-v1-<date>'}

        # 4. only the retained commit and tag moved: rule (b) still refuses any change under public/
        only_intake = worktree('only-intake', source)
        patch_gate(only_intake, retained, DRY_TAG, public_rule=False)
        commit_all(only_intake, 'DRY RUN control change: retained commit only')
        report['successor_intake_with_public_rule_unchanged'] = run_gate(only_intake)

        # 5. the proposed change: retained commit moved and rule (b) anchored at the retained commit
        proposed = worktree('proposed', source)
        patch_gate(proposed, retained, DRY_TAG, public_rule=True)
        patch = git(proposed, 'diff', '--', GATE)
        (out / '02-reconciliation-gate.patch').write_text(patch + '\n')
        control = commit_all(proposed, 'DRY RUN control change: retained commit and public rule')
        report['proposed_change'] = {'patch': '02-reconciliation-gate.patch',
                                     'patch_sha256': hashlib.sha256((patch + '\n').encode()).hexdigest(),
                                     'gate': run_gate(proposed), 'gate_own_tests': run_gate_tests(proposed)}

        # 6. the proposed gate must still reject these
        negatives = {}

        def case(name, action, expect):
            path = worktree('neg-' + name, control)
            restore = action(path)
            result = run_gate(path)
            negatives[name] = {'rejected': not result['passed'], 'reason': result['reason'],
                               'expected_reason_contains': expect, 'as_expected': (not result['passed']) and expect in result['reason']}
            if restore:
                restore()

        def edit_public(path):
            with open(path / 'public/claim-check.html', 'a') as handle:
                handle.write('<!-- altered after admission -->\n')
            commit_all(path, 'altered admitted public file')

        def add_public(path):
            (path / 'public/unlisted.html').write_text('<!doctype html><title>unlisted</title>\n')
            commit_all(path, 'unlisted public file')

        def edit_existing(path):
            with open(path / 'public/index.html', 'a') as handle:
                handle.write('<!-- altered existing production page -->\n')
            commit_all(path, 'altered existing public file')

        def untracked(path):
            (path / 'public/untracked.html').write_text('untracked\n')

        def retarget_tag(path):
            git(ROOT, 'tag', '-f', DRY_TAG, source)
            return lambda: git(ROOT, 'tag', '-f', DRY_TAG, retained)

        def drop_lineage(path):
            alien = git(ROOT, *IDENT, 'commit-tree', tree, '-p', source, '-m', 'DRY RUN retained commit without the previous retained commit')
            git(ROOT, 'tag', '-f', DRY_TAG, alien)
            patch_gate(path, alien, DRY_TAG, public_rule=False)
            commit_all(path, 'DRY RUN control change pointing at a commit that drops the original PR heads')
            return lambda: git(ROOT, 'tag', '-f', DRY_TAG, retained)

        case('admitted_public_file_altered', edit_public, 'non-control')
        case('unlisted_public_file_added', add_public, 'non-control')
        case('existing_production_page_altered', edit_existing, 'non-control')
        case('untracked_file_under_public', untracked, 'Working source differs')
        case('tag_points_at_another_commit', retarget_tag, 'tag differs')
        case('retained_commit_drops_original_pr_heads', drop_lineage, 'returned non-zero exit status')
        report['negative_controls'] = negatives

        expected = [
            report['gate_unchanged_on_origin_main']['passed'] is True,
            report['gate_unchanged_on_source_commit']['passed'] is False,
            report['successor_intake_with_public_rule_unchanged']['passed'] is False
            and 'Public deployment tree changed' in report['successor_intake_with_public_rule_unchanged']['reason'],
            report['proposed_change']['gate']['passed'] is True,
            report['proposed_change']['gate_own_tests']['passed'] is True,
            all(item['as_expected'] for item in negatives.values()),
            not report['census']['deleted'],
            not report['census']['integration_controls_touched'],
        ]
        report['all_as_expected'] = all(expected)
    finally:
        git(ROOT, 'tag', '-d', DRY_TAG, check=False)
        for path in trees:
            git(ROOT, 'worktree', 'remove', '--force', str(path), check=False)
        git(ROOT, 'worktree', 'prune', check=False)
        shutil.rmtree(scratch, ignore_errors=True)
        report['cleanup'] = {'dry_run_tag_left_behind': bool(git(ROOT, 'tag', '-l', DRY_TAG)), 'worktrees_removed': True}
    (out / '02-reconciliation-gate.dry-run.json').write_text(json.dumps(report, indent=1) + '\n')
    print(json.dumps({k: report[k] for k in ('source_commit', 'all_as_expected', 'cleanup') if k in report}, indent=1))
    return 0 if report.get('all_as_expected') else 1


if __name__ == '__main__':
    raise SystemExit(main())
