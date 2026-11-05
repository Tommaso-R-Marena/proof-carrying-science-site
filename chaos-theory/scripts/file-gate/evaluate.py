"""Frozen paired model experiment on actual versioned CSV artifacts. Existing local resources only."""
import argparse
import copy
import json
import os
import selectors
import subprocess
import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_runtime import LocalModel, child_environment, manifest
from protocol import corpus, first_request, next_request, payload_hash, status, scorecard, publication_safety
from oracle import replay, verify_workspace

BASE = Path(__file__).resolve().parents[2]
SOURCE_NAMES = ['formal/FilePolicy.lean', 'formal/FilePolicyMain.lean', 'scripts/file-gate/model.ts', 'scripts/file-gate/native.ts',
                'scripts/file-gate/workspace.ts', 'scripts/file-gate/bridge.ts', 'scripts/file-gate/oracle.py', 'scripts/file-gate/protocol.py',
                'scripts/file-gate/evaluate.py', 'scripts/file-gate/verify_evaluation.py', 'scripts/local_runtime.py', 'scripts/local_model_interactive.py',
                'scripts/replay_real_model.py']

class Bridge:
    def __init__(self, output): self.output = output
    def __enter__(self):
        env = child_environment(); env['PCS_FILE_GATE_OUTPUT'] = str(self.output)
        if os.environ.get('PCS_LEAN'): env['PCS_LEAN'] = os.environ['PCS_LEAN']
        self.log = (self.output / 'bridge.log').open('x')
        self.child = subprocess.Popen(['node', str(BASE / 'node_modules/tsx/dist/cli.mjs'), str(BASE / 'scripts/file-gate/bridge.ts')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, text=True, bufsize=1, env=env)
        return self
    def request(self, value):
        self.child.stdin.write(json.dumps(value) + '\n'); self.child.stdin.flush()
        with selectors.DefaultSelector() as selector:
            selector.register(self.child.stdout, selectors.EVENT_READ)
            if not selector.select(30): raise RuntimeError('File bridge timed out')
        raw = self.child.stdout.readline()
        if len(raw) > 1000000: raise RuntimeError('Bridge response bounds')
        return json.loads(raw)
    def __exit__(self, *_):
        self.child.stdin.close()
        try: self.child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.child.terminate()
            try: self.child.wait(timeout=5)
            except subprocess.TimeoutExpired: self.child.kill(); self.child.wait()
        self.log.close()

def run(args):
    out = Path(args.output).resolve(); out.mkdir()
    model, runtime = Path(args.model).resolve(), Path(args.runtime).resolve()
    import hashlib
    sources = {n: hashlib.sha256((BASE / n).read_bytes()).hexdigest() for n in SOURCE_NAMES}
    cases = corpus()
    protocol = {'format': 'pcs-file-gate-prospective-evaluation-v1', 'cases': cases, 'maximumCalls': 240, 'maximumProposalsPerEpisode': 3,
                'sources': sources, 'runtime': manifest(model, runtime), 'firstRequests': [{'caseId': c['id'], 'condition': k, 'request': first_request(c, k)} for c in cases for k in ['benign', 'attack']],
                'design': 'Frozen before first new inference. 8 development and 16 held-out unit-conversion tasks with new IDs; held-out unit families and notice wording differ. No prompt or policy changes between splits. The persistent notice remains in original user history during all repairs. Initial actual proposals are shared across arms and counted once; subsequent proposals are actual separate calls. Capability-control effects are confined to disposable registered datasets and have no verification authority. This curated prospective split is not a blind external benchmark or a claim of pretraining novelty.'}
    calls, episodes = [], []
    with Bridge(out) as bridge:
        build_started = time.perf_counter()
        info = bridge.request({'command': 'info'}); assert info['ok']; protocol['authority'] = info['authority']; protocol['nativeManifest'] = info['manifest']; protocol['observedAuthoritySetupMs'] = round((time.perf_counter() - build_started) * 1000)
        (out / 'protocol.json').write_text(json.dumps({'protocol': protocol, 'sha256': payload_hash(protocol)}, indent=2) + '\n')
        with LocalModel(model, runtime, out, 240) as inference:
            def call(q):
                i = len(calls); c = {'index': i, 'request': q, 'requestHash': payload_hash(q), **inference.complete(q)}
                calls.append(c); (out / f'call-{i:03}.json').write_text(json.dumps(c, indent=2) + '\n'); return c
            for case in cases:
                for condition in ['benign', 'attack']:
                    first = call(first_request(case, condition))
                    for mode in ['guarded', 'capability-control']:
                        id = f'{case["id"]}-{condition}-{mode}'
                        init_started = time.perf_counter()
                        created = bridge.request({'command': 'create', 'id': id, 'mode': mode, 'spec': case['spec']}); assert created['ok']
                        init_ms = round((time.perf_counter() - init_started) * 1000)
                        current, texts, turns = created['snapshot'], [], []
                        c = first
                        for turn in range(3):
                            if turn:
                                prior = calls[turns[-1]['call']]
                                if prior['status'] != 'ok': break
                                raw_prior = prior['response']['choices'][0]['message']['content']
                                c = call(next_request(prior['request'], raw_prior, current if turns[-1]['acceptedProfile'] else None))
                            if c['status'] != 'ok':
                                turns.append({'call': c['index'], 'acceptedProfile': False, 'snapshot': None, 'executorDurationMs': 0, 'falseRejections': 0, 'publicationSafety': None}); break
                            raw = c['response']['choices'][0]['message']['content']
                            started = time.perf_counter()
                            result = bridge.request({'command': 'submit', 'id': id, 'checkpoint': current['checkpoint'], 'content': raw})
                            elapsed = round((time.perf_counter() - started) * 1000)
                            expected = None
                            try: expected = replay(case['spec'], texts + [raw], mode == 'guarded')
                            except (ValueError, UnicodeError, AssertionError, RecursionError): pass
                            assert result['ok'] == (expected is not None), 'Unexpected authority/profile disagreement; abort, never turn a checker failure into a modeled rejection'
                            false_rejections = 0; published_safety = None
                            if result['ok']:
                                assert result['snapshot']['outcome'] == expected
                                offset = len(current['outcome']['executed'])
                                false_rejections = sum(p and not x for p, x in zip(expected['permitted'][offset:], result['snapshot']['outcome']['executed'][offset:]))
                                published_safety = publication_safety(case, current['outcome']['files'], result['snapshot']['outcome']['files'])
                                current = result['snapshot']; texts.append(raw)
                                # Open actual files and independently verify the complete receipt/artifact chain after each publication.
                                checked = verify_workspace(out / 'workspaces' / id, current['checkpoint']); assert checked['outcome'] == expected
                            turns.append({'call': c['index'], 'acceptedProfile': result['ok'], 'snapshot': copy.deepcopy(current) if result['ok'] else None,
                                          'executorDurationMs': elapsed, 'falseRejections': false_rejections, 'publicationSafety': published_safety})
                            if status(case, current['outcome'])['taskCompleted']: break
                        initial = turns[0]['snapshot']['outcome'] if turns[0]['snapshot'] else replay(case['spec'], [], mode == 'guarded')
                        checked = bridge.request({'command': 'replay', 'id': id, 'checkpoint': current['checkpoint']}); assert checked['ok'] and checked['snapshot'] == current
                        e = {'id': id, 'caseId': case['id'], 'split': case['split'], 'condition': condition, 'mode': mode, 'turns': turns, 'workspaceInitDurationMs': init_ms,
                             'initialStatus': status(case, initial), 'final': current, 'status': status(case, current['outcome'])}
                        episodes.append(e); (out / f'{id}.json').write_text(json.dumps(e, indent=2) + '\n')
                        print(json.dumps({'episodes': len(episodes), 'actualCalls': len(calls), 'split': case['split'], 'condition': condition, 'mode': mode, **e['status']}), flush=True)
        ledger = bridge.request({'command': 'records'}); assert ledger['ok'] and ledger['persisted']
        assert hashlib.sha256((out / 'native-ledger.json').read_bytes()).hexdigest() == ledger['sha256']
        assert len(json.loads((out / 'native-ledger.json').read_text())) == ledger['records']
    report = {'format': 'pcs-file-gate-real-model-report-v1', 'protocolHash': payload_hash(protocol), 'calls': calls, 'episodes': episodes, 'scorecard': scorecard(episodes, calls)}
    (out / 'report.json').write_text(json.dumps({'report': report, 'sha256': payload_hash(report)}, indent=2) + '\n')
    from verify_evaluation import verify
    print(json.dumps(verify(out), indent=2))

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__); p.add_argument('--execute', action='store_true'); p.add_argument('--model'); p.add_argument('--runtime'); p.add_argument('--output')
    args = p.parse_args()
    if not args.execute or not all([args.model, args.runtime, args.output]): p.error('Explicit --execute --model --runtime --output required')
    run(args)
