#!/usr/bin/env python3
"""Execute the frozen prospective study with real weights and real Lean.
Search and independent replay run in separate process groups with hard deadlines.
This program does not train, select checkpoints, or grant PCS authority.
"""
import argparse,hashlib,json,os,signal,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROTOCOL=ROOT/'research/proof-search-prospective-v1/protocol.json'
class SearchBudgetExceeded(Exception):pass

def protocol():
 raw=PROTOCOL.read_bytes();expected=(PROTOCOL.with_suffix('.sha256')).read_text().split()[0]
 if hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('Frozen protocol digest mismatch')
 return json.loads(raw),expected

def bind_core(core,p):
 actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=core,text=True).strip()
 if actual!=p['core_revision']:raise ValueError('Exact frozen core required')
 subprocess.run(['git','diff','--exit-code','HEAD','--','pcs/experimental/prover','formal','research/verified-memory-v1'],cwd=core,check=True,stdout=subprocess.DEVNULL)
 sys.path.insert(0,str(core))

def child(core,case_id,method,replay_path=None):
 p,sha=protocol();bind_core(core,p)
 from pcs.experimental.prover.induction_language import formalize
 from pcs.experimental.prover.induction_ir import digest
 from pcs.experimental.prover.memory_cli import load
 from pcs.experimental.prover.memory_cost import MeasuredMemoryEnvironment
 from pcs.experimental.prover.memory_environment import structural_rank,replay_memory_receipt
 from pcs.experimental.prover.environment import search
 from pcs.experimental.prover.hybrid import std_search,replay_std_receipt
 case=next(c for c in p['cases'] if c['id']==case_id)
 parsed=formalize(case['statement']);goal=parsed['candidates'][0]['ir']
 if goal!=case['goal'] or digest(goal)!=case['goal_sha256']:raise ValueError('Frozen translator meaning changed')
 if replay_path:
  row=json.loads(replay_path.read_text());receipt=row['receipt'];started=time.monotonic()
  if row['goal_sha256']!=case['goal_sha256']:raise ValueError('Replay target changed')
  if receipt['format']=='pcs-std-baseline-proof-v1':result=replay_std_receipt(goal,receipt)
  else:
   trusted=json.loads((core/'research/verified-memory-v1/library.json').read_text())
   if receipt.get('library')!=trusted:raise ValueError('Untrusted memory in replay')
   fresh=replay_memory_receipt(goal,receipt);result={'status':'verified','kernel':fresh['kernel']}
  return {'status':'verified','axioms':result['kernel']['axioms'],'wall_seconds':time.monotonic()-started,'fresh_process':True}
 started=time.monotonic();registry,entry,library,model=load(core/'research/verified-memory-v1')
 if entry!=p['checkpoint']:raise ValueError('Frozen checkpoint changed')
 budget=p['budget']
 class BudgetEnv(MeasuredMemoryEnvironment):
  armed=False;attempts=0
  def charge(self,worker=False):
   if not self.armed:return
   if self.attempts>=budget['search_lean_attempts']:raise SearchBudgetExceeded('lean_attempt_cap')
   if worker and self.worker is None:raise SearchBudgetExceeded('worker_restart_closed')
   remaining=budget['case_wall_seconds_including_setup']-(time.monotonic()-started)
   if remaining<=0:raise SearchBudgetExceeded('wall_cap')
   self.timeout=min(30,remaining);self.attempts+=1
  def _run(self,*args,**kwargs):self.charge();return super()._run(*args,**kwargs)
  def _worker_source(self,*args,**kwargs):self.charge(worker=True);return super()._worker_source(*args,**kwargs)
 env=BudgetEnv(library,timeout=30)
 try:
  # Same non-goal startup probe for every method; no study state is pre-solved.
  env._source('#pcs_probe (True) => []\n','PCS_STATE:')
  setup=time.monotonic()-started;setup_calls=env.actual_calls;env.armed=True
  reason=None;stages=[];result={'status':'unknown','receipt':None,'expansions':0}
  try:
   remaining=budget['action_expansions']
   if method=='std_then_structural':
    result=std_search(env,goal);stages.append({'component':'ordinary_Std','status':result['status'],'expansions':result['expansions']});remaining-=result['expansions']
   if result['status']!='verified':
    result=search(env,goal,model.rank if method=='frozen_neural' else structural_rank,budget=remaining,beam=budget['beam'],depth=budget['depth']);stages.append({'component':method,'status':result['status'],'expansions':result['expansions']})
  except SearchBudgetExceeded as e:reason=str(e);result={'status':'budget_exhausted','receipt':None,'expansions':None}
  return {'case':case_id,'method':method,'goal_sha256':case['goal_sha256'],'protocol_sha256':sha,'search_status':result['status'],'receipt':result.get('receipt'),'expansions':sum(s['expansions'] for s in stages) if stages else result.get('expansions'),
   'stages':stages,'budget_reason':reason,'setup_seconds':setup,'setup_lean_attempts':setup_calls,'search_lean_attempts':env.attempts,'search_seconds':time.monotonic()-started-setup,
   'total_search_phase_seconds':time.monotonic()-started,'checkpoint_sha256':entry['sha256'] if method=='frozen_neural' else None,'memory_sha256':registry['library_sha256'],'model_training':False,'pcs_authority':False}
 finally:env.close()

