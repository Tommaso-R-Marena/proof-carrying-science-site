#!/usr/bin/env python3
"""Check frozen artifact membership, provenance and regenerated public counts."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];STUDY=ROOT/'research/proof-search-prospective-v1'
def check():
 manifest=json.loads((STUDY/'artifacts.json').read_text())
 actual={p.relative_to(STUDY).as_posix() for p in STUDY.rglob('*.json') if p.name!='artifacts.json'}|{'protocol.sha256'}
 if set(manifest['files'])!=actual:raise ValueError('Study artifact closure differs')
 for name,sha in manifest['files'].items():
  if hashlib.sha256((STUDY/name).read_bytes()).hexdigest()!=sha:raise ValueError('Study artifact bytes changed: '+name)
 p=json.loads((STUDY/'protocol.json').read_text());public=json.loads((ROOT/'public/proof-search-evaluation.json').read_text());paired=[]
 if hashlib.sha256((STUDY/'protocol.json').read_bytes()).hexdigest()!=public['protocol_sha256']:raise ValueError('Protocol commitment differs')
 for run in ['run-1','run-2']:
  folder=STUDY/run;source=json.loads((folder/'evaluator-source.json').read_text())
  original=subprocess.check_output(['git','show',source['runner_commit']+':scripts/run_proof_search_evaluation.py'],cwd=ROOT)
  if hashlib.sha256(original).hexdigest()!=source['runner_sha256']:raise ValueError('Recorded evaluator source provenance differs')
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
