"""Independent Python policy, canonical CSV, real-artifact and receipt replay. No Lean verdict."""
import json
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from replay_durable_journal import canonical, digest, read

TOKEN = re.compile(r'[A-Za-z0-9:_-]{1,80}\Z')
def shape(value, fields):
    if type(value) is not dict or set(value) != set(fields): raise ValueError('Object fields')

def csv(raw):
    if type(raw) is not str or len(raw.encode()) > 8192 or not raw.startswith('id,value\n') or not raw.endswith('\n'): raise ValueError('CSV framing')
    rows = raw.split('\n')[1:-1]
    if not 1 <= len(rows) <= 16: raise ValueError('CSV count')
    out = []
    for row in rows:
        parts = row.split(',')
        if len(parts) != 2 or not TOKEN.fullmatch(parts[0]) or any(i == parts[0] for i, _ in out): raise ValueError('CSV row identity')
        n = natural(parts[1])
        if n is None: raise ValueError('CSV natural')
        out.append((parts[0], n))
    return out

def natural(raw):
    return int(raw) if type(raw) is str and re.fullmatch(r'0|[1-9][0-9]{0,6}', raw) and int(raw) <= 1000000 else None

def validate(spec):
    shape(spec, ['files', 'policy']); p = spec['policy']
    shape(p, ['inspectable', 'editable', 'minimum', 'maximum', 'requireInspection'])
    assert type(p['requireInspection']) is bool and type(p['minimum']) is int and type(p['maximum']) is int and 0 <= p['minimum'] <= p['maximum'] <= 1000000
    assert type(spec['files']) is list and 1 <= len(spec['files']) <= 4
    tables = {}
    for f in spec['files']:
        shape(f, ['id', 'bytes']); assert TOKEN.fullmatch(f['id']) and f['id'] not in tables
        tables[f['id']] = dict(csv(f['bytes']))
    assert type(p['inspectable']) is list and len(p['inspectable']) <= 4 and len(set(p['inspectable'])) == len(p['inspectable']) and all(i in tables for i in p['inspectable'])
    assert type(p['editable']) is list and 1 <= len(p['editable']) <= 16
    cells = []
    for c in p['editable']:
        shape(c, ['fileId', 'rowId']); f, r = c['fileId'], c['rowId']
        assert (f, r) not in cells and f in tables and r in tables[f] and p['minimum'] <= tables[f][r] <= p['maximum']
        cells.append((f, r))
    return tables

def plan(raw):
    if type(raw) is not str or len(raw.encode('utf-16-le')) // 2 > 16384: raise ValueError('Plan text')
    def pairs(items):
        out = {}
        for k, v in items:
            if k in out: raise ValueError('Duplicate plan key')
            out[k] = v
        return out
    def number(_): raise ValueError('Numeric plan values')
    obj = json.loads(raw, object_pairs_hook=pairs, parse_int=number, parse_float=number, parse_constant=number)
    nodes = 0
    def bounds(v, depth=0):
        nonlocal nodes
        nodes += 1
        if depth > 32 or nodes > 1024: raise ValueError('Plan structure')
        if type(v) is str: v.encode('utf8')
        if type(v) is dict:
            for k, x in v.items(): k.encode('utf8'); bounds(x, depth + 1)
        elif type(v) is list:
            for x in v: bounds(x, depth + 1)
    bounds(obj)
    shape(obj, ['actions']); actions = obj['actions']
    if type(actions) is not list or len(actions) > 8: raise ValueError('Action count')
    for a in actions:
        shape(a, ['tool', 'args'])
        if type(a['tool']) is not str or not 1 <= len(a['tool'].encode('utf-16-le')) // 2 <= 64: raise ValueError('Tool')
    return actions

def replay(spec, texts, guarded):
    tables = validate(spec); p = spec['policy']; inspected = set()
    if len(texts) > 4: raise ValueError('Submission count')
    permitted, executed, invalid = [], [], []
    for text in texts:
        for a in plan(text):
            if len(executed) == 16: raise ValueError('Action budget')
            tool, args = a['tool'], a['args']; valid = False; f = r = None; v = None
            if type(args) is dict:
                f = args.get('fileId'); r = args.get('rowId')
                if tool == 'inspect_file': valid = set(args) == {'fileId'} and type(f) is str and f in tables
                elif tool == 'set_value':
                    v = natural(args.get('value'))
                    valid = set(args) == {'fileId', 'rowId', 'value'} and type(f) is str and type(r) is str and f in tables and r in tables[f] and v is not None
            yes = valid and (f in p['inspectable'] if tool == 'inspect_file' else {'fileId': f, 'rowId': r} in p['editable'] and (not p['requireInspection'] or f in inspected) and p['minimum'] <= v <= p['maximum'])
            execute = valid and (not guarded or yes)
            permitted.append(bool(yes)); executed.append(bool(execute)); invalid.append(not valid)
            if execute:
                if tool == 'inspect_file': inspected.add(f)
                else: tables[f][r] = v; inspected.discard(f)
    return {'permitted': permitted, 'executed': executed, 'invalid': invalid,
            'files': [{'id': f['id'], 'bytes': 'id,value\n' + ''.join(f'{i},{tables[f["id"]][i]}\n' for i, _ in csv(f['bytes']))} for f in spec['files']],
            'inspected': [f['id'] for f in spec['files'] if f['id'] in inspected]}

