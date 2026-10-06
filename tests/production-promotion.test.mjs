import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
  validatePromotionMappings,stagePromotion,verifyPromotion,
  mergePromotion,promotionManifestPath
} from "../src/production-promotion.js";
import {hashSubmissionText} from "../src/contribution-github.js";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.btoa)globalThis.btoa=v=>Buffer.from(v,"binary").toString("base64");
if(!globalThis.atob)globalThis.atob=v=>Buffer.from(v,"base64").toString("binary");

const repo="Tommaso-R-Marena/proof-carrying-science-site";
const id="123e4567-e89b-42d3-a456-426614174000";
const sourceId="123e4567-e89b-42d3-a456-426614174001";
const task="TASK-123";
const baseSha="a".repeat(40),headSha="b".repeat(40);
const text="Audited source text for documentation.\n";
const filename="result.md", destination="docs/PCSResult.md";
const sourcePath=`contributions/pcs-submissions/${task}/${sourceId}/${filename}`;
const manifestPath=promotionManifestPath(id);
const maps=[{filename,path:destination}];

function simulatedGitHub({outcome="success",missingStep=false,changeMain=false,
  changedSource=false,otherDiff=false,modifyProduction=false}={}){
  const previous=globalThis.fetch;
  const headFiles=new Map(),calls=[];
  const mandatory=[
    "Check archive-to-production exact bytes and file scope",
    "Check PCS site source/links",
    "Run adversarial site/security campaign",
    "Check Worker and browser JavaScript syntax",
    "Run submission and production-promotion integration tests"
  ];
  function reply(status,obj){return {ok:status>=200&&status<400,status,json:async()=>obj};}
  globalThis.fetch=async(url,init)=>{
    const u=new URL(url),p=u.pathname,method=init.method;
    calls.push({method,path:p});
    const uploaded=init.body?JSON.parse(init.body):null;
    if(p.endsWith("/git/ref/heads/main"))return reply(200,{object:{sha:changeMain?"c".repeat(40):baseSha}});
    if(p.endsWith("/git/refs")&&method==="POST")return reply(201,{});
    if(p.endsWith("/pulls/9"))return reply(200,{merged:true,base:{ref:"main"},
      head:{ref:`pcs/submission/${sourceId}`,repo:{full_name:repo}}});
    if(p.endsWith("/pulls/10/files"))return reply(200,[
      {filename:destination,status:"added"},{filename:manifestPath,status:"added"},
      ...(otherDiff?[{filename:".github/workflows/malicious.yml",status:"added"}]:[])
    ]);
    if(p.endsWith("/pulls/10/merge")&&method==="PUT")return reply(200,{merged:true,sha:headSha});
    if(p.endsWith("/pulls/10"))return reply(200,{
      base:{ref:"main"},head:{ref:`pcs/promote/${id}`,repo:{full_name:repo},sha:headSha},
      draft:false,merged:false,html_url:"https://github.com/test/pr/10"
    });
    if(p.endsWith("/pulls")&&method==="GET")return reply(200,[]);
    if(p.endsWith("/pulls")&&method==="POST")return reply(201,{
      number:10,html_url:"https://github.com/test/pr/10",
      head:{ref:`pcs/promote/${id}`,sha:headSha}
    });
    if(p.includes("/contents/")){
      const path=decodeURIComponent(p.split("/contents/")[1]);
      if(method==="PUT"){headFiles.set(path,uploaded.content);return reply(201,{content:{sha:"b".repeat(40)}});}
      if(path===sourcePath)return reply(200,{type:"file",sha:"d".repeat(40),
        content:btoa(changedSource?"different archive":text)});
      if(headFiles.has(path))return reply(200,{type:"file",sha:"f".repeat(40),
        content:path===destination&&modifyProduction?btoa("tampered data"):headFiles.get(path)});
      return reply(404,{message:"Not Found"});
    }
    if(p.endsWith("/actions/workflows/pcs-promotion.yml/runs")){
      return reply(200,{workflow_runs:outcome==="none"?[]:[{
        id:89,head_sha:headSha,event:"pull_request",status:"completed",
        conclusion:outcome==="failure"?"failure":"success",created_at:"2026-10-06T12:00:00Z",
        pull_requests:[{number:10}],html_url:"https://github.com/test/actions"
      }]});
    }
    if(p.endsWith("/actions/runs/89/jobs"))return reply(200,{jobs:[{
      name:"PCS Promotion Verification",status:"completed",conclusion:"success",
      html_url:"https://github.com/test/job",
      steps:(missingStep?mandatory.slice(1):mandatory).map(name=>({name,status:"completed",conclusion:"success"}))
    }]});
    throw Error(`Unexpected request: ${method} ${p}`);
  };
  return {calls,restore:()=>{globalThis.fetch=previous;}};
}
async function input(){
  const hash=await hashSubmissionText(text);
  const promo={id,repo,task_id:task,submission_id:sourceId,
    source_pr_number:9,mapping_json:JSON.stringify(maps)};
  return {promo,files:[{filename,content:text,sha256:hash}]};
}
const env={PCS_GITHUB_TOKEN:"fake-token-only-for-tests"};
async function stagedCase(options={}){
  const mock=simulatedGitHub(options);
  const {promo,files}=await input();
  const stage=await stagePromotion(env,promo,files);
  Object.assign(promo,{branch:stage.branch,base_sha:stage.base_sha,
    head_sha:stage.head_sha,pr_number:stage.pr_number,pr_url:stage.pr_url});
  return {mock,promo,files};
}

