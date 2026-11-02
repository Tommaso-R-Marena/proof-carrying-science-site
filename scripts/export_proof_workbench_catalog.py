#!/usr/bin/env python3
"""Export a bounded, source-bound interpretation catalog; never proof verdicts."""
import argparse,hashlib,json,re,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def catalog(core):
 sha=re.search(r'export const CORE_SHA = "([0-9a-f]{40})"',(ROOT/'src/lean-research.js').read_text())[1]
 if subprocess.check_output(['git','rev-parse','HEAD'],cwd=core,text=True).strip()!=sha:raise ValueError('Exact approved translator checkout required')
 sys.path.insert(0,str(core));from pcs.experimental.prover.induction_language import formalize
 specs=[
 ('combine','Reorder two requirements','For all propositions U and V, if (U and V) then (V and U).','prospective-hybrid-v2','If both requirements hold, their order does not change what follows.'),
 ('reuse','Keep a fact while reusing a conjunction','For all propositions U and V, if (U and V) then (U and (U and V)).','verified-memory-v1','Use one established fact twice while keeping the original pair.'),
 ('chain','Connect two rules','For all propositions P, Q and R, if ((P implies Q) and (Q implies R)) then (P implies R).','prospective-hybrid-v2','Assume the two rules. Does the first condition imply the final one?'),
 ('insufficient','Check an insufficient requirement','For all propositions P and Q, if (P or Q) then P.','verified-memory-v1','An alternative requirement may be too weak. A failed search alone cannot refute it.'),
 ('length','Count joined lists','For all lists of natural numbers xs and ys, the length of (xs appended to ys) equals (the length of xs + the length of ys).','induction-abstraction-v2','The length of two lists joined together is the sum of their lengths.'),
 ('reverse','Reverse a list twice','For all lists of natural numbers xs, the reversal of (the reversal of xs) equals xs.','induction-abstraction-v2','Investigate a concrete list identity under the mathematical list model.'),
 ]
 for left in range(9):
  for right in range(9):
   specs.append((f'offset-{left}-{right}',f'Compare offsets {left} and {right}',f'For all natural numbers n, (n + {left}) equals (n + {right}).','prospective-hybrid-v2' if left==right else 'verified-memory-v1','Check equality for every natural number, rather than a few numerical examples.'))
 rows=[]
 for identity,title,statement,family,meaning in specs:
  parsed=formalize(statement)
  if parsed['status']!='supported' or len(parsed['candidates'])!=1:raise ValueError('Unsupported workbench template '+identity)
  c=parsed['candidates'][0];rows.append({'id':identity,'title':title,'statement':statement,'meaning':meaning,'recommended_family':family,'goal':c['ir'],'lean':c['lean'],'goal_sha256':c['interpretation_sha256']})
 payload={'format':'pcs-proof-workbench-catalog-v1','core_revision':sha,'entries':rows,'browser_preview_runs_Lean':False,'semantic_authorization':False,'pcs_authority':False}
 payload['catalog_sha256']=hashlib.sha256(json.dumps({k:v for k,v in payload.items() if k!='core_revision'},sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
 return payload
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);p.add_argument('--write',action='store_true');a=p.parse_args();data=catalog(a.core.resolve());target=ROOT/'public/proof-workbench-catalog.json'
 if a.write:target.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')
 elif json.loads(target.read_text())!=data:raise SystemExit('Preview catalog differs from exact trusted translator')
 print(json.dumps({'entries':len(data['entries']),'core':data['core_revision'],'catalog_sha256':data['catalog_sha256']}))
