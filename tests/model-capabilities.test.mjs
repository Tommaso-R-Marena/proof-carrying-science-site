import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {CAPABILITIES,MODE_LABELS,executionSummary} from '../public/capability-catalog.mjs';
import {CORE_SHA} from '../src/lean-research.js';
const root=new URL('../',import.meta.url);
const inventory=JSON.parse(readFileSync(new URL('public/model-capabilities.json',root)));

test('advertised execution paths resolve and distinguish hosted models, replay and exact tools',()=>{
 assert.ok(CAPABILITIES.length>=18);
 for(const c of CAPABILITIES){
  assert.ok(MODE_LABELS[c.mode]);assert.ok(c.limit&&c.engine&&c.does);
  assert.ok(existsSync(new URL('public/'+c.page,root)),c.page);
 }
 assert.equal(CAPABILITIES.find(c=>c.page==='check-my-files.html').mode,'native');
 assert.equal(CAPABILITIES.find(c=>c.page==='memory-workshop.html').mode,'replay');
 assert.equal(CAPABILITIES.find(c=>c.page==='research-updates.html').mode,'recorded');
});
test('model inventory and protected browser qualification use the current exact executor',()=>{
 assert.equal(inventory.core_revision,CORE_SHA);assert.equal(inventory.models.length,41);
 assert.equal(inventory.hosted_general_llm_inference,false);assert.equal(inventory.automatic_training,false);
 assert.equal(inventory.pcs_authority,false);
 for(const r of inventory.registry_sources){
  const selected=inventory.models.filter(m=>m.family===r.path.split('/')[1]&&m.selected);
  assert.equal(selected.length,1);assert.equal(selected[0].id,r.selected);
 }
 for(const m of inventory.models){assert.match(m.sha256,/^[0-9a-f]{64}$/);assert.equal(m.pcs_authority,false);}
 const workflow=readFileSync(new URL('.github/workflows/site-public-verification.yml',root),'utf8');
 assert.ok(workflow.includes('ref: '+CORE_SHA));assert.ok(workflow.includes('python3 scripts/check_model_capabilities.py'));
 assert.ok(inventory.execution_sources['pcs/experimental/prover/public_job.py']);
 const report=JSON.parse(readFileSync(new URL('docs/evidence/model-wiring-v1/learned-chain.json',root)));
 const proof=readFileSync(new URL('docs/evidence/model-wiring-v1/learned-chain.lean',root));
 assert.equal(report.proof_source_sha256,createHash('sha256').update(proof).digest('hex'));
 assert.equal(report.source_revision,CORE_SHA);assert.deepEqual(report.kernel_axioms,[]);
 assert.equal(report.checkpoint_sha256,inventory.models.find(m=>m.family==='verified-memory-v1'&&m.selected).sha256);
});
test('result labels attribute actual baseline winners and never attribute human actions to a neural model',()=>{
 const human=executionSummary({actions_sha256:'a'.repeat(64),result:{model:'irrelevant'}});
 assert.match(human,/exact typed actions/);assert.doesNotMatch(human,/Executor/);
 const symbolic=executionSummary({core_sha:CORE_SHA,result:{model:'refined-17',search:{portfolio:{selected_stage:'symbolic_fallback'}}}});
 assert.match(symbolic,/symbolic_fallback/);assert.match(symbolic,new RegExp(CORE_SHA));
 const hybrid=executionSummary({result:{model:'hybrid',checkpoint_sha256:'b'.repeat(64),search:{winning_component:'ordinary_Std'}}});
 assert.match(hybrid,/ordinary_Std/);assert.match(hybrid,/Reported checkpoint/);
 assert.doesNotMatch(executionSummary({result:{}}),/undefined|Kernel-verified/);
});
