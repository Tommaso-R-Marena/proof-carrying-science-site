import test from 'node:test';import assert from 'node:assert/strict';
import {COUNTERMODEL_VERSION,replayCountermodelSession,initialWorld} from '../public/countermodel-core.mjs';
import {rankSearchActions,SEARCH_DIMENSION,searchFeatures} from '../public/countermodel-search-policy.mjs';
import {trainCountermodelSearchPolicy,evaluateCountermodelSearchPolicy} from '../scripts/train_countermodel_search_policy.mjs';
const session=(mission='implication-flip',actions=[{type:'toggle',p:'P',i:0},{type:'check'}])=>({version:COUNTERMODEL_VERSION,mission_id:mission,actions});
const entry=s=>({session:s,replay:replayCountermodelSession(s)});
const training=entry(session());
const evaluation=entry(session('quantifier-switch',[{type:'add'},{type:'toggle',p:'P',i:0},{type:'check'}]));
const document=(...entries)=>({format:'pcs-countermodel-adult-optin-dataset-v1',entries});
test('actually fits nonzero weights from independently replayed choices and reports real provenance',()=>{
 const model=trainCountermodelSearchPolicy(document(training));
 assert.equal(model.training.examples,2);assert.deepEqual(model.training.task_ids,['implication-flip']);
 assert.ok(model.weights.flat().some(x=>x!==0));assert.deepEqual(model,trainCountermodelSearchPolicy(document(training)));
 assert.equal(model.provenance.evaluation_examples_used_for_training,0);
 assert.equal(model.authority,'NONE_UNTRUSTED_BEHAVIOR_CLONING');
 assert.equal(searchFeatures('implication-flip',initialWorld(),false).length,SEARCH_DIMENSION);
});
test('held-out trajectories do not affect weights, training digest, or any fitting metadata',()=>{
 assert.deepEqual(trainCountermodelSearchPolicy(document(training)),trainCountermodelSearchPolicy(document(training,evaluation)));
 const m=trainCountermodelSearchPolicy(document(training));const report=evaluateCountermodelSearchPolicy(m,document(training,evaluation));
 assert.equal(report.examples,3);assert.deepEqual(report.evaluation_task_ids,['quantifier-switch']);
 assert.ok(report.uniform_random_expected_correct>0);assert.equal(report.authority,'NONE');
 assert.equal(evaluateCountermodelSearchPolicy(m,document(training)).model_accuracy,null);
});
test('hint-assisted episodes are completely excluded and missing training data is an error',()=>{
 const hinted=entry(session('negation-drop',[{type:'hint'},{type:'toggle',p:'P',i:0},{type:'check'}]));
 assert.deepEqual(trainCountermodelSearchPolicy(document(training)),trainCountermodelSearchPolicy(document(training,hinted)));
 assert.throws(()=>trainCountermodelSearchPolicy(document(evaluation)),/refusing to invent/);
 assert.throws(()=>trainCountermodelSearchPolicy(document(hinted)),/refusing to invent/);
});
test('forged labels and participant fields fail closed before fitting',()=>{
 const bad=structuredClone(training);bad.replay.score=999;
 assert.throws(()=>trainCountermodelSearchPolicy(document(bad)),/mismatch/);
 bad.replay=training.replay;bad.email='participant@example.invalid';
 assert.throws(()=>trainCountermodelSearchPolicy(document(bad)),/personal/);
});
test('ranker proposes only legal actions and never returns a verifier verdict',()=>{
 const m=trainCountermodelSearchPolicy(document(training)),world=initialWorld();
 for(const id of ['implication-flip','quantifier-scope']){
  const ranked=rankSearchActions(m,id,world);assert.ok(ranked.length>0);
  assert.ok(ranked.every(row=>row.action.type!=='remove'&&row.action.type!=='hint'));
  assert.ok(ranked.every(row=>!Object.hasOwn(row,'counterexample')));
 }
 assert.throws(()=>rankSearchActions({...m,weights:[]},'implication-flip',world),/Invalid/);
});