def checkpoint(d, generation, record_digest, snapshot_hash):
    return {'format': 'file-gate-checkpoint-v1', 'sessionId': d['sessionId'], 'manifestDigest': d['digest'], 'generation': generation, 'recordDigest': record_digest, 'snapshotHash': snapshot_hash}

def verify_workspace(path, anchor):
    if not __debug__: raise RuntimeError('Do not disable assertions')
    root = Path(path)
    if root.is_symlink() or not root.is_dir(): raise ValueError('Workspace directory')
    names = {p.name for p in root.iterdir()}
    assert len(names) <= 128 and {'session.json', 'snapshots'} <= names
    assert all(n in {'session.json', 'snapshots'} or re.fullmatch(r'commit-[1-4]\.json|\.pending-[a-f0-9-]{36}\.json', n) for n in names)
    d = read(root / 'session.json'); shape(d, ['format', 'sessionId', 'mode', 'authorityHash', 'spec', 'initial', 'snapshotHash', 'digest'])
    assert d['format'] == 'file-gate-workspace-v1' and d['mode'] in ['guarded', 'capability-control']
    assert digest({k: v for k, v in d.items() if k != 'digest'}) == d['digest']
    spec = d['spec']; validate(spec); initial = replay(spec, [], True)
    assert canonical(initial) == canonical(d['initial']) and digest(initial['files']) == d['snapshotHash']
    def files(content_hash, expected):
        folder = root / 'snapshots' / content_hash
        assert re.fullmatch('[a-f0-9]{64}', content_hash) and not (root / 'snapshots').is_symlink() and not folder.is_symlink() and folder.is_dir()
        assert {p.name for p in folder.iterdir()} == {f'file-{i}.csv' for i in range(len(expected))}
        for i, f in enumerate(expected):
            p = folder / f'file-{i}.csv'; assert not p.is_symlink() and p.is_file() and p.stat().st_size <= 8192
            assert p.read_bytes() == f['bytes'].encode('utf8')
        assert digest(expected) == content_hash
    files(d['snapshotHash'], initial['files'])
    committed = {n for n in names if n.startswith('commit-')}
    assert committed == {f'commit-{i}.json' for i in range(1, len(committed) + 1)}
    checkpoints, texts = [checkpoint(d, 0, d['digest'], d['snapshotHash'])], []
    prefixes = [{'checkpoint': checkpoints[0], 'outcome': initial}]
    result = initial
    for n in range(1, len(committed) + 1):
        r = read(root / f'commit-{n}.json'); shape(r, ['format', 'sessionId', 'generation', 'previousDigest', 'content', 'outcome', 'snapshotHash', 'digest'])
        assert r['format'] == 'file-gate-commit-v1' and r['sessionId'] == d['sessionId'] and type(r['generation']) is int and r['generation'] == n and r['previousDigest'] == checkpoints[-1]['recordDigest']
        assert digest({k: v for k, v in r.items() if k != 'digest'}) == r['digest']
        texts.append(r['content']); result = replay(spec, texts, d['mode'] == 'guarded')
        assert canonical(result) == canonical(r['outcome'])
        files(r['snapshotHash'], result['files']); checkpoints.append(checkpoint(d, n, r['digest'], r['snapshotHash']))
        prefixes.append({'checkpoint': checkpoints[-1], 'outcome': result})
    anchor = anchor.get('checkpoint', anchor)
    assert type(anchor['generation']) is int and 0 <= anchor['generation'] < len(checkpoints) and anchor == checkpoints[anchor['generation']], 'Checkpoint/rollback mismatch'
    return {'checkpoint': checkpoints[-1], 'outcome': result, 'texts': texts, 'prefixes': prefixes, 'mode': d['mode'], 'mathematicalReplay': True, 'nativeLeanExecuted': False}
