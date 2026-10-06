// Authenticated Worker integration tests; exercise the REAL route with an in-memory
// D1-shaped fake that enforces the production SQL digest contract.
import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.btoa)globalThis.btoa=s=>Buffer.from(s,"binary").toString("base64");
import worker from "../src/worker.js";
import {SAFETY_LAB_VERSION} from "../public/safety-forge-core.mjs";

const ORIGIN="https://pcs-unit-test.example";
const adult={id:"consenting-adult-fixture",role:"member",status:"active",email_verified:1,is_owner:0};
const valid=()=>({
  scenario_seed:197,scenario_version:SAFETY_LAB_VERSION,
  attack_trials:[
    {actions:["shortcut"],assisted:false},
    {actions:["safe_route","deploy"],assisted:false}
  ],
  repair_trials:[
    {guards:["risk"],feedback_exposed:false},
    {guards:["joint_review","redact","risk"],feedback_exposed:true}
  ],
  adult_confirmation:true,consent_training:true
});
const queryLog=[];
function fakeEnv({user=adult,admin=null,changes=1}={}){
  const history=[];
  const state={insertCalls:0,digests:[],deletionCount:0,exportCalled:false};
  const db={
    prepare(sql){
      return {
        bind(...args){
          history.push({sql,args});
          return {
            async first(){
              if(sql.includes("rate_limits"))return {count:1};
              if(sql.includes("FROM sessions s JOIN users u"))return user;
              if(sql.includes("FROM admin_sessions s JOIN users u"))return admin;
              if(sql.includes("SELECT COUNT(*) AS n FROM safety_forge_research_sessions"))return {n:0};
              throw Error("Unexpected D1 first query: "+sql);
            },
            async run(){
              if(sql.includes("INSERT OR IGNORE INTO safety_forge_research_sessions")){
                state.insertCalls++;
                const hex=args[4];
                assert.match(hex,/^[0-9a-f]{64}$/,"D1 session_digest CHECK LENGTH=64");
                assert.equal(args[1],adult.id);
                assert.equal(args[2],197);
                assert.equal(args[3],SAFETY_LAB_VERSION);
                assert.ok(typeof args[6]==="string"&&args[6].includes("FINITE_SYNTHETIC_REPLAY_ONLY"));
                state.digests.push(hex);
                return {meta:{changes}};
              }
              if(sql.includes("DELETE FROM safety_forge_research_sessions WHERE user_id=?")){
                assert.equal(args[0],adult.id);
                state.deletionCount++;
                return {meta:{changes:2}};
              }
              if(sql.includes("UPDATE admin_sessions SET last_seen_at"))return {meta:{changes:1}};
              throw Error("Unexpected D1 run query: "+sql);
            },
            async all(){
              if(sql.includes("FROM safety_forge_research_sessions")&&sql.includes("verified_replay_json")){
                state.exportCalled=true;
                return {results:[]};
              }
              throw Error("Unexpected D1 all query: "+sql);
            }
          };
        }
      };
    }
  };
  return {env:{RATE_LIMIT_SALT:"not-production-unit-test-salt",COMMONS_DB:db},history,state};
}
const request=(path,body,headers={})=>new Request(ORIGIN+path,{
  method:"POST",
  headers:{
    "content-type":"application/json",
    "origin":ORIGIN,
    "cookie":"pcs_commons_session=test-session-token",
    ...headers
  },
  body:JSON.stringify(body)
});
async function hit(ctx,path,body,headers){
  const response=await worker.fetch(request(path,body,headers),ctx.env);
  return {status:response.status,body:await response.json()};
}

