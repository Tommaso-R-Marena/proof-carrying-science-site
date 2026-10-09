import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {COUNTERMODEL_VERSION,replayCountermodelSession,initialWorld} from '../public/countermodel-core.mjs';
import {fitLocalSearchModel,fitSearchSessions,normalizeSearchSession,validateSearchModelJSON,evaluateSearchSessions} from '../public/countermodel-learning.mjs';
import {rankSearchActions} from '../public/countermodel-search-policy.mjs';
import {trainCountermodelSearchPolicy,evaluateCountermodelSearchPolicy} from '../scripts/train_countermodel_search_policy.mjs';
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const hashes={trainer_sha256:sha(readFileSync(new URL('../public/arena-countermodel.js',import.meta.url),'utf8')),
 fitter_sha256:sha(readFileSync(new URL('../public/countermodel-learning.mjs',import.meta.url),'utf8')),
 features_sha256:sha(readFileSync(new URL('../public/countermodel-search-policy.mjs',import.meta.url),'utf8'))};
const training={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'}]};
const heldOut={version:COUNTERMODEL_VERSION,mission_id:'quantifier-switch',actions:[{type:'add'},{type:'toggle',p:'P',i:0},{type:'check'}]};
const document=sessions=>({format:'pcs-countermodel-adult-optin-dataset-v1',entries:sessions.map(session=>({session,replay:replayCountermodelSession(session)}))});
test('local choices and verified owner export actually fit identical coefficients and evaluate identical held-out choices',async()=>{
 const local=await fitLocalSearchModel([training,heldOut],hashes),owner=trainCountermodelSearchPolicy(document([training,heldOut]));
 assert.deepEqual(local.weights,owner.weights);assert.deepEqual(local.training,owner.training);
 assert.equal(local.provenance.training_rows_sha256,owner.provenance.training_rows_sha256);
 assert.ok(local.weights.flat().some(x=>x!==0));assert.equal(local.weights.flat().length,486);
 assert.deepEqual(evaluateSearchSessions(local,[training,heldOut]),evaluateCountermodelSearchPolicy(owner,document([training,heldOut])));
 assert.equal(evaluateSearchSessions(local,[training,heldOut]).examples,3);
 assert.match(local.provenance.data_origin,/private local/);assert.notEqual(local.model_digest_sha256,owner.model_digest_sha256);
});
test('training is deterministic and evaluation choices never alter weights, counts or training digest',async()=>{
 assert.deepEqual(await fitLocalSearchModel([training],hashes),await fitLocalSearchModel([training,heldOut],hashes));
 assert.deepEqual(await fitLocalSearchModel([training],hashes),await fitLocalSearchModel([training],hashes));
 assert.equal(evaluateSearchSessions(await fitLocalSearchModel([training],hashes),[training]).model_accuracy,null);
});
test('walkthrough and model-hint notebooks are excluded from both fitting and evaluation',async()=>{
 const assisted={...training,actions:[{type:'hint'},...training.actions]};
 const assistedHeldOut={...heldOut,actions:[{type:'hint'},...heldOut.actions]};
 const model=await fitLocalSearchModel([training],hashes);
 assert.deepEqual(model,await fitLocalSearchModel([training,assisted,assistedHeldOut],hashes));
 assert.equal(evaluateSearchSessions(model,[assistedHeldOut]).examples,0);
 assert.throws(()=>fitSearchSessions([assisted]),/refusing to invent/);
});
test('empty, unsuccessful, forged and oversized collections never fabricate a model',()=>{
 for(const sessions of [[],[heldOut],[{...training,actions:[{type:'check'}]}],[{...training,score:999}],Array(201).fill(training)]){
  assert.throws(()=>fitSearchSessions(sessions));
 }
});
test('semantically identical reordered notebooks deduplicate before fitting',()=>{
 const reordered={actions:[{i:0,p:'P',type:'toggle'},{type:'check'}],mission_id:training.mission_id,version:training.version};
 assert.deepEqual(normalizeSearchSession(reordered).session,normalizeSearchSession(training).session);
 assert.deepEqual(fitSearchSessions([training]),fitSearchSessions([training,reordered]));
});
test('real local and owner artifacts round-trip through the strict import validator',async()=>{
 const local=await fitLocalSearchModel([training],hashes),owner=trainCountermodelSearchPolicy(document([training]));
 for(const model of [local,owner])assert.deepEqual(await validateSearchModelJSON(JSON.stringify(model),{featuresSHA256:hashes.features_sha256}),model);
 const ranked=rankSearchActions(local,'implication-flip',initialWorld(),false);
 assert.deepEqual(ranked[0].action,{type:'toggle',p:'P',i:0});
 assert.ok(ranked.every(row=>!Object.hasOwn(row,'verdict')));
});
test('tampering, duplicate fields and unexpected participant metadata reject before use',async()=>{
 const model=await fitLocalSearchModel([training],hashes),options={featuresSHA256:hashes.features_sha256};
 const altered=structuredClone(model);altered.weights[0][0]+=1;
 await assert.rejects(validateSearchModelJSON(JSON.stringify(altered),options),/digest/);
 await assert.rejects(validateSearchModelJSON(JSON.stringify({...model,email:'fixture@example.invalid'}),options),/fields/);
 const duplicate=JSON.stringify(model).replace('"authority":','"authority":"NONE_UNTRUSTED_BEHAVIOR_CLONING","authority":');
 await assert.rejects(validateSearchModelJSON(duplicate,options),/Duplicate/);
 await assert.rejects(validateSearchModelJSON(' '.repeat(65537),options),/byte budget/);
 await assert.rejects(validateSearchModelJSON('{"__proto__":{}}',options),/Reserved/);
});
test('rebinding a digest cannot bypass schema, numerical, feature or training-family restrictions',async()=>{
 const model=await fitLocalSearchModel([training],hashes),options={featuresSHA256:hashes.features_sha256};
 const mutations=[m=>m.authority='LEAN_PASS',m=>m.weights[0][0]=1e100,m=>m.weights[0].pop(),
  m=>m.training.task_ids=['quantifier-switch'],m=>m.training.action_counts[0]++,m=>m.training.examples=0,
  m=>m.provenance.evaluation_examples_used_for_training=1,m=>m.provenance.hint_assisted_episodes_used_for_training=1,
  m=>m.provenance.features_sha256='a'.repeat(64),m=>m.ruleset_sha256='b'.repeat(64)];
 for(const mutate of mutations){const m=structuredClone(model);mutate(m);const {model_digest_sha256,...body}=m;m.model_digest_sha256=sha(body);
  await assert.rejects(validateSearchModelJSON(JSON.stringify(m),options));
 }
});
