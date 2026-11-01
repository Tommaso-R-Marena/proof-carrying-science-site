#!/usr/bin/env python3
"""Freeze authored post-checkpoint cases before running any search. No training."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def outer_alpha(goal):
 names={b['name']:'v'+str(i) for i,b in enumerate(goal['binders'])}
 def rec(value):
  if isinstance(value,list):return [rec(v) for v in value]
  if not isinstance(value,dict):return value
  return {k:(names.get(v,v) if k=='name' and isinstance(v,str) else rec(v)) for k,v in value.items()}
 return rec(goal)
def known_goals(core):
 known=set();files=[]
 for family in ['lean-learning-v2','checked-reuse-v2','induction-abstraction-v2','verified-memory-v1']:
  for path in sorted((core/'research'/family).rglob('*.json')):
   if path.stat().st_size>50_000_000:raise ValueError('Corpus file bound')
   raw=path.read_bytes();files.append({'path':path.relative_to(core).as_posix(),'sha256':hashlib.sha256(raw).hexdigest()})
   def walk(v):
    if isinstance(v,dict):
     if v.get('format')=='pcs-math-ir-v1' and 'binders' in v and 'body' in v:known.add(digest(outer_alpha(v)))
     for child in v.values():walk(child)
    elif isinstance(v,list):
     for child in v:walk(child)
   walk(json.loads(raw))
 return known,files

def freeze(core):
 revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=core,text=True).strip()
 sys.path.insert(0,str(core))
 from pcs.experimental.prover.induction_language import formalize
 known,corpus=known_goals(core);cases=[];seen=set(known)
 candidates=[]
 # Numbers and combinations chosen after the released checkpoints froze.
 for k in range(2,9):
  candidates.extend([
   ('arithmetic','positive',f'For all natural numbers a and b, if (a + {k}) equals (b + {k}) then (a + 0) equals b.'),
   ('arithmetic','negative',f'For all natural numbers a, (a + {k}) equals (a + {k+1}).'),
   ('logic','positive',f'For all propositions P and Q, if (P and Q) then '+('('*(k-1)+'P and '*(k-1)+'Q'+')'*(k-1))+'.'),
  ])
 for tail in ['(A and (B and C))','((C and A) and B)','((A and C) and (B and A))']:
  candidates.append(('logic','positive','For all propositions A, B and C, if ((A and B) and C) then '+tail+'.'))
 candidates.extend([
  ('lists','positive','For all lists of natural numbers xs and ys, the length of (the reversal of (xs appended to ys)) equals (the length of xs + the length of ys).'),
  ('lists','positive','For all lists of natural numbers xs and ys, the reversal of (the reversal of (xs appended to ys)) equals (xs appended to ys).'),
  ('lists','positive','For all lists of natural numbers xs and ys, if (the reversal of xs) equals (the reversal of ys) then (xs appended to xs) equals (ys appended to ys).'),
 ])
 selected={'arithmetic':0,'logic':0,'lists':0};negatives=0;unsupported=0
 for family,control,statement in candidates:
  parsed=formalize(statement)
  if parsed['status']!='supported':unsupported+=1;continue
  goal=parsed['candidates'][0]['ir'];identity=digest(outer_alpha(goal))
  if identity in seen:continue
  if control=='negative':
   if negatives>=3:continue
   negatives+=1
  else:
   if selected[family]>={'arithmetic':4,'logic':5,'lists':3}[family]:continue
   selected[family]+=1
  seen.add(identity);cases.append({'id':'case-'+str(len(cases)+1).zfill(2),'family':family,'authored_control':control,'statement':statement,'goal':goal,'goal_sha256':parsed['candidates'][0]['interpretation_sha256'],'outer_alpha_sha256':identity})
 if len(cases)<12:raise ValueError('Too few disjoint supported cases: '+str(selected))
 registry=json.loads((core/'research/verified-memory-v1/registry.json').read_text());entry=next(x for x in registry['models'] if x['id']==registry['selected_local_experiment'])
 return {'format':'pcs-prospective-proof-search-protocol-v1','core_revision':revision,'checkpoint':entry,'case_count':len(cases),'cases':cases,'corpus_sources':corpus,'known_outer_alpha_goals':len(known),'unsupported_candidate_count':unsupported,
 'methods':['frozen_neural','same_memory_structural','std_then_structural'],'budget':{'action_expansions':32,'search_lean_attempts':64,'case_wall_seconds_including_setup':120,'independent_replay_wall_seconds':90,'beam':4,'depth':18},
 'selection':'first supported outer-binder-alpha-disjoint candidates in frozen generator order; no search used in selection','success':'fresh independently replayed proof; unknown, timeout and rejected replay remain failures','cache':'shared prewarmed compiled trusted modules; fresh environment and observation cache per case/method','limitations':['authored prospective cases, not independently blind','outer-binder-alpha disjointness does not establish conceptual novelty or exclusion from all historical data','equal external wall/call caps do not equate tactic internal work to one neural proposal','no fitting or checkpoint selection against these cases','negative controls are authored expectations, not axioms'], 'training_authorized':False,'pcs_authority':False}
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);a=p.parse_args();protocol=freeze(a.core.resolve());dest=ROOT/'research/proof-search-prospective-v1';dest.mkdir(parents=True,exist_ok=True);raw=(json.dumps(protocol,indent=2,sort_keys=True,ensure_ascii=False)+'\n').encode();target=dest/'protocol.json'
 if target.exists():raise SystemExit('Frozen protocol exists; create a new version instead of overwriting it')
 target.write_bytes(raw);(dest/'protocol.sha256').write_text(hashlib.sha256(raw).hexdigest()+'  protocol.json\n');print(json.dumps({'cases':len(protocol['cases']),'known_goals_excluded':protocol['known_outer_alpha_goals'],'sha256':hashlib.sha256(raw).hexdigest()}))
