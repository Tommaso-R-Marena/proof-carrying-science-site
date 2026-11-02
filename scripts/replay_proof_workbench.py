#!/usr/bin/env python3
"""Replay an untrusted workbench JSON report with exact trusted PCS source.
Never executes a report's Lean source: reconstructs commands from typed actions,
trusted local libraries or the receiver's fixed Std tactics/witness whitelist.
"""
import argparse,hashlib,json,math,subprocess,sys
from pathlib import Path

def strict(raw):
 def unique(pairs):
  obj={}
  for k,v in pairs:
   if k in obj:raise ValueError('Duplicate report key')
   obj[k]=v
  return obj
 return json.loads(raw,object_pairs_hook=unique,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite JSON number')))

def equal_json(a,b):
 if isinstance(a,bool) or isinstance(b,bool):return type(a) is type(b) and a==b
 if type(a) in {int,float} and type(b) in {int,float}:return math.isfinite(a) and math.isfinite(b) and a==b
 if type(a) is not type(b):return False
 if isinstance(a,dict):return a.keys()==b.keys() and all(equal_json(a[k],b[k]) for k in a)
 if isinstance(a,list):return len(a)==len(b) and all(equal_json(x,y) for x,y in zip(a,b))
 return a==b

def envelope(raw):
 if len(raw)>12*1024*1024:raise ValueError('Report size bound')
 outer=strict(raw)
 if type(outer) is not dict:raise ValueError('Expected a report object')
 payload=outer.get('canonical_payload');sha=outer.get('report_sha256')
 if not isinstance(payload,str) or hashlib.sha256(payload.encode()).hexdigest()!=sha:raise ValueError('Report commitment mismatch')
 data=strict(payload)
 if not equal_json(data,{k:v for k,v in outer.items() if k not in {'canonical_payload','report_sha256'}}):raise ValueError('Canonical payload and display fields disagree')
 fields={'provider_evidence_sha256','format','catalog_sha256','entry_id','goal_sha256','statement','formal_statement','source_revision','request_id','requested_family','run_url','execution_mode','created_at','outcome','selected_role','interpretation_confirmed','evidence','pcs_authority','physical_neural_execution_independently_attested'}
 if set(data)!=fields or data['format']!='pcs-proof-workbench-report-v1' or data['pcs_authority'] is not False or data['physical_neural_execution_independently_attested'] is not False or data['interpretation_confirmed'] is not True:raise ValueError('Unrecognized report scope')
 if data['requested_family'] not in {'checked-reuse-v2','induction-abstraction-v2','verified-memory-v1','prospective-hybrid-v2'} or data['execution_mode'] not in {'fresh_public_job','recorded_example'} or data['outcome'] not in {'proved','refuted','unresolved'}:raise ValueError('Unknown report mode')
 return data

def trusted_source(core):
 profile=strict((Path(__file__).resolve().parent/'proof_workbench/trust-profile-v1.json').read_bytes())
 if profile['format']!='pcs-workbench-receiver-trust-v1':raise ValueError('Unsupported local receiver profile')
 tracked=subprocess.check_output(['git','ls-files','pcs'],cwd=core,text=True).splitlines()
 expected={p for p in profile['source_files'] if p.startswith('pcs/')}
 if set(tracked)!=expected:raise ValueError('Unreviewed PCS package source added or removed')
 for name,sha in profile['source_files'].items():
  path=core/name
  if path.is_symlink() or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=sha:raise ValueError('Receiver source is outside its locally pinned trust profile: '+name)
 extras=subprocess.check_output(['git','ls-files','--others','--exclude-standard','pcs'],cwd=core,text=True).splitlines()
 if any(p.endswith(('.py','.pyc','.so','.pyd')) for p in extras):raise ValueError('Untracked executable package source is not accepted')
 return profile

def replay(raw,core):
 data=envelope(raw);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=core,text=True).strip()
 if revision!=data['source_revision']:raise ValueError('Check out the exact trusted core revision shown in the report')
 subprocess.run(['git','diff','--exit-code','HEAD','--','pcs/experimental/prover','formal','research/checked-reuse-v2','research/induction-abstraction-v2','research/verified-memory-v1'],cwd=core,check=True,stdout=subprocess.DEVNULL)
 trusted_source(core)
 sys.path.insert(0,str(core))
 from pcs.experimental.prover.induction_language import formalize
 from pcs.experimental.prover.induction_ir import digest
 from pcs.experimental.prover.hybrid import replay_std_receipt
 from pcs.experimental.prover.library import LibraryEnvironment
 from pcs.experimental.prover.memory_environment import MemoryEnvironment
 from pcs.experimental.prover.abstraction_environment import AbstractionEnvironment
 from pcs.experimental.prover.memory_falsify import check_witness
 from pcs.experimental.prover.memory_cost import MeasuredMemoryEnvironment
 parsed=formalize(data['statement'])
 if parsed['status']!='supported' or len(parsed['candidates'])!=1:raise ValueError('Report interpretation is unsupported or ambiguous')
 candidate=parsed['candidates'][0];goal=candidate['ir'];e=data['evidence']
 if e.get('projection')!='pcs-workbench-evidence-projection-v1':raise ValueError('Unrecognized evidence projection')
 if candidate['lean']!=data['formal_statement'] or digest(goal)!=data['goal_sha256'] or e.get('core_sha')!=revision or e.get('request_id')!=data['request_id'] or e.get('source_sha256')!=digest(data['statement']):raise ValueError('Report statement, goal or source binding mismatch')
 if (e.get('model_family') or 'checked-reuse-v2')!=data['requested_family'] or e.get('result',{}).get('pcs_authority') is not False:raise ValueError('Reported family or authority changed')
 candidates=e['result']['formalization']['candidates']
 if not any(c.get('interpretation_sha256')==digest(goal) and c.get('lean')==candidate['lean'] for c in candidates):raise ValueError('Producer interpretation differs')
 selected=next((role for role in ['result','strong_baseline','previous','baseline'] if e.get(role) and e[role].get('status')=='verified'),None)
 if selected and e['result'].get('status')=='verified_counterexample':raise ValueError('Conflicting proof and refutation')
 if e.get('automatic_training_authorization') is not False or any(e.get(role) and e[role].get('pcs_authority') is not False for role in ['result','strong_baseline','previous','baseline']):raise ValueError('Unexpected producer authority scope')
 outcome='proved' if selected else 'refuted' if e['result'].get('status')=='verified_counterexample' else 'unresolved'
 if selected is None and outcome=='refuted':selected='result'
 if data['selected_role']!=selected or data['outcome']!=outcome:raise ValueError('False result attribution')
 if outcome=='unresolved':return {'format':'pcs-workbench-independent-replay-v1','status':'unresolved','formal_truth_established':False,'pcs_authority':False}
 observation=e[selected];receipt=observation['counterexample']['receipt'] if outcome=='refuted' else observation['search']['receipt']
 if receipt.get('statement')!=candidate['lean'] or (receipt.get('original_goal_sha256') if outcome=='refuted' else receipt.get('goal_sha256'))!=digest(goal):raise ValueError('Receipt target changed')
 if outcome=='refuted':
  env=MeasuredMemoryEnvironment(None,timeout=30)
  try:fresh=check_witness(env,goal,receipt['witness'])
  finally:env.close()
 elif receipt['format']=='pcs-std-baseline-proof-v1':fresh=replay_std_receipt(goal,receipt)
 else:
  family='verified-memory-v1' if data['requested_family'] in {'verified-memory-v1','prospective-hybrid-v2'} else data['requested_family']
  folder=core/'research'/family;trusted=strict((folder/'library.json').read_text())
  if receipt.get('library')!=trusted:raise ValueError('Receipt memory is not the trusted local library')
  cls=MemoryEnvironment if family=='verified-memory-v1' else AbstractionEnvironment if family=='induction-abstraction-v2' else LibraryEnvironment
  env=cls(trusted,timeout=30)
  try:fresh=env.verify(goal,receipt['actions'])
  finally:env.close()
  for field in ['proof','library_declarations','library_sha256','adapter_sha256']:
   if fresh.get(field)!=receipt.get(field):raise ValueError('Regenerated proof/source differs: '+field)
 if outcome=='refuted' and any(fresh.get(k)!=receipt.get(k) for k in ['proof','adapter_sha256']):raise ValueError('Regenerated counterexample proof differs')
 if fresh['kernel']!=receipt['kernel']:raise ValueError('Independent axiom/type audit differs from the claimed receipt')
 return {'format':'pcs-workbench-independent-replay-v1','status':outcome,'goal_sha256':digest(goal),'source_revision':revision,'axioms':fresh['kernel']['axioms'],'proof_commands_regenerated':True,'producer_Lean_source_executed':False,'physical_neural_execution_independently_attested':False,'human_intent_verified':False,'scientific_validity_established':False,'pcs_authority':False}
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('report',type=Path);p.add_argument('--core',type=Path,required=True);a=p.parse_args();print(json.dumps(replay(a.report.read_bytes(),a.core.resolve()),indent=2))
