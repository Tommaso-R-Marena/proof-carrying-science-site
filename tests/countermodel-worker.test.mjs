// Route tests against the real Worker, following the same isolated D1 harness as Safety Forge.
import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.btoa)globalThis.btoa=s=>Buffer.from(s,'binary').toString('base64');
import worker from '../src/worker.js';
import {COUNTERMODEL_VERSION} from '../public/countermodel-core.mjs';
const ORIGIN='https://pcs-countermodel-route.example';
const adult={id:'adult-fixture',role:'member',status:'active',email_verified:1,is_owner:0};
const choices=()=>({version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'}]});
const valid=()=>({adult_confirmation:true,consent_training:true,session:choices()});
function fakeEnv({user=adult,admin=null,changes=1,records=[]}={}){
 const state={writes:0,deletes:0,exposed:false,sha:null};
 const db={prepare(sql){return{bind(...args){return{
  async first(){
   if(sql.includes('rate_limits'))return {count:1};
   if(sql.includes('FROM sessions s JOIN users u'))return user;
   if(sql.includes('FROM admin_sessions s JOIN users u'))return admin;
   if(sql.includes('SELECT COUNT(*) AS n FROM countermodel_research_sessions'))return {n:0};
   throw Error('Unexpected SELECT: '+sql);
  },async run(){
   if(sql.includes('INSERT OR IGNORE INTO countermodel_research_sessions')){state.writes++;assert.equal(args[1],adult.id);assert.equal(args[2],'implication-flip');assert.match(args[4],/^[0-9a-f]{64}$/);state.sha=args[4];assert.equal(JSON.parse(args[6]).pcs_authoritative,false);return {meta:{changes}};}
   if(sql.includes('DELETE FROM countermodel_research_sessions')){state.deletes++;assert.equal(args[0],adult.id);return {meta:{changes:1}};}
   if(sql.includes('UPDATE admin_sessions SET last_seen_at'))return {meta:{changes:1}};
   throw Error('Unexpected mutation '+sql);
  },async all(){
   if(sql.includes('FROM countermodel_research_sessions ORDER BY')){state.exposed=true;return {results:records};}
   throw Error('Unexpected query '+sql);
  }
 };}};}};
 return {state,env:{COMMONS_DB:db,RATE_LIMIT_SALT:'test-only-salt'}};
}
const request=(path,data,headers={})=>new Request(ORIGIN+path,{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',cookie:'pcs_commons_session=local-test-cookie',...headers},body:JSON.stringify(data)});
async function hit(ctx,path,data=valid(),headers){const r=await worker.fetch(request(path,data,headers),ctx.env);return{status:r.status,body:await r.json()};}
test('public missions come from same pinned finite checker as replay',async()=>{
 const ctx=fakeEnv({user:null});const r=await worker.fetch(new Request(ORIGIN+'/api/arena/countermodel/missions'),ctx.env);const body=await r.json();assert.equal(r.status,200);assert.equal(body.missions.length,7);assert.equal(body.lean_kernel_checked,false);
});
test('server replays a real solved finite countermodel before inserting',async()=>{
 const ctx=fakeEnv();const r=await hit(ctx,'/api/arena/countermodel/donate');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.recorded,true);assert.equal(r.body.lean_kernel_checked,false);assert.equal(ctx.state.writes,1);
});
test('deduplicated insert is honest, not another recorded sample',async()=>{
 const ctx=fakeEnv({changes:0});const r=await hit(ctx,'/api/arena/countermodel/donate');assert.equal(r.status,200);assert.equal(r.body.recorded,false);
});
test('reject unauthorized, underage, unsigned, forged or incomplete trajectories',async()=>{
 let ctx=fakeEnv({user:null});assert.equal((await hit(ctx,'/api/arena/countermodel/donate',valid(),{cookie:''})).status,401);
 ctx=fakeEnv({user:{...adult,email_verified:0}});assert.equal((await hit(ctx,'/api/arena/countermodel/donate')).status,403);
 for(const key of ['adult_confirmation','consent_training']){ctx=fakeEnv();const v=valid();v[key]=false;assert.equal((await hit(ctx,'/api/arena/countermodel/donate',v)).status,403);assert.equal(ctx.state.writes,0);}
 for(const mutate of [v=>v.score=999,v=>v.session.actions.push({type:'check',verified:true}),v=>v.session.actions.pop(),v=>v.session.mission_id='unregistered']){
  ctx=fakeEnv();const v=valid();mutate(v);assert.equal((await hit(ctx,'/api/arena/countermodel/donate',v)).status,400);assert.equal(ctx.state.writes,0);
 }
 ctx=fakeEnv();assert.equal((await hit(ctx,'/api/arena/countermodel/donate',valid(),{origin:'https://hostile.example'})).status,403);
});
test('owner-only export omits private user metadata and allows deterministic recheck',async()=>{
 const session=choices();const {replayCountermodelSession}=await import('../public/countermodel-core.mjs');
 const replay=replayCountermodelSession(session);
 const records=[{session_json:JSON.stringify(session),replay_json:JSON.stringify(replay)}];
 let ctx=fakeEnv({records});let r=await worker.fetch(new Request(ORIGIN+'/api/admin/arena/countermodel/dataset'),ctx.env);assert.equal(r.status,401);
 ctx=fakeEnv({admin:{...adult,role:'admin',is_owner:0},records});r=await worker.fetch(new Request(ORIGIN+'/api/admin/arena/countermodel/dataset',{headers:{cookie:'pcs_admin_session=reviewer'}}),ctx.env);assert.equal(r.status,403);
 ctx=fakeEnv({admin:{...adult,id:'pcs-owner',role:'admin',is_owner:1},records});r=await worker.fetch(new Request(ORIGIN+'/api/admin/arena/countermodel/dataset',{headers:{cookie:'pcs_admin_session=owner'}}),ctx.env);assert.equal(r.status,200);const body=await r.json();assert.equal(body.entries.length,1);assert.doesNotMatch(JSON.stringify(body.entries),/user_id|email|created_at/);
});
test('self-service deletion never acts on another account',async()=>{
 const ctx=fakeEnv();const r=await hit(ctx,'/api/arena/countermodel/erase',{});assert.equal(r.status,200);assert.equal(ctx.state.deletes,1);
 const anon=fakeEnv({user:null});assert.equal((await hit(anon,'/api/arena/countermodel/erase',{}, {cookie:''})).status,401);assert.equal(anon.state.deletes,0);
});
