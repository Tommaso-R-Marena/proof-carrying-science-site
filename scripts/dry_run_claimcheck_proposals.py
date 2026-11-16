"""Dry runs of the proposed changes 01 (reading-help verifier) and 03 (complete CI gate).

  python3 scripts/dry_run_claimcheck_proposals.py [--commit HEAD] [--out DIR]

Each patch is applied in a throw-away worktree of the commit, never to the checked-out files.  The
patched gate must accept the commit, and must reject a set of alterations it exists to catch.
Writes 01-reading-help-verifier.dry-run.json and 03-complete-gate.dry-run.json.  Not an approval:
whether to apply a patch to a protected file is the owner's decision.  Nothing is pushed; the
worktrees are removed.
"""
import argparse, hashlib, json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROPOSALS = 'docs/governance/claimcheck-proposals'
PATCH_01 = f'{PROPOSALS}/01-reading-help-verifier.patch'
PATCH_03 = f'{PROPOSALS}/03-complete-gate.patch'
VERIFIER_TESTS = ['tests/science-clarity.test.mjs', 'tests/scientific-workflow-v2.test.mjs', 'tests/transport-workflow-v3.test.mjs']


def git(*args, cwd=ROOT, check=True):
    run = subprocess.run(['git', '-C', str(cwd), *args], capture_output=True, text=True)
    if check and run.returncode:
        raise RuntimeError('git ' + ' '.join(args) + ': ' + run.stderr.strip())
    return run.stdout.strip()


def run(cmd, cwd):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def node_tests(cwd, files):
    code, out, err = run(['node', '--test', *files], cwd)
    count = lambda key: int((re.search(rf'^# {key} (\d+)', out, re.M) or [0, 0])[1])
    failed = re.findall(r'^not ok \d+ - (.*)$', out, re.M)
    return {'exit': code, 'tests': count('tests'), 'pass': count('pass'), 'fail': count('fail'), 'failed': failed}


class Worktree:
    def __init__(self, commit):
        self.commit = commit
        self.path = Path(tempfile.mkdtemp(prefix='pcs-proposal-dry-run-')) / 'tree'

    def __enter__(self):
        git('worktree', 'add', '--detach', str(self.path), self.commit)
        return self.path

    def __exit__(self, *exc):
        git('worktree', 'remove', '--force', str(self.path), check=False)
        shutil.rmtree(self.path.parent, ignore_errors=True)


def apply(tree, patch):
    text = (ROOT / patch).read_text(encoding='utf-8')
    strip = '-p1' if text.startswith('--- a/') else '-p0'          # patch 01 names paths without a/ and b/
    code, _, err = run(['git', 'apply', strip, '--check', str(ROOT / patch)], tree)
    if code:
        return False, err.strip()[:300]
    run(['git', 'apply', strip, str(ROOT / patch)], tree)
    return True, ''


def edit(path, old, new):
    text = path.read_text(encoding='utf-8')
    assert old in text, (path, old[:60])
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


def dry_run_01(commit):
    record = {'format': 'pcs-claimcheck-reading-help-verifier-dry-run-v2', 'approval': False, 'effective': False,
              'patch': PATCH_01.split('/')[-1], 'patch_sha256': hashlib.sha256((ROOT / PATCH_01).read_bytes()).hexdigest(),
              'source_commit': git('rev-parse', commit),
              'what': 'The patch applied in a throw-away worktree of the commit; the checked-out verifier is unchanged.'}
    with Worktree(commit) as tree:
        record['unpatched_verifier_on_the_commit'] = {'passed': run(['node', 'scripts/verify_browser_ui_sources.mjs'], tree)[0] == 0,
                                                       'tests': node_tests(tree, VERIFIER_TESTS)}
        ok, why = apply(tree, PATCH_01)
        record['patch_applies_cleanly'] = ok
        if not ok:
            record['error'] = why
            record['all_as_expected'] = False
            return record
        code, out, err = run(['node', 'scripts/verify_browser_ui_sources.mjs'], tree)
        record['positive'] = {
            'patched_verifier_accepts_the_commit': {'passed': code == 0, 'output': (out or err).strip()[:200]},
            'tests_that_call_the_verifier': node_tests(tree, VERIFIER_TESTS),
            'successor_check': {'passed': run(['node', 'scripts/check_reading_help_successor.mjs'], tree)[0] == 0},
        }
        alterations = {
            'existing_help_entry_edited': (('public/page-help-core.mjs', '"title": "Find a useful way to help PCS."',
                                            '"title": "Find a useful way to help."'), 'Reading help source drift'),
            'second_page_added_without_review': (('public/page-help-core.mjs', 'export const PAGE_HELP = Object.freeze({',
                                                  'export const PAGE_HELP = Object.freeze({\n  "unreviewed.html": {"title": "x", "purpose": "x"},'),
                                                 'Reading help source drift'),
            'successor_manifest_edited': (('docs/evidence/site-clarity-v2/reading-help-requalification.json', '', ' '),
                                          'Unreviewed reading-help successor'),
            'historical_manifest_edited': (('docs/evidence/site-clarity-v1/browser-qualifications.json', '"format"', '"format_"'), ''),
            'help_stylesheet_edited': (('public/page-help.css', '', '/* altered */\n'), 'Reading help source'),
        }
        record['negative'] = {}
        for name, ((path, old, new), expect) in alterations.items():
            target = tree / path
            saved = target.read_bytes()
            if old:
                edit(target, old, new)
            else:
                target.write_text(new + target.read_text(encoding='utf-8'), encoding='utf-8')
            code, out, err = run(['node', 'scripts/verify_browser_ui_sources.mjs'], tree)
            target.write_bytes(saved)
            record['negative'][name] = {'rejected': code != 0, 'message': (err or out).strip()[:200],
                                        'expected_message_contains': expect, 'as_expected': code != 0 and expect in (err or out)}
    record['all_as_expected'] = (record['patch_applies_cleanly'] and not record['unpatched_verifier_on_the_commit']['passed']
                                 and all(v['passed'] for k, v in record['positive'].items() if k != 'tests_that_call_the_verifier')
                                 and record['positive']['tests_that_call_the_verifier']['fail'] == 0
                                 and all(v['as_expected'] for v in record['negative'].values()))
    return record