def process(arguments,timeout,output):
 start=time.monotonic();log=output.with_suffix('.log')
 with log.open('w') as stream:
  proc=subprocess.Popen([sys.executable,__file__,*arguments],stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=proc.wait(timeout=timeout)
  except subprocess.TimeoutExpired:
   os.killpg(proc.pid,signal.SIGKILL);proc.wait();return {'status':'timeout','wall_seconds':time.monotonic()-start}
 if code or not output.is_file():return {'status':'execution_failed','exit_code':code,'wall_seconds':time.monotonic()-start}
 return json.loads(output.read_text())

def run(core,out):
 p,sha=protocol();bind_core(core,p)
 if out.exists():raise ValueError('Use a fresh output directory; evidence must not be overwritten')
 out.mkdir(parents=True)
 # Freeze/selection provenance is checked before any inference.
 freeze_revision=subprocess.check_output(['git','log','--diff-filter=A','--format=%H','--',str(PROTOCOL.relative_to(ROOT))],cwd=ROOT,text=True).strip().splitlines()[-1]
 if not freeze_revision:raise ValueError('Protocol must be committed before evaluation')
 from pcs.experimental.prover.memory_cli import load
 from pcs.experimental.prover.memory_cost import MeasuredMemoryEnvironment
 _,_,library,_=load(core/'research/verified-memory-v1');warm=MeasuredMemoryEnvironment(library,timeout=30)
 try:warm._source('#pcs_probe (True) => []\n','PCS_STATE:')
 finally:warm.close()
 rows=[]
 for case in p['cases']:
  # Deterministic balanced ordering; no test outcomes influence method order.
  methods=sorted(p['methods'],key=lambda m:hashlib.sha256((case['id']+m).encode()).hexdigest())
  for method in methods:
   dest=out/(case['id']+'-'+method+'.json')
   row=process(['--core',str(core),'--child',case['id'],'--method',method,'--output',str(dest)],p['budget']['case_wall_seconds_including_setup'],dest)
   row.update(case=case['id'],method=method,authored_control=case['authored_control'],family=case['family'])
   replay=None
   if row.get('search_status')=='verified':
    rp=out/(case['id']+'-'+method+'-replay.json')
    replay=process(['--core',str(core),'--child',case['id'],'--method',method,'--replay',str(dest),'--output',str(rp)],p['budget']['independent_replay_wall_seconds'],rp)
   row['independent_replay']=replay;row['status']='verified' if replay and replay.get('status')=='verified' else ('replay_failed' if row.get('search_status')=='verified' else row.get('status',row.get('search_status','execution_failed')))
   # Search receipt retained exactly; mutable summary is written separately.
   rows.append(row);print(json.dumps({k:row.get(k) for k in ['case','method','status','search_lean_attempts','expansions']}),flush=True)
 summary={'format':'pcs-prospective-proof-search-results-v1','core_revision':p['core_revision'],'protocol_sha256':sha,'protocol_freeze_commit':freeze_revision,'site_implementation':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'rows':rows,
  'metrics':{m:{'cases':sum(r['method']==m for r in rows),'verified':sum(r['method']==m and r['status']=='verified' for r in rows),'negative_controls_proved':sum(r['method']==m and r['status']=='verified' and r['authored_control']=='negative' for r in rows),'search_lean_attempts':sum(r.get('search_lean_attempts',0) for r in rows if r['method']==m),'unknown_or_failed':sum(r['method']==m and r['status']!='verified' for r in rows)} for m in p['methods']},
  'limitations':p['limitations'],'training_authorized':False,'pcs_authority':False}
 (out/'summary.json').write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n');print(json.dumps({'metrics':summary['metrics']}),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);p.add_argument('--out',type=Path);p.add_argument('--child');p.add_argument('--method',choices=['frozen_neural','same_memory_structural','std_then_structural']);p.add_argument('--replay',type=Path);p.add_argument('--output',type=Path);a=p.parse_args()
 if a.child:a.output.write_text(json.dumps(child(a.core.resolve(),a.child,a.method,a.replay),indent=2)+'\n')
 else:run(a.core.resolve(),a.out.resolve())
