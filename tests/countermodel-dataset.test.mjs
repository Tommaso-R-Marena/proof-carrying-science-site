import test from 'node:test';import assert from 'node:assert/strict';
import {replayCountermodelSession,COUNTERMODEL_VERSION} from '../public/countermodel-core.mjs';
import {prepareCountermodelDataset} from '../scripts/prepare_countermodel_dataset.mjs';
const session={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'}]};
const fixture=(s=session)=>({format:'pcs-countermodel-adult-optin-dataset-v1',entries:[{session:s,replay:replayCountermodelSession(s)}]});
test('replays and creates real model-checking transitions without invented Lean labels',()=>{const out=prepareCountermodelDataset(fixture());assert.equal(out.stats.episodes,1);assert.equal(out.episodes[0].steps.length,2);assert.equal(out.episodes[0].authority,'FINITE_MODEL_CHECKER_ONLY');assert.equal(out.episodes[0].source_proof_validity,'NOT_EVALUATED');});
test('reject forged scores, labels and arbitrary user fields',()=>{let doc=fixture();doc.entries[0].replay.score=999;assert.throws(()=>prepareCountermodelDataset(doc),/mismatch/);doc=fixture();doc.entries[0].email='ex@example.org';assert.throws(()=>prepareCountermodelDataset(doc),/personal/);});
test('held-out family separation and no account metadata',()=>{const e=fixture().entries[0];const s={version:COUNTERMODEL_VERSION,mission_id:'quantifier-switch',actions:[{type:'add'},{type:'toggle',p:'P',i:0},{type:'toggle',p:'Q',i:1},{type:'check'}]};const doc={format:'pcs-countermodel-adult-optin-dataset-v1',entries:[e,{session:s,replay:replayCountermodelSession(s)}]};const out=prepareCountermodelDataset(doc);assert.deepEqual(out.episodes.map(x=>x.split),['training','evaluation']);assert.doesNotMatch(JSON.stringify(out.episodes),/user_id|email|created_at|collected_day/);});
test('deduplicates identical episodes and is reproducible',()=>{const d=fixture();d.entries.push(structuredClone(d.entries[0]));assert.deepEqual(prepareCountermodelDataset(d),prepareCountermodelDataset(d));assert.equal(prepareCountermodelDataset(d).stats.episodes,1);});

test('training state includes concrete world but hides oracle checker labels until check',()=>{
 const prepared=prepareCountermodelDataset(fixture());
 const [before,after]=prepared.episodes[0].steps;
 assert.deepEqual(before.state.world.P,[false]);assert.deepEqual(before.next_state.world.P,[true]);
 assert.equal(before.checker_labels.source_true,false);
 assert.equal(before.checker_labels.label_exposed_to_player,false);
 assert.equal(after.checker_labels.label_exposed_to_player,true);
 assert.equal(before.reward,0);assert.equal(after.reward,10);
});

test('training episodes carry the exact symbolic semantics needed to learn a countermodel search policy',()=>{
 const e=prepareCountermodelDataset(fixture()).episodes[0];
 assert.equal(e.semantic_input.original_ast.op,'forall');
 assert.equal(e.semantic_input.proposed_ast.op,'forall');
 assert.match(e.semantic_input.original_lean,/∀/);
 assert.match(e.semantic_input.proposed_lean,/∀/);
 assert.equal(e.authority,'FINITE_MODEL_CHECKER_ONLY');
});


test('RL state is pre-action; checker feedback cannot leak before its check',()=>{
 const s={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'},{type:'check'}]};
 const out=prepareCountermodelDataset(fixture(s));const [toggle,first,repeat]=out.episodes[0].steps;
 assert.equal(toggle.state.world.P[0],false);assert.equal(toggle.next_state.world.P[0],true);
 assert.equal(toggle.state.checker_feedback_exposed,false);
 assert.equal(first.state.checker_feedback_exposed,false);assert.equal(first.next_state.checker_feedback_exposed,true);
 assert.equal(first.reward,10);assert.equal(repeat.state.checker_feedback_exposed,true);
 assert.ok(repeat.reward<=0,'no infinite rewards from repeated successful checks');
});
test('learning action cannot expose hint before the hint was requested',()=>{
 const s={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'hint'},{type:'toggle',p:'P',i:0},{type:'check'}]};
 const d=prepareCountermodelDataset(fixture(s)).episodes[0].steps;
 assert.equal(d[0].state.hint_used_before_action,false);
 assert.equal(d[0].next_state.hint_used,true);
 assert.equal(d[1].state.hint_used_before_action,true);
});


test('dataset is bound to exact checked symbolic mission ruleset',async()=>{
 const {COUNTERMODEL_RULESET_SHA256}=await import('../scripts/prepare_countermodel_dataset.mjs');
 const result=prepareCountermodelDataset(fixture());
 assert.match(COUNTERMODEL_RULESET_SHA256,/^[0-9a-f]{64}$/);
 assert.equal(result.ruleset_sha256,COUNTERMODEL_RULESET_SHA256);
 assert.equal(result.episodes[0].ruleset_sha256,COUNTERMODEL_RULESET_SHA256);
 assert.equal(COUNTERMODEL_RULESET_SHA256,'d3b02eb4eb39976fd3179a44ef1b6bffd17a8f4a271b1bd7cddb97eb71276df2',
  'mission definitions changed: review formulas, bump version and dataset provenance before accepting new donations');
});
