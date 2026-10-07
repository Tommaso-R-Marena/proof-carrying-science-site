import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.btoa)globalThis.btoa=x=>Buffer.from(x,"binary").toString("base64");
import worker from "../src/worker.js";
import {PROOFLAB_VERSION,TASKS,nextReady,repairPuzzle} from "../public/prooflab-core.mjs";

const ORIGIN="https://pcs-prooflab-unit-test.example";
const contributor={id:"adult-prooflab-test",role:"member",status:"active",email_verified:1,is_owner:0};
function submission(){
 const task=TASKS[0],actions=[],placed=[];
 while(nextReady(task.id,placed).length){
  const id=nextReady(task.id,placed)[0].id;actions.push({kind:"place",node:id});placed.push(id);
 }
 actions.push({kind:"repair",choice:repairPuzzle(task.id).missing_source});
 actions.push({kind:"scope",choice:"scoped",confidence:3});
 return {version:PROOFLAB_VERSION,task_id:task.id,actions,adult_confirmation:true,consent_training:true};
}
function fixture({user=contributor,admin=null,changes=1,daily=0}={}){
 const state={inserts:0,erases:0,exports:0,lastInsert:null};
 const db={prepare(sql){return{bind(...args){return{
  async first(){
   if(sql.includes("rate_limits"))return{count:1};
   if(sql.includes("FROM sessions s JOIN users u"))return user;
   if(sql.includes("FROM admin_sessions s JOIN users u"))return admin;
   if(sql.includes("SELECT COUNT(*) AS n FROM prooflab_research_sessions"))return{n:daily};
   throw Error("Unexpected FIRST query: "+sql);
  },
  async run(){
   if(sql.includes("INSERT OR IGNORE INTO prooflab_research_sessions")){
    state.inserts++;state.lastInsert=args;
    assert.equal(args[1],contributor.id);
    assert.match(args[2],/^[a-f0-9]{64}$/);
    assert.equal(args[3],TASKS[0].id);
    assert.equal(args[5],"train");
    assert.equal(args[7],PROOFLAB_VERSION);
    assert.equal(args[10],submission().actions.length);
    const checked=JSON.parse(args[9]);
    assert.equal(checked.kernel_proof_verified,false);
    assert.equal(checked.score,100);
    return{meta:{changes}};
   }
   if(sql.includes("DELETE FROM prooflab_research_sessions WHERE user_id=?")){
    assert.equal(args[0],contributor.id);state.erases++;return{meta:{changes:2}};
   }
   if(sql.includes("UPDATE admin_sessions SET last_seen_at"))return{meta:{changes:1}};
   throw Error("Unexpected RUN query: "+sql);
  },
  async all(){
   if(sql.includes("SELECT verified_replay_json FROM prooflab_research_sessions")){
    state.exports++;return{results:[]};
   }
   throw Error("Unexpected ALL query: "+sql);
  }
 };}};}};
 return{env:{RATE_LIMIT_SALT:"unit-test-salt-not-real",COMMONS_DB:db},state};
}
async function post(ctx,path,body,headers={}){
 const request=new Request(ORIGIN+path,{method:"POST",headers:{
  "content-type":"application/json",origin:ORIGIN,cookie:"pcs_commons_session=test-user-token",...headers
 },body:JSON.stringify(body)});
 const res=await worker.fetch(request,ctx.env);
 return{status:res.status,data:await res.json()};
}
test("verified adult researcher can donate a real source-backed strategy but not a Lean proof",async()=>{
 const f=fixture(),r=await post(f,"/api/arena/prooflab/donate",submission());
 assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.recorded,true);
 assert.equal(r.data.score,100);
 assert.equal(r.data.kernel_proof_verified,false);
 assert.equal(f.state.inserts,1);
});
test("unknown users, unverified email, missing consent and failed replay are all rejected",async()=>{
 const b=submission();
 let f=fixture({user:null});
 assert.equal((await post(f,"/api/arena/prooflab/donate",b,{cookie:""})).status,401);
 f=fixture({user:{...contributor,email_verified:0}});
 assert.equal((await post(f,"/api/arena/prooflab/donate",b)).status,403);
 for(const field of ["adult_confirmation","consent_training"]){
  const bad={...b,[field]:false};f=fixture();
  assert.equal((await post(f,"/api/arena/prooflab/donate",bad)).status,403);
  assert.equal(f.state.inserts,0);
 }
 for(const bad of [
  {...b,claimed_lean_proof:true},
  {...b,task_id:"PKPDCheck/pkpdContractRun_sound"},
  {...b,actions:[{kind:"place",node:"fabricated"},{kind:"repair",choice:"scope"},{kind:"scope",choice:"scoped",confidence:3}]},
  {...b,actions:[{kind:"place",node:"read"},{kind:"repair",choice:"scope"},{kind:"scope",choice:"scoped",confidence:3}]},
 ]){
  f=fixture();const r=await post(f,"/api/arena/prooflab/donate",bad);
  assert.equal(r.status,400,JSON.stringify(r.data));assert.equal(f.state.inserts,0);
 }
 f=fixture();assert.equal((await post(f,"/api/arena/prooflab/donate",b,{origin:"https://evil.example"})).status,403);
});
test("donation retries deduplicate and 12/day abuse limit fails closed",async()=>{
 let f=fixture({changes:0});
 const repeat=await post(f,"/api/arena/prooflab/donate",submission());
 assert.equal(repeat.status,200);assert.equal(repeat.data.recorded,false);
 f=fixture({daily:12});
 const blocked=await post(f,"/api/arena/prooflab/donate",submission());
 assert.equal(blocked.status,429);assert.equal(f.state.inserts,0);
});
test("private, owner-only research export and account-owned deletion enforce authority",async()=>{
 let f=fixture();
 let res=await worker.fetch(new Request(ORIGIN+"/api/admin/arena/prooflab/dataset"),f.env);
 assert.equal(res.status,401);
 f=fixture({admin:{...contributor,id:"test-owner",role:"admin",is_owner:1}});
 res=await worker.fetch(new Request(ORIGIN+"/api/admin/arena/prooflab/dataset",{headers:{cookie:"pcs_admin_session=test-owner-token"}}),f.env);
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.format,"pcs-prooflab-optin-learning-sessions-v1");
 assert.deepEqual(data.records,[]);assert.equal(f.state.exports,1);
 assert.ok(!("user_id" in data));
 f=fixture({admin:{...contributor,role:"admin",is_owner:0}});
 res=await worker.fetch(new Request(ORIGIN+"/api/admin/arena/prooflab/dataset",{headers:{cookie:"pcs_admin_session=non-owner"}}),f.env);
 assert.equal(res.status,403);
 f=fixture();const erased=await post(f,"/api/arena/prooflab/erase",{});
 assert.equal(erased.status,200);assert.equal(erased.data.deleted,2);assert.equal(f.state.erases,1);
});