def dry_run_03(commit):
    record = {'format': 'pcs-claimcheck-complete-gate-dry-run-v2', 'approval': False, 'effective': False,
              'patch': PATCH_03.split('/')[-1], 'patch_sha256': hashlib.sha256((ROOT / PATCH_03).read_bytes()).hexdigest(),
              'source_commit': git('rev-parse', commit), 'where': 'throw-away worktree; the checked-out package.json is unchanged'}
    with Worktree(commit) as tree:
        ok, why = apply(tree, PATCH_03)
        record['patch_applies_cleanly'] = ok
        if not ok:
            record['error'] = why
            record['all_as_expected'] = False
            return record
        scripts = json.loads((tree / 'package.json').read_text())['scripts']
        files = scripts['test:claim-check'].split('node --test ', 1)[1].split()
        record['complete_gate_runs_it'] = scripts['ci:zero-minutes'].endswith('npm run test:claim-check')
        record['with_patch'] = node_tests(tree, files)
        runner = tree / 'public/claim-check/claimcheck_kernel_runner.py'
        alterations = {
            'served_kernel_runner_altered': lambda: runner.write_text(runner.read_text(encoding='utf-8') + '\n# altered\n', encoding='utf-8'),
            'served_kernel_runner_without_the_strict_grammar': lambda: edit(runner, 'data, outcomes = parse_tail(tail)', 'data, outcomes = b"", []'),
            'served_lean_checker_altered': lambda: (tree / 'public/claim-check/ClaimCheck.lean').write_text(
                (tree / 'public/claim-check/ClaimCheck.lean').read_text(encoding='utf-8') + '\n-- altered\n', encoding='utf-8'),
            'local_run_label_weakened': lambda: edit(tree / 'public/claim-check.mjs', 'REPORTED BY YOUR LOCAL RUN · NOT VERIFIED BY THIS PAGE',
                                                     'VERIFIED BY YOUR LOCAL RUN'),
            'withdrawn_receipts_accepted_again': lambda: (
                edit(tree / 'public/claim-check-core.mjs', "if (run.schema === WITHDRAWN_RUN_SCHEMA) return", "if (false) return"),
                edit(tree / 'public/claim-check-core.mjs', "if (run.schema !== KERNEL_RUN_SCHEMA) return",
                     "if (run.schema !== KERNEL_RUN_SCHEMA && run.schema !== WITHDRAWN_RUN_SCHEMA) return")),
            'report_about_other_data_shown': lambda: edit(tree / 'public/claim-check-core.mjs', "if (run.data_sha256 !== expected.dataSha256) return",
                                                          "if (false) return"),
            'report_without_the_canonical_flag_shown': lambda: edit(tree / 'public/claim-check-core.mjs', "run.generated_part_canonical !== true || ", ""),
            'what_a_kernel_run_does_not_verify_removed': lambda: edit(tree / 'public/claim-check.mjs', 'What no kernel run verifies: ', ''),
        }
        record['must_fail'] = {}
        for name, alter in alterations.items():
            git('checkout', '--', '.', cwd=tree)
            apply(tree, PATCH_03)
            alter()
            res = node_tests(tree, files)
            record['must_fail'][name] = {'rejected': res['fail'] > 0, 'failed': res['failed']}
        git('checkout', '--', '.', cwd=tree)
    record['all_as_expected'] = (record['patch_applies_cleanly'] and record['complete_gate_runs_it'] and record['with_patch']['fail'] == 0
                                 and record['with_patch']['tests'] > 0 and all(v['rejected'] for v in record['must_fail'].values()))
    return record


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--commit', default='HEAD')
    ap.add_argument('--out', default=str(ROOT / PROPOSALS))
    args = ap.parse_args(argv)
    out = Path(args.out)
    r1, r3 = dry_run_01(args.commit), dry_run_03(args.commit)
    (out / '01-reading-help-verifier.dry-run.json').write_text(json.dumps(r1, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    (out / '03-complete-gate.dry-run.json').write_text(json.dumps(r3, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps({'01': r1['all_as_expected'], '03': r3['all_as_expected'], 'source_commit': r1['source_commit']}))
    return 0 if r1['all_as_expected'] and r3['all_as_expected'] else 1


if __name__ == '__main__':
    sys.exit(main())
