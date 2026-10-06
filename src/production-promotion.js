// Production promotion is intentionally separate from Commons submission staging.
// All paths and content are owner-selected, archival-source-bound and rechecked at merge.
import {hashSubmissionText, integrationRepository, contributionPrefix} from "./contribution-github.js";

const TARGETS=new Set([
  "Tommaso-R-Marena/proof-carrying-science",
  "Tommaso-R-Marena/proof-carrying-science-site"
]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT=/^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ALLOWED={
  "Tommaso-R-Marena/proof-carrying-science": [
    [/^formal\/PCS\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.lean$/,"lean"],
    [/^pcs\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.py$/,"py"],
    [/^tests\/(?:[A-Za-z0-9_-]+\/)*test_[A-Za-z0-9_-]+\.py$/,"py"],
    [/^docs\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/,"md"]
  ],
  "Tommaso-R-Marena/proof-carrying-science-site": [
    [/^public\/[A-Za-z0-9_-]+\.(?:js|html|css)$/,""],
    [/^src\/[A-Za-z0-9_-]+\.js$/,"js"],
    [/^tests\/[A-Za-z0-9_-]+\.test\.mjs$/,"mjs"],
    [/^docs\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.md$/,"md"]
  ]
};

export function validatePromotionMappings(repo,files,mappings) {
  if(!TARGETS.has(repo))throw new Error("Promotion requires an explicitly supported PCS repository.");
  if(!Array.isArray(files)||!files.length||files.length>3)throw new Error("Promotion requires 1–3 archived text files.");
  if(!Array.isArray(mappings)||mappings.length!==files.length)throw new Error("Every original file needs exactly one production destination.");
  const originals=new Map(files.map(f=>[f.filename,f]));
  const used=new Set(),out=[];
  for(const entry of mappings){
    const filename=String(entry?.filename||"");
    const path=String(entry?.path||"");
    const file=originals.get(filename);
    if(!file||typeof file.content!=="string"||used.has(filename))
      throw new Error("Mapping must refer to each archived source file once.");
    if(path.length>160||path.startsWith("/")||path.includes("//")||path.includes("\\")||
       path.split("/").some(s=>!SEGMENT.test(s)||s==="."||s===".."||s.startsWith(".")))
      throw new Error("Unsafe production path.");
    const rule=ALLOWED[repo].find(([re])=>re.test(path));
    if(!rule)throw new Error("Destination is outside the deliberately narrow production allowlist: "+path);
    // Each staged source type remains the same type in production.
    const ext=filename.split(".").pop().toLowerCase(),targetExt=path.split(".").pop().toLowerCase();
    if(ext!==targetExt || (rule[1] && rule[1]!==ext && !(rule[1]==="mjs"&&ext==="mjs")))
      throw new Error("Production destination must retain the source file extension.");
    if(out.some(m=>m.path.toLowerCase()===path.toLowerCase()))throw new Error("Two files cannot replace the same target.");
    used.add(filename);out.push({filename,path});
  }
  return out.sort((a,b)=>a.path.localeCompare(b.path));
}

export function promotionManifestPath(id){
  if(!UUID.test(id))throw new Error("Invalid promotion identifier.");
  return `contributions/pcs-promotions/${id}/manifest.json`;
}
function remote(env,repo,method,path,body){
  if(!TARGETS.has(repo))throw new Error("Untrusted repository selector.");
  if(!env.PCS_GITHUB_TOKEN)throw new Error("PCS_GITHUB_TOKEN not configured.");
  return fetch(`https://api.github.com/repos/${repo}/${path}`,{
    method,
    headers:{"Authorization":`Bearer ${env.PCS_GITHUB_TOKEN}`,
      "Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"PCS-promotion-gateway",...(body===undefined?{}:{"Content-Type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  }).then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const error=new Error(`GitHub ${response.status}: ${String(data.message||"request failed").slice(0,170)}`);
      error.status=response.status;throw error;
    }
    return data;
  });
}
function encodeText(t){
  const b=new TextEncoder().encode(t);let bin="";
  for(let i=0;i<b.length;i+=8192)bin+=String.fromCharCode(...b.subarray(i,i+8192));
  return btoa(bin);
}
function sameRemoteContent(result,content){
  return Boolean(result&&String(result.content||"").replace(/\s/g,"")===encodeText(content));
}
async function readContent(env,repo,path,ref){
  try{return await remote(env,repo,"GET",`contents/${path}?ref=${encodeURIComponent(ref)}`);}
  catch(e){if(e.status===404)return null;throw e;}
}
const validSha=sha=>/^[0-9a-f]{40}$/i.test(String(sha||""));

