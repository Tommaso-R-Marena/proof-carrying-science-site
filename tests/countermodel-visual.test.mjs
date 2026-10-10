import test from 'node:test';
import assert from 'node:assert/strict';
import {inverseWorldEdit,plainMission} from '../public/countermodel-visual.mjs';
import {initialWorld,replayCountermodelSession,COUNTERMODEL_VERSION} from '../public/countermodel-core.mjs';

function actionsFor(w){
 const actions=Array.from({length:w.n-1},()=>({type:'add'}));
 for(let i=0;i<w.n;i++)for(let j=0;j<w.n;j++)if(w.R[i][j])actions.push({type:'toggle_relation',i,j});
 return actions;
}
test('remove/undo preserves every three-agent relation world and recorded assistance',()=>{
 for(let mask=0;mask<512;mask++){
  const before=initialWorld(3);for(let i=0;i<3;i++)for(let j=0;j<3;j++)before.R[i][j]=Boolean(mask&(1<<(i*3+j)));
  const actions=[{type:'hint'},...actionsFor(before),{type:'check'},{type:'remove'},...inverseWorldEdit({type:'remove'},before),{type:'check'}];
  const result=replayCountermodelSession({version:COUNTERMODEL_VERSION,mission_id:'quantifier-scope',actions});
  assert.deepEqual(result.final_world,before,'relation world '+mask);
  assert.equal(result.hints,1);assert.equal(result.checks,2);assert.equal(result.steps.length,actions.length);
 }
});
test('remove/undo preserves all three-agent P/Q assignments; inverse toggles remain real moves',()=>{
 for(let mask=0;mask<64;mask++){
  const before=initialWorld(3),actions=[{type:'add'},{type:'add'}];
  for(let i=0;i<3;i++)for(const [p,bit]of [['P',2*i],['Q',2*i+1]])if(mask&(1<<bit)){before[p][i]=true;actions.push({type:'toggle',p,i});}
  actions.push({type:'check'},{type:'remove'},...inverseWorldEdit({type:'remove'},before),{type:'check'});
  const result=replayCountermodelSession({version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions});
  assert.deepEqual(result.final_world,before);assert.equal(result.checks,2);
 }
 const toggle={type:'toggle',p:'P',i:0};
 const r=replayCountermodelSession({version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[toggle,{type:'check'},...inverseWorldEdit(toggle,initialWorld()),{type:'check'}]});
 assert.deepEqual(r.final_world,initialWorld());assert.equal(r.final_verified,false);assert.equal(r.edits,2);
});
test('undo cannot silently drop hint or checker actions',()=>{
 for(const action of [{type:'hint'},{type:'check'},{type:'remove'},{type:'erase'}])assert.throws(()=>inverseWorldEdit(action,initialWorld()));
 assert.throws(()=>plainMission('unknown'));
});
