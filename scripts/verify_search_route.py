"""Independent finite graph reconstruction and certificate check; stdlib only.

No JavaScript, client edges, client scores or search implementation is trusted.
The general Lean theorem proves the abstract potential criterion; this Python
implementation's correspondence to that mathematical graph is tested, not proved.
"""
if not __debug__:
    raise RuntimeError("Certificate checking requires assertions; optimized Python is unsupported")

import hashlib
import json
from collections import deque

IDS = ['implication-flip', 'negation-drop', 'connective-swap', 'assumption-loss',
       'quantifier-switch', 'quantifier-scope', 'variable-capture']
RULESET = 'd3b02eb4eb39976fd3179a44ef1b6bffd17a8f4a271b1bd7cddb97eb71276df2'


def worlds(task):
    relation = task in IDS[-2:]
    result = []
    for n in range(1, 4):
        for mask in range(1 << (n*n if relation else 2*n)):
            result.append(dict(n=n,
                P=[bool(mask & (1 << (2*i))) if not relation else False for i in range(n)],
                Q=[bool(mask & (1 << (2*i+1))) if not relation else False for i in range(n)],
                R=[[bool(mask & (1 << (i*n+j))) if relation else False for j in range(n)] for i in range(n)]))
    return result


def key(w):
    assert type(w) is dict and set(w) == {'n', 'P', 'Q', 'R'}
    n = w['n']; assert type(n) is int and 1 <= n <= 3
    for p in ['P', 'Q']:
        assert type(w[p]) is list and len(w[p]) == n and all(type(x) is bool for x in w[p])
    assert type(w['R']) is list and len(w['R']) == n
    assert all(type(row) is list and len(row) == n and all(type(x) is bool for x in row) for row in w['R'])
    return (w['n'], tuple(w['P']), tuple(w['Q']), tuple(map(tuple, w['R'])))


def goal(task, w):
    p, q, r, n = w['P'], w['Q'], w['R'], w['n']
    impl = [not p[i] or q[i] for i in range(n)]
    if task == IDS[0]: a, b = all(impl), all(not q[i] or p[i] for i in range(n))
    elif task == IDS[1]: a, b = all(not p[i] or not q[i] for i in range(n)), all(impl)
    elif task == IDS[2]: a, b = any(p[i] and q[i] for i in range(n)), any(p[i] or q[i] for i in range(n))
    elif task == IDS[3]: a, b = all(impl), all(q)
    elif task == IDS[4]: a, b = all(impl), any(impl)
    elif task == IDS[5]: a, b = all(any(row) for row in r), any(all(r[i][j] for i in range(n)) for j in range(n))
    elif task == IDS[6]: a, b = all(any(row) for row in r), all(r[i][i] for i in range(n))
    else: raise ValueError('Unknown mission')
    return a != b


def edits(task, w):
    n = w['n']
    if n < 3: yield dict(type='add')
    if n > 1: yield dict(type='remove')
    if task in IDS[-2:]:
        for i in range(n):
            for j in range(n): yield dict(type='toggle_relation', i=i, j=j)
    else:
        for p in ['P', 'Q']:
            for i in range(n): yield dict(type='toggle', p=p, i=i)


def apply(w, a):
    w = json.loads(json.dumps(w))
    n = w['n']
    if a['type'] == 'add':
        w['n'] += 1
        w['P'].append(False); w['Q'].append(False)
        for row in w['R']: row.append(False)
        w['R'].append([False]*(n+1))
    elif a['type'] == 'remove':
        w['n'] -= 1
        w['P'].pop(); w['Q'].pop(); w['R'].pop()
        for row in w['R']: row.pop()
    elif a['type'] == 'toggle': w[a['p']][a['i']] = not w[a['p']][a['i']]
    else: w['R'][a['i']][a['j']] = not w['R'][a['i']][a['j']]
    return w


def graph(task):
    states = worlds(task); index = {key(w): i for i, w in enumerate(states)}
    edges = [[dict(action=a, to=index[key(apply(w, a))]) for a in edits(task, w)] for w in states]
    goals = [goal(task, w) for w in states]
    serial = dict(mission_id=task, ruleset_sha256=RULESET, edges=edges, goals=goals)
    digest = hashlib.sha256(json.dumps(serial, separators=(',', ':')).encode()).hexdigest()
    return states, index, edges, goals, digest


def verify(c):
    fields = {'format','mission_id','ruleset_sha256','graph_sha256','cost_model','state_count',
              'start_world','potentials','actions','goal_world','minimum_edits','lean_kernel_checked','pcs_authoritative'}
    assert type(c) is dict and set(c) == fields and c['format'] == 'pcs-finite-search-route-v1'
    assert c['mission_id'] in IDS and c['ruleset_sha256'] == RULESET
    assert c['cost_model'] == 'one per world edit; tests and clues excluded'
    assert c['lean_kernel_checked'] is False and c['pcs_authoritative'] is False
    states, index, edges, goals, digest = graph(c['mission_id'])
    d = c['potentials']; assert type(c['state_count']) is int and c['state_count'] == len(states) and c['graph_sha256'] == digest
    assert type(d) is list and len(d) == len(states) and all(type(v) is int and 0 <= v < len(states) for v in d)
    for i, out in enumerate(edges):
        assert (d[i] == 0) == goals[i]
        assert all(d[i] <= d[e['to']] + 1 for e in out)
        assert d[i] == 0 or any(d[e['to']] == d[i]-1 for e in out)
    start = index[key(c['start_world'])]
    assert type(c['minimum_edits']) is int and c['minimum_edits'] == d[start] == len(c['actions'])
    w = c['start_world']; assert type(c['actions']) is list
    for a in c['actions']:
        assert type(a) is dict and all(type(a[k]) is int for k in ['i', 'j'] if k in a)
        assert a in list(edits(c['mission_id'], w))
        w = apply(w, a)
    assert key(w) == key(c['goal_world']) and goal(c['mission_id'], w)
    # Independent forward BFS from EVERY state, not the JS reverse search.
    for start in range(len(states)):
        queue = deque([(start, 0)]); seen = {start}
        while queue:
            i, depth = queue.popleft()
            if goals[i]: assert depth == d[start]; break
            for e in edges[i]:
                if e['to'] not in seen: seen.add(e['to']); queue.append((e['to'], depth+1))
        else: raise ValueError('Unreachable goal')
    return dict(mission_id=c['mission_id'], states=len(states), edges=sum(map(len, edges)), minimum_edits=c['minimum_edits'])


if __name__ == '__main__':
    import sys
    from pathlib import Path
    def strict_pairs(pairs):
        out = {}
        for k, v in pairs:
            if k in out or k in {'__proto__','prototype','constructor'}: raise ValueError('Duplicate/reserved key')
            out[k] = v
        return out
    reports = []
    for path in sys.argv[1:]:
        raw = Path(path).read_bytes()
        if len(raw) > 32768: raise ValueError('Certificate exceeds byte budget')
        reports.append(verify(json.loads(raw.decode('utf-8'), object_pairs_hook=strict_pairs, parse_constant=lambda x: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))))
    if not reports: raise ValueError('Provide certificate JSON files')
    print(json.dumps(dict(independent_python_checks=reports, kernel_checked=False, pcs_authority=False)))
