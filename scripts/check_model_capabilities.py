#!/usr/bin/env python3
"""Bind the website's model inventory to an exact checked-out PCS revision.

No model is executed or granted authority by this inventory. Real execution and
independent Lean replay are separate release checks.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = ('lean-learning-v2', 'checked-reuse-v2', 'induction-abstraction-v2', 'verified-memory-v1')


def inventory(core):
    revision = re.search(r'export const CORE_SHA = "([0-9a-f]{40})"', (ROOT/'src/lean-research.js').read_text())[1]
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=core, text=True).strip()
    if actual != revision:
        raise ValueError('Capability inventory requires the exact approved core checkout')
    models, registries = [], []
    digest = lambda raw: hashlib.sha256(raw).hexdigest()
    for family in FAMILIES:
        path = Path('research')/family/'registry.json'
        raw = (core/path).read_bytes()
        registry = json.loads(raw)
        registries.append({'path': path.as_posix(), 'sha256': digest(raw),
                           'selected': registry['selected_local_experiment'],
                           'library_sha256': registry.get('library_sha256')})
        for entry in registry['models']:
            checkpoint = entry['checkpoint']
            if Path(checkpoint).name != checkpoint:
                raise ValueError('Registry checkpoint must be a basename')
            model_path = path.parent/checkpoint
            if digest((core/model_path).read_bytes()) != entry['sha256']:
                raise ValueError('Actual model bytes disagree with registry')
            models.append({'family': family, 'id': entry['id'], 'path': model_path.as_posix(),
                           'sha256': entry['sha256'], 'parameters': entry['parameters'],
                           'selected': entry['id'] == registry['selected_local_experiment'],
                           'pcs_authority': False})
    paths = subprocess.check_output(['git', 'ls-files', 'pcs/experimental/prover/*.py',
                                    '.github/workflows/pcs-lean-public.yml'], cwd=core, text=True).splitlines()
    tracked = paths + [r['path'] for r in registries] + [m['path'] for m in models]
    subprocess.run(['git', 'diff', '--exit-code', 'HEAD', '--', *tracked], cwd=core, check=True, stdout=subprocess.DEVNULL)
    browser_models = []
    for name in ('repair-policy-model-v1.json', 'omega/bag-v1.json', 'omega/graph-v1.json',
                 'omega/bandit-v1.json', 'omega/nonlinear-v2.json'):
        raw = (ROOT/'public'/name).read_bytes()
        model = json.loads(raw)
        browser_models.append({'path': name, 'file_sha256': digest(raw),
                               'model_digest': model.get('model_digest_sha256', model.get('model_sha256')),
                               'pcs_authority': False})
    return {'format': 'pcs-website-model-inventory-v1', 'browser_models': browser_models, 'core_revision': revision,
            'registry_sources': registries, 'models': models,
            'execution_sources': {p: digest((core/p).read_bytes()) for p in sorted(paths)},
            'hosted_families': ['checked-reuse-v2', 'induction-abstraction-v2', 'verified-memory-v1', 'prospective-hybrid-v2'],
            'hybrid_checkpoint_family': 'verified-memory-v1',
            'hosted_general_llm_inference': False, 'automatic_training': False, 'pcs_authority': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core', type=Path, default=ROOT/'.ci-components/lean-prover')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    expected = inventory(args.core)
    target = ROOT/'public/model-capabilities.json'
    if args.write:
        target.write_text(json.dumps(expected, indent=2, sort_keys=True)+'\n')
    elif json.loads(target.read_text()) != expected:
        raise SystemExit('Website model/source inventory is stale or substituted')
    print(json.dumps({'models': len(expected['models']), 'families': len(FAMILIES),
                      'execution_sources': len(expected['execution_sources']),
                      'core_revision': expected['core_revision'], 'status': 'matched', 'pcs_authority': False}))
