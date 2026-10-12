import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {CORE_SHA,PREVIOUS_CORE_SHA,dispatch,poll,parseResult,parseResultLog,verifyTicket,validatePublicStatement} from '../src/lean-research.js';
const env={PCS_GITHUB_TOKEN:'test-only-protocol-token',RATE_LIMIT_SALT:'test-only-ticket-secret'};
const body={statement:'For all propositions U and V, if (U and V) then (U and (U and V)).',interpretation:null,public_consent:true,license:'CC0-1.0'};
const repository={private:false,full_name:'Tommaso-R-Marena/proof-carrying-science'};
const response=(value,status=200,headers={})=>new Response(value===null?null:JSON.stringify(value),{status,headers});
async function queued(now=1000000,override={}){const calls=[];const transport=async(url,options)=>{calls.push({url,options});if(url.endsWith('/commits/main'))return response({sha:CORE_SHA,...override.commit});if(url.endsWith('/dispatches'))return response(null,204);return response({...repository,...override.repo});};return {...await dispatch(env,body,transport,now),calls};}
const receipt=JSON.parse(readFileSync(new URL('./fixtures/lean-proof-receipt-v1.json',import.meta.url)));
function record(p){return {format:'pcs-public-lean-result-v1',request_id:p.request_id,core_sha:p.core_sha,source_sha256:p.source_sha256,result:{status:'verified',pcs_authority:false,formalization:{candidates:[{interpretation_sha256:receipt.goal_sha256,lean:receipt.statement}]},search:{receipt:structuredClone(receipt)}},baseline:{status:'unknown',pcs_authority:false}};}
const marker=r=>'2026-10-10T00:00:00Z PCS_LEAN_RESULT_V1:'+Buffer.from(JSON.stringify(r)).toString('base64')+'\n';
const compressedMarker=r=>'2026-10-10T00:00:00Z PCS_LEAN_RESULT_GZIP_V1:'+gzipSync(Buffer.from(JSON.stringify(r))).toString('base64')+'\n';
test('bounded gzip preserves the full large checker result and legacy compatibility',async()=>{
 const q=await queued(),p=await verifyTicket(env,q.ticket,1000000),r=record(p);r.diagnostics='actual transport fixture; '.repeat(35000);
 const raw=marker(r),compressed=compressedMarker(r);assert.ok(raw.length>1000000);assert.ok(compressed.length<65536);
 assert.deepEqual(await parseResultLog(compressed,p),r);assert.deepEqual(await parseResultLog(marker(record(p)),p),record(p));
});
test('compressed receipts reject mixed/duplicate markers, malformed gzip and expansion bombs',async()=>{
 const q=await queued(),p=await verifyTicket(env,q.ticket,1000000),r=record(p),valid=compressedMarker(r);
 for(const log of [valid+valid,valid+marker(r),valid+'PCS_LEAN_RESULT_GZIP_V1:invalid!\n'])await assert.rejects(parseResultLog(log,p),/duplicate/);
 await assert.rejects(parseResultLog('PCS_LEAN_RESULT_GZIP_V1:'+Buffer.from('not gzip').toString('base64')+'\n',p));
 const bomb=structuredClone(r);bomb.diagnostics='x'.repeat(1000000);await assert.rejects(parseResultLog(compressedMarker(bomb),p),/bound/);
 await assert.rejects(parseResultLog('PCS_LEAN_RESULT_GZIP_V1:'+Buffer.alloc(48001).toString('base64')+'\n',p),/bound/);
 const corrupt=gzipSync(Buffer.from(JSON.stringify(r)));corrupt[corrupt.length-8]^=1;
 await assert.rejects(parseResultLog('PCS_LEAN_RESULT_GZIP_V1:'+corrupt.toString('base64')+'\n',p));
});
test('gzip does not weaken interpretation, source, action or kernel authority bindings',async()=>{
 const q=await queued(),p=await verifyTicket(env,q.ticket,1000000),r=record(p);
 for(const mutate of [r=>r.core_sha='0'.repeat(40),r=>r.source_sha256='0'.repeat(64),r=>r.actions_sha256='0'.repeat(64),r=>r.result.search.receipt.kernel.axioms.push('sorryAx'),r=>r.result.search.receipt.statement='False']){
  const changed=structuredClone(r);mutate(changed);await assert.rejects(parseResultLog(compressedMarker(changed),p));
 }
});
test('explicit public authorization and closed mathematical payload',()=>{validatePublicStatement(body);for(const changed of [{public_consent:false},{license:'private'},{statement:'theorem evil : False := by sorry'},{statement:'For all propositions P, P. bearer-token: secret'},{interpretation:16},{statement:body.statement,extra:'reward'}])assert.throws(()=>validatePublicStatement({...body,...changed}));});
test('only pinned public main, safe environment input, signed expiring ticket',async()=>{const q=await queued();assert.equal(q.calls.length,3);const submitted=JSON.parse(q.calls[2].options.body);assert.equal(submitted.ref,'main');assert.equal(submitted.inputs.statement,body.statement);assert.equal(q.calls[2].options.redirect,'manual');const p=await verifyTicket(env,q.ticket,1000000);assert.equal(p.core_sha,CORE_SHA);await assert.rejects(verifyTicket(env,q.ticket,5000000),/Expired/);await assert.rejects(verifyTicket({...env,RATE_LIMIT_SALT:'other'},q.ticket,1000000),/Forged/);await assert.rejects(queued(1000000,{repo:{private:true}}),/public/);await assert.rejects(queued(1000000,{commit:{sha:'0'.repeat(40)}}),/approved/);});
test('actual receipt format, source binding, duplicate markers and forbidden axioms',async()=>{const q=await queued();const p=await verifyTicket(env,q.ticket,1000000);const r=record(p);assert.equal(parseResult(marker(r),p).result.status,'verified');assert.throws(()=>parseResult(marker(r)+marker(r),p),/duplicate/);for(const mutate of [r=>r.source_sha256='0'.repeat(64),r=>r.core_sha='0'.repeat(40),r=>r.result.pcs_authority=true,r=>r.result.search.receipt.kernel.axioms.push('evil'),r=>r.result.search.receipt.proof=' ',r=>r.baseline={status:'verified',pcs_authority:false,search:{receipt:{}}}]){const changed=structuredClone(r);mutate(changed);assert.throws(()=>parseResult(marker(changed),p));}});
test('completed job provenance and redirected logs never carry GitHub credentials',async()=>{const q=await queued();const p=await verifyTicket(env,q.ticket,1000000);let logOptions;
 const run={id:123,display_title:'PCS public Lean '+p.request_id,head_sha:CORE_SHA,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/pcs-lean-public.yml',repository,status:'completed',conclusion:'success'};
 const transport=async(url,options)=>{if(url.includes('/workflows/')&&url.includes('/runs?'))return response({workflow_runs:[run]});if(url.endsWith('/123/jobs'))return response({jobs:[{id:456,name:'public-lean',conclusion:'success'}]});if(url.endsWith('/456/logs'))return response(null,302,{location:'https://test.blob.core.windows.net/proof/log'});logOptions=options;return new Response(marker(record(p)));};
 const result=await poll(env,q.ticket,transport,1000000);assert.equal(result.status,'completed');assert.equal(logOptions.credentials,'omit');assert.equal(logOptions.headers,undefined);assert.equal(logOptions.redirect,'manual');run.head_branch='untrusted';await assert.rejects(poll(env,q.ticket,transport,1000000),/Unapproved/);run.head_branch='main';const unsafe=async(url,options)=>url.endsWith('/456/logs')?response(null,302,{location:'https://evil.example/log'}):transport(url,options);await assert.rejects(poll(env,q.ticket,unsafe,1000000),/destination/);
});
test('bounded logs and missing final evidence remain unresolved',async()=>{const q=await queued();const p=await verifyTicket(env,q.ticket,1000000);assert.throws(()=>parseResult('Search claims success, without a real result',p),/Missing/);assert.throws(()=>parseResult('PCS_LEAN_RESULT_V1:'+Buffer.alloc(1000001).toString('base64')+'\n',p),/bound/);const forged=record(p);forged.baseline.pcs_authority=true;assert.throws(()=>parseResult(marker(forged),p),/authority/);const result=await poll(env,q.ticket,async()=>response({workflow_runs:[]}),1000000);assert.equal(result.status,'queued');assert.equal(result.pcs_authority,false);});

const worker=(await import('../src/worker.js')).default;
function quotaEnv(count) {
  const state={calls:0};
  const db={prepare(sql) {
    assert.match(sql,/INSERT INTO rate_limits/);
    return {bind() {return {async first() {state.calls++;return {count};}};}};
  }};
  return {state,env:{RATE_LIMIT_SALT:'test-only-route-salt',COMMONS_DB:db}};
}
const origin='https://proof-carrying-science-site.marenatommaso.workers.dev';
const submitRequest=(payload,requestOrigin=origin)=>new Request(origin+'/api/lean-research/submit',{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(payload)});
test('real Worker rejects origin and absent consent before any quota or provider operation',async()=>{const q=quotaEnv(1);assert.equal((await worker.fetch(submitRequest(body,'https://hostile.example'),q.env)).status,403);assert.equal((await worker.fetch(submitRequest({...body,public_consent:false}),q.env)).status,400);assert.equal(q.state.calls,0);});
test('actual Worker/D1 preserves admission quotas and missing-provider recovery without proof',async()=>{
 const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
 const mf=new Miniflare(convertV4MiniflareOptions({telemetry:{enabled:false},workers:[{name:'route-db',compatibilityDate:'2026-09-28',modules:true,script:'export default {fetch(){return new Response("fixture");}}',d1Databases:{COMMONS_DB:'route-db'}}]}));
 try{
  const db=await mf.getD1Database('COMMONS_DB');
  await db.exec('CREATE TABLE rate_limits(key TEXT PRIMARY KEY,window_start TEXT NOT NULL,count INTEGER NOT NULL); CREATE TABLE audit_log(id TEXT PRIMARY KEY,actor_user_id TEXT,action TEXT NOT NULL,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,detail_json TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE audit_archive(seq INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,legacy_audit_id TEXT UNIQUE,actor_user_id TEXT,actor_email TEXT,actor_name TEXT,actor_role TEXT,action TEXT,subject_type TEXT,subject_id TEXT,detail_json TEXT,created_at TEXT,prev_hash TEXT UNIQUE,event_hash TEXT UNIQUE)');
  const env={COMMONS_DB:db,RATE_LIMIT_SALT:'test-only-real-route-db'},results=[];
  for(let i=0;i<3;i++)results.push(await worker.fetch(submitRequest(body),env));
  assert.deepEqual(results.map(r=>r.status),[200,200,429]);
  for(const response of results.slice(0,2)){const value=await response.json();assert.equal(value.job_state,'dispatch_uncertain');assert.equal(value.pcs_authority,false);assert.equal(value.evidence,undefined);assert.ok(value.ticket);}
  const rows=(await db.prepare('SELECT detail_json FROM audit_log').all()).results.map(r=>JSON.parse(r.detail_json));
  assert.equal(rows.filter(r=>r.code==='admission_passed').length,2);assert.equal(rows.filter(r=>r.code==='rate_limited').length,1);
 }finally{await mf.dispose();}
});

test('dedicated proof-dispatch credential is preferred without replacing existing website credential',async()=>{const scoped={...env,PCS_LEAN_GITHUB_TOKEN:'test-only-scoped-actions-token'};const calls=[];const transport=async(url,options)=>{calls.push(options.headers.Authorization);if(url.endsWith('/commits/main'))return response({sha:CORE_SHA});if(url.endsWith('/dispatches'))return response(null,204);return response(repository);};assert.equal((await dispatch(scoped,body,transport)).status,'queued');assert.ok(calls.every(h=>h==='Bearer test-only-scoped-actions-token'));assert.equal(scoped.PCS_GITHUB_TOKEN,env.PCS_GITHUB_TOKEN);});

test('real Worker availability exposes configuration only, without credentials or authority',async()=>{const q=quotaEnv(1);let r=await worker.fetch(new Request(origin+'/api/lean-research/status'),q.env);assert.equal((await r.json()).status,'unavailable');r=await worker.fetch(new Request(origin+'/api/lean-research/status'),{...q.env,PCS_LEAN_GITHUB_TOKEN:'test-only-proof-scope'});const configured=await r.json();assert.equal(configured.status,'configured');assert.equal(configured.pcs_authority,false);assert.doesNotMatch(JSON.stringify(configured),/test-only-proof-scope/);assert.equal(q.state.calls,0);});

test('optional operational evidence is source-correlated, ordered and never authorizes training',async()=>{
 const q=await queued(),p=await verifyTicket(env,q.ticket,1000000),r=record(p);
 const event=(sequence,status)=>({format:'pcs-lean-job-event-v1',request_id:p.request_id,core_sha:p.core_sha,source_sha256:p.source_sha256,sequence,stage:'checked_reuse',status,elapsed_seconds:sequence,pcs_authority:false});
 r.source_license='CC0-1.0';r.automatic_training_authorization=false;r.job_events=[event(0,'started'),{...event(1,'finished'),wall_seconds:0.5,cpu_seconds:0.1,recorded_Lean_execution_attempts:3}];
 assert.deepEqual(await parseResultLog(marker(r),p),r);
 for(const mutate of [r=>r.source_license='private',r=>r.automatic_training_authorization=true,r=>r.job_events[0].request_id='a'.repeat(32),r=>r.job_events[0].source_sha256='0'.repeat(64),r=>r.job_events[1].sequence=0,r=>r.job_events[1].elapsed_seconds=-1,r=>r.job_events[1].cpu_seconds=-1,r=>r.job_events[1].recorded_Lean_execution_attempts=1.5,r=>r.job_events[1].pcs_authority=true,r=>r.job_events[0].status='finished',r=>r.job_events.push(r.job_events[1]),r=>r.job_events[1].secret='untrusted',r=>r.job_events.pop()]){
  const changed=structuredClone(r);mutate(changed);await assert.rejects(parseResultLog(compressedMarker(changed),p));
 }
 const changed=structuredClone(r);changed.job_events[1].wall_seconds=Infinity;assert.throws(()=>parseResult(marker(changed),p));
});
test('the action digest binds actual checked receipt actions rather than a repeated output assertion',async()=>{
 const actions=structuredClone(receipt.actions),transport=async url=>url.endsWith('/commits/main')?response({sha:CORE_SHA}):url.endsWith('/dispatches')?response(null,204):response(repository);
 const q=await dispatch(env,{...body,proof_actions:actions},transport,1000000),p=await verifyTicket(env,q.ticket,1000000),r=record(p);r.actions_sha256=p.actions_sha256;
 assert.equal((await parseResultLog(marker(r),p)).result.status,'verified');
 const forged=structuredClone(r);forged.result.search.receipt.actions=[{kind:'rfl',argument:null}];
 for(const serialize of [marker,compressedMarker])await assert.rejects(parseResultLog(serialize(forged),p),/Actual checked human actions/);
});

test('hybrid requests require an attributed independently replayed proof and reject human action overrides',async()=>{
 validatePublicStatement({...body,model_family:'prospective-hybrid-v2'});
 assert.throws(()=>validatePublicStatement({...body,model_family:'prospective-hybrid-v2',proof_actions:[{kind:'rfl',argument:null}]}));
 const transport=async url=>url.endsWith('/commits/main')?response({sha:CORE_SHA}):url.endsWith('/dispatches')?response(null,204):response(repository);
 const q=await dispatch(env,{...body,model_family:'prospective-hybrid-v2'},transport,1000000),p=await verifyTicket(env,q.ticket,1000000),r=record(p);
 r.model_family='prospective-hybrid-v2';Object.assign(r.result,{checkpoint_sha256:'b'.repeat(64),library_sha256:'c'.repeat(64),production_authority:false,automatic_training:false,automatic_promotion:false});
 Object.assign(r.result.search,{format:'pcs-attributed-hybrid-v1',status:'verified',goal_sha256:receipt.goal_sha256,budget:48,expansions:4,stages:[{component:'ordinary_Std',status:'unknown',expansions:3},{component:'memory_structural',status:'verified',expansions:1}],cost:{measured_lean_calls_excluding_legacy_memory_replay:9,cold_wall_seconds:1},winning_component:'memory_structural',independent_replay:{status:'verified',goal_sha256:receipt.goal_sha256,kernel:structuredClone(receipt.kernel)}});
 assert.equal((await parseResultLog(marker(r),p)).result.status,'verified');
 for(const change of [r=>delete r.result.search.independent_replay,r=>r.result.search.independent_replay.goal_sha256='0'.repeat(64),r=>r.result.search.independent_replay.kernel.axioms=['Unapproved'],r=>r.result.search.winning_component='invented_superiority',r=>r.result.automatic_promotion=true,r=>r.result.checkpoint_sha256='fabricated',r=>r.result.search.expansions=999,r=>r.result.search.cost.cold_wall_seconds=-1,r=>r.result.search.stages.reverse()]){const c=structuredClone(r);change(c);await assert.rejects(parseResultLog(compressedMarker(c),p));}
});

test('previous protected source stays bound to an already signed unexpired ticket',async()=>{
 const now=1000000;
 async function signed(core){
  const payload={format:'pcs-public-lean-ticket-v1',request_id:'abcd'.repeat(8),core_sha:core,source_sha256:'1'.repeat(64),interpretation:null,issued:now,expires:now+3600000};
  const raw=JSON.stringify(payload),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const mac=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('PCS_PUBLIC_LEAN_TICKET_V1:'+raw))).toString('hex');
  return {payload,ticket:Buffer.from(raw).toString('base64url')+'.'+mac};
 }
 const old=await signed(PREVIOUS_CORE_SHA);
 assert.equal((await verifyTicket(env,old.ticket,now)).core_sha,PREVIOUS_CORE_SHA);
 const run={id:123,display_title:'PCS public Lean '+old.payload.request_id,head_sha:PREVIOUS_CORE_SHA,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/pcs-lean-public.yml',repository,status:'in_progress'};
 assert.equal((await poll(env,old.ticket,async()=>response({workflow_runs:[run]}),now)).status,'running');
 await assert.rejects(poll(env,old.ticket,async()=>response({workflow_runs:[{...run,head_sha:'f'.repeat(40)}]}),now),/Unapproved/);
 await assert.rejects(verifyTicket(env,(await signed('f'.repeat(40))).ticket,now),/mismatched/);
 await assert.rejects(verifyTicket(env,old.ticket,now+3600001),/Expired/);
});
