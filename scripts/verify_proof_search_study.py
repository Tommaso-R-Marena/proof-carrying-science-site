#!/usr/bin/env python3
"""Independent receiving replay for frozen study artifacts; no inference/training.
Every accepted proof is regenerated and checked in a new actual Lean compiler
process. Trusted memory construction is shared; producer search states are not.
"""
import argparse,hashlib,json,sys
from pathlib import Path
from replay_proof_workbench import strict,trusted_source
ROOT=Path(__file__).resolve().parents[1]
def final_status(search,replay):
 if search.get('search_status')=='verified':return 'verified' if replay and replay.get('status')=='verified' else 'replay_failed'
 if search.get('search_status') in {'unknown','budget_exhausted'}:return search['search_status']
 if search.get('status') in {'timeout','execution_failed'}:return search['status']
 return 'invalid_search_record'

def verify(core,folder):
 protocol_path=ROOT/'research/proof-search-prospective-v1/protocol.json';raw=protocol_path.read_bytes();sha=hashlib.sha256(raw).hexdigest()
 if sha!=(protocol_path.with_suffix('.sha256')).read_text().split()[0]:raise ValueError('Frozen protocol changed')
 p=strict(raw);trusted_source(core)
 import subprocess
 if subprocess.check_output(['git','rev-parse','HEAD'],cwd=core,text=True).strip()!=p['core_revision']:raise ValueError('Wrong frozen study source')
 sys.path.insert(0,str(core))
 from pcs.experimental.prover.memory_environment import MemoryEnvironment
 from pcs.experimental.prover.memory_cost import MeasuredInductionEnvironment
 from pcs.experimental.prover.environment import render_action
 from pcs.experimental.prover.hybrid import STD_TACTICS,ALLOWED_AXIOMS
 from pcs.experimental.prover.induction_language import formalize
 from pcs.experimental.prover.induction_ir import digest
 library=strict((core/'research/verified-memory-v1/library.json').read_bytes());memory=MemoryEnvironment(library,timeout=30);std=MeasuredInductionEnvironment(timeout=30);rows=[];proofs=0
 try:
  for case in p['cases']:
   candidate=formalize(case['statement'])['candidates'][0];goal=candidate['ir']
   if goal!=case['goal'] or digest(goal)!=case['goal_sha256']:raise ValueError('Frozen case meaning changed')
   for method in p['methods']:
    path=folder/(case['id']+'-'+method+'.json')
    if not path.is_file():raise ValueError('Incomplete study: missing '+path.name)
    search=strict(path.read_bytes())
    if search.get('case')!=case['id'] or search.get('method')!=method or search.get('goal_sha256')!=case['goal_sha256'] or search.get('protocol_sha256')!=sha:raise ValueError('Study membership/meaning binding mismatch')
    attempts=search.get('search_lean_attempts')
    if type(attempts) is not int or not 0<=attempts<=p['budget']['search_lean_attempts']:raise ValueError('Reported attempt budget exceeded')
    if 'search_physical_attempts' in search and search['search_physical_attempts']!=attempts:raise ValueError('Physical attempt ledger mismatch')
    receipt=search.get('receipt');status=search.get('search_status')
    if status not in {'verified','unknown','budget_exhausted'} or (status=='verified')!=(receipt is not None):raise ValueError('Unbound proof status')
    observed=None
    if receipt:
     if receipt.get('goal_sha256')!=digest(goal) or receipt.get('statement')!=candidate['lean']:raise ValueError('Retargeted proof')
     if receipt['format']=='pcs-std-baseline-proof-v1':
      if receipt['proof'] not in {'  repeat intro\n  '+t for t in STD_TACTICS}:raise ValueError('Unapproved producer tactics')
      observed=std._source('theorem pcs_study_replayed : '+candidate['lean']+' := by\n'+receipt['proof']+'\n#pcs_audit pcs_study_replayed\n','PCS_KERNEL:')
     else:
      if receipt.get('library')!=library or receipt.get('library_declarations')!=memory._declarations:raise ValueError('Untrusted producer memory/source')
      proof='\n'.join('  '+render_action(a) for a in receipt['actions'])
      if proof!=receipt['proof']:raise ValueError('Producer proof is not its approved typed actions')
      observed=memory.verify(goal,receipt['actions'])['kernel']
     if observed!=receipt['kernel'] or not set(observed['axioms'])<=ALLOWED_AXIOMS:raise ValueError('Independent type/axiom audit differs')
     proofs+=1
    rows.append({'case':case['id'],'method':method,'status':status,'independent_proof_replayed':observed is not None,'axioms':observed['axioms'] if observed else None,'search_lean_attempts':attempts,'authored_control':case['authored_control']})
 finally:memory.close();std.close()
 metrics={m:{'cases':sum(r['method']==m for r in rows),'verified':sum(r['method']==m and r['status']=='verified' for r in rows),'search_lean_attempts':sum(r['search_lean_attempts'] for r in rows if r['method']==m)} for m in p['methods']}
 return {'format':'pcs-study-independent-receiving-v1','protocol_sha256':sha,'cases':len(p['cases']),'methods':len(p['methods']),'independently_compiled_proofs':proofs,'fresh_inference':False,'physical_resource_claims_independently_attested':False,'metrics':metrics,'rows':rows,'pcs_authority':False}

def verify_negative_controls(core):
 trusted_source(core);sys.path.insert(0,str(core))
 from pcs.experimental.prover.memory_cost import MeasuredMemoryEnvironment
 from pcs.experimental.prover.memory_falsify import check_witness
 protocol=strict((ROOT/'research/proof-search-prospective-v1/protocol.json').read_bytes())
 artifact=strict((ROOT/'research/proof-search-prospective-v1/negative-controls.json').read_bytes())
 expected={c['id']:c for c in protocol['cases'] if c['authored_control']=='negative'}
 if artifact['source']!=protocol['core_revision'] or [r['case'] for r in artifact['rows']]!=list(expected):raise ValueError('Negative control membership differs')
 env=MeasuredMemoryEnvironment(None,timeout=30)
 try:
  for row in artifact['rows']:
   actual=check_witness(env,expected[row['case']]['goal'],row['receipt']['witness'])
   if actual!=row['receipt']:raise ValueError('Fresh counterexample replay differs')
 finally:env.close()
 return {'checked_false_controls':len(expected),'axioms':[r['receipt']['kernel']['axioms'] for r in artifact['rows']],'pcs_authority':False}
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);p.add_argument('--results',type=Path);p.add_argument('--negative-controls',action='store_true');a=p.parse_args()
 if a.negative_controls:result=verify_negative_controls(a.core.resolve())
 elif a.results:result=verify(a.core.resolve(),a.results.resolve())
 else:p.error('--results or --negative-controls required')
 print(json.dumps(result,indent=2))
