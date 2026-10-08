import test from 'node:test';
import assert from 'node:assert/strict';
import {GAUNTLET_TASKS,getGauntletTask,worldFromBits,gauntletVerdict} from '../public/semantic-gauntlet-core.mjs';
import {REPAIR_VERSION,repairRequestForTask,validateRepairFormula,listRepairMoves,
 finiteRepairCheck,analyzeSemanticRepair,recheckSemanticRepair} from '../public/semantic-repair-core.mjs';
const copy=x=>structuredClone(x);
function reference(formula,world,vars={}){
 const domain=Array.from({length:world.n},(_,i)=>i);
 switch(formula.op){
 case 'pred':return world.unary[formula.name][vars[formula.x]];
 case 'rel':return world.binary[formula.name][vars[formula.x]][vars[formula.y]];
 case 'eq':return vars[formula.x]===vars[formula.y];
 case 'not':return reference(formula.f,world,vars)===false;
 case 'and':return reference(formula.a,world,vars)&&reference(formula.b,world,vars);
 case 'or':return reference(formula.a,world,vars)||reference(formula.b,world,vars);
 case 'imp':return !reference(formula.a,world,vars)||reference(formula.b,world,vars);
 case 'forall':return domain.every(i=>reference(formula.f,world,{...vars,[formula.x]:i}));
 case 'exists':return domain.some(i=>reference(formula.f,world,{...vars,[formula.x]:i}));
 default:throw Error('Unknown test formula');
 }
}
function allWorlds(task){
 const worlds=[];
 for(let n=1;n<=task.bound;n++){
  const bits=task.symbols.unary.length*n+task.symbols.binary.length*n*n;
  for(let mask=0;mask<2**bits;mask++)worlds.push(worldFromBits(task,n,mask));
 }
 return worlds;
}
test('typed and grounded formula validation rejects false interpretations',()=>{
 const t=getGauntletTask('implication-reversal-1');const c=copy(t.candidate);
 assert.ok(validateRepairFormula(t,c)>0);
 let b=copy(c);b.op='exists';b.evil=true;assert.throws(()=>validateRepairFormula(t,b),/Malformed/);
 b=copy(c);b.f.a.name='Unknown';assert.throws(()=>validateRepairFormula(t,b),/grounded/);
 b=copy(c);b.f.a.x='z';assert.throws(()=>validateRepairFormula(t,b),/grounded/);
 b=copy(c);b.f.a={op:'forall',x:'x',f:b.f.a};assert.throws(()=>validateRepairFormula(t,b),/shadowing/);
 b=copy(c);b.f.a={op:'untrusted',something:'good'};assert.throws(()=>validateRepairFormula(t,b),/Unsupported/);
 assert.throws(()=>repairRequestForTask('nonexistent'),/Unknown/);
});
test('moves are actual single-node edits, preserve source signature, and are deterministic',()=>{
 for(const task of GAUNTLET_TASKS){
  const moves=listRepairMoves(task.id,task.candidate);
  assert.ok(moves.length<=80);
  assert.deepEqual(moves,listRepairMoves(task.id,task.candidate));
  const uniq=new Set();
  for(const m of moves){
   assert.equal(typeof m.operation,'string');assert.ok(Array.isArray(m.path));
   assert.ok(validateRepairFormula(task,m.formula)>0);
   const key=JSON.stringify(m.formula);assert.ok(!uniq.has(key));uniq.add(key);
   assert.notDeepEqual(m.formula,task.candidate);
  }
 }
});
test('finite checker agrees with independently written quantifier semantics on ALL finite worlds of 60 tasks',()=>{
 let checked=0;
 for(const task of GAUNTLET_TASKS){
  const oracle=finiteRepairCheck(task.id,task.candidate);
  assert.equal(oracle.equivalent_within_bound,allWorlds(task).every(w=>reference(task.source,w)===reference(task.candidate,w)));
  for(const world of allWorlds(task)){
   const a=gauntletVerdict(task,world);
   assert.equal(a.source,reference(task.source,world));
   assert.equal(a.candidate,reference(task.candidate,world));checked++;
  }
  if(!oracle.equivalent_within_bound){
   assert.equal(oracle.countermodel.n,oracle.minimum_countermodel_domain);
   assert.notEqual(reference(task.source,oracle.countermodel),reference(task.candidate,oracle.countermodel));
   assert.ok(allWorlds(task).filter(w=>w.n<oracle.minimum_countermodel_domain).every(w=>reference(task.source,w)===reference(task.candidate,w)));
  }
 }
 assert.ok(checked>=1000);
});
test('repairs use replayable AST patch sequences and independent finite-truth testing',()=>{
 for(const id of ['implication-reversal-1','universal-existential-1','negation-drop-1','self-equality-negated-1']){
  const input=repairRequestForTask(id,{max_edits:1,max_candidates:150});const r=analyzeSemanticRepair(input);
  assert.equal(r.search_status,'BOUNDED_REPAIR_FOUND',id);
  assert.ok(r.repairs.length>0);assert.equal(r.minimum_edits_found,1);
  for(const repair of r.repairs){
   assert.equal(repair.steps.length,1);
   assert.equal(repair.check.equivalent_within_bound,true);
   assert.equal(finiteRepairCheck(id,repair.candidate).equivalent_within_bound,true);
   assert.equal(repair.verification,'EXHAUSTIVE_FINITE_AGREEMENT_ONLY');
  }
  assert.deepEqual(recheckSemanticRepair(input,r).result,'REPLAY_MATCHED');
 }
});
test('already agreeing candidate is not misclassified as a repaired proof',()=>{
 const r=analyzeSemanticRepair(repairRequestForTask('alpha-renaming-1'));
 assert.equal(r.search_status,'ALREADY_AGREES_WITHIN_BOUND');assert.equal(r.kernel_checked,false);
 assert.equal(r.unbounded_equivalence_proved,false);assert.equal(r.repairs.length,0);
});
test('bounded search exhaustion never asserts universal impossibility',()=>{
 const r=analyzeSemanticRepair(repairRequestForTask('diagonal-variable-capture-1',{max_edits:1,max_candidates:150}));
 assert.equal(r.search_status,'NO_REPAIR_IN_ENUMERATED_EDITS');
 assert.equal(r.unbounded_equivalence_proved,false);
 assert.equal(r.initial_check.equivalent_within_bound,false);
});
test('budget-limited search is visibly not exhaustive',()=>{
 const r=analyzeSemanticRepair(repairRequestForTask('negation-drop-1',{max_edits:2,max_candidates:1}));
 assert.equal(r.search_exhaustive_within_edit_limit,false);
 assert.equal(r.examined_candidates,1);
 assert.ok(['CANDIDATE_BUDGET_EXHAUSTED','BOUNDED_REPAIR_FOUND'].includes(r.search_status));
});
test('tampered replay and parameter smuggling fail closed',()=>{
 const input=repairRequestForTask('implication-reversal-1',{max_edits:1,max_candidates:150});
 const report=analyzeSemanticRepair(input);
 let forged=copy(report);forged.repairs[0].candidate={op:'pred',name:'W',x:'x'};
 assert.throws(()=>recheckSemanticRepair(input,forged),/TAMPERED/);
 forged=copy(report);forged.kernel_checked=true;assert.throws(()=>recheckSemanticRepair(input,forged),/TAMPERED/);
 let tampered=copy(input);tampered.extraneous='bypass';assert.throws(()=>analyzeSemanticRepair(tampered),/Invalid repair request/);
 tampered=copy(input);tampered.max_candidates=700;assert.throws(()=>analyzeSemanticRepair(tampered),/Invalid bounded/);
 tampered=copy(input);tampered.max_edits=-1;assert.throws(()=>analyzeSemanticRepair(tampered),/Invalid bounded/);
});
test('every accepted repair remains consistent with independent oracle on all supported finite worlds',()=>{
 let found=0;
 for(const task of GAUNTLET_TASKS){
  const report=analyzeSemanticRepair(repairRequestForTask(task.id,{max_edits:1,max_candidates:120}));
  for(const repair of report.repairs){
   found++;
   for(const w of allWorlds(task)){
    assert.equal(reference(task.source,w),reference(repair.candidate,w),task.id);
   }
  }
 }
 assert.ok(found>=8,'Expected substantive repair coverage');
});