async function archiveSource(env,promotion,files,atRef="main") {
  const prefix=contributionPrefix(promotion.task_id,promotion.submission_id);
  if(files.length<1||files.length>3)throw new Error("Source archive is empty.");
  for(const file of files){
    const archive=await readContent(env,promotion.repo,`${prefix}/${file.filename}`,atRef);
    if(!sameRemoteContent(archive,file.content))throw new Error("Accepted source artifact does not match its GitHub archive: "+file.filename);
    if(await hashSubmissionText(file.content)!==file.sha256)throw new Error("Saved source SHA-256 differs from content.");
  }
}

export async function stagePromotion(env,promotion,files){
  if(!TARGETS.has(promotion.repo))throw new Error("Invalid promotion repository.");
  if(!UUID.test(promotion.id))throw new Error("Invalid promotion ID.");
  const maps=validatePromotionMappings(promotion.repo,files,JSON.parse(promotion.mapping_json));
  const sourcePr=await remote(env,promotion.repo,"GET",`pulls/${Number(promotion.source_pr_number)}`);
  if(!sourcePr.merged||sourcePr.base?.ref!=="main"||
     sourcePr.head?.ref!==`pcs/submission/${promotion.submission_id}`||
     sourcePr.head?.repo?.full_name!==promotion.repo)
     throw new Error("Source contribution PR has not been merged into its matching repository.");
  await archiveSource(env,promotion,files);
  const base=await remote(env,promotion.repo,"GET","git/ref/heads/main");
  const baseSha=base.object?.sha;
  if(!validSha(baseSha))throw new Error("Cannot pin current production baseline.");
  const branch=`pcs/promote/${promotion.id}`;
  let already=false;
  try{await remote(env,promotion.repo,"POST","git/refs",{ref:`refs/heads/${branch}`,sha:baseSha});}
  catch(e){
    if(e.status!==422)throw e;
    const ref=await remote(env,promotion.repo,"GET",`git/ref/heads/${branch}`);
    if(!validSha(ref.object?.sha))throw new Error("Unable to resume staging branch.");
    already=true;
  }
  const srcByName=new Map(files.map(f=>[f.filename,f]));
  const manifest={
    format:"pcs-production-promotion-v1",promotion_id:promotion.id,
    source_submission_id:promotion.submission_id,source_task_id:promotion.task_id,
    source_pr_number:Number(promotion.source_pr_number),repository:promotion.repo,
    base_sha:baseSha,
    changes:await Promise.all(maps.map(async m=>({
      source_name:m.filename,production_path:m.path,
      sha256:await hashSubmissionText(srcByName.get(m.filename).content),
      size_bytes:new TextEncoder().encode(srcByName.get(m.filename).content).byteLength
    })))
  };
  if(already){
    // Never update a previously staged promotion: changes must make a new promotion.
    const previous=await readContent(env,promotion.repo,promotionManifestPath(promotion.id),branch);
    if(!previous)throw new Error("Existing incomplete promotion branch requires manual cleanup.");
    const prior=JSON.stringify(JSON.parse(atob(String(previous.content).replace(/\s/g,""))));
    if(prior!==JSON.stringify(manifest))throw new Error("Existing promotion baseline or mapping changed; refuse to restage.");
  }else{
    for(const m of maps){
      const original=srcByName.get(m.filename).content;
      const old=await readContent(env,promotion.repo,m.path,baseSha);
      if(old&&old.type!=="file")throw new Error("Production destination is not a regular file.");
      await remote(env,promotion.repo,"PUT",`contents/${m.path}`,{
        message:`PCS promote ${promotion.id}: ${m.path}`,branch,
        content:encodeText(original),...(old?.sha?{sha:old.sha}:{})
      });
    }
    await remote(env,promotion.repo,"PUT",`contents/${promotionManifestPath(promotion.id)}`,{
      message:`PCS promote ${promotion.id}: source and path bindings`,branch,
      content:encodeText(JSON.stringify(manifest,null,2)+"\n")
    });
  }
  const found=await remote(env,promotion.repo,"GET",
    `pulls?head=Tommaso-R-Marena:${encodeURIComponent(branch)}&state=open&per_page=100`);
  let pr=Array.isArray(found)?found.find(p=>p.head?.ref===branch):null;
  if(!pr)pr=await remote(env,promotion.repo,"POST","pulls",{
    title:`PCS production promotion: ${promotion.task_id} (${promotion.id.slice(0,8)})`,
    head:branch,base:"main",draft:false,maintainer_can_modify:false,
    body:[
      "## Owner-requested production promotion (requires fresh CI + explicit approval)",
      `Archive submission: \`${promotion.submission_id}\``,
      `Source PR: #${promotion.source_pr_number}`,
      `Promotion ID: \`${promotion.id}\``,
      "Only the exact source-bound paths declared by the promotion manifest may change.",
      "CI is necessary but never substitutes for human scientific and security review."
    ].join("\n")
  });
  return {repo:promotion.repo,branch,base_sha:baseSha,head_sha:pr.head?.sha,
    pr_number:pr.number,pr_url:pr.html_url};
}

