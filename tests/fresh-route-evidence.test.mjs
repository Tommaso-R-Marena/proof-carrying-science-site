// Binding tests use recorded catalog receipts, not invented live authorization.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {freshRouteEvidence,localRouteEvidence} from '../public/lean-job-client.mjs';
import {canonical,sha256,utf8} from '../public/file-check-core.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../public/bridge-builder-catalog.json',import.meta.url))),mission=catalog.missions[0];
const receipt=mission.receipts[0],route={proof_actions:receipt.actions,receipt};
async function fixture(){
 const request={request_id:'1'.repeat(32),core_sha:'f20f3cab2938f2e085f137185e88f4700d5da2ed',model_family:null};
 const evidence={format:'pcs-public-lean-result-v1',request_id:request.request_id,core_sha:request.core_sha,source_sha256:await sha256(utf8(JSON.stringify(mission.statement))),actions_sha256:await sha256(utf8(canonical(route.proof_actions))),automatic_training_authorization:false,result:{status:'verified',pcs_authority:false,search:{receipt}}};
 return {request,evidence:structuredClone(evidence)};
}
test('fresh route binding rejects cross-request, stale route, altered memory, axioms and source',async()=>{
 const {request,evidence}=await fixture();const bound=await freshRouteEvidence(evidence,request,route,mission);
 assert.equal(bound.receipt.goal_sha256,mission.goal_sha256);
 for(const change of [e=>e.request_id='2'.repeat(32),e=>e.core_sha='0'.repeat(40),e=>e.source_sha256='0'.repeat(64),e=>e.actions_sha256='0'.repeat(64),e=>e.model_family='verified-memory-v1',e=>e.result.search.receipt.actions.pop(),e=>e.result.search.receipt.kernel.axioms.push('sorryAx'),e=>e.result.search.receipt.library={},e=>e.result.search.receipt.adapter_sha256='0'.repeat(64),e=>e.result.status='unresolved',e=>e.automatic_training_authorization=true]){
  const bad=structuredClone(evidence);change(bad);await assert.rejects(freshRouteEvidence(bad,request,route,mission));
 }
});
test('receipt inputs are captured before asynchronous hashing and are not reopened',async()=>{
 const {request,evidence}=await fixture(),copy=structuredClone(route),m=structuredClone(mission);
 const pending=freshRouteEvidence(evidence,request,copy,m);
 evidence.result.status='unresolved';request.request_id='2'.repeat(32);copy.proof_actions.pop();m.statement='False';
 const bound=await pending;assert.equal(bound.request_id,'1'.repeat(32));assert.deepEqual(bound.receipt.actions,receipt.actions);
});
test('local receipts refuse action substitution and disclose absent backend source attestation',()=>{
 const bound=localRouteEvidence(receipt,route,mission);assert.equal(bound.execution_mode,'fresh_local_session');assert.equal(bound.core_sha,null);assert.equal(bound.local_backend_source_independently_attested,false);
 const bad=structuredClone(receipt);bad.actions.pop();assert.throws(()=>localRouteEvidence(bad,route,mission));
});
