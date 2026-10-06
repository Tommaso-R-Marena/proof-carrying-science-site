import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
if(!globalThis.btoa)globalThis.btoa=text=>Buffer.from(text,"binary").toString("base64");
import {
  integrationRepository, validateContributorFiles, contributionPrefix,
  hashSubmissionText, createSubmissionPullRequest, readSubmissionChecks,
  mergeStagedPullRequest
} from "../src/contribution-github.js";

const taskId="QA-101";
const id="123e4567-e89b-42d3-a456-426614174000";
const prefix=contributionPrefix(taskId,id);
const repo="Tommaso-R-Marena/proof-carrying-science-site";
const branch="pcs/submission/"+id;
const sha="f".repeat(40);
const text="A checkable contribution.\n";
const files=[{filename:"result.md",content:text}];

test("validates small UTF-8 artifacts and rejects source escape attempts",()=>{
  assert.deepEqual(validateContributorFiles([{name:"result.md",content:text}]),files);
  assert.throws(()=>validateContributorFiles([{name:"../.github/workflows/inject.yml",content:text}]));
  assert.throws(()=>validateContributorFiles([{name:"manifest.json",content:text}]));
  assert.throws(()=>validateContributorFiles([{name:"proof.lean",content:"theorem fake : True := by sorry"}]));
  assert.throws(()=>validateContributorFiles([{name:"value.json",content:"{"}]));
  assert.throws(()=>validateContributorFiles([{name:"x.py",content:"a".repeat(20001)}]));
  assert.throws(()=>validateContributorFiles([1,2,3,4]));
  assert.equal(integrationRepository("core"),"Tommaso-R-Marena/proof-carrying-science");
  assert.equal(integrationRepository("foreign"),null);
  assert.equal(prefix,`contributions/pcs-submissions/${taskId}/${id}`);
});

test("digest result is stable for the exact UTF-8 bytes",async()=>{
  assert.equal(await hashSubmissionText("abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

function withMockGithub(conclusion){
  const calls=[];
  const previous=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    const u=new URL(url);
    const path=u.pathname;
    calls.push({path,method:init.method});
    function reply(status,body){return {ok:status<400,status,json:async()=>body};}
    if(path.endsWith("/git/ref/heads/main"))return reply(200,{object:{sha}});
    if(path.endsWith("/git/refs")&&init.method==="POST")return reply(201,{});
    if(path.includes("/contents/")&&init.method==="GET"&&path.endsWith("/result.md"))return reply(200,{content:Buffer.from(text).toString("base64")});
    if(path.includes("/contents/")&&init.method==="GET")return reply(404,{message:"Not Found"});
    if(path.includes("/contents/")&&init.method==="PUT")return reply(201,{content:{sha}});
    if(path.endsWith("/pulls")&&init.method==="GET")return reply(200,[]);
    if(path.endsWith("/pulls")&&init.method==="POST")return reply(201,{number:42,head:{ref:branch,sha},html_url:"https://github.com/example/pull/42"});
    if(path.endsWith("/pulls/42/files"))return reply(200,[
      {filename:prefix+"/result.md",status:"added"},
      {filename:prefix+"/manifest.json",status:"added"}
    ]);
    if(path.endsWith("/pulls/42/merge"))return reply(200,{merged:true,sha});
    if(path.endsWith("/pulls/42"))return reply(200,{
      base:{ref:"main"},head:{ref:branch,repo:{full_name:repo},sha},
      html_url:"https://github.com/example/pull/42",merged:false,draft:false
    });
    if(path.endsWith("/actions/runs")||path.endsWith("/actions/runs/"))return reply(200,{workflow_runs:[]});
    if(path.endsWith("/actions/workflows/pcs-submission.yml/runs")){
      return reply(200,{workflow_runs:conclusion==null?[]:[{
        id:91,head_sha:sha,event:"pull_request",status:"completed",conclusion:conclusion==="empty_jobs"?"success":conclusion,
        pull_requests:[{number:42}],created_at:"2026-10-06T00:00:00Z",
        html_url:"https://github.com/example/actions/runs/91"
      }]});
    }
    if(path.endsWith("/actions/runs/91/jobs"))return reply(200,{jobs:[{
      name:"PCS Submission Verification",status:"completed",conclusion:conclusion==="empty_jobs"?"success":conclusion,
      steps:conclusion==="empty_jobs"?[]:[{name:"Verify artifacts",status:"completed",conclusion}],
      html_url:"https://github.com/example/actions/jobs/5"
    }]});
    throw new Error("Unexpected mock request: "+init.method+" "+u.href);
  };
  return {calls,restore:()=>{globalThis.fetch=previous;}};
}

test("creates a restricted branch/PR and checks exact file bytes",async()=>{
  const mock=withMockGithub("success");
  try{
    const env={PCS_GITHUB_TOKEN:"test-only-token"};
    const staged=await createSubmissionPullRequest(env,{
      target:"site",taskId,submissionId:id,title:"Check work",summary:"Summary",
      files
    });
    assert.equal(staged.number,42);
    assert.equal(staged.repo,repo);
    const check=await readSubmissionChecks(env,{
      repo,branch,number:42,taskId,submissionId:id,expectedFiles:files
    });
    assert.equal(check.state,"passed");
    assert.equal(check.verified,true);
    const merged=await mergeStagedPullRequest(env,{repo,branch,number:42,taskId,submissionId:id},sha);
    assert.equal(merged.merge_sha,sha);
    assert.equal(mock.calls.some(x=>x.path.endsWith("/pulls/42/merge")),true);
    assert.equal(mock.calls.some(x=>x.path.includes("/contents/contributions/pcs-submissions/")),true);
  }finally{mock.restore();}
});

test("missing or failed runner never produces a verified result",async()=>{
  for(const outcome of [null,"failure","empty_jobs"]){
    const mock=withMockGithub(outcome);
    try{
      const check=await readSubmissionChecks({PCS_GITHUB_TOKEN:"test-only-token"},{
        repo,branch,number:42,taskId,submissionId:id,expectedFiles:files
      });
      assert.equal(check.verified,false);
      assert.equal(check.state,outcome?"failed":"pending");
    }finally{mock.restore();}
  }
});

test("GitHub read-only diagnostic reports missing Actions permission without exposing secrets",async()=>{
  const mock=withMockGithub("success");
  try{
    const {githubAccessReport}=await import("../src/contribution-github.js");
    const report=await githubAccessReport({PCS_GITHUB_TOKEN:"test-only-token"});
    assert.equal(report.configured,true);
    assert.equal(report.repositories.length,2);
    assert.ok(report.repositories.every(r=>r.contents_read&&r.actions_read));
    assert.equal(JSON.stringify(report).includes("test-only-token"),false);
  }finally{mock.restore();}
});
