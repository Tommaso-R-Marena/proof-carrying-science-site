"""Curated external-source boundary audit, frozen weights; no training or selection."""
import gzip,hashlib,json,subprocess,time
from pathlib import Path
from pcs.experimental.prover.language import formalize
from pcs.experimental.prover.library import LibraryEnvironment
from pcs.experimental.prover.environment import search
from pcs.experimental.prover.portfolio import _BasicActionView,search_portfolio
from pcs.experimental.prover.reuse_model import ReuseNetwork
from pcs.experimental.prover.reuse_experiment import metrics
from pcs.experimental.prover.ir import theorem,digest

root=Path('/workspace/proof-carrying-science');out=Path('/workspace/.onboarding/checked-reuse-external-audit');out.mkdir(exist_ok=False)
folder=root/'research/checked-reuse-v2';registry=json.loads((folder/'registry.json').read_text());entry=next(e for e in registry['models'] if e['id']==registry['selected_local_experiment'])
rows=[
 ('Nat.two_mul_ne_two_mul_add_one','Mathlib/Data/Nat/Init.lean','For all natural numbers m and n, not (2 * n equals 2 * m + 1).','intro m n\n  exact Nat.two_mul_ne_two_mul_add_one (m := m) (n := n)'),
 ('Imp.swap','Mathlib/Logic/Basic.lean','For all propositions A, B and C, (A implies (B implies C)) if and only if (B implies (A implies C)).','intro A B C\n  exact Imp.swap'),
 ('not_imp_self','Mathlib/Logic/Basic.lean','For all propositions A, (not A implies A) if and only if A.','intro A\n  exact not_imp_self'),
 ('Nat.div_right_comm','Mathlib/Data/Nat/Basic.lean','For all natural numbers a, b and c, a / b / c equals a / c / b.',None),
 ('Int.gcd_emod','Mathlib/Data/Int/Basic.lean','For all integers m and n, gcd(m % n, n) equals gcd(m, n).',None),
]
mathlib=root/'.lake/packages/mathlib';revision=subprocess.check_output(['git','-C',str(mathlib),'rev-parse','HEAD'],text=True).strip();assert revision=='8f9d9cff6bd728b17a24e163c9402775d9e6a365'
tasks=[]
for name,path,source,proof in rows:
 parsed=formalize(source)
 tasks.append({'id':name,'project':'https://github.com/leanprover-community/mathlib4','revision':revision,'source_file':path,'source_file_sha256':hashlib.sha256((mathlib/path).read_bytes()).hexdigest(),'license':'Apache-2.0','statement':source,'formalization':parsed,'formal_label_bridge':proof})
protocol={'checkpoint_sha256':entry['sha256'],'tasks_sha256':digest(tasks),'budget':64,'beam':4,'scope':'Curated Mathlib statement specializations; shared elementary domains, not unseen whole-project automation or a blind private benchmark. Independent Mathlib bridges establish supported statements, not general English semantic fidelity. Two richer syntax probes must abstain. No task solutions enter the policy or its retrieval library. No training or model selection.','source_core_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'financial_spend':0}
(out/'protocol.json').write_text(json.dumps(protocol,indent=2));(out/'tasks.json').write_text(json.dumps(tasks,indent=2));(out/'audit-source.py').write_bytes(Path(__file__).read_bytes())
bridge='import Mathlib.Data.Nat.Basic\nimport Mathlib.Logic.Basic\n'
for i,t in enumerate(tasks):
 if t['formal_label_bridge']:
  assert t['formalization']['status']=='supported'
  goal=t['formalization']['candidates'][0]['ir'];bridge+=f"theorem external_grounding_{i} : {theorem(goal)} := by\n  {t['formal_label_bridge']}\n#print axioms external_grounding_{i}\n"
 else:assert t['formalization']['status']=='unsupported'
(out/'Grounding.lean').write_text(bridge)
grounding=subprocess.run(['lake','env','lean',str(out/'Grounding.lean')],cwd=root,capture_output=True,text=True,timeout=300)
(out/'grounding.log').write_text(grounding.stdout+grounding.stderr);assert grounding.returncode==0,grounding.stdout+grounding.stderr
model=ReuseNetwork.load(folder/entry['checkpoint'],entry['sha256']);env=LibraryEnvironment(json.loads((folder/'library.json').read_text()),timeout=30)
try:
 begin=time.monotonic();results={};summaries={}
 for name,runner in [('raw_refined',lambda g:search(env,g,model.rank,budget=64,beam=4)),('symbolic',lambda g:search(_BasicActionView(env),g,budget=64,beam=4)),('portfolio',lambda g:search_portfolio(env,g,model.rank,budget=64,beam=4))]:
  env.observations.clear();records=[]
  for task in tasks:
   if task['formalization']['status']!='supported':continue
   goal=task['formalization']['candidates'][0]['ir'];result=runner(goal)
   records.append({'id':task['id'],'goal':goal,'result':result});print(name,task['id'],result['status'],result['expansions'],flush=True)
  results[name]=records;summaries[name]=metrics(records)
 (out/'evaluations.json.gz').write_bytes(gzip.compress(json.dumps(results,sort_keys=True,separators=(',',':')).encode(),mtime=0))
 summary={'metrics':summaries,'supported_tasks':3,'unsupported_abstentions':2,'grounding_kernel_checked':True,'wall_seconds':time.monotonic()-begin,'financial_spend':0,'gpu_used':False,'scope':protocol['scope']}
 (out/'summary.json').write_text(json.dumps(summary,indent=2));print(json.dumps(summary),flush=True)
 (out/'SHA256.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()},indent=2))
finally:env.close()
