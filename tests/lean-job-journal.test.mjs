// Actual workerd SQLite persistence. GitHub replies are explicit provider fixtures.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {AuditJournal,requestKey,eventId} from '../src/lean-job-journal.js';
import {submitJob,pollJob,cancelJob} from '../src/lean-job-service.js';
import {CORE_SHA,preparePublicRequest} from '../src/lean-research.js';
const BODY={statement:'For all propositions U and V, if (U and V) then (U and (U and V)).',interpretation:null,public_consent:true,license:'CC0-1.0'};
const NOW=1760000000000;
const receipt=JSON.parse(readFileSync(new URL('./fixtures/lean-proof-receipt-v1.json',import.meta.url)));
async function setup(path){
  const mf=new Miniflare(convertV4MiniflareOptions({telemetry:{enabled:false},resourcePersistencePath:path,workers:[{name:'real-journal-db',compatibilityDate:'2026-09-28',modules:true,script:'export default {fetch(){return new Response("test-only");}}',d1Databases:{COMMONS_DB:'journal-db'}}]}));
  const db=await mf.getD1Database('COMMONS_DB');
  await db.exec("CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,actor_user_id TEXT,action TEXT NOT NULL,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,detail_json TEXT NOT NULL,created_at TEXT NOT NULL)");
  return {mf,db,env:{COMMONS_DB:db,RATE_LIMIT_SALT:'test-only-journal-salt',PCS_LEAN_GITHUB_TOKEN:'test-only-provider-token'}};
}
function provider({loseConfirmation=false}={}){
  const state={dispatches:0,run:null,status:'in_progress',conclusion:null,badResult:false,cancels:0,unavailable:false};
  const repository={private:false,full_name:'Tommaso-R-Marena/proof-carrying-science'};
  const json=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
  state.transport=async(url,options={})=>{
    if(state.unavailable)throw TypeError('test network interruption');
    const path=new URL(url).pathname;
    if(path.endsWith('/proof-carrying-science'))return json(repository);
    if(path.endsWith('/commits/main'))return json({sha:CORE_SHA});
    if(path.endsWith('/dispatches')){state.dispatches++;const inputs=JSON.parse(options.body).inputs;state.run=inputs.request_id;await new Promise(r=>setTimeout(r,10));if(loseConfirmation)throw TypeError('test accepted POST, lost response');return new Response(null,{status:204});}
    if(path.endsWith('/pcs-lean-public.yml/runs'))return json({workflow_runs:state.run?[{id:123,display_title:'PCS public Lean '+state.run,head_sha:CORE_SHA,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/pcs-lean-public.yml',repository,status:state.status,conclusion:state.conclusion}]:[]});
    if(path.endsWith('/123/cancel')){state.cancels++;return new Response(null,{status:202});}
    if(path.endsWith('/123/jobs'))return json({jobs:[{id:456,name:'public-lean',conclusion:'success'}]});
    if(path.endsWith('/456/logs')){
      const r=structuredClone(receipt);if(state.badResult)r.kernel.axioms=['Unapproved.axiom'];
      const e={format:'pcs-public-lean-result-v1',request_id:state.run,core_sha:CORE_SHA,source_sha256:createHash('sha256').update(JSON.stringify(BODY.statement)).digest('hex'),result:{status:'verified',pcs_authority:false,formalization:{candidates:[{interpretation_sha256:r.goal_sha256,lean:r.statement}]},search:{receipt:r}},baseline:{status:'unknown',pcs_authority:false}};
      return new Response('PCS_LEAN_RESULT_V1:'+Buffer.from(JSON.stringify(e)).toString('base64')+'\n');
    }
    throw Error('Unexpected fixture request: '+path);
  };
  return state;
}
async function fixture(fn){const path=mkdtempSync(join(tmpdir(),'pcs-journal-'));const a=await setup(path);try{await fn(a,path);}finally{await a.mf.dispose();rmSync(path,{recursive:true,force:true});}}
test('twenty concurrent identical requests consume admission once and dispatch once',async()=>fixture(async({env})=>{
  const p=provider();let admissions=0;
  const options={ip:'fixture-client',idempotencyKey:'a'.repeat(32),admit:async()=>{admissions++;await new Promise(r=>setTimeout(r,10));},transport:p.transport,now:NOW};
  const results=await Promise.all(Array.from({length:20},(_,index)=>submitJob(env,BODY,{...options,now:NOW+index})));
  assert.equal(admissions,1);assert.equal(p.dispatches,1);assert.equal(new Set(results.map(r=>r.request_id)).size,1);assert.equal(new Set(results.map(r=>r.ticket)).size,1);
  const history=await new AuditJournal(env.COMMONS_DB).history(results[0].request_id);assert.equal(history.at(-1).state,'dispatched');
  assert.ok(history.every(row=>!JSON.stringify(row).includes(BODY.statement)&&!JSON.stringify(row).includes('fixture-client')));
}));
test('same-key changed meaning is rejected without consuming another admission',async()=>fixture(async({env})=>{
 const p=provider(),o={ip:'fixture',idempotencyKey:'b'.repeat(32),admit:async()=>{},transport:p.transport,now:NOW};
 await submitJob(env,BODY,o);await assert.rejects(submitJob(env,{...BODY,interpretation:1},o),/different request/);assert.equal(p.dispatches,1);
}));
test('accepted dispatch with lost confirmation is reconciled, never retransmitted',async()=>fixture(async({env})=>{
 const p=provider({loseConfirmation:true}),o={ip:'fixture',idempotencyKey:'c'.repeat(32),admit:async()=>{},transport:p.transport,now:NOW};
 const first=await submitJob(env,BODY,o);assert.equal(first.job_state,'dispatch_uncertain');
 await submitJob(env,BODY,o);assert.equal(p.dispatches,1);
 const result=await pollJob(env,first.ticket,{transport:p.transport,now:NOW+1});assert.equal(result.job_state,'running');
}));
test('complete provider result is frozen by digest and cannot be replaced',async()=>fixture(async({env})=>{
 const p=provider(),o={ip:'fixture',idempotencyKey:'d'.repeat(32),admit:async()=>{},transport:p.transport,now:NOW};
 const submitted=await submitJob(env,BODY,o);p.status='completed';p.conclusion='success';
 const completed=await pollJob(env,submitted.ticket,{transport:p.transport,now:NOW+1});assert.equal(completed.status,'completed');assert.equal(completed.job_state,'complete');assert.match(completed.result_sha256,/^[0-9a-f]{64}$/);
 assert.equal((await pollJob(env,submitted.ticket,{transport:p.transport,now:NOW+2})).result_sha256,completed.result_sha256);
 const row=await new AuditJournal(env.COMMONS_DB).current(submitted.request_id);await assert.rejects(new AuditJournal(env.COMMONS_DB).advance(row,'running','provider_running',{now:NOW+3}),/Terminal/);
}));
test('forged evidence becomes failed and never supplies a proof',async()=>fixture(async({env})=>{
 const p=provider(),r=await submitJob(env,BODY,{ip:'fixture',idempotencyKey:'e'.repeat(32),admit:async()=>{},transport:p.transport,now:NOW});p.status='completed';p.conclusion='success';p.badResult=true;
 const out=await pollJob(env,r.ticket,{transport:p.transport,now:NOW+1});assert.equal(out.status,'failed');assert.equal(out.evidence,undefined);assert.equal((await new AuditJournal(env.COMMONS_DB).current(r.request_id)).code,'evidence_rejected');
}));
test('expiration, provider cancellation and timeout remain distinct nonproof outcomes',async()=>fixture(async({env})=>{
 const p=provider(),o={ip:'fixture',idempotencyKey:'f'.repeat(32),admit:async()=>{},transport:p.transport,now:NOW};
 const r=await submitJob(env,BODY,o);const expired=await pollJob(env,r.ticket,{transport:p.transport,now:NOW+3600001});assert.equal(expired.status,'expired');assert.equal(p.dispatches,1);
 for(const [key,conclusion,status,state] of [['0','cancelled','cancelled','cancelled'],['1','timed_out','resource_exhaustion','resource_exhausted']]){
  const q=provider(),a=await submitJob(env,BODY,{...o,idempotencyKey:key.repeat(32),transport:q.transport});q.status='completed';q.conclusion=conclusion;
  const result=await pollJob(env,a.ticket,{transport:q.transport,now:NOW+1});assert.equal(result.status,status);assert.equal(result.job_state,state);assert.equal(result.evidence,undefined);
 }
}));
test('cancellation requires the exact run and is confirmed only by provider state',async()=>fixture(async({env})=>{
 const p=provider(),r=await submitJob(env,BODY,{ip:'fixture',idempotencyKey:'2'.repeat(32),admit:async()=>{},transport:p.transport,now:NOW});
 const requested=await Promise.all(Array.from({length:10},()=>cancelJob(env,r.ticket,{transport:p.transport,now:NOW+1})));assert.ok(requested.every(x=>x.status==='cancellation_requested'));assert.equal(p.cancels,1);
 await cancelJob(env,r.ticket,{transport:p.transport,now:NOW+2});assert.equal(p.cancels,1);
 p.status='completed';p.conclusion='cancelled';assert.equal((await pollJob(env,r.ticket,{transport:p.transport,now:NOW+3})).job_state,'cancelled');
}));
test('a restarted actual workerd database retains immutable request identity',async()=>{
 const path=mkdtempSync(join(tmpdir(),'pcs-restart-'));let a=await setup(path);const p=provider(),o={ip:'fixture',idempotencyKey:'3'.repeat(32),admit:async()=>{},transport:p.transport,now:NOW};
 try{const r=await submitJob(a.env,BODY,o);await a.mf.dispose();a=await setup(path);const recovered=await submitJob(a.env,BODY,o);assert.equal(recovered.ticket,r.ticket);assert.equal(recovered.request_id,r.request_id);assert.equal(p.dispatches,1);}
 finally{await a.mf.dispose();rmSync(path,{recursive:true,force:true});}
});
test('persisted event corruption and skipped versions fail closed',async()=>fixture(async({env,db})=>{
 const key=await requestKey(env,'fixture','4'.repeat(32)),p=await preparePublicRequest(BODY,NOW,key.slice(0,32)),store=new AuditJournal(db);
 const r=await store.create(p,'5'.repeat(64),NOW);
 await db.prepare('UPDATE audit_log SET detail_json=? WHERE id=?').bind(JSON.stringify({...r,state:'complete'}),eventId(p.request_id,0)).run();
 await assert.rejects(store.current(p.request_id),/digest mismatch/);
}));