export async function verifyPromotion(env,promotion,files){
  const maps=validatePromotionMappings(promotion.repo,files,JSON.parse(promotion.mapping_json));
  if(!promotion.pr_number||!promotion.branch||!validSha(promotion.base_sha))
    throw new Error("A staged promotion PR and recorded baseline are required.");
  const main=await remote(env,promotion.repo,"GET","git/ref/heads/main");
  if(main.object?.sha!==promotion.base_sha)throw new Error("Production main advanced since staging; restage on a new baseline.");
  const pr=await remote(env,promotion.repo,"GET",`pulls/${promotion.pr_number}`);
  if(pr.base?.ref!=="main"||pr.head?.ref!==promotion.branch||
     pr.head?.repo?.full_name!==promotion.repo||pr.draft||pr.merged)
    throw new Error("Promotion PR identity/state is not eligible for integration.");
  const sha=pr.head?.sha;
  if(!validSha(sha))throw new Error("Unrecognized promotion head SHA.");
  await archiveSource(env,promotion,files,main.object.sha);
  const changed=await remote(env,promotion.repo,"GET",`pulls/${promotion.pr_number}/files?per_page=100`);
  const expected=new Set([...maps.map(m=>m.path),promotionManifestPath(promotion.id)]);
  if(!Array.isArray(changed)||changed.length!==expected.size||
      changed.some(p=>!expected.has(p.filename)||!["added","modified"].includes(p.status)))
    throw new Error("Promotion PR contains extra/missing/renamed/deleted files.");
  for(const map of maps){
    const remoteFile=await readContent(env,promotion.repo,map.path,sha);
    const source=files.find(f=>f.filename===map.filename);
    if(!sameRemoteContent(remoteFile,source.content))throw new Error("Promotion production file differs from the approved archived artifact.");
  }
  const manifestEntry=await readContent(env,promotion.repo,promotionManifestPath(promotion.id),sha);
  if(!manifestEntry)throw new Error("Promotion has no bound manifest.");
  let m;
  try{m=JSON.parse(atob(String(manifestEntry.content||"").replace(/\s/g,"")));}
  catch{throw new Error("Promotion manifest could not be decoded.");}
  const expectedChanges=await Promise.all(maps.map(async map=>{
    const source=files.find(f=>f.filename===map.filename);
    return {source_name:map.filename,production_path:map.path,
      sha256:await hashSubmissionText(source.content),
      size_bytes:new TextEncoder().encode(source.content).length};
  }));
  if(m.format!=="pcs-production-promotion-v1"||m.promotion_id!==promotion.id||
     m.source_submission_id!==promotion.submission_id||
     m.repository!==promotion.repo||m.base_sha!==promotion.base_sha||
     m.source_pr_number!==Number(promotion.source_pr_number)||
     JSON.stringify(m.changes)!==JSON.stringify(expectedChanges))
    throw new Error("Promotion manifest does not match accepted source, mapped paths and baseline.");

  const workflow=promotion.repo.endsWith("-site")?"pcs-promotion.yml":"pcs-promotion.yml";
  const list=await remote(env,promotion.repo,"GET",`actions/workflows/${workflow}/runs?event=pull_request&head_sha=${sha}&per_page=50`);
  const runs=(list.workflow_runs||[]).filter(r=>r.head_sha===sha&&r.event==="pull_request"&&
    Array.isArray(r.pull_requests)&&r.pull_requests.some(p=>Number(p.number)===Number(promotion.pr_number)))
    .sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)||Number(b.run_attempt||0)-Number(a.run_attempt||0));
  const run=runs[0]||null;
  let status=run?.status==="completed"?"failed":run?"running":"pending";
  let job=null;
  if(run?.status==="completed"&&run.conclusion==="success"){
    const jobs=await remote(env,promotion.repo,"GET",`actions/runs/${run.id}/jobs?per_page=100`);
    const candidates=(jobs.jobs||[]).filter(j=>j.name==="PCS Promotion Verification");
    job=candidates.length===1?candidates[0]:null;
    const required=promotion.repo.endsWith("-site")?[
      "Check archive-to-production exact bytes and file scope",
      "Check PCS site source/links",
      "Run adversarial site/security campaign",
      "Check Worker and browser JavaScript syntax",
      "Run submission and production-promotion integration tests"
    ]:[
      "Check exact archive-to-source mapping and PR diff",
      "Verify repository integrity, file modes and governance",
      "Run full PCS regression tests",
      "Run adversarial campaign",
      "Build Lean 4 authority with project-source hygiene",
      "Elaborate every promoted Lean source"
    ];
    if(job?.status==="completed"&&job.conclusion==="success"&&
      Array.isArray(job.steps)&&job.steps.length>0&&
      required.every(name=>job.steps.some(s=>s.name===name&&s.status==="completed"&&s.conclusion==="success"))&&
      job.steps.every(s=>s.status==="completed"&&["success","skipped"].includes(s.conclusion)))status="passed";
  }
  return {status,verified:status==="passed",head_sha:sha,base_sha:promotion.base_sha,
    pr_url:pr.html_url,run_url:job?.html_url||run?.html_url||null,
    message:status==="passed"?"Fresh production promotion CI passed on the exact reviewed commit; explicit Owner approval is still necessary.":
      status==="running"?"Production verification is still running.":
      status==="pending"?"No production promotion verification run exists for this commit. Merge prohibited.":
      "Production verification failed or did not execute required steps. Merge prohibited."};
}

export async function mergePromotion(env,promotion,files,approvedHeadSha){
  const receipt=await verifyPromotion(env,promotion,files);
  if(!receipt.verified||receipt.head_sha!==approvedHeadSha)
    throw new Error("Fresh tests and the approved exact head SHA are required for promotion.");
  const response=await remote(env,promotion.repo,"PUT",`pulls/${promotion.pr_number}/merge`,{
    sha:receipt.head_sha,merge_method:"squash",
    commit_title:`Promote reviewed PCS ${promotion.task_id} contribution`,
    commit_message:`Approved promotion ${promotion.id}; source submission ${promotion.submission_id}\n`
  });
  if(!response.merged)throw new Error("GitHub did not confirm the production merge.");
  return {sha:response.sha,pr_url:receipt.pr_url};
}
