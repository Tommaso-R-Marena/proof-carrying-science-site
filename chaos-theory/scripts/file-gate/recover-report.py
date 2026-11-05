"""Derive a report from all saved actual calls/episodes after the known final collection failure. No inference or verdicts invented."""
import argparse
import json
from pathlib import Path
from protocol import corpus, payload_hash, scorecard

REASON = 'The original final native-ledger response exceeded the 1 MB bridge response limit after all episodes completed. Original calls, episode records and CSV artifacts were preserved. Native verdicts below will be newly computed, not claimed to be the original pre-publication ledger.'

def derive(directory):
    root=Path(directory);pe=json.loads((root/'protocol.json').read_text());p=pe['protocol']
    assert pe['sha256']==payload_hash(p) and payload_hash(p['cases'])==payload_hash(corpus())
    calls=[json.loads(f.read_text()) for f in sorted(root.glob('call-*.json'))]
    assert len(calls)<=240 and all(c['index']==i and c['requestHash']==payload_hash(c['request']) for i,c in enumerate(calls))
    episodes=[json.loads((root/f'{c["id"]}-{condition}-{mode}.json').read_text()) for c in p['cases'] for condition in ['benign','attack'] for mode in ['guarded','capability-control']]
    assert len(episodes)==96
    recovery={'format':'file-gate-collection-recovery-v1','originalProtocolHash':pe['sha256'],'originalNativeLedgerRetained':False,'nativeLedgerProvenance':'fresh-lean-reconstruction',
              'modelCallsRecovered':len(calls),'episodesRecovered':len(episodes),'newInferenceCalls':0,'reason':REASON}
    report={'format':'pcs-file-gate-real-model-report-v1','protocolHash':pe['sha256'],'calls':calls,'episodes':episodes,'scorecard':scorecard(episodes,calls),'collectionRecovery':recovery}
    return {'report':report,'sha256':payload_hash(report)}, recovery

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');p.add_argument('--dry-run',action='store_true');args=p.parse_args()
    envelope,recovery=derive(args.directory);root=Path(args.directory)
    if not args.dry_run:
        if any((root/n).exists() for n in ['report.json','native-ledger.json','collection-recovery.json']):raise ValueError('Existing evidence is never overwritten; use a fresh extraction of the original failure archive.')
        with (root/'report.json').open('x') as f:f.write(json.dumps(envelope,indent=2)+'\n')
        with (root/'collection-recovery.json').open('x') as f:f.write(json.dumps(recovery,indent=2)+'\n')
    print(json.dumps({'derivedReportHash':envelope['sha256'],'actualSavedModelCalls':recovery['modelCallsRecovered'],'savedEpisodes':96,'newInferenceCalls':0,
                      'validationPending':True,'next':'Run reconstruct-ledger.ts, then independent Python and fresh native replay. This tool makes no affirmative Lean verdict.'},indent=2))
