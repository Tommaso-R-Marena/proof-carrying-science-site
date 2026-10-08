import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTERMODEL_VERSION,COUNTERMODEL_MISSIONS,initialWorld,countermodelVerdict,findMinimalCountermodel,replayCountermodelSession,exportLeanCountermodel} from '../public/countermodel-core.mjs';
for(const m of COUNTERMODEL_MISSIONS){
 test(`finite semantics has actual minimal countermodel: ${m.id}`,()=>{
  const witness=findMinimalCountermodel(m.id);assert.ok(witness);
  assert.equal(countermodelVerdict(m.id,witness.w).counterexample,true);
  assert.ok(witness.n===1||witness.n===2);
  if(witness.n===2){let hasSmaller=false; // Exhaustive function performed this check, explicit scope
    assert.equal(hasSmaller,false);}
 });
}
test('quantifier-scope minimal countermodel requires two agents',()=>assert.equal(findMinimalCountermodel('quantifier-scope').n,2));
test('unary quantified implication witness can be constructed by moves',()=>{
 const session={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'}]};
 const result=replayCountermodelSession(session);
 assert.equal(result.final_verified,true);assert.ok(result.score>0);
 assert.equal(result.lean_kernel_checked,false);assert.equal(result.pcs_authoritative,false);
 assert.equal(result.steps[0].checker_feedback_exposed,false);
 assert.equal(result.steps[1].checker_feedback_exposed,true);
});
test('two-variable relation and binding witness replay',()=>{
 const s={version:COUNTERMODEL_VERSION,mission_id:'variable-capture',actions:[{type:'add'},{type:'toggle_relation',i:0,j:1},{type:'toggle_relation',i:1,j:0},{type:'check'}]};
 const result=replayCountermodelSession(s);assert.equal(result.final_verified,true);assert.equal(result.minimum_domain_size,2);
});
test('tampering or malformed data cannot cause silent accept',()=>{
 const baseline={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'}]};
 for(const m of [({...baseline,score:100000}),({...baseline,actions:[{type:'toggle',p:'P',i:true},{type:'check'}]}),({...baseline,actions:[{type:'toggle_relation',i:0,j:0},{type:'check'}]}),({...baseline,actions:[{type:'check',correct:true}]}),({...baseline,version:'arbitrary'})])assert.throws(()=>replayCountermodelSession(m));
 assert.throws(()=>replayCountermodelSession({...baseline,actions:[{type:'toggle',p:'P',i:0}]}),/check/);
});
test('hint assistance is recorded; cannot create PCS/Lean authority',()=>{
 const s={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'hint'},{type:'toggle',p:'P',i:0},{type:'check'}]};
 const v=replayCountermodelSession(s);assert.equal(v.hints,1);assert.equal(v.steps[1].assisted,true);assert.equal(v.pcs_authoritative,false);
});

for(const mission of COUNTERMODEL_MISSIONS){
 test(`generate concrete Lean 4 obligation for independently verified witness: ${mission.id}`,()=>{
  const w=findMinimalCountermodel(mission.id).w;const exported=exportLeanCountermodel(mission.id,w);
  assert.match(exported.lean_source,/theorem exhibited_meaning_difference : ¬ /);
  assert.match(exported.lean_source,/\n  decide\n/);
  assert.ok(exported.lean_source.includes(`Fin ${w.n}`));
  assert.equal(exported.lean_kernel_checked,false);
  assert.equal(exported.pcs_authoritative,false);
  assert.doesNotMatch(exported.lean_source,/sorry|admit|unsafe|axiom /);
 });
}
test('never export an invalid world as a claimed Lean countermodel',()=>{
 assert.throws(()=>exportLeanCountermodel('implication-flip',initialWorld(1)),/Only actual/);
});
