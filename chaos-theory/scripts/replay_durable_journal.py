"""Independent stdlib journal/state replay. No model inference or affirmative Lean verdict."""
import argparse
import hashlib
import json
import re
from pathlib import Path
from local_model_recovery import projected


def canonical(value):
    def ordered(v, depth=0):
        if depth > 32:
            raise ValueError("Journal depth")
        if type(v) is dict:
            return {k: ordered(v[k], depth + 1) for k in sorted(v, key=lambda k: k.encode('utf-16-be'))}
        if type(v) is list:
            return [ordered(x, depth + 1) for x in v]
        if type(v) is float or type(v) is int and abs(v) > 2**53 - 1:
            raise ValueError("Outside journal integer profile")
        return v
    return json.dumps(ordered(value), ensure_ascii=False, separators=(',', ':')).encode('utf8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def read(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 500000:
        raise ValueError("Invalid journal file")
    with path.open('rb') as stream:
        raw = stream.read(500001)
    if len(raw) > 500000:
        raise ValueError('Journal file exceeds bounds')
    def pairs(items):
        out = {}
        for k, v in items:
            if k in out:
                raise ValueError("Duplicate key")
            out[k] = v
        return out
    value = json.loads(raw.decode('utf8'), object_pairs_hook=pairs)
    if canonical(value) + b'\n' != raw:
        raise ValueError("Noncanonical journal")
    return value


def verify(directory, anchor):
    if not __debug__:
        raise RuntimeError('Do not run replay with -O')
    root = Path(directory)
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Invalid journal directory')
    descriptor = read(root / 'session.json')
    assert set(descriptor) == {'format', 'sessionId', 'authorityHash', 'scenario', 'initial', 'digest'}
    assert descriptor['format'] == 'lean-recovery-journal-v1'
    assert digest({k: v for k, v in descriptor.items() if k != 'digest'}) == descriptor['digest']
    scenario = descriptor['scenario']
    assert digest({k: v for k, v in scenario.items() if k != 'hash'}) == scenario['hash']
    history, commits, states = [], [], []
    def state(previous=None, plan_hash=None):
        result = projected(scenario, history)
        body = {'format': 'guarded-recovery-head-v1', 'scenarioHash': scenario['hash'], 'generation': len(commits),
                'previousHead': previous, 'planHash': plan_hash, 'historyHash': digest(history), 'resultHash': digest(result)}
        return {'version': 1, 'kind': 'guarded-recovery-state', 'scenarioHash': scenario['hash'], 'generation': len(commits),
                'head': digest(body), 'history': list(history), 'commits': list(commits), 'result': result}
    current = state()
    assert canonical(descriptor['initial']) == canonical(current)
    def checkpoint(record_digest):
        return {'format': 'lean-recovery-checkpoint-v1', 'sessionId': descriptor['sessionId'], 'manifestDigest': descriptor['digest'],
                'generation': current['generation'], 'recordDigest': record_digest, 'snapshotHead': current['head']}
    previous_digest = descriptor['digest']
    states.append(checkpoint(previous_digest))
    names = {p.name for p in root.iterdir()}
    pending = {n for n in names if re.fullmatch(r'\.pending-[a-f0-9-]{36}\.json', n)}
    assert all(not p.is_symlink() and p.is_file() for p in root.iterdir())
    committed = names - pending - {'session.json'}
    assert len(names) <= 128 and committed == {f'commit-{n}.json' for n in range(1, len(committed) + 1)} and len(committed) <= 4
    for n in range(1, len(committed) + 1):
        record = read(root / f'commit-{n}.json')
        assert set(record) == {'format', 'sessionId', 'generation', 'previousDigest', 'content', 'snapshot', 'digest'}
        assert record['format'] == 'lean-recovery-record-v1' and record['sessionId'] == descriptor['sessionId']
        assert type(record['generation']) is int and record['generation'] == n and record['previousDigest'] == previous_digest
        assert digest({k: v for k, v in record.items() if k != 'digest'}) == record['digest']
        # Independently decode, then replay fixed policy. Lean separately enforces the stricter input profile.
        from replay_real_model import parse_raw_plan
        plan = parse_raw_plan(record['content'])
        assert plan is not None and not current['result']['completed'] and len(history) + len(plan) <= 16
        old_head = current['head']
        history.extend(plan)
        commits.append({'generation': n, 'previousHead': old_head, 'plan': plan, 'planHash': digest(plan), 'head': ''})
        current = state(old_head, digest(plan))
        commits[-1]['head'] = current['head']
        current['commits'] = list(commits)
        assert canonical(current) == canonical(record['snapshot']) and not current['result']['unsafe']
        previous_digest = record['digest']
        states.append(checkpoint(previous_digest))
    anchor = anchor.get('checkpoint', anchor)
    assert set(anchor) == set(states[0]) and type(anchor['generation']) is int and 0 <= anchor['generation'] < len(states)
    assert anchor == states[anchor['generation']], 'Rollback or checkpoint substitution'
    return {'passed': True, 'commits': len(committed), 'checkpoint': states[-1], 'ignoredPending': len(pending),
            'scope': 'Independent Python hash-chain and synthetic-state replay, not a Lean verdict, origin authentication, or immutable storage claim.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory')
    parser.add_argument('checkpoint')
    args = parser.parse_args()
    print(json.dumps(verify(args.directory, read(Path(args.checkpoint))), indent=2))
