"""Explicit bounded real-weight evaluation. Two guarded interfaces; no hosted API or training."""
import argparse,copy,hashlib,json,os,subprocess,tarfile,time
from pathlib import Path
from study import corpus,first_request,next_request,payload_hash,status,publication_safety,scorecard
from intent_oracle import compile_intent
from evaluate import Bridge,BASE
from local_runtime import LocalModel,child_environment,manifest
from oracle import replay,verify_workspace

class IntentBridge(Bridge):
 def __enter__(self):
  env=child_environment();env['PCS_FILE_GATE_OUTPUT']=str(self.output)
  if os.environ.get('PCS_LEAN'):env['PCS_LEAN']=os.environ['PCS_LEAN']
  self.log=(self.output/'bridge.log').open('x')
  self.child=subprocess.Popen(['node',str(BASE/'node_modules/tsx/dist/cli.mjs'),str(BASE/'scripts/file-intent/bridge.ts')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.log,text=True,bufsize=1,env=env)
  return self

def sources():
 # Freeze every execution/proposal/scoring dependency. Independent report/replay/test observers
 # are reviewable separately and do not authorize actions or produce model requests.
 names=['scripts/file-intent/'+n for n in ['model.ts','native.ts','bridge.ts','study.py','intent_oracle.py','run.py']]
 names+=['formal/'+n for n in ['FileIntent.lean','FileIntentMain.lean','FilePolicy.lean','FilePolicyMain.lean','GuardedTools.lean','GuardedToolsTable.lean','GuardedJson.lean','GuardedJsonMain.lean']]
 names+=['scripts/file-gate/'+n for n in ['model.ts','native.ts','workspace.ts','oracle.py','evaluate.py','protocol.py']]
 names+=['scripts/'+n for n in ['durable-recovery.ts','lean-plan-process.ts','local_runtime.py','local_model_interactive.py','replay_real_model.py']]
 names+=['src/research.ts','src/schema.ts','src/contracts.ts','package.json','package-lock.json','tsconfig.json']
 return {n:hashlib.sha256((BASE/n).read_bytes()).hexdigest() for n in sorted(names)}

def decision(case,interface,raw,texts):
 compilation=None;content=raw;classification='profile-valid'
 if interface=='intent':
  try:compilation=compile_intent(case['spec'],case['target'],raw)
  except (ValueError,UnicodeError,RecursionError):return None,None,'malformed'
  if not compilation['eligible']:return compilation,None,'policy-ineligible'
  content=json.dumps(compilation['plan'],separators=(',',':'))
 try:expected=replay(case['spec'],texts+[content],True)
 except (ValueError,UnicodeError,AssertionError,RecursionError):return compilation,None,'profile-rejection'
 return compilation,expected,classification

def run(args):
 out=Path(args.output).resolve();out.mkdir();model,runtime=Path(args.model).resolve(),Path(args.runtime).resolve()
 frozen=sources();cases=corpus();calls=[];episodes=[]
 with IntentBridge(out) as bridge:
  setup=time.perf_counter();info=bridge.request({'command':'info'});assert info['ok'];setup_ms=round((time.perf_counter()-setup)*1000)
  p={'format':'pcs-file-intent-study-v1','cases':cases,'sources':frozen,'authority':info['authority'],'intentCompiler':info['intentCompiler'],'runtime':manifest(model,runtime),'maximumCalls':96,'maximumProposals':2,'observedAuthoritySetupMs':setup_ms,
     'design':'Twelve new authored tasks (4 development, 8 prospective held-out), two persistent notices, two guarded interfaces. Every inference is new and counted separately. No tuning between splits. Intent interface restricts model responsibility to a numeric answer; host compiles protocol and selects trusted target. Not model learning, a blind external benchmark, an estimate of prompt-injection prevalence or a proof of correct scientific answers.',
     'firstRequests':[{'caseId':c['id'],'condition':k,'interface':i,'request':first_request(c,k,i)} for c in cases for k in ['benign','attack'] for i in ['tools','intent']]}
  (out/'protocol.json').write_text(json.dumps({'protocol':p,'sha256':payload_hash(p)},indent=2)+'\n')
  with tarfile.open(out/'frozen-sources.tar.gz','x:gz') as archive:
   for name in frozen:archive.add(BASE/name,arcname=name)
  with LocalModel(model,runtime,out,96) as inference:
   for case in cases:
    for condition in ['benign','attack']:
     for interface in ['tools','intent']:
      id=f'{case["id"]}-{condition}-{interface}';init_start=time.perf_counter();created=bridge.request({'command':'create','id':id,'interface':interface,'spec':case['spec'],'target':case['target']});assert created['ok']
      init_ms=round((time.perf_counter()-init_start)*1000)
      current=created['snapshot'];texts=[];turns=[];writes=0;q=first_request(case,condition,interface)
      for turn in range(2):
       index=len(calls);c={'index':index,'request':q,'requestHash':payload_hash(q),**inference.complete(q)};calls.append(c);(out/f'call-{index:03}.json').write_text(json.dumps(c,indent=2)+'\n')
       if c['status']!='ok':
        turns.append({'call':index,'acceptedProfile':False,'classification':'inference-error','snapshot':copy.deepcopy(current),'compilation':None,'compilationFile':None,'executorMs':0,'publicationSafety':None});break
       raw=c['response']['choices'][0]['message']['content'];expectedCompilation,expected,classification=decision(case,interface,raw,texts)
       start=time.perf_counter();r=bridge.request({'command':'submit','id':id,'checkpoint':current['checkpoint'],'content':raw});elapsed=round((time.perf_counter()-start)*1000)
       assert r['ok'] and r['acceptedProfile']==(expected is not None),'Unexpected compiler/authority/I/O failure; abort rather than count as a modeled rejection'
       physical=None
       if r['acceptedProfile']:
        assert r['snapshot']['outcome']==expected
        content=raw if interface=='tools' else r['compilation']['response']['result']['plan']
        if interface=='intent':assert json.loads(content)==expectedCompilation['plan']
        offset=len(current['outcome']['executed']);actions=json.loads(content)['actions']
        writes+=sum(a['tool']=='set_value' and x for a,x in zip(actions,expected['executed'][offset:]))
        physical=publication_safety(case,current['outcome']['files'],r['snapshot']['outcome']['files']);texts.append(content);current=r['snapshot']
        assert verify_workspace(out/'workspaces'/id,current['checkpoint'])['outcome']==expected
       assert r['snapshot']==current
       turns.append({'call':index,'acceptedProfile':r['acceptedProfile'],'classification':classification,'snapshot':copy.deepcopy(current),'compilation':r['compilation'],'compilationFile':r['compilationFile'],'executorMs':elapsed,'publicationSafety':physical})
       if status(case,current['outcome'])['taskCompleted']:break
       q=next_request(q,raw,current,r['acceptedProfile'])
      checked=bridge.request({'command':'replay','id':id,'checkpoint':current['checkpoint']});assert checked['ok'] and checked['snapshot']==current
      e={'id':id,'caseId':case['id'],'split':case['split'],'condition':condition,'interface':interface,'turns':turns,'workspaceInitMs':init_ms,'executedWrites':writes,'initialStatus':status(case,turns[0]['snapshot']['outcome']),'final':current,'status':status(case,current['outcome'])}
      episodes.append(e);(out/(id+'.json')).write_text(json.dumps(e,indent=2)+'\n')
      print(json.dumps({'episodes':len(episodes),'calls':len(calls),'interface':interface,**e['status']}),flush=True)
  ledger=bridge.request({'command':'records'});assert ledger['ok'] and hashlib.sha256((out/'native-ledger.json').read_bytes()).hexdigest()==ledger['sha256']
  assert len(json.loads((out/'native-ledger.json').read_text()))==ledger['records']
 assert sources()==frozen,'Sources changed after study freeze'
 report={'format':'pcs-file-intent-report-v1','protocolHash':payload_hash(p),'calls':calls,'episodes':episodes,'scorecard':scorecard(episodes,calls),'originalNativeLedgerRetained':True}
 (out/'report.json').write_text(json.dumps({'report':report,'sha256':payload_hash(report)},indent=2)+'\n')
 from replay import verify
 print(json.dumps(verify(out),indent=2))

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--execute',action='store_true');p.add_argument('--model');p.add_argument('--runtime');p.add_argument('--output');args=p.parse_args()
 if not args.execute or not all([args.model,args.runtime,args.output]):p.error('Explicit --execute --model --runtime --output required')
 run(args)
