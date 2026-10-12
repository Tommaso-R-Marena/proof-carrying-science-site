import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import catalog from '../public/memory-workshop-catalog.mjs';
import {createSession,replay} from '../public/bridge-builder-core.mjs';
import {dispatch,verifyTicket,parseResultLog,CORE_SHA} from '../src/lean-research.js';
import worker from '../src/worker.js';
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
function finished(m){const s=createSession(m.id,catalog);let r=replay(s,catalog);for(const action of m.receipts[0].actions.slice(m.automatic_setup_actions.length)){const node=m.nodes[r.current_node],edge=node.edges.findIndex(e=>JSON.stringify(e.action)===JSON.stringify(action));assert.ok(edge>=0);s.events.push({kind:'choose',node:r.current_node,edge,sequence:s.events.length});r=replay(s,catalog);}assert.ok(r.completed);return {s,r};}
test('memory missions retain actual induction, exact goals, and immutable catalogs',()=>{
 assert.equal(hash(Object.fromEntries(Object.entries(catalog).filter(([k])=>k!=='content_sha256'))),catalog.content_sha256);
 for(const m of catalog.missions){const {s,r}=finished(m);assert.equal(r.receipt.goal_sha256,m.goal_sha256);assert.equal(r.receipt.primitive_catalog_sha256,catalog.primitive_catalog_sha256);assert.throws(()=>replay(s));}
 for(const m of catalog.missions.filter(m=>/induction|recurrence/.test(m.id)))assert.ok(m.receipts[0].actions.some(a=>a.kind==='induct_nat'));
});
test('actual Worker recognizes the pinned memory catalog and rejects a forged identity',async()=>{
 const {s}=finished(catalog.missions[1]);
 const call=async body=>worker.fetch(new Request('https://memory-test.example/api/demo/bridge-builder/replay',{method:'POST',headers:{'content-type':'application/json',origin:'https://memory-test.example'},body:JSON.stringify(body)}),{RATE_LIMIT_SALT:'test-rate-salt',COMMONS_DB:{prepare(){return {bind(){return {first:async()=>({count:1}),run:async()=>({meta:{changes:1}})}}}}}});
 const r=await call(s);assert.equal(r.status,200);assert.equal((await r.json()).completed,true);
 assert.equal((await call({...s,catalog_sha256:'0'.repeat(64)})).status,400);
});
test('memory proof requests bind both model generation and exact typed human actions',async()=>{
 const m=catalog.missions[1],{r}=finished(m),env={PCS_LEAN_GITHUB_TOKEN:'test-token',RATE_LIMIT_SALT:'test-secret'};
 const transport=async url=>url.endsWith('/dispatches')?new Response(null,{status:204}):Response.json(url.endsWith('/commits/main')?{sha:CORE_SHA}:{private:false,full_name:'Tommaso-R-Marena/proof-carrying-science'});
 const q=await dispatch(env,{statement:m.statement,interpretation:0,public_consent:true,license:'CC0-1.0',proof_actions:r.proof_actions,model_family:'verified-memory-v1'},transport,1000000);
 const p=await verifyTicket(env,q.ticket,1000000);assert.equal(p.model_family,'verified-memory-v1');assert.match(p.actions_sha256,/^[0-9a-f]{64}$/);
 const record={format:'pcs-public-lean-result-v1',request_id:p.request_id,core_sha:p.core_sha,source_sha256:p.source_sha256,actions_sha256:p.actions_sha256,model_family:p.model_family,result:{pcs_authority:false,status:'verified',formalization:{candidates:[{interpretation_sha256:m.goal_sha256,lean:r.receipt.statement}]},search:{receipt:r.receipt}}};
 const c=[{name:'checked',expression:{kind:'constant',children:[],value:'Nat'}}],id=hash(c);
 const packed={format:'pcs-interned-public-lean-v1',expanded_limit_bytes:4000000,catalogs:{[id]:c},payload:{...record,diagnostics:[{available_lemmas:{pcs_catalog_ref:id}}]}};
 const log=x=>'PCS_LEAN_RESULT_GZIP_V1:'+gzipSync(Buffer.from(JSON.stringify(x))).toString('base64')+'\n';
 const result=await parseResultLog(log(packed),p);assert.deepEqual(result.diagnostics[0].available_lemmas,c);assert.equal(result.result.status,'verified');
 const forged=structuredClone(packed);forged.catalogs[id][0].name='forged';await assert.rejects(parseResultLog(log(forged),p),/digest/);
 const huge=['x'.repeat(100000)],hid=hash(huge);const bomb={...packed,catalogs:{[hid]:huge},payload:{...record,diagnostics:Array(100).fill({pcs_catalog_ref:hid})}};await assert.rejects(parseResultLog(log(bomb),p),/Expanded/);
 await assert.rejects(parseResultLog(log(packed),{...p,model_family:'induction-abstraction-v2'}),/Unapproved/);
});

test('strong symbolic baseline remains distinct, goal-bound and axiom-audited',async()=>{
 const m=catalog.missions[0],{r}=finished(m);
 const p={request_id:'1'.repeat(32),core_sha:'2'.repeat(40),source_sha256:'3'.repeat(64),model_family:'verified-memory-v1',interpretation:0};
 // Protocol fixture derived from an actual checked theorem; it is not evidence
 // of a hosted Std run or a model-performance result.
 const receipt={...structuredClone(r.receipt),format:'pcs-std-baseline-proof-v1'};
 const record={format:'pcs-public-lean-result-v1',...p,result:{status:'unknown',pcs_authority:false,formalization:{candidates:[{lean:receipt.statement,interpretation_sha256:m.goal_sha256}]}},strong_baseline:{status:'verified',pcs_authority:false,search:{receipt}}};
 const log=x=>'PCS_LEAN_RESULT_GZIP_V1:'+gzipSync(Buffer.from(JSON.stringify(x))).toString('base64')+'\n';
 const checked=await parseResultLog(log(record),p);assert.equal(checked.result.status,'unknown');assert.equal(checked.strong_baseline.status,'verified');
 receipt.kernel.axioms.push('sorryAx');await assert.rejects(parseResultLog(log(record),p),/kernel receipt/);receipt.kernel.axioms.pop();receipt.goal_sha256='9'.repeat(64);
 const changed=await parseResultLog(log(record),p);assert.equal(changed.strong_baseline.status,'different_interpretation');assert.equal(changed.strong_baseline.certifies_selected_interpretation,false);
});
