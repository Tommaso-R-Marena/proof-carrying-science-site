import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import worker from "../src/worker.js";
import {PROOFLAB_VERSION,allProofLabCases,availablePlanMoves} from "../public/prooflab-core.mjs";
import {PROOFLAB_SOURCE_COMMIT} from "../public/prooflab-source-data.mjs";
const HOST="https://pcs-prooflab-integration.example";
const adult={id:"prooflab-test-adult",role:"member",status:"active",email_verified:1,is_owner:0};
const currentCase=allProofLabCases()[0];
function actionsFor(c){
 const actions=[],done=[];
 while(done.length<c.nodes.length){
  const id=availablePlanMoves(c.id,done).at(-1);
  assert.ok(id);done.push(id);actions.push({node:id,reason:"dependency",confidence:2});
 }
 return actions;
}
function valid(){
 return {case_id:currentCase.id,version:PROOFLAB_VERSION,actions:actionsFor(currentCase),
  hints_used:0,threat:currentCase.threats[0],threat_confidence:2,
  adult_confirmation:true,consent_training:true};
}
function fixture({user=adult,admin=null,changes=1,cap=0}={}){
 const events=[],state={insertions:0,deletes:0,exports:0,hashes:[],lastPlan:null};
 const db={prepare(sql){return{bind(...args){events.push({sql,args});return{
  async first(){
   if(sql.includes("rate_limits"))return{count:1};
   if(sql.includes("FROM sessions s JOIN users u"))return user;
   if(sql.includes("FROM admin_sessions s JOIN users u"))return admin;
   if(sql.includes("SELECT COUNT(*) AS n FROM prooflab_research_sessions"))return{n:cap};
   throw Error("Unexpected first query "+sql);
  },
  async run(){
   if(sql.includes("INSERT OR IGNORE INTO prooflab_research_sessions")){
    state.insertions++;
    assert.equal(args.length,14);
    assert.equal(args[1],adult.id);
    assert.equal(args[2],currentCase.id);
    assert.equal(args[3],PROOFLAB_SOURCE_COMMIT);
    assert.match(args[4],/^[a-f0-9]{64}$/);
    assert.equal(args[5],PROOFLAB_VERSION);
    assert.equal(args[8],valid().actions.length);
    assert.equal(args[11],1);
    assert.match(args[7],/graph_replay/);
    state.hashes.push(args[4]);state.lastPlan=JSON.parse(args[7]);
    return{meta:{changes}};
   }
   if(sql.includes("DELETE FROM prooflab_research_sessions WHERE user_id=?")){
    assert.equal(args[0],adult.id);state.deletes++;return{meta:{changes:2}};
   }
   if(sql.includes("UPDATE admin_sessions SET last_seen_at"))return{meta:{changes:1}};
   throw Error("Unexpected run query "+sql);
  },
  async all(){
   if(sql.includes("SELECT verified_replay_json FROM prooflab_research_sessions")){
    state.exports++;return{results:[]};
   }
   throw Error("Unexpected all query "+sql);
  }
 };}};}};
 return{env:{RATE_LIMIT_SALT:"unit-test-salt-not-real",COMMONS_DB:db},events,state};
}
async function call(ctx,path,body,headers={}){
 const req=new Request(HOST+path,{method:"POST",
  headers:{"content-type":"application/json",origin:HOST,
    cookie:"pcs_commons_session=prooflab-test-token",...headers},
  body:JSON.stringify(body)});
 const resp=await worker.fetch(req,ctx.env);
 return{code:resp.status,body:await resp.json()};
}
test("real Worker accepts verified-email adult opt-in and independently grades real-source plan",async()=>{
 const ctx=fixture(),r=await call(ctx,"/api/arena/prooflab/donate",valid());
 assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.body.recorded,true);
 assert.equal(r.body.completed,true);
 assert.equal(ctx.state.insertions,1);
 assert.equal(ctx.state.lastPlan.case_theorem,currentCase.theorem);
 assert.equal(ctx.state.lastPlan.split,"training");
});
test("identical trace deduplicates by stable source-bound content digest",async()=>{
 const yes=fixture(),no=fixture({changes:0});
 const a=await call(yes,"/api/arena/prooflab/donate",valid());
 const b=await call(no,"/api/arena/prooflab/donate",valid());
 assert.equal(a.code,200);assert.equal(b.code,200);
 assert.equal(b.body.recorded,false);
 assert.equal(yes.state.hashes[0],no.state.hashes[0]);
});
test("fail-closed: no login, no email verification, no explicit adult consent, no external origin",async()=>{
 let ctx=fixture({user:null});
 assert.equal((await call(ctx,"/api/arena/prooflab/donate",valid(),{cookie:""})).code,401);
 ctx=fixture({user:{...adult,email_verified:0}});
 assert.equal((await call(ctx,"/api/arena/prooflab/donate",valid())).code,403);
 for(const x of ["adult_confirmation","consent_training"]){
  ctx=fixture();const b=valid();b[x]=false;
  assert.equal((await call(ctx,"/api/arena/prooflab/donate",b)).code,403);
  assert.equal(ctx.state.insertions,0);
 }
 ctx=fixture();
 assert.equal((await call(ctx,"/api/arena/prooflab/donate",valid(),{origin:"https://attacker.example"})).code,403);
});
test("reject reserved source cases and client-forged Lean verifier claims",async()=>{
 let ctx=fixture(),b=valid();b.case_id="pcs-frontier-01";
 assert.equal((await call(ctx,"/api/arena/prooflab/donate",b)).code,400);
 ctx=fixture();b=valid();b.lean_kernel_verified=true;
 assert.equal((await call(ctx,"/api/arena/prooflab/donate",b)).code,400);
 ctx=fixture();b=valid();b.actions[0].confidence=42;
 assert.equal((await call(ctx,"/api/arena/prooflab/donate",b)).code,400);
 ctx=fixture();b=valid();b.threat="I proved safety";
 assert.equal((await call(ctx,"/api/arena/prooflab/donate",b)).code,400);
 assert.equal(ctx.state.insertions,0);
});
test("quota rejects excessive donation attempts without storing research",async()=>{
 const ctx=fixture({cap:15});
 const r=await call(ctx,"/api/arena/prooflab/donate",valid());
 assert.equal(r.code,429);assert.equal(ctx.state.insertions,0);
});
test("owner-only export excludes all identity and refuses delegated administrators",async()=>{
 let ctx=fixture();let req=new Request(HOST+"/api/admin/arena/prooflab/dataset");
 assert.equal((await worker.fetch(req,ctx.env)).status,401);
 ctx=fixture({admin:{...adult,id:"owner",role:"admin",is_owner:1}});
 req=new Request(HOST+"/api/admin/arena/prooflab/dataset",{headers:{cookie:"pcs_admin_session=owner"}});
 let r=await worker.fetch(req,ctx.env),data=await r.json();
 assert.equal(r.status,200,JSON.stringify(data));
 assert.equal(data.format,"pcs-prooflab-optin-source-grounded-dataset-v1");
 assert.deepEqual(data.entries,[]);
 assert.equal(data.source_commit,PROOFLAB_SOURCE_COMMIT);
 assert.equal(ctx.state.exports,1);
 ctx=fixture({admin:{...adult,role:"admin",is_owner:0}});
 assert.equal((await worker.fetch(req,ctx.env)).status,403);
});
test("self-service deletion removes only the account's linked active plan records",async()=>{
 const ctx=fixture(),r=await call(ctx,"/api/arena/prooflab/erase",{});
 assert.equal(r.code,200);assert.equal(r.body.deleted,2);
 assert.equal(ctx.state.deletes,1);
 ctx=fixture({user:null});
 assert.equal((await call(ctx,"/api/arena/prooflab/erase",{}, {cookie:""})).code,401);
});
