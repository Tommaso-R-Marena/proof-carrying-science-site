"""Independently verify archived causal calls, exact intent compilation and actual CSV versions. No invented Lean verdict."""
import json,sys,hashlib,tarfile
from pathlib import Path
from study import corpus,first_request,next_request,payload_hash,scorecard,status,publication_safety
from intent_oracle import compile_intent
from oracle import replay,verify_workspace
BASE=Path(__file__).resolve().parents[2]
def read(path):return json.loads(path.read_text())
def request(case,plans):return {'kind':'file-policy-request-v1',**case['spec'],'plans':list(plans)}
def verify(directory):
 if not __debug__:raise RuntimeError('Do not disable assertions')
 path=Path(directory);pe=read(path/'protocol.json');p=pe['protocol'];re=read(path/'report.json');r=re['report']
 assert payload_hash(p)==pe['sha256']==r['protocolHash'] and payload_hash(r)==re['sha256']
 assert p['cases']==corpus() and p['maximumCalls']==96 and p['maximumProposals']==2
 assert p['firstRequests']==[{'caseId':c['id'],'condition':k,'interface':i,'request':first_request(c,k,i)} for c in corpus() for k in ['benign','attack'] for i in ['tools','intent']]
 with tarfile.open(path/'frozen-sources.tar.gz') as archive:
  assert sorted(archive.getnames())==sorted(p['sources'])
  for name,h in p['sources'].items():assert hashlib.sha256(archive.extractfile(name).read()).hexdigest()==h
 calls=r['calls'];assert len(calls)<=96 and len(r['episodes'])==48 and r['originalNativeLedgerRetained'] is True
 assert {f.name for f in path.glob('call-*.json')}=={f'call-{i:03}.json' for i in range(len(calls))}
 for i,c in enumerate(calls):assert c['index']==i and c==read(path/f'call-{i:03}.json') and c['requestHash']==payload_hash(c['request'])
 expectedLedger=[];used=[];compileFiles=[];episodeIds=[];profiles=0;compiled=0
 for case in p['cases']:
  for condition in ['benign','attack']:
   for interface in ['tools','intent']:
    id=f'{case["id"]}-{condition}-{interface}';episodeIds.append(id);e=r['episodes'][len(episodeIds)-1];assert e==read(path/(id+'.json'))
    assert (e['id'],e['caseId'],e['split'],e['condition'],e['interface'])==(id,case['id'],case['split'],condition,interface)
    owner=read(path/'compilations'/(id+'-owner.json'));assert owner=={'spec':case['spec'],'target':case['target'],'interface':interface,'compiler':p['intentCompiler'],'authority':p['authority']}
    checked=verify_workspace(path/'workspaces'/id,e['final']['checkpoint']);assert checked['mode']=='guarded'
    d=read(path/'workspaces'/id/'session.json');assert d['spec']==case['spec'] and d['authorityHash']==p['authority']['hash']
    current=checked['prefixes'][0];plans=[];expectedLedger.extend([request(case,[]),request(case,[])]);q=first_request(case,condition,interface);writes=0
    assert 1<=len(e['turns'])<=2
    for turn,t in enumerate(e['turns']):
     c=calls[t['call']];used.append(t['call']);assert t['call']==len(used)-1 and c['request']==q
     compilation=None;content=None;expected=None;classification='profile-valid'
     if c['status']=='ok':
      raw=c['response']['choices'][0]['message']['content']
      if interface=='intent':
       compiled+=1
       try:compilation=compile_intent(case['spec'],case['target'],raw)
       except (ValueError,UnicodeError,RecursionError):classification='malformed'
       if compilation is not None and not compilation['eligible']:classification='policy-ineligible'
       record=t['compilation'];f=t['compilationFile'];assert f==f'compile-{len(compileFiles):04}.json';compileFiles.append(f)
       assert read(path/'compilations'/f)=={'id':id,'checkpoint':current['checkpoint'],**record}
       assert record['request']=={'kind':'file-intent-request-v1','policy':case['spec']['policy'],'target':case['target'],'raw':raw}
       assert record['rawHash']==payload_hash(raw) and record['compilerHash']==payload_hash(p['intentCompiler'])
       rr=record['response'];assert rr['ok']==(compilation is not None)
       if rr['ok']:
        result=rr['result'];assert result['request']==record['request']
        assert {'value':result['value'],'eligible':result['eligible'],'plan':json.loads(result['plan']) if result['plan'] is not None else None}==compilation
        content=result['plan']
      else:content=raw;assert t['compilation'] is None and t['compilationFile'] is None
      if content is not None:
       expectedLedger.extend([request(case,plans),request(case,plans+[content])])
       try:expected=replay(case['spec'],plans+[content],True)
       except (ValueError,UnicodeError,AssertionError,RecursionError):classification='profile-rejection'
     else:assert c['status']=='inference_error';classification='inference-error'
     assert t['classification']==classification and t['acceptedProfile']==(expected is not None)
     if expected is not None:
      profiles+=1;offset=len(current['outcome']['executed'])
      writes+=sum(a['tool']=='set_value' and x for a,x in zip(json.loads(content)['actions'],expected['executed'][offset:]))
      assert t['publicationSafety']==publication_safety(case,current['outcome']['files'],expected['files'])
      plans.append(content);current=checked['prefixes'][len(plans)];assert current['outcome']==expected
     else:assert t['publicationSafety'] is None
     assert t['snapshot']['checkpoint']==current['checkpoint'] and t['snapshot']['outcome']==current['outcome']
     assert t['snapshot']['mode']=='guarded' and t['snapshot']['verificationAuthority'] is True
     artifacts=t['snapshot']['artifacts'];assert len(artifacts)==len(current['outcome']['files'])
     for i,(a,f) in enumerate(zip(artifacts,current['outcome']['files'])):
      assert a['id']==f['id'] and a['sha256']==hashlib.sha256(f['bytes'].encode()).hexdigest()
      assert a['path'].endswith('/snapshots/'+current['checkpoint']['snapshotHash']+f'/file-{i}.csv')
     if turn+1<len(e['turns']):
      assert c['status']=='ok' and not status(case,current['outcome'])['taskCompleted']
      q=next_request(q,raw,t['snapshot'],t['acceptedProfile'])
    assert e['final']==e['turns'][-1]['snapshot']
    assert plans==checked['texts'] and current['checkpoint']==e['final']['checkpoint'] and current['outcome']==e['final']['outcome']
    assert e['initialStatus']==status(case,e['turns'][0]['snapshot']['outcome']) and e['status']==status(case,current['outcome']) and e['executedWrites']==writes
    expectedLedger.append(request(case,plans))
 assert {d.name for d in (path/'workspaces').iterdir()}==set(episodeIds)
 assert used==list(range(len(calls))) and r['scorecard']==scorecard(r['episodes'],calls)
 assert {f.name for f in (path/'compilations').iterdir()}==set(compileFiles)|{id+'-owner.json' for id in episodeIds}
 ledger=read(path/'native-ledger.json');assert [v['request'] for v in ledger]==expectedLedger
 for v in ledger:
  expected=None
  try:
   spec={'files':v['request']['files'],'policy':v['request']['policy']};plans=v['request']['plans']
   expected={'kind':'file-policy-result-v1','request':v['request'],'initial':replay(spec,[],True),'outcomes':[{'guarded':replay(spec,plans[:i+1],True),'control':replay(spec,plans[:i+1],False)} for i in range(len(plans))]}
  except (ValueError,UnicodeError,AssertionError,RecursionError):pass
  assert v['response']==({'ok':True,'result':expected} if expected is not None else {'ok':False})
 return {'passed':True,'actualModelCalls':len(calls),'episodes':len(r['episodes']),'compilerRecords':compiled,'nativeLedgerRecords':len(ledger),'originalNativeLedgerRetained':True,'nativeLeanExecutedByPython':False,'newInferenceCalls':0,'warning':'Archived output consistency, not inference reproduction, origin authentication or proof of scientific validity.'}
if __name__=='__main__':print(json.dumps(verify(sys.argv[1]),indent=2))
