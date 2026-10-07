import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.btoa)globalThis.btoa=s=>Buffer.from(s,"binary").toString("base64");
import worker from "../src/worker.js";
import {DUEL_VERSION,duelFor} from "../public/forge-duel-core.mjs";
const ORIGIN="https://pcs-duel-unit-test.example";
const adult={id:"adult-forge-duel-test",role:"member",status:"active",email_verified:1,is_owner:0};
const ballot=r=>({seed:197,round:r,version:DUEL_VERSION,choice:duelFor(197,r).oracle.winner,reason:"risk",confidence:3});
const valid=()=>({session_version:DUEL_VERSION,ballots:[ballot(0),ballot(1),ballot(2)],adult_confirmation:true,consent_training:true});
function fixture({user=adult,admin=null,changes=1}={}){
  const log=[],state={inserts:0,deleted:0,exports:0,digests:[]};
  const db={prepare(sql){return {bind(...args){log.push({sql,args});return{
    async first(){
      if(sql.includes("rate_limits"))return{count:1};
      if(sql.includes("FROM sessions s JOIN users u"))return user;
      if(sql.includes("FROM admin_sessions s JOIN users u"))return admin;
      if(sql.includes("SELECT COUNT(*) AS n FROM forge_duel_research_sessions"))return {n:0};
      throw Error("Unexpected FIRST query: "+sql);
    },
    async run(){
      if(sql.includes("INSERT OR IGNORE INTO forge_duel_research_sessions")){
        state.inserts++;
        assert.equal(args[1],adult.id);
        assert.match(args[2],/^[a-f0-9]{64}$/);
        assert.equal(args[3],DUEL_VERSION);
        assert.equal(args[6],3);
        assert.match(args[5],/oracle_winner/);
        state.digests.push(args[2]);
        return{meta:{changes}};
      }
      if(sql.includes("DELETE FROM forge_duel_research_sessions WHERE user_id=?")){
        assert.equal(args[0],adult.id);state.deleted++;
        return{meta:{changes:2}};
      }
      if(sql.includes("UPDATE admin_sessions SET last_seen_at"))return{meta:{changes:1}};
      throw Error("Unexpected RUN query: "+sql);
    },
    async all(){
      if(sql.includes("SELECT verified_replay_json FROM forge_duel_research_sessions")){
        state.exports++;
        return{results:[]};
      }
      throw Error("Unexpected ALL query: "+sql);
    }
  };}};}};
  return{env:{RATE_LIMIT_SALT:"unit-test-salt-not-real",COMMONS_DB:db},log,state};
}
async function post(ctx,path,body,headers={}){
  const r=new Request(ORIGIN+path,{method:"POST",headers:{
    "content-type":"application/json",origin:ORIGIN,cookie:"pcs_commons_session=test-user-token",...headers
  },body:JSON.stringify(body)});
  const response=await worker.fetch(r,ctx.env);
  return{status:response.status,body:await response.json()};
}
test("the real Worker API verifies and stores 3 opt-in adult choices",async()=>{
  const ctx=fixture(),r=await post(ctx,"/api/arena/forge-duel/donate",valid());
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.recorded,true);
  assert.equal(r.body.record_count,3);
  assert.equal(ctx.state.inserts,1);
});
test("duplicate ballots produce the same content digest but no additional D1 record",async()=>{
  const a=fixture(),b=fixture({changes:0});
  assert.equal((await post(a,"/api/arena/forge-duel/donate",valid())).status,200);
  const response=await post(b,"/api/arena/forge-duel/donate",valid());
  assert.equal(response.body.recorded,false);
  assert.equal(a.state.digests[0],b.state.digests[0]);
});
test("reject anonymous, email-unverified, absent adult consent or injected verifier labels",async()=>{
  let ctx=fixture({user:null});
  assert.equal((await post(ctx,"/api/arena/forge-duel/donate",valid(),{cookie:""})).status,401);
  ctx=fixture({user:{...adult,email_verified:0}});
  assert.equal((await post(ctx,"/api/arena/forge-duel/donate",valid())).status,403);
  for(const field of ["adult_confirmation","consent_training"]){
    ctx=fixture();const body=valid();body[field]=false;
    assert.equal((await post(ctx,"/api/arena/forge-duel/donate",body)).status,403);
    assert.equal(ctx.state.inserts,0);
  }
  ctx=fixture();let body=valid();body.oracle_result="PASS";
  assert.equal((await post(ctx,"/api/arena/forge-duel/donate",body)).status,400);
  ctx=fixture();body=valid();body.ballots[0].confidence=9;
  assert.equal((await post(ctx,"/api/arena/forge-duel/donate",body)).status,400);
  ctx=fixture();
  assert.equal((await post(ctx,"/api/arena/forge-duel/donate",valid(),{origin:"https://evil.example"})).status,403);
});
test("owner-only export denies unauthenticated or delegated admin sessions",async()=>{
  let ctx=fixture(),request=new Request(ORIGIN+"/api/admin/arena/forge-duel/dataset");
  assert.equal((await worker.fetch(request,ctx.env)).status,401);
  ctx=fixture({admin:{...adult,id:"owner",role:"admin",is_owner:1}});
  request=new Request(ORIGIN+"/api/admin/arena/forge-duel/dataset",{headers:{cookie:"pcs_admin_session=valid-owner"}});
  const response=await worker.fetch(request,ctx.env),data=await response.json();
  assert.equal(response.status,200,JSON.stringify(data));
  assert.equal(data.format,"pcs-forge-duel-optin-research-dataset-v1");
  assert.equal(ctx.state.exports,1);
  assert.deepEqual(data.entries,[]);
  ctx=fixture({admin:{...adult,role:"admin",is_owner:0}});
  assert.equal((await worker.fetch(request,ctx.env)).status,403);
});
test("research owner can erase their active donated ballots",async()=>{
  const ctx=fixture(),response=await post(ctx,"/api/arena/forge-duel/erase",{});
  assert.equal(response.status,200);
  assert.equal(response.body.deleted,2);
  assert.equal(ctx.state.deleted,1);
  const noUser=fixture({user:null});
  assert.equal((await post(noUser,"/api/arena/forge-duel/erase",{}, {cookie:""})).status,401);
});