test("promotion paths reject executable bypasses and all cross-repository destinations",()=>{
  const files=[{filename,content:text}];
  assert.deepEqual(validatePromotionMappings(repo,files,maps),maps);
  for(const illegal of [
    ".github/workflows/bypass.yml","src/../admin.js","public/../../worker.js",
    "wrangler.jsonc","scripts/check_site.py","src/unknown.py","public/.hidden.js",
    "public/nope.js"
  ])assert.throws(()=>validatePromotionMappings(repo,files,[{filename,path:illegal}]));
  assert.throws(()=>validatePromotionMappings("elsewhere/test",files,maps));
  assert.throws(()=>validatePromotionMappings(repo,files,[...maps,...maps]));
});

test("full archive-to-production staging and exact-commit test gate can lead to merge",async()=>{
  const {mock,promo,files}=await stagedCase();
  try{
    assert.equal(promo.pr_number,10);
    const result=await verifyPromotion(env,promo,files);
    assert.equal(result.status,"passed");
    assert.equal(result.verified,true);
    assert.equal(result.head_sha,headSha);
    const merge=await mergePromotion(env,promo,files,headSha);
    assert.equal(merge.sha,headSha);
    assert.equal(mock.calls.some(x=>x.path.endsWith("/pulls/10/merge")),true);
    assert.equal(mock.calls.some(x=>x.path.endsWith("/contents/"+destination)),true);
  }finally{mock.restore();}
});

test("absent, failed, or partially executed CI can never authorize promotion",async()=>{
  for(const options of [{outcome:"none"},{outcome:"failure"},{missingStep:true}]){
    const {mock,promo,files}=await stagedCase(options);
    try{
      const result=await verifyPromotion(env,promo,files);
      assert.equal(result.verified,false);
      await assert.rejects(()=>mergePromotion(env,promo,files,headSha));
      assert.equal(mock.calls.some(x=>x.path.endsWith("/pulls/10/merge")),false);
    }finally{mock.restore();}
  }
});

test("source modification, PR scope drift, or stale main invalidates exact-bound promotion",async()=>{
  for(const options of [{changeMain:true},{changedSource:true},{otherDiff:true},{modifyProduction:true}]){
    const mock=simulatedGitHub(options);
    try{
      const {promo,files}=await input();
      // A previously staged PR would have a separately recorded baseline.
      Object.assign(promo,{base_sha:baseSha,branch:`pcs/promote/${id}`,pr_number:10});
      if(options.changedSource||options.changeMain){
        await assert.rejects(()=>verifyPromotion(env,promo,files));
      }else{
        // Need a saved manifest to test a changed PR's file inventory/bytes.
        // Staging itself cannot silently authorize modified source content.
        await assert.rejects(()=>verifyPromotion(env,promo,files));
      }
    }finally{mock.restore();}
  }
});
