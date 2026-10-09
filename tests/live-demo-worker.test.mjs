import test from 'node:test';import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker from '../src/worker.js';
import {COUNTERMODEL_VERSION} from '../public/countermodel-core.mjs';
const origin='https://pcs-live-demo.example';
const session=()=>({version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'}]});
const env={get COMMONS_DB(){throw Error('Stateless replay must not access accounts or research storage');}};
async function hit(body,headers={}){
 const response=await worker.fetch(new Request(origin+'/api/demo/countermodel/replay',{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}),env);
 return {status:response.status,body:await response.json()};
}
test('anonymous replay computes a real witness without accounts, consent or database writes',async()=>{
 const r=await hit(session());assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.replay.final_verified,true);
 assert.equal(r.body.research_recorded,false);assert.equal(r.body.replay.pcs_authoritative,false);
 assert.equal(r.body.witness.format,'pcs-countermodel-witness-v1');assert.deepEqual(r.body.witness.world.P,[true]);
});
test('agreement is a valid computation but never a counterexample or false success',async()=>{
 const s=session();s.actions=[{type:'check'}];const r=await hit(s);
 assert.equal(r.status,200);assert.equal(r.body.replay.final_verified,false);
});
test('forged scores, malformed formulas, unknown missions, stale versions and excessive moves reject',async()=>{
 for(const change of [s=>s.score=999,s=>s.actions[0].passed=true,s=>s.mission_id='arbitrary',s=>s.version='old',s=>s.actions=Array(121).fill({type:'check'})]){
  const s=session();change(s);assert.equal((await hit(s)).status,400);
 }
 assert.equal((await hit(session(),{origin:'https://attacker.invalid'})).status,403);
});
test('actual byte limit holds with missing or false Content-Length',async()=>{
 assert.equal((await hit(' '.repeat(64001))).status,413);
 assert.equal((await hit(' '.repeat(64001),{'content-length':'1'})).status,413);
 assert.equal((await hit('{')).status,400);
});
