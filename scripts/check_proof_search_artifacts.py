#!/usr/bin/env python3
"""Check frozen artifact membership, provenance and regenerated public counts."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];STUDY=ROOT/'research/proof-search-prospective-v1'
def restore_provenance(repo=ROOT):
 # Import Git objects only. Never check out or execute archived producer code.
 # The bundle's SHA-256 is checked by the artifact closure before this call.
 bundle=STUDY/'original-source.bundle'
 expected='8d872cc6dc401dc3b1ebd7e228ab9cab45752b2a refs/pcs-provenance/prospective-evaluation-v1'
 heads=subprocess.check_output(['git','bundle','list-heads',str(bundle)],cwd=repo,text=True).strip()
 if heads!=expected:raise ValueError('Unexpected archived provenance ref')
 subprocess.run(['git','bundle','verify',str(bundle)],cwd=repo,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 subprocess.run(['git','bundle','unbundle',str(bundle)],cwd=repo,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 frozen=subprocess.check_output(['git','show','f3549c30921ea2e1527b10d9f43bb0700e10ff39:research/proof-search-prospective-v1/protocol.json'],cwd=repo)
 if frozen!=(STUDY/'protocol.json').read_bytes():raise ValueError('Original protocol commit bytes differ')
def check():
 manifest=json.loads((STUDY/'artifacts.json').read_text())
 actual={p.relative_to(STUDY).as_posix() for p in STUDY.rglob('*') if p.is_file() and p.relative_to(STUDY).as_posix() not in {'artifacts.json','README.md'}}
 if set(manifest['files'])!=actual:raise ValueError('Study artifact closure differs')
 for name,sha in manifest['files'].items():
  if hashlib.sha256((STUDY/name).read_bytes()).hexdigest()!=sha:raise ValueError('Study artifact bytes changed: '+name)
 restore_provenance()
 p=json.loads((STUDY/'protocol.json').read_text());public=json.loads((ROOT/'public/proof-search-evaluation.json').read_text());paired=[]
 if hashlib.sha256((STUDY/'protocol.json').read_bytes()).hexdigest()!=public['protocol_sha256']:raise ValueError('Protocol commitment differs')
 for run in ['run-1','run-2']:
  folder=STUDY/run;source=json.loads((folder/'evaluator-source.json').read_text())
  original=subprocess.check_output(['git','show',source['runner_commit']+':scripts/run_proof_search_evaluation.py'],cwd=ROOT)
  if hashlib.sha256(original).hexdigest()!=source['runner_sha256']:raise ValueError('Recorded evaluator source provenance differs')
  subprocess.run(['git','merge-base','--is-ancestor',source['protocol_freeze_commit'],source['runner_commit']],cwd=ROOT,check=True)
  rows=[json.loads((folder/(c['id']+'-'+m+'.json')).read_text()) for c in p['cases'] for m in p['methods']]
  paired.append([(r['case'],r['method'],r['search_status'],r['search_lean_attempts']) for r in rows])
  for m in p['methods']:
   subset=[r for r in rows if r['method']==m];solved=[r['case'] for r in subset if r['search_status']=='verified'];negative={c['id'] for c in p['cases'] if c['authored_control']=='negative'}
   metrics={'cases':len(subset),'negative_controls_proved':len(set(solved)&negative),'search_lean_attempts':sum(r['search_lean_attempts'] for r in subset),'unknown_or_failed':len(subset)-len(solved),'verified':len(solved)}
   if metrics!=public['methods'][m] or solved!=public['paired_solved_cases'][m]:raise ValueError('Public study metrics differ from raw records')
 if paired[0]!=paired[1]:raise ValueError('Claimed repeat outcomes differ')
 learned=set(public['paired_solved_cases']['frozen_neural'])
 for method,key in [('same_memory_structural','neural_unique_solve_gain_over_structural'),('std_then_structural','neural_unique_solve_gain_over_strong_baseline')]:
  if len(learned-set(public['paired_solved_cases'][method]))!=public[key]:raise ValueError('Public unique gain differs')
 if public['unique_cases']!=len(p['cases']) or public['physical_search_runs']!=len(paired)*len(paired[0]) or public['training_performed'] or public['pcs_authority']:raise ValueError('Public study scope differs')
 return {'artifact_files':len(actual),'unique_cases':len(p['cases']),'physical_search_runs':sum(map(len,paired)),'public_metrics_regenerated':True,'kernel_replay_performed_by_this_check':False}
if __name__=='__main__':print(json.dumps(check()))
