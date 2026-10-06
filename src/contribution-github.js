// GitHub integration for human-reviewed PCS contributions.
// Upload destinations are server-owned and restricted to contributions/pcs-submissions/.
// These branches stage artifacts for inspection; they do NOT alter the production Lean kernel.
const TARGETS = Object.freeze({
  core: "Tommaso-R-Marena/proof-carrying-science",
  site: "Tommaso-R-Marena/proof-carrying-science-site",
});
const CHECK_NAME = "PCS Submission Verification";
const EXTENSIONS = new Set(["lean","py","md","txt","json","js","html","css","csv"]);
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,78}\.(lean|py|md|txt|json|js|html|css|csv)$/;
const PROHIBITED = /(^|[^A-Za-z0-9_])(sorry|admit|axiom|unsafe|extern|native_decide|implemented_by)([^A-Za-z0-9_]|$)/;

export function integrationRepository(target) {
  return TARGETS[target] || null;
}

export function validateContributorFiles(input) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 3) throw new Error("Attach at most three small text files.");
  const seen = new Set();
  let total = 0;
  return input.map(item => {
    const filename = String(item?.name || "");
    const content = item?.content;
    if (!FILENAME.test(filename) || filename.toLowerCase()==="manifest.json" || filename.includes("..") || filename.startsWith(".")) {
      throw new Error("Each attachment must have a safe, single filename ending in .lean, .py, .md, .txt, .json, .js, .html, .css or .csv.");
    }
    if (seen.has(filename.toLowerCase())) throw new Error("Duplicate filenames are not allowed.");
    seen.add(filename.toLowerCase());
    if (typeof content !== "string") throw new Error("Only UTF-8 text attachments are supported.");
    const bytes = new TextEncoder().encode(content);
    total += bytes.byteLength;
    if (!bytes.byteLength || bytes.byteLength > 20000 || total > 40000) {
      throw new Error("Attachments must contain text and total at most 40 KB (20 KB per file).");
    }
    const extension = filename.split(".").pop().toLowerCase();
    if (!EXTENSIONS.has(extension)) throw new Error("Unsupported contribution file format.");
    if (extension === "lean" && PROHIBITED.test(content)) {
      throw new Error("Lean contributions cannot use admitted proofs or project-specific trust escape hatches.");
    }
    if (extension === "json") {
      try { JSON.parse(content); } catch (_) { throw new Error("An attached JSON file is not valid JSON."); }
    }
    return {filename,content};
  });
}

export async function hashSubmissionText(value) {
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
}

export function githubConfigured(env) {
  return Boolean(env.PCS_GITHUB_TOKEN);
}

const toPath = (repo, suffix) => `https://api.github.com/repos/${repo}/${suffix}`;
async function github(env, repo, method, path, payload) {
  if (!githubConfigured(env)) throw new Error("GitHub integration is not yet configured: set the PCS_GITHUB_TOKEN Worker secret.");
  const res = await fetch(toPath(repo,path),{
    method,
    headers:{
      "Authorization":`Bearer ${env.PCS_GITHUB_TOKEN}`,
      "Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"PCS-commons-submission-gateway",
      ...(payload===undefined?{}:{"Content-Type":"application/json"})
    },
    ...(payload===undefined?{}:{body:JSON.stringify(payload)})
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) {
    const reason = String(data.message||"GitHub returned an error").slice(0,240);
    const error = new Error(`GitHub ${res.status}: ${reason}`);
    error.status=res.status;
    throw error;
  }
  return data;
}

function base64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}

export function contributionPrefix(taskId, submissionId) {
  if (!/^[A-Z][A-Z0-9._-]{2,31}$/.test(taskId) || !/^[0-9a-f-]{36}$/i.test(submissionId)) {
    throw new Error("Invalid PCS submission identity.");
  }
  return `contributions/pcs-submissions/${taskId}/${submissionId}`;
}

