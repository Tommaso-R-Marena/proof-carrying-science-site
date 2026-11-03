import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {modelProofHandoff,validateModelHandoff,withModelEntry,validateModelChain,validateLocalModelChain,shareModelChainHtml} from '../public/model-lean-bridge.mjs';
import {runModelExample} from '../public/model-walkthrough-core.mjs';
import {canonical,utf8} from '../public/file-check-core.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url)));
const model=read('public/repair-policy-model-v1.json'),catalog=read('public/proof-workbench-catalog.json');
test('both actual ranker outputs bind to independently executed Lean proof targets',async()=>{
 for(const id of ['implication-reversal-1','universal-existential-1']){
  const run=await runModelExample(model,id),h=await modelProofHandoff(utf8(canonical(run)),model);
  const real=read('docs/evidence/runtime-wiring-v1/'+id+'-handoff-result.json');
  assert.equal(real.result.status,'verified');assert.equal(real.result.search.winning_component,'ordinary_Std');
  const meaning=real.result.formalization.candidates[0];assert.equal(h.entry.lean,meaning.lean);assert.equal(h.entry.goal_sha256,meaning.interpretation_sha256);
  assert.deepEqual(real.result.search.receipt.kernel.axioms,['propext']);
  assert.match(h.entry.meaning,/natural-number labels/);assert.match(h.entry.meaning,/earlier finite check is separate/);
  assert.equal(h.physical_neural_execution_independently_attested,false);assert.equal(h.pcs_authority,false);
 }
});
test('the receiving workbench extends its reviewed catalog with the exact reconstructed target',async()=>{
 const run=await runModelExample(model,'implication-reversal-1'),h=await modelProofHandoff(utf8(canonical(run)),model),c=await withModelEntry(catalog,h);
 assert.equal(c.entries.length,catalog.entries.length+1);assert.notEqual(c.catalog_sha256,catalog.catalog_sha256);
 assert.deepEqual(c.entries.find(e=>e.id===h.entry.id),h.entry);assert.equal((await withModelEntry(c,h)).entries.length,c.entries.length);
});
test('altered model proposals, goal statements, signatures and authority claims are refused',async()=>{
 const run=await runModelExample(model,'implication-reversal-1'),h=await modelProofHandoff(utf8(canonical(run)),model);
 for(const mutate of [x=>x.entry.lean='False',x=>x.entry.statement='Another question',x=>x.proposal_sha256='0'.repeat(64),x=>x.model_replay.attempts[0].proposal.op='exists',x=>x.pcs_authority=true,x=>x.physical_neural_execution_independently_attested=true,x=>x.extra=true]){
  const v=structuredClone(h);mutate(v);await assert.rejects(validateModelHandoff(v,model));
 }
 const changed=structuredClone(model);changed.weights[0]+=1;await assert.rejects(validateModelHandoff(h,changed));
});
test('recorded local Lean runs and their exact model replays round trip without claiming fresh hosted execution',async()=>{
 for(const id of ['implication-reversal-1','universal-existential-1']){
  const chain=read('docs/evidence/runtime-wiring-v1/'+id+'-chain.json'),checked=await validateModelChain(chain,catalog,model);
  assert.equal(checked.report.execution_mode,'recorded_example');assert.equal(checked.report.outcome,'proved');assert.equal(checked.report.run_url,null);
  assert.equal(checked.handoff.model_replay.lean_kernel_executed,false);assert.equal(checked.report.physical_neural_execution_independently_attested,false);
  const wrong=structuredClone(chain);wrong.proof_report.goal_sha256='0'.repeat(64);await assert.rejects(validateModelChain(wrong,catalog,model));
 }
});
test('actual memory-model proof evidence remains private, reproducible and bound to the exact proposal',async()=>{
 const real=read('docs/evidence/runtime-wiring-v1/local-model-lean-chain.json');
 const checked=await validateLocalModelChain(real,model);
 assert.equal(checked.observation.model,'verified-memory-v1');assert.equal(checked.observation.search.expansions,6);
 assert.deepEqual(checked.observation.search.receipt.kernel.axioms,[]);
 assert.equal(checked.observation.search.receipt.goal_sha256,checked.handoff.entry.goal_sha256);
 assert.equal(checked.physical_neural_execution_independently_attested,false);
 for(const mutate of [x=>x.observation.checkpoint_sha256='0'.repeat(64),x=>x.observation.search.receipt.goal_sha256='0'.repeat(64),x=>x.observation.search.receipt.kernel.axioms.push('sorryAx'),x=>x.observation.status='unresolved',x=>x.pcs_authority=true,x=>x.observation.public_authorization=true]){
  const bad=structuredClone(real);mutate(bad);await assert.rejects(validateLocalModelChain(bad,model));
 }
});
test('readable model/proof reports embed the complete chain and the matching independent receiver',async()=>{
 const chain=read('docs/evidence/runtime-wiring-v1/implication-reversal-1-chain.json');
 const html=await shareModelChainHtml(chain.handoff,chain.proof_report);
 const embedded=JSON.parse(html.match(/id="evidence">([^]*?)<\/script>/)[1]);
 assert.deepEqual(embedded.handoff,chain.handoff);assert.deepEqual(embedded.proof_report,chain.proof_report);
 assert.match(html,/scripts\/replay_model_lean_chain.py/);assert.doesNotMatch(html,/scripts\/replay_proof_workbench.py/);
 assert.match(html,/Independent replay has not run/);assert.match(html,/script-src &#39;sha256-/);
});
test('the connected UI preserves explicit meaning/publication consent and exposes fresh route evidence',()=>{
 const modelPage=fs.readFileSync(new URL('../public/model-walkthrough.html',import.meta.url),'utf8');assert.match(modelPage,/id="modelLean" disabled/);
 const workbench=fs.readFileSync(new URL('../public/proof-workbench.mjs',import.meta.url),'utf8');assert.match(workbench,/validateModelHandoff/);assert.match(workbench,/validateModelChain/);
 assert.match(workbench,/wbMeaningConsent/);assert.match(workbench,/wbPublishConsent/);assert.match(workbench,/token!==importRevision/);
 const bridge=fs.readFileSync(new URL('../public/bridge-builder.mjs',import.meta.url),'utf8');assert.match(bridge,/routeRevision!==version/);assert.match(bridge,/freshRouteEvidence/);assert.match(bridge,/fresh\?\.receipt\|\|r.receipt/);
});
