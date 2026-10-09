import test from 'node:test';import assert from 'node:assert/strict';
import {mastery,expedition,dailyMission,explainWorld} from '../public/countermodel-expedition.mjs';
import {COUNTERMODEL_VERSION,COUNTERMODEL_MISSIONS,initialWorld,countermodelVerdict,findMinimalCountermodel} from '../public/countermodel-core.mjs';
const session=actions=>({version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions});
test('mastery comes from a real checked trajectory, assistance cannot earn independent badges',()=>{
 const moves=[{type:'toggle',p:'P',i:0},{type:'check'}];assert.deepEqual(mastery(session(moves)),{mission_id:'implication-flip',discovered:true,minimal:true,independent:true,precise:true});
 const assisted=mastery(session([{type:'hint'},...moves]));assert.equal(assisted.independent,false);assert.equal(assisted.precise,false);
 assert.equal(mastery(session([{type:'check'}])).discovered,false);
 assert.throws(()=>mastery({...session(moves),score:999}));
 const progress=expedition([session(moves),session(moves)]);assert.equal(progress.completed,1);assert.equal(progress.mastery,3);assert.throws(()=>expedition(Array(201).fill(session(moves))));
});
test('daily deck is deterministic, covers every mission, rejects invalid dates',()=>{
 const dates=Array.from({length:7},(_,i)=>`2026-10-${String(9+i).padStart(2,'0')}`);assert.equal(new Set(dates.map(dailyMission)).size,7);assert.equal(dailyMission(dates[0]),dailyMission(dates[0]));assert.throws(()=>dailyMission('2026-02-30'));
});
test('explanation evaluates quantifiers and binding in actual winning and losing worlds',()=>{
 for(const m of COUNTERMODEL_MISSIONS)for(const world of [initialWorld(),findMinimalCountermodel(m.id).w]){
  const e=explainWorld(m.id,world),v=countermodelVerdict(m.id,world);assert.equal(e.left.value,v.left);assert.equal(e.right.value,v.right);assert.equal(e.counterexample,v.counterexample);
  assert.ok(e.left.children.length);assert.ok(e.left.label.length);
 }
 assert.throws(()=>explainWorld('fake',initialWorld()));assert.throws(()=>explainWorld('implication-flip',{...initialWorld(),P:[1]}));
});