export async function createSubmissionPullRequest(env, {target, taskId, submissionId, title, summary, files}) {
  const repo=integrationRepository(target);
  if (!repo) throw new Error("This task has no configured GitHub destination.");
  if (!files?.length) throw new Error("Attach one or more text files before creating a GitHub PR.");
  const branch=`pcs/submission/${submissionId}`;
  const prefix=contributionPrefix(taskId,submissionId);
  const base=await github(env,repo,"GET","git/ref/heads/main");
  const baseSha=base.object?.sha;
  if (!/^[a-f0-9]{40}$/.test(baseSha||"")) throw new Error("Could not resolve GitHub main branch.");

  try {
    await github(env,repo,"POST","git/refs",{ref:`refs/heads/${branch}`,sha:baseSha});
  } catch (error) {
    if (error.status!==422) throw error;
    // Idempotent retry for an interrupted stage of THIS exact submission only.
    const ref=await github(env,repo,"GET",`git/ref/heads/${branch}`);
    if (!ref?.object?.sha) throw new Error("Could not confirm pre-existing staging branch.");
  }

  const manifest={
    format:"pcs-submission-artifacts-v1",
    task_id:taskId, submission_id:submissionId,
    note:"Untrusted contributor artifacts. CI checks evidence; only authorized reviewers accept and merge.",
    files:await Promise.all(files.map(async f=>({name:f.filename,sha256:await hashSubmissionText(f.content),size_bytes:new TextEncoder().encode(f.content).length})))
  };
  for (const f of files) {
    const path=`${prefix}/${f.filename}`;
    let existingSha;
    try {
      const present=await github(env,repo,"GET",`contents/${path}?ref=${encodeURIComponent(branch)}`);
      existingSha=present.sha;
      // An interrupted attempt is only recoverable if no one has edited its contents.
      if (existingSha && present.content) {
        const existingBase64=String(present.content).replace(/\s/g,"");
        if (existingBase64!==base64Utf8(f.content)) throw new Error("Staging branch file changed externally; manual investigation required.");
        continue;
      }
    } catch (error) {
      if (error.status!==404) throw error;
    }
    await github(env,repo,"PUT",`contents/${path}`,{
      message:`PCS ${taskId}: stage contributor artifact ${f.filename}`,
      branch,content:base64Utf8(f.content)
    });
  }

  const manifestPath=`${prefix}/manifest.json`;
  let manifestSha;
  try {
    const existing=await github(env,repo,"GET",`contents/${manifestPath}?ref=${encodeURIComponent(branch)}`);
    manifestSha=existing.sha;
  } catch (error) {
    if (error.status!==404) throw error;
  }
  await github(env,repo,"PUT",`contents/${manifestPath}`,{
    message:`PCS ${taskId}: bind contribution manifest ${submissionId}`,
    branch,content:base64Utf8(JSON.stringify(manifest,null,2)+"\n"),
    ...(manifestSha?{sha:manifestSha}:{})
  });
  const open=await github(env,repo,"GET",`pulls?head=Tommaso-R-Marena:${encodeURIComponent(branch)}&state=open&per_page=20`);
  let pr=Array.isArray(open)?open.find(p=>p.head?.ref===branch):null;
  if (!pr) {
    pr=await github(env,repo,"POST","pulls",{
      title:`PCS submission [${taskId}]: ${String(title).slice(0,85)}`,
      head:branch,base:"main",draft:false,
      body:[
        "## Untrusted, review-gated PCS submission",
        `Task: \`${taskId}\``,
        `Submission: \`${submissionId}\``,
        `Artifacts: \`${prefix}/\``,
        "",
        String(summary).slice(0,2500),
        "",
        "### Acceptance policy",
        "- Run **PCS Submission Verification** on this precise PR head.",
        "- Reviewer checks the artifact contract, assumptions, and CI output.",
        "- **Green CI is necessary, never sufficient, for scientific acceptance.**",
        "- The PR stores a proposed contribution; merging here does not automatically promote a proof into the production Lean authority."
      ].join("\n")
    });
  }
  return {repo,branch,number:Number(pr.number),url:pr.html_url,head_sha:pr.head?.sha||null};
}

export async function readSubmissionChecks(env,{repo,branch,number,taskId,submissionId}) {
  if (!Object.values(TARGETS).includes(repo)) throw new Error("Unexpected GitHub repository.");
  const pr=await github(env,repo,"GET",`pulls/${number}`);
  if (pr.base?.ref!=="main" || pr.head?.ref!==branch || pr.head?.repo?.full_name!==repo) throw new Error("GitHub pull request branch or target does not match the staged submission.");
  const prefix=contributionPrefix(taskId,submissionId)+"/";
  const changes=await github(env,repo,"GET",`pulls/${number}/files?per_page=100`);
  const files=Array.isArray(changes)?changes:[];
  if (files.length<2 || files.length>4 || !files.some(f=>f.filename===prefix+"manifest.json") ||
      files.some(f=>!f.filename.startsWith(prefix) || !["added","modified"].includes(f.status))) {
    throw new Error("PR file scope changed; reject until a reviewer investigates.");
  }
  const head=String(pr.head?.sha||"");
  const checks=await github(env,repo,"GET",`commits/${head}/check-runs?per_page=100`);
  const candidates=(checks.check_runs||[]).filter(x=>x.name===CHECK_NAME && x.app?.slug==="github-actions");
  const run=candidates.sort((a,b)=>String(b.started_at||b.created_at||"").localeCompare(String(a.started_at||a.created_at||"")))[0];
  const state=!run?"pending":run.status!=="completed"?"running":run.conclusion==="success"?"passed":"failed";
  return {
    state,verified:state==="passed",head_sha:head,check_run_url:run?.html_url||null,
    conclusion:run?.conclusion||null,pr_url:pr.html_url,
    merged:Boolean(pr.merged),draft:Boolean(pr.draft),files:files.map(x=>x.filename),
    message:!run?"GitHub has not reported the required CI check; do not integrate.":run.status!=="completed"?"Verification is still running.":run.conclusion==="success"?"CI passed; independent review is still required.":"CI is not green; request improvements or rerun the checks."
  };
}

export async function mergeStagedPullRequest(env,link,expectedHead) {
  const checks=await readSubmissionChecks(env,link);
  if (!checks.verified || checks.merged || checks.draft || checks.head_sha!==expectedHead) {
    throw new Error("The exact staged commit must have completed successful CI and remain unmerged before integration.");
  }
  const result=await github(env,link.repo,"PUT",`pulls/${link.number}/merge`,{
    commit_title:`Integrate checked PCS contribution ${link.taskId}`,
    commit_message:`PCS submission ${link.submissionId}; accepted by independent PCS review.\n`,
    sha:checks.head_sha,merge_method:"squash"
  });
  if (!result.merged) throw new Error("GitHub did not confirm the merge.");
  return {merge_sha:result.sha,pr_url:checks.pr_url};
}