test("a consented verified adult donation passes the real Worker route and D1 hex digest constraint",async()=>{
  const ctx=fakeEnv();
  const res=await hit(ctx,"/api/arena/safety-lab/donate",valid());
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.recorded,true);
  assert.equal(ctx.state.insertCalls,1);
  assert.equal(ctx.state.digests[0].length,64);
  assert.match(ctx.state.digests[0],/^[0-9a-f]{64}$/);
});
test("identical content fingerprints deterministically while duplicate insert yields no new donation",async()=>{
  const a=fakeEnv(),b=fakeEnv({changes:0});
  const first=await hit(a,"/api/arena/safety-lab/donate",valid());
  const repeat=await hit(b,"/api/arena/safety-lab/donate",valid());
  assert.equal(first.status,200);
  assert.equal(repeat.status,200);
  assert.equal(repeat.body.recorded,false);
  assert.equal(a.state.digests[0],b.state.digests[0]);
});
test("anonymous players cannot donate, but can play locally",async()=>{
  const ctx=fakeEnv({user:null});
  const res=await hit(ctx,"/api/arena/safety-lab/donate",valid(),{cookie:""});
  assert.equal(res.status,401);
  assert.equal(ctx.state.insertCalls,0);
});
test("an unverified email is not sufficient for research donation",async()=>{
  const ctx=fakeEnv({user:{...adult,email_verified:0}});
  const res=await hit(ctx,"/api/arena/safety-lab/donate",valid());
  assert.equal(res.status,403);
  assert.equal(res.body.error,"email_verification_required");
  assert.equal(ctx.state.insertCalls,0);
});
test("absent explicit adult consent blocks storage",async()=>{
  for(const field of ["adult_confirmation","consent_training"]){
    const ctx=fakeEnv(),data=valid();data[field]=false;
    const res=await hit(ctx,"/api/arena/safety-lab/donate",data);
    assert.equal(res.status,403);
    assert.equal(ctx.state.insertCalls,0);
  }
});
test("forged PASS, malformed check tags and foreign origin are rejected",async()=>{
  const forged=fakeEnv(),data=valid();data.certified=true;
  const one=await hit(forged,"/api/arena/safety-lab/donate",data);
  assert.equal(one.status,400);
  assert.equal(forged.state.insertCalls,0);
  const wrong=fakeEnv(),attempt=valid();attempt.repair_trials[0].guards=["unregistered"];
  const two=await hit(wrong,"/api/arena/safety-lab/donate",attempt);
  assert.equal(two.status,400);
  assert.equal(wrong.state.insertCalls,0);
  const cross=fakeEnv();
  const three=await hit(cross,"/api/arena/safety-lab/donate",valid(),{origin:"https://hostile.example"});
  assert.equal(three.status,403);
  assert.equal(cross.state.insertCalls,0);
});
test("owner export requires separate admin session and excludes account details",async()=>{
  const unauthorized=fakeEnv();
  const noAdmin=await worker.fetch(new Request(ORIGIN+"/api/admin/arena/safety-lab/dataset"),unauthorized.env);
  assert.equal(noAdmin.status,401);
  const owner=fakeEnv({admin:{...adult,id:"pcs-owner-test",role:"admin",is_owner:1}});
  const res=await worker.fetch(new Request(ORIGIN+"/api/admin/arena/safety-lab/dataset",{headers:{cookie:"pcs_admin_session=owner-token"}}),owner.env);
  const body=await res.json();
  assert.equal(res.status,200,JSON.stringify(body));
  assert.equal(body.format,"pcs-safety-forge-optin-dataset-v1");
  assert.equal(owner.state.exportCalled,true);
  assert.equal(JSON.stringify(body.entries),"[]");
  const delegated=fakeEnv({admin:{...adult,role:"admin",is_owner:0}});
  const nonOwner=await worker.fetch(new Request(ORIGIN+"/api/admin/arena/safety-lab/dataset",{headers:{cookie:"pcs_admin_session=admin-token"}}),delegated.env);
  assert.equal(nonOwner.status,403);
});
test("account holder can erase research attempts without accidentally erasing another user's data",async()=>{
  const ctx=fakeEnv();
  const res=await hit(ctx,"/api/arena/safety-lab/erase",{});
  assert.equal(res.status,200,JSON.stringify(res.body));
  assert.equal(res.body.deleted,2);
  assert.equal(ctx.state.deletionCount,1);
  const anon=fakeEnv({user:null});
  const unauthorized=await hit(anon,"/api/arena/safety-lab/erase",{},{"cookie":""});
  assert.equal(unauthorized.status,401);
  assert.equal(anon.state.deletionCount,0);
});
