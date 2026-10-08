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
 assert.deepEqual(before.state.world.P,[true]);
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
