import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CATALOG,createSession,replay,mission} from '../public/bridge-builder-core.mjs';
import {CORE_SHA,dispatch,verifyTicket,validateProofActions,parseResult} from '../src/lean-research.js';

function finish(id='tutorial') {
 const session=createSession(id);let r=replay(session);
 while(!r.completed){const node=mission(id).nodes[r.current_node],edge=node.edges.findIndex(e=>e.status!=='invalid');assert.ok(edge>=0);session.events.push({kind:'choose',node:r.current_node,edge,sequence:session.events.length});r=replay(session);}
 return session;
}
test('all public routes retain exact original goals and completed kernel artifacts',()=>{
 for(const m of CATALOG.missions){const s=finish(m.id),r=replay(s);assert.equal(r.completed,true);assert.equal(r.receipt.goal_sha256,m.goal_sha256);assert.deepEqual(r.proof_actions,r.receipt.actions);assert.equal(r.pcs_authority,false);validateProofActions(r.proof_actions);}
});
test('actual rejected choices, undo and visible hint exposure replay separately',()=>{
 const s=createSession('tutorial'),m=mission('tutorial'),node=m.nodes[m.start];
 const invalid=node.edges.findIndex(e=>e.status==='invalid');assert.ok(invalid>=0);
 s.events.push({kind:'hint',node:m.start,edge:null,sequence:0},{kind:'choose',node:m.start,edge:invalid,sequence:1});
 let r=replay(s);assert.equal(r.current_node,m.start);assert.equal(r.invalid_attempts,1);assert.equal(r.transitions[0].hint_exposed,true);
 const valid=node.edges.findIndex(e=>e.status!=='invalid');s.events.push({kind:'choose',node:m.start,edge:valid,sequence:2});r=replay(s);s.events.push({kind:'undo',node:r.current_node,edge:null,sequence:3});assert.equal(replay(s).current_node,m.start);
});
test('forged labels, goal fields, catalog identity, timeline and reordered history fail closed',()=>{
 const original=finish();
 for(const mutate of [s=>s.score=100,s=>s.catalog_sha256='0'.repeat(64),s=>s.events[0].sequence=99,s=>s.events[0].node='forged',s=>s.events[0].edge=true,s=>s.events.push({...s.events[0],sequence:s.events.length}),s=>s.events[0].status='closed']){const s=structuredClone(original);mutate(s);assert.throws(()=>replay(s));}
});
test('typed action envelope rejects code, admissions and fabricated rewards',()=>{
 for(const a of [[{kind:'apply',argument:'sorry'}],[{kind:'normalize',argument:'list; native_decide'}],[{kind:'induct_list',argument:'h0 h1 h1 h3'}],[{kind:'exact',argument:'h0',reward:1}],[{kind:'witness',argument:true}],[{kind:'axiom',argument:'False'}]])assert.throws(()=>validateProofActions(a));
});
test('public signed ticket binds the exact human proof actions and kernel evidence',async()=>{
 const r=replay(finish()),m=mission('tutorial'),env={PCS_LEAN_GITHUB_TOKEN:'test-actions-token',RATE_LIMIT_SALT:'test-ticket-secret'};
 const body={statement:m.statement,interpretation:0,public_consent:true,license:'CC0-1.0',proof_actions:r.proof_actions},calls=[];
 const transport=async(url,options)=>{calls.push({url,options});if(url.endsWith('/actions/workflows/pcs-lean-public.yml'))return Response.json({state:'active',path:'.github/workflows/pcs-lean-public.yml'});if(url.endsWith('/dispatches'))return new Response(null,{status:204});return Response.json(url.endsWith('/git/ref/heads/main')?{object:{sha:CORE_SHA}}:{private:false,default_branch:'main',full_name:'Tommaso-R-Marena/proof-carrying-science'});};
 const q=await dispatch(env,body,transport,1000000),p=await verifyTicket(env,q.ticket,1000000);
 const hash=createHash('sha256').update(JSON.stringify(r.proof_actions.map(a=>({argument:a.argument,kind:a.kind})))).digest('hex');assert.equal(p.actions_sha256,hash);
 assert.deepEqual(JSON.parse(JSON.parse(calls.at(-1).options.body).inputs.proof_actions),r.proof_actions);
 const record={format:'pcs-public-lean-result-v1',request_id:p.request_id,core_sha:p.core_sha,source_sha256:p.source_sha256,actions_sha256:hash,result:{status:'verified',pcs_authority:false,formalization:{candidates:[{interpretation_sha256:m.goal_sha256,lean:r.receipt.statement}]},search:{receipt:r.receipt}}};
 const marker=x=>'PCS_LEAN_RESULT_V1:'+Buffer.from(JSON.stringify(x)).toString('base64')+'\n';
 assert.equal(parseResult(marker(record),p).result.status,'verified');record.actions_sha256='0'.repeat(64);assert.throws(()=>parseResult(marker(record),p),/binding/);
});
export {finish};
