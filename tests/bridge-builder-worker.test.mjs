import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {createSession,replay,mission} from '../public/bridge-builder-core.mjs';
const HOST='https://bridge-test.example';
const adult={id:'test-adult',role:'member',status:'active',email_verified:1,is_owner:0};
function session(){const s=createSession('tutorial');let r=replay(s);while(!r.completed){const n=mission('tutorial').nodes[r.current_node],edge=n.edges.findIndex(e=>e.status!=='invalid');s.events.push({kind:'choose',node:r.current_node,edge,sequence:s.events.length});r=replay(s);}return s;}
function fixture({user=adult,cap=0}={}){
 const state={inserted:0,deleted:0};
 const db={prepare(sql){const query=args=>({_sql:sql,_args:args,
  async first(){if(sql.includes('rate_limits'))return {count:1};if(sql.includes('FROM sessions s JOIN users u'))return user;if(sql.includes('bridge_research_sessions'))return {n:cap,bytes:0};if(sql.includes('FROM users WHERE id'))return user;if(sql.includes('SELECT event_hash'))return null;throw Error(sql);},
  async run(){if(sql.startsWith('INSERT OR IGNORE INTO bridge_research_sessions')){state.inserted++;assert.equal(args[1],adult.id);const r=JSON.parse(args[6]);assert.equal(r.completed,true);assert.equal(r.automatic_training_authorization,false);return {meta:{changes:1}};}if(sql.startsWith('DELETE FROM bridge_research_sessions')){assert.equal(args[0],adult.id);state.deleted++;return {meta:{changes:1}};}if(sql.includes('audit'))return {meta:{changes:1}};throw Error(sql);}
 });return {...query([]),bind(...args){return query(args);}};},async batch(statements){assert.equal(statements.length,3);assert.match(statements[0]._sql,/SELECT id.*ORDER BY id LIMIT 1000/);assert.deepEqual(statements[0]._args,[adult.id]);assert.match(statements[1]._sql,/DELETE FROM bridge_research_sessions.*id IN/);assert.deepEqual(statements[1]._args,[adult.id,adult.id]);assert.deepEqual(statements[2]._args,[adult.id]);state.deleted++;return [{results:[{id:'12345678-1234-1234-1234-123456789012'}]},{meta:{changes:1}},{results:[{remaining:0}]}];}};
 return {state,env:{RATE_LIMIT_SALT:'test-salt',COMMONS_DB:db}};
}
async function call(ctx,path,body,origin=HOST){const response=await worker.fetch(new Request(HOST+path,{method:'POST',headers:{'content-type':'application/json',origin,cookie:'pcs_commons_session=test-session'},body:JSON.stringify(body)}),ctx.env);return {code:response.status,body:await response.json()};}
const payload=()=>({session:session(),adult_confirmation:true,consent_training:true});
test('real Worker replays explicit authenticated adult donation, without training authority',async()=>{const c=fixture(),r=await call(c,'/api/arena/bridge-builder/donate',payload());assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(c.state.inserted,1);assert.equal(r.body.eligible_for_training,false);});
test('consent, age, login, verification, storage quota and origin are mandatory',async()=>{
 for(const [options,change,code] of [[{user:null},{},401],[{user:{...adult,email_verified:0}},{},403],[{}, {adult_confirmation:false},400],[{}, {consent_training:false},400],[{cap:1000},{},429]]){const c=fixture(options),r=await call(c,'/api/arena/bridge-builder/donate',{...payload(),...change});assert.equal(r.code,code,JSON.stringify(r.body));assert.equal(c.state.inserted,0);}
 const c=fixture();assert.equal((await call(c,'/api/arena/bridge-builder/donate',payload(),'https://evil.example')).code,403);
});
test('producer scores and changed catalog never enter storage',async()=>{const c=fixture(),body=payload();body.session.score=100;assert.equal((await call(c,'/api/arena/bridge-builder/donate',body)).code,400);assert.equal(c.state.inserted,0);});
test('erasure targets only the authenticated contributor',async()=>{const c=fixture(),r=await call(c,'/api/arena/bridge-builder/erase',{});assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(c.state.deleted,1);assert.deepEqual(r.body.withdrawal.withdrawn_entry_ids,['12345678-1234-1234-1234-123456789012']);assert.equal(r.body.withdrawal.model_unlearning,false);});
test('public replay has mathematical catalog labels, never fresh kernel authority',async()=>{const c=fixture(),r=await call(c,'/api/demo/bridge-builder/replay',session());assert.equal(r.code,200);assert.equal(r.body.completed,true);assert.match(r.body.label_boundary,/archived/);assert.equal(r.body.pcs_authority,false);assert.equal(c.state.inserted,0);});
