(() => {
  "use strict";
  const $=(s,r=document)=>r.querySelector(s);
  const all=(s,r=document)=>[...r.querySelectorAll(s)];
  let currentAdmin=null;
  const auditFeeds={
    approvals:{events:[],next:null,requestId:0},
    admin:{events:[],next:null,requestId:0},
    all:{events:[],next:null,requestId:0},
  };

  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function fmt(v){if(!v)return"—";try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));}catch{return v;}}
  async function api(path,options={}){
    if(typeof path!=="string" || !path.startsWith("/api/")) throw new Error("Same-origin PCS API path required.");
    const init={credentials:"same-origin",...options};
    const isForm=typeof FormData!=="undefined" && init.body instanceof FormData;
    if(init.body&&typeof init.body!=="string"&&!isForm){init.headers={...(init.headers||{}),"content-type":"application/json"};init.body=JSON.stringify(init.body);}
    const res=await fetch(path,init);const data=await res.json().catch(()=>({message:"Invalid server response."}));
    if(!res.ok){const e=new Error(data.message||"Request failed.");e.status=res.status;e.code=data.error;throw e;}return data;
  }
  function msg(id,text,good=false){const n=document.getElementById(id);if(!n)return;n.textContent=text||"";n.className=good?"form-message successline":"form-message validation bad";}

  const ADMIN_EVIDENCE_MAX_FILES=4;
  const ADMIN_EVIDENCE_MAX_FILE_BYTES=2*1024*1024;
  const ADMIN_EVIDENCE_MAX_TOTAL_BYTES=6*1024*1024;
  const ADMIN_EVIDENCE_EXTENSIONS=new Set(["pdf","txt","md","csv","json","log","lean","py","png","jpg","jpeg","webp"]);
  let adminActionResolver=null;
  let adminActionFiles=[];

  function fileExt(name){
    const value=String(name||"");
    const dot=value.lastIndexOf(".");
    return dot>0?value.slice(dot+1).toLowerCase():"";
  }
  function formatBytes(bytes){
    const n=Number(bytes||0);
    if(n<1024)return n+" B";
    if(n<1024*1024)return (n/1024).toFixed(n<10*1024?1:0)+" KiB";
    return (n/(1024*1024)).toFixed(1)+" MiB";
  }
  function validateEvidenceFiles(files){
    if(files.length>ADMIN_EVIDENCE_MAX_FILES)return {ok:false,message:`Attach at most ${ADMIN_EVIDENCE_MAX_FILES} files.`};
    let total=0;
    for(const file of files){
      const ext=fileExt(file.name);
      if(!ADMIN_EVIDENCE_EXTENSIONS.has(ext))return {ok:false,message:`${file.name}: unsupported type.`};
      if(file.size<=0)return {ok:false,message:`${file.name}: file is empty.`};
      if(file.size>ADMIN_EVIDENCE_MAX_FILE_BYTES)return {ok:false,message:`${file.name}: exceeds the 2 MiB per-file limit.`};
      total+=file.size;
    }
    if(total>ADMIN_EVIDENCE_MAX_TOTAL_BYTES)return {ok:false,message:"Attachments exceed the 6 MiB total limit."};
    return {ok:true,total};
  }
  function renderActionFiles(){
    const target=$("#adminActionFileList");
    if(!target)return;
    target.innerHTML=adminActionFiles.length?adminActionFiles.map((file,index)=>`
      <div class="admin-file-item">
        <div><strong>${esc(file.name)}</strong><small>${esc(fileExt(file.name).toUpperCase())} · ${formatBytes(file.size)}</small></div>
        <button type="button" data-remove-admin-file="${index}">Remove</button>
      </div>`).join(""):'<span class="tiny">No evidence files attached.</span>';
    all("[data-remove-admin-file]",target).forEach(button=>button.addEventListener("click",()=>{
      adminActionFiles.splice(Number(button.dataset.removeAdminFile),1);
      renderActionFiles();
    }));
  }
  function finishAdminAction(value){
    const resolve=adminActionResolver;
    adminActionResolver=null;
    const dialog=$("#adminActionDialog");
    if(dialog?.open)dialog.close();
    if(resolve)resolve(value);
  }
  function openAdminAction(config){
    const dialog=$("#adminActionDialog");
    if(!dialog)return Promise.resolve(null);
    $("#adminActionTitle").textContent=config.title||"Administrative action";
    $("#adminActionDescription").textContent=config.description||"";
    $("#adminActionNote").value=config.note||"";
    $("#adminActionMessage").textContent="";
    $("#adminActionConfirm").textContent=config.confirmLabel||"Confirm action";

    const levelField=$("#adminActionLevelField");
    levelField.hidden=!config.levelField;
    if(config.levelField)$("#adminActionLevel").value=String(config.currentLevel??0);

    const skillField=$("#adminActionSkillField");
    skillField.hidden=!config.skill;
    $("#adminActionSkill").textContent=config.skill||"";

    const overrideField=$("#adminActionOverrideField");
    overrideField.hidden=!config.allowOverride;
    $("#adminActionOverride").checked=false;

    const warning=$("#adminActionWarning");
    warning.hidden=!config.warning;
    warning.textContent=config.warning||"";

    const fileInput=$("#adminActionFiles");
    fileInput.value="";
    adminActionFiles=[];
    renderActionFiles();

    dialog.showModal();
    setTimeout(()=>config.levelField?$("#adminActionLevel").focus():$("#adminActionNote").focus(),40);
    return new Promise(resolve=>{adminActionResolver=resolve;});
  }
  async function uploadActionEvidence(files,purpose,userId){
    if(!files?.length)return [];
    const validation=validateEvidenceFiles(files);
    if(!validation.ok)throw new Error(validation.message);
    const form=new FormData();
    form.set("purpose",purpose);
    if(userId)form.set("subject_user_id",userId);
    files.forEach(file=>form.append("files",file,file.name));
    const result=await api("/api/admin/evidence",{method:"POST",body:form});
    return (result.files||[]).map(file=>file.id);
  }

  async function requestDecision(id,decision){
    const note=prompt(decision==="approve"?"Why should this contributor receive this reserved task? Include your competency judgment when the required skill is not yet verified.":"Why is this application not being approved?");
    if(!note)return;
    try{
      await api(`/api/admin/requests/${encodeURIComponent(id)}/decision`,{method:"POST",body:{decision,note}});
      await load();
    }catch(e){
      if(decision==="approve"&&e.code==="manual_skill_review_required"){
        const ok=confirm(e.message+"\n\nIf the application itself demonstrates the required competence, click OK to manually verify that skill and approve the task in one audited decision. Otherwise click Cancel and request more evidence or reject.");
        if(!ok)return;
        try{
          await api(`/api/admin/requests/${encodeURIComponent(id)}/decision`,{method:"POST",body:{decision,note,verify_required_skill:true}});
          await load();
          return;
        }catch(second){alert(second.message);return;}
      }
      alert(e.message);
    }
  }

  async function submissionDecision(id,decision){
    const note=prompt("Give a review rationale. Negative findings can be fully successful contributions when correct.");
    if(!note)return;
    try{await api(`/api/admin/submissions/${encodeURIComponent(id)}/decision`,{method:"POST",body:{decision,note}});await load();}
    catch(e){alert(e.message);}
  }

  async function skillDecision(userId,skill,status){
    const note=prompt(status==="verified"?"Why is this skill independently verified? Cite evidence or calibration performance.":"Why was the skill not verified?");
    if(!note)return;
    try{await api(`/api/admin/users/${encodeURIComponent(userId)}/skill`,{method:"POST",body:{skill,status,note}});await load();}
    catch(e){alert(e.message);}
  }

  async function setLevel(userId,current,userName="this contributor"){
    const result=await openAdminAction({
      title:"Change technical level",
      description:`${userName} is currently L${current}. Choose the new verified technical level and record the evidence-based reason.`,
      confirmLabel:"Save level change",
      levelField:true,
      currentLevel:current,
      allowOverride:Boolean(currentAdmin?.is_owner),
      warning:"Demotions take effect immediately. Promotions still obey PCS evidence gates unless the Founder/Owner explicitly records an override."
    });
    if(!result)return;
    const level=Number(result.level);
    if(!Number.isInteger(level)||level<0||level>6){alert("Choose a valid level from L0 through L6.");return;}
    try{
      const evidence_ids=await uploadActionEvidence(result.files,"level_change",userId);
      await api(`/api/admin/users/${encodeURIComponent(userId)}/level`,{
        method:"POST",
        body:{level,note:result.note,override:Boolean(result.override),evidence_ids}
      });
      await load();
    }catch(e){alert(e.message);}
  }

  async function revokeSkill(user,skill){
    if(!currentAdmin?.is_owner)return alert("Only the Founder/Owner can revoke an already verified skill.");
    const result=await openAdminAction({
      title:`Revoke verified skill: ${skill}`,
      description:`Remove ${skill} verification from ${user.display_name}. The contributor can later submit new evidence or retake the competency evaluation.`,
      confirmLabel:"Revoke verified skill",
      skill,
      warning:"This immediately removes the verified skill. Any active reserved task that requires this exact skill will be released automatically."
    });
    if(!result)return;
    try{
      const evidence_ids=await uploadActionEvidence(result.files,"skill_revocation",user.id);
      const response=await api(`/api/admin/users/${encodeURIComponent(user.id)}/skill/revoke`,{
        method:"POST",
        body:{skill,note:result.note,evidence_ids}
      });
      if(response.released_reservations>0){
        alert(`Skill revoked. ${response.released_reservations} active reservation(s) requiring this skill were released.`);
      }
      await load();
    }catch(e){alert(e.message);}
  }

  async function verifyEmail(userId){
    if(!confirm("Manually mark this email address verified? Only do this if you independently confirmed the address belongs to the contributor."))return;
    try{await api(`/api/admin/users/${encodeURIComponent(userId)}/email-verified`,{method:"POST",body:{verified:true}});await load();}
    catch(e){alert(e.message);}
  }

  function renderRequests(items){
    const target=$("#adminRequestList");
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No pending task applications.</strong><span>The queue is clear.</span></div>';return;}
    target.innerHTML=items.map(r=>`
      <article class="admin-card ${new Date(r.decision_due_at)<new Date()?"overdue":""}">
        <div class="task-card-top"><div><span class="commons-chip level">${esc(r.task_id)}</span><span class="commons-chip planned">L${esc(r.level)} applicant</span><span class="commons-chip ${r.email_verified?"volunteer":"planned"}">${r.email_verified?"email verified":"email unverified"}</span>${r.required_skill?`<span class="commons-chip ${Number(r.required_skill_verified)?"volunteer":"planned"}">${Number(r.required_skill_verified)?"skill verified":"skill needs manual review"}</span>`:""}</div><span class="tiny">due ${fmt(r.decision_due_at)}</span></div>
        <h3>${esc(r.title)}</h3>
        <p><strong>${esc(r.display_name)}</strong> · ${esc(r.email)} · required skill: ${esc(r.required_skill||"none")}</p>
        <details open><summary>Application</summary><p>${esc(r.application_note)}</p></details>
        <details><summary>AI-use plan</summary><p>${esc(r.ai_use_plan)}</p></details>
        <details><summary>Independent verification plan</summary><p>${esc(r.verification_plan)}</p></details>
        <div class="actions"><button class="button primary" data-approve-request="${esc(r.id)}">Approve + reserve</button><button class="button secondary" data-reject-request="${esc(r.id)}">Reject</button></div>
      </article>`).join("");
    all("[data-approve-request]",target).forEach(b=>b.addEventListener("click",()=>requestDecision(b.dataset.approveRequest,"approve")));
    all("[data-reject-request]",target).forEach(b=>b.addEventListener("click",()=>requestDecision(b.dataset.rejectRequest,"reject")));
  }

  async function checkpointDecision(id,decision){
    const note=prompt(decision==="accept"?"Why does this checkpoint justify keeping the reservation?":"Why should the reservation be released?");
    if(!note)return;
    try{await api(`/api/admin/requests/${encodeURIComponent(id)}/checkpoint`,{method:"POST",body:{decision,note,extend_hours:168}});await load();}
    catch(e){alert(e.message);}
  }

  function renderCheckpoints(items){
    const target=$("#adminCheckpointList");
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No checkpoints awaiting review.</strong><span>Silent reservations are released automatically by the hourly cleanup.</span></div>';return;}
    target.innerHTML=items.map(r=>`
      <article class="admin-card">
        <div class="task-card-top"><div><span class="commons-chip level">${esc(r.task_id)}</span><span class="commons-chip volunteer">L${esc(r.level)}</span></div><span class="tiny">reservation ends ${fmt(r.reservation_expires_at)}</span></div>
        <h3>${esc(r.title)}</h3><p><strong>${esc(r.display_name)}</strong> · ${esc(r.email)}</p>
        <div class="boundary"><strong>Progress checkpoint</strong><span>${esc(r.checkpoint_note)}</span></div>
        <div class="actions"><button class="button primary" data-checkpoint-accept="${esc(r.id)}">Accept + extend up to 7 days</button><button class="button secondary" data-checkpoint-release="${esc(r.id)}">Release reservation</button></div>
      </article>`).join("");
    all("[data-checkpoint-accept]",target).forEach(b=>b.addEventListener("click",()=>checkpointDecision(b.dataset.checkpointAccept,"accept")));
    all("[data-checkpoint-release]",target).forEach(b=>b.addEventListener("click",()=>checkpointDecision(b.dataset.checkpointRelease,"release")));
  }

  function renderSkills(items){
    const target=$("#adminSkillList");
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No skill reviews pending.</strong><span>High-trust access stays locked until exact skills are verified.</span></div>';return;}
    target.innerHTML=items.map(s=>`
      <article class="admin-card">
        <div class="task-card-top"><div><span class="commons-chip level">${esc(s.skill)}</span><span class="commons-chip planned">L${esc(s.level)}</span><span class="commons-chip ${s.source==="evaluation"?"volunteer":"planned"}">${esc(s.source||"manual")}</span></div><span class="tiny">review by ${fmt(s.review_due_at||s.requested_at)}</span></div>
        <h3>${esc(s.display_name)}</h3><p>${esc(s.email)}</p>
        ${s.source==="evaluation"?`<div class="boundary"><strong>Auto-scored screening</strong><span>${esc(s.evaluation_score)}/${esc(s.evaluation_max_score)} · passed screening only; final approval is manual.${s.evaluation_task_id?` Task context: ${esc(s.evaluation_task_id)}.`:""}</span></div>`:""}
        <div class="boundary"><strong>${s.source==="evaluation"?"Evaluation evidence + rationale":"Manual evidence"}</strong><span>${esc(s.evidence)}</span></div>
        <div class="actions"><button class="button primary" data-verify-skill="${esc(s.user_id)}" data-skill="${esc(s.skill)}">Verify skill</button><button class="button secondary" data-reject-skill="${esc(s.user_id)}" data-skill="${esc(s.skill)}">Reject</button></div>
      </article>`).join("");
    all("[data-verify-skill]",target).forEach(b=>b.addEventListener("click",()=>skillDecision(b.dataset.verifySkill,b.dataset.skill,"verified")));
    all("[data-reject-skill]",target).forEach(b=>b.addEventListener("click",()=>skillDecision(b.dataset.rejectSkill,b.dataset.skill,"rejected")));
  }

  async function githubSubmissionAction(id,action){
    const endpoint=`/api/admin/submissions/${encodeURIComponent(id)}/${action}`;
    try {
      const response=await api(endpoint,{method:action==="checks"?"GET":"POST",
        ...(action==="merge"?{body:{note:prompt("Explain why the exact tested PR may now be integrated (minimum 20 characters).")||""}}:{})});
      const result=$("#pcsGitStatus-"+id);
      if(result){
        result.textContent=action==="checks"
          ?`${response.state.toUpperCase()}: ${response.message||"No result provided"}`
          :action==="merge"?"Merged into GitHub (PR is now integrated)."
          :"Staged a GitHub pull request; check CI before accepting.";
        result.className="pcs-ci-state "+(response.verified?"pcs-ci-good":"");
      }
      if(action!=="checks")await load();
    }catch(e){
      const result=$("#pcsGitStatus-"+id);
      if(result){result.textContent=e.message;result.className="pcs-ci-state pcs-ci-error";}
      else alert(e.message);
    }
  }

  async function inspectSubmissionFiles(id){
    const target=$("#pcsFiles-"+id);if(!target)return;
    try{
      const data=await api(`/api/admin/submissions/${encodeURIComponent(id)}/files`);
      target.replaceChildren();
      if(!data.files?.length){target.textContent="No attached text artifacts; inspect the external evidence link.";return;}
      for(const f of data.files){
        const section=document.createElement("section");
        const heading=document.createElement("strong");
        heading.textContent=f.filename+" · SHA-256 "+f.sha256;
        const pre=document.createElement("pre");pre.className="pcs-review-code";pre.textContent=f.content;
        section.append(heading,pre);target.append(section);
      }
    }catch(e){target.textContent=e.message;}
  }

  function renderSubmissions(items){
    const target=$("#adminSubmissionList");
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No action needed in the submission queue.</strong><span>New work and accepted GitHub PRs awaiting integration will appear here.</span></div>';return;}
    target.innerHTML=items.map(s=>{
      const source=s.github_stage_state||"not_applicable";
      const isGithub=source!=="not_applicable";
      const ready=s.status==="accepted"&&source==="staged";
      const url=String(s.github_pr_url||"");
      const verifiedLink=url.startsWith("https://github.com/Tommaso-R-Marena/");
      return `
      <article class="admin-card pcs-review-card">
        <div class="task-card-top"><div><span class="commons-chip level">${esc(s.task_id)}</span><span class="commons-chip ${s.ai_used?"planned":"volunteer"}">${s.ai_used?"AI used":"no AI declared"}</span><span class="commons-chip ${s.status==="accepted"?"volunteer":"planned"}">${esc(s.status)}</span></div><span class="tiny">${fmt(s.submitted_at)}</span></div>
        <h3>${esc(s.title)}</h3><p><strong>${esc(s.display_name)}</strong> · L${esc(s.level)} · ${esc(s.email)}</p>
        <div class="pcs-review-steps">
          <span>1. Examine evidence</span><span>2. Check Lean/PCS or site CI</span><span>3. Decide / request refinement</span><span>4. Owner integrates PR</span>
        </div>
        <details open><summary>Contribution summary</summary><p>${esc(s.summary)}</p></details>
        ${s.artifact_url&&/^https:\/\//.test(s.artifact_url)?`<p><a href="${esc(s.artifact_url)}" target="_blank" rel="noopener noreferrer">Open external supporting evidence ↗</a></p>`:""}
        <p class="tiny"><strong>Attached files:</strong> ${esc(s.file_count||0)} · <strong>Evidence type:</strong> ${esc(s.evidence_kind||"none")}
          ${s.evidence_kind==="outcome"?` · ${esc(s.outcome_metric)}: ${esc(s.outcome_count)} (claimed; reviewer must check source)`:""}
        </p>
        <div class="actions"><button class="button secondary" data-inspect-files="${esc(s.id)}">Inspect source/evidence files</button></div>
        <div id="pcsFiles-${esc(s.id)}" class="pcs-review-files"></div>
        <details><summary>Independent verification</summary><p>${esc(s.verification_note)}</p></details>
        <details><summary>Scope and remaining assumptions</summary><p>${esc(s.understanding_note)}</p></details>
        ${s.ai_used?`<details><summary>AI disclosure</summary><p>${esc(s.ai_tools||"AI used; tool not stated")}</p></details>`:""}
        ${isGithub?`
          <div class="pcs-git-review">
            <strong>GitHub staging: ${esc(source)}</strong>
            ${verifiedLink?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open staged PR ↗</a>`:""}
            <p>Check status is obtained from GitHub for the current PR head. A passing check is only a technical prerequisite.</p>
            <p class="pcs-ci-state" id="pcsGitStatus-${esc(s.id)}">${esc(s.github_stage_error||"Click Check CI to get the live verification result.")}</p>
            <div class="actions">
              ${!s.github_pr_number?`<button class="button secondary" data-git-stage="${esc(s.id)}">Stage / retry GitHub PR</button>`:""}
              ${s.github_pr_number?`<button class="button secondary" data-git-checks="${esc(s.id)}">Check CI status</button>`:""}
              ${ready&&currentAdmin?.is_owner?`<button class="button primary" data-git-merge="${esc(s.id)}">Integrate checked PR</button>`:""}
            </div>
          </div>`
          :'<p class="pcs-ci-state">Review-only task. No GitHub PR or Lean CI is required; evaluate the submitted evidence directly.</p>'}
        ${s.status!=="accepted"?`<div class="actions"><button class="button primary" data-submission-accept="${esc(s.id)}">Accept reviewed work</button><button class="button secondary" data-submission-changes="${esc(s.id)}">Request improvements</button><button class="button secondary" data-submission-reject="${esc(s.id)}">Reject</button></div>`:""}
      </article>`;
    }).join("");
    all("[data-inspect-files]",target).forEach(b=>b.addEventListener("click",()=>inspectSubmissionFiles(b.dataset.inspectFiles)));
    all("[data-git-stage]",target).forEach(b=>b.addEventListener("click",()=>githubSubmissionAction(b.dataset.gitStage,"stage")));
    all("[data-git-checks]",target).forEach(b=>b.addEventListener("click",()=>githubSubmissionAction(b.dataset.gitChecks,"checks")));
    all("[data-git-merge]",target).forEach(b=>b.addEventListener("click",()=>githubSubmissionAction(b.dataset.gitMerge,"merge")));
    all("[data-submission-accept]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionAccept,"accept")));
    all("[data-submission-changes]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionChanges,"needs_changes")));
    all("[data-submission-reject]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionReject,"reject")));
  }

  let promotionCandidates=[];
  let promotionPendingDecision=null;
  function promotionMappings(record){
    try{return JSON.parse(record.mapping_json||"[]");}catch{return [];}
  }
  function promotionNoteAction(id,action){
    if(!currentAdmin?.is_owner)return;
    promotionPendingDecision={id,action};
    const dialog=$("#promotionDecisionDialog");
    const descriptions={
      approve:"Approve this exact, freshly tested commit for production. Explain how you evaluated scientific scope, regressions and trust boundaries.",
      needs_changes:"Request improvements. This existing artifact stays unchanged; the contributor must provide a new accepted, archived submission for a revised promotion.",
      reject:"Reject the proposed production source change with a concrete rationale.",
      merge:"Final production integration. The server will recheck the approved SHA, exact archived bytes, PR file inventory, current main baseline and fresh CI.",
      supersede:"Close the obsolete PR, invalidate its old approval, and automatically stage the same accepted archive on a new branch and fresh main baseline. Every attempt needs new CI and new Owner approval. Previous attempts remain in the audit log."
    };
    $("#promotionDecisionTitle").textContent={
      approve:"Approve production promotion",needs_changes:"Request changes",reject:"Reject promotion",merge:"Merge verified production PR",supersede:"Restage on fresh main"
    }[action];
    $("#promotionDecisionContext").textContent=descriptions[action];
    $("#promotionDecisionNote").value="";
    $("#promotionDecisionStatus").textContent="";
    dialog.showModal();
  }
  async function promotionAction(id,action,body=null){
    const status=$("#promotionStatus-"+id);
    if(status)status.textContent="Checking "+action+"…";
    try{
      const r=await api(`/api/admin/promotions/${encodeURIComponent(id)}/${action}`,{
        method:action==="checks"?"GET":"POST",...(body?{body}:{})
      });
      if(status)status.textContent=action==="checks"
        ?`${r.status||"blocked"}: ${r.message||"No check output."}`
        :`${r.state||"updated"}: ${r.message||"Action recorded."}`;
      if(action!=="checks")await loadPromotions();
      return true;
    }catch(e){if(status)status.textContent=e.message;else alert(e.message);return false;}
  }
  async function loadPromotions(){
    const queue=$("#promotionQueue"),status=$("#promotionQueueStatus");
    if(!queue)return;
    try{
      const data=await api("/api/admin/promotions");
      promotionCandidates=data.candidates||[];
      const form=$("#promotionCreateForm"),source=$("#promotionSource");
      form.hidden=!data.can_manage;
      const selected=source.value;
      source.replaceChildren(new Option("Select an accepted, archived contribution",""));
      for(const candidate of promotionCandidates){
        source.add(new Option(candidate.task_id+" · "+candidate.contributor+" · "+candidate.filenames,candidate.submission_id));
      }
      if(promotionCandidates.some(x=>x.submission_id===selected))source.value=selected;
      const items=data.promotions||[];
      status.textContent=items.length
        ?`${items.length} promotion case(s) · ${items.filter(x=>x.state==="staged").length} awaiting new tests/review · ${items.filter(x=>x.state==="approved").length} reviewed but not merged.`
        :"No production promotions yet. Work is first accepted and archived through the separate submission pipeline.";
      queue.innerHTML=items.map(p=>{
        const maps=promotionMappings(p);
        const repo=p.repo.endsWith("-site")?"Website":"Lean/PCS core";
        const url=String(p.pr_url||"");
        const validUrl=url.startsWith("https://github.com/Tommaso-R-Marena/");
        const stageable=["stage_error","requested"].includes(p.state);
        const inspectable=["staged","approved"].includes(p.state);
        return `<article class="admin-card pcs-review-card">
          <div class="task-card-top"><div>
            <span class="commons-chip category">${esc(repo)}</span>
            <span class="commons-chip level">${esc(p.task_id)}</span>
            <span class="commons-chip ${p.state==="merged"?"volunteer":"planned"}">${esc(p.state)}</span>
          </div><span class="tiny">${fmt(p.created_at)}</span></div>
          <h3>Promotion ${esc(p.id.slice(0,8))} · ${esc(p.contributor)}</h3>
          <p class="tiny">Source contribution: ${esc(p.submission_id)} · accepted archive
            <a href="https://github.com/${esc(p.repo)}/pull/${esc(p.source_pr_number)}" target="_blank" rel="noopener noreferrer">PR #${esc(p.source_pr_number)} ↗</a></p>
          <div class="pcs-submission-contract"><strong>Exact proposed production paths</strong>
            ${maps.map(x=>`<p><code>${esc(x.filename)}</code> → <code>${esc(x.path)}</code></p>`).join("")}
          </div>
          <p>${esc(p.rationale)}</p>
          ${p.decision_note?`<p><strong>Recorded review:</strong> ${esc(p.decision_note)}</p>`:""}
          ${p.stage_error?`<p class="pcs-ci-error">${esc(p.stage_error)}</p>`:""}
          ${validUrl?`<p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Inspect production PR ↗</a></p>`:""}
          ${p.approved_head_sha?`<p class="tiny"><strong>Approved exact SHA:</strong> <code>${esc(p.approved_head_sha)}</code></p>`:""}
          ${p.merge_sha?`<p class="tiny"><strong>Merged commit:</strong> <code>${esc(p.merge_sha)}</code></p>`:""}
          <p class="pcs-ci-state" id="promotionStatus-${esc(p.id)}" role="status" aria-live="polite">
            ${inspectable?"CI is not assumed to pass. Check the latest exact-commit receipt.":stageable?"Stage this case before CI can run.":"Promotion decision recorded."}
          </p>
          <div class="actions">
            ${inspectable?`<button type="button" class="button secondary" data-promotion-checks="${esc(p.id)}">Check fresh CI</button>`:""}
            ${stageable&&data.can_manage?`<button type="button" class="button secondary" data-promotion-stage="${esc(p.id)}">Stage / retry PR</button>`:""}
            ${p.state==="staged"&&data.can_manage?`<button type="button" class="button primary" data-promotion-approve="${esc(p.id)}">Approve tested change</button>
              <button type="button" class="button secondary" data-promotion-needs_changes="${esc(p.id)}">Request improvements</button>
              <button type="button" class="button secondary" data-promotion-reject="${esc(p.id)}">Reject</button>`:""}
            ${p.state==="approved"&&data.can_manage?`<button type="button" class="button primary" data-promotion-merge="${esc(p.id)}">Integrate into production</button>`:""}
            ${["requested","stage_error","staged","approved"].includes(p.state)&&data.can_manage?`<button type="button" class="button secondary" data-promotion-supersede="${esc(p.id)}">Close old PR & restage</button>`:""}
          </div>
        </article>`;
      }).join("")||'<div class="commons-empty"><strong>No promoted source changes yet.</strong><span>Each case must originate in a reviewed GitHub archive and pass new tests.</span></div>';
      all("[data-promotion-checks]",queue).forEach(button=>button.addEventListener("click",()=>promotionAction(button.dataset.promotionChecks,"checks")));
      all("[data-promotion-stage]",queue).forEach(button=>button.addEventListener("click",()=>promotionAction(button.dataset.promotionStage,"stage")));
      for(const action of ["approve","needs_changes","reject","merge","supersede"]){
        all("[data-promotion-"+action+"]",queue).forEach(button=>button.addEventListener("click",()=>promotionNoteAction(button.getAttribute("data-promotion-"+action),action)));
      }
    }catch(e){
      status.textContent="Promotion dashboard unavailable: "+e.message;
      queue.replaceChildren();
    }
  }

  $("#promotionSource")?.addEventListener("change",event=>{
    const candidate=promotionCandidates.find(x=>x.submission_id===event.currentTarget.value);
    const names=candidate?.filenames?String(candidate.filenames).split(" | "):[];
    $("#promotionSourceDetails").textContent=candidate
      ?`Source: ${candidate.repo}. Reviewed contributor: ${candidate.contributor}. Exact source files: ${names.join(", ")}. Reviewer note: ${candidate.review_note||"Not provided."}`
      :"Choose a previously accepted and archived submission.";
    $("#promotionFileMappings").value=names.map(n=>n+" => ").join("\n");
    const original=$("#promotionOriginalPr");
    const valid=Boolean(candidate&&["Tommaso-R-Marena/proof-carrying-science",
      "Tommaso-R-Marena/proof-carrying-science-site"].includes(candidate.repo)
      &&Number.isInteger(Number(candidate.source_pr_number))&&Number(candidate.source_pr_number)>0);
    original.hidden=!valid;
    if(valid)original.href="https://github.com/"+candidate.repo+"/pull/"+candidate.source_pr_number;
    else original.removeAttribute("href");
    $("#promotionSourcePreview").replaceChildren();
  });
  $("#promotionInspectSource")?.addEventListener("click",async()=>{
    const submissionId=$("#promotionSource").value;
    const target=$("#promotionSourcePreview");
    target.replaceChildren();
    if(!submissionId){target.textContent="First select an accepted archived submission.";return;}
    const button=$("#promotionInspectSource");
    button.disabled=true;
    try{
      const response=await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}/files`);
      if(!response.files?.length){target.textContent="No saved source files for this submission.";return;}
      for(const f of response.files){
        const section=document.createElement("section");
        const heading=document.createElement("strong");heading.textContent=f.filename+" · SHA-256: "+f.sha256;
        const pre=document.createElement("pre");pre.className="pcs-review-code";pre.textContent=f.content;
        section.append(heading,pre);target.appendChild(section);
      }
    }catch(e){target.textContent="Source inspection unavailable: "+e.message;}
    finally{button.disabled=false;}
  });
  $("#promotionCreateForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!currentAdmin?.is_owner)return;
    const form=event.currentTarget,message=$("#promotionCreateMessage");
    const original=String(form.elements.mappings.value).trim().split("\n").map(x=>x.trim()).filter(Boolean);
    const mappings=[];
    for(const row of original){
      const match=row.match(/^([^=]+)=>\s*(.+)$/);
      if(!match){message.textContent="Map each uploaded file with: filename => specific/production/path.ext";return;}
      mappings.push({filename:match[1].trim(),path:match[2].trim()});
    }
    const body={submission_id:form.elements.submission_id.value,
      mappings,rationale:form.elements.rationale.value.trim()};
    if(!body.submission_id||body.rationale.length<40){message.textContent="Choose an eligible source and provide a detailed rationale.";return;}
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    message.textContent="Binding archive bytes, opening an isolated production PR…";
    try{
      const result=await api("/api/admin/promotions",{method:"POST",body});
      message.textContent=result.message||"Promotion recorded.";
      form.reset();await loadPromotions();
    }catch(e){message.textContent=e.message;}
    finally{button.disabled=false;}
  });
  $("#refreshPromotions")?.addEventListener("click",loadPromotions);
  $("#promotionDecisionCancel")?.addEventListener("click",()=>$("#promotionDecisionDialog").close());
  $("#promotionDecisionForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const {id,action}=promotionPendingDecision||{};
    const note=$("#promotionDecisionNote").value.trim();
    if(!id||note.length<40){$("#promotionDecisionStatus").textContent="Write a reason of at least 40 characters.";return;}
    const btn=$("#promotionDecisionConfirm");btn.disabled=true;
    $("#promotionDecisionStatus").textContent="Rechecking exact source, current PR and required CI…";
    const endpoint=action==="merge"?"merge":action==="supersede"?"supersede":"decision";
    const body=action==="merge"||action==="supersede"?{reason:note}:{decision:action,note};
    const ok=await promotionAction(id,endpoint,body);
    btn.disabled=false;
    if(ok)$("#promotionDecisionDialog").close();
    else $("#promotionDecisionStatus").textContent="Operation was blocked. Inspect the promotion card for the exact reason.";
  });

  async function governanceChange(user,kind){
    if(!currentAdmin?.is_owner)return alert("Founder/Owner authority required.");
    let body={};
    let question="";
    if(kind==="grant-admin"){body={role:"admin"};question=`Grant delegated administrator authority to ${user.display_name}? This does not make them Owner or L7.`;}
    if(kind==="revoke-admin"){body={role:"contributor"};question=`Revoke administrator authority from ${user.display_name}? Their active sessions will be invalidated immediately.`;}
    if(kind==="suspend"){body={role:"contributor",status:"suspended"};question=`Suspend ${user.display_name}? Any administrator authority will be revoked and active sessions invalidated.`;}
    if(kind==="reactivate"){body={status:"active"};question=`Reactivate ${user.display_name}? This does not restore administrator authority automatically.`;}
    if(!question||!confirm(question))return;
    const note=prompt("Give the governance reason (at least 20 characters).");
    if(!note)return;
    body.note=note;
    try{await api(`/api/admin/users/${encodeURIComponent(user.id)}/governance`,{method:"POST",body});await load();}
    catch(e){alert(e.message);}
  }


  function parseDetail(value){
    try{return JSON.parse(value||"{}");}catch{return {raw:String(value||"")};}
  }

  function prettyDetail(value){
    const detail=parseDetail(value);
    return JSON.stringify(detail,null,2);
  }

  function auditEvidenceLinks(value){
    const detail=parseDetail(value);
    const files=Array.isArray(detail.evidence)?detail.evidence:Array.isArray(detail.files)?detail.files:[];
    if(!files.length)return "";
    return `<div class="audit-evidence-links">${files.map(file=>`
      <a href="/api/admin/evidence/${encodeURIComponent(file.id)}" download>
        ↧ ${esc(file.name||file.id)} ${file.size_bytes?`· ${formatBytes(file.size_bytes)}`:""}
      </a>`).join("")}</div>`;
  }

  function auditMatches(event,query){
    if(!query)return true;
    const hay=[
      event.action,event.actor_name,event.actor_email,event.actor_role,
      event.subject_type,event.subject_id,event.detail_json,String(event.seq)
    ].join(" ").toLowerCase();
    return hay.includes(query.toLowerCase());
  }

  function auditCard(event){
    const actor=event.actor_name || event.actor_email || (event.actor_user_id ? "user "+event.actor_user_id : "system");
    const role=event.actor_role ? ` · ${event.actor_role}` : "";
    const hash=String(event.event_hash||"");
    return `
      <article class="admin-audit-card">
        <div class="admin-audit-top">
          <div><span class="commons-chip level">#${esc(event.seq)}</span><span class="commons-chip">${esc(event.action)}</span><span class="commons-chip ${event.actor_role==="owner"?"paid":event.actor_role==="admin"?"volunteer":""}">${esc(event.actor_role||"system")}</span></div>
          <span class="tiny">${fmt(event.created_at)}</span>
        </div>
        <h3>${esc(event.action.replaceAll("_"," "))}</h3>
        <p><strong>${esc(actor)}</strong>${esc(role)} → ${esc(event.subject_type)} · <code>${esc(event.subject_id)}</code></p>
        <details><summary>Recorded detail</summary><pre class="admin-audit-json">${esc(prettyDetail(event.detail_json))}</pre></details>
        ${auditEvidenceLinks(event.detail_json)}
        <div class="admin-audit-hash"><span>event hash</span><code title="${esc(hash)}">${esc(hash.slice(0,20))}…</code></div>
      </article>`;
  }

  function renderAuditFeed(kind){
    const config={
      approvals:{target:"#adminApprovalHistory",button:"#loadMoreApprovals"},
      admin:{target:"#adminActionHistory",button:"#loadMoreAdminActions"},
      all:{target:"#adminAuditList",button:"#loadMoreAudit"},
    }[kind];
    const target=$(config.target);
    if(!target)return;
    const items=auditFeeds[kind].events;
    target.innerHTML=items.length?items.map(auditCard).join(""):'<div class="commons-empty"><strong>No matching audit events.</strong><span>This view is read-only.</span></div>';
    const button=$(config.button);
    if(button){
      button.hidden=!auditFeeds[kind].next;
      button.disabled=!auditFeeds[kind].next;
    }
  }

  function renderAuditIntegrity(integrity){
    const top=$("#adminAuditIntegrity");
    const panel=$("#auditIntegrityPanel");
    if(!integrity)return;
    const label=integrity.ok?`VERIFIED · ${integrity.count} events`:`BROKEN AT #${integrity.broken_seq||"?"}`;
    if(top){top.textContent=label;top.className=integrity.ok?"good-text":"warn-text";}
    if(panel){
      panel.className="audit-integrity-panel "+(integrity.ok?"verified":"broken");
      panel.innerHTML=integrity.ok
        ? `<strong>Hash chain verified.</strong><span>${esc(integrity.count)} archived events link correctly from the PCS genesis marker to head <code>${esc(String(integrity.head||"").slice(0,24))}…</code>.</span>`
        : `<strong>Audit integrity check failed.</strong><span>Failure at sequence ${esc(integrity.broken_seq||"?")} · ${esc(integrity.reason||"unknown mismatch")}. Treat the archive as potentially altered until investigated.</span>`;
    }
  }

  async function loadAuditFeed(kind,{append=false,verify=false}={}){
    const feed=auditFeeds[kind];
    if(append&&!feed.next)return;
    const requestId=++feed.requestId;
    const limit=kind==="approvals"?"5":kind==="admin"?"10":($("#adminAuditPageSize")?.value||"25");
    const qs=new URLSearchParams({kind,limit});
    if(kind==="all"){
      const q=($("#adminAuditSearch")?.value||"").trim();
      if(q)qs.set("q",q);
      if(verify)qs.set("verify","1");
    }
    if(append&&feed.next)qs.set("before_seq",String(feed.next));
    const data=await api("/api/admin/audit?"+qs.toString());
    if(requestId!==feed.requestId)return;
    feed.events=append?[...feed.events,...(data.events||[])]:data.events||[];
    feed.next=data.next_before||null;
    if(data.integrity)renderAuditIntegrity(data.integrity);
    renderAuditFeed(kind);
  }

  async function reloadAuditFeeds(){
    for(const feed of Object.values(auditFeeds)){
      feed.requestId++;feed.events=[];feed.next=null;
    }
    const requests=[loadAuditFeed("approvals"),loadAuditFeed("admin")];
    if($("#adminAuditDatabaseDisclosure")?.open){
      requests.push(loadAuditFeed("all",{verify:true}));
    }else{
      requests.push(api("/api/admin/audit?kind=all&limit=1&verify=1")
        .then(data=>renderAuditIntegrity(data.integrity)));
    }
    await Promise.all(requests);
  }

  function taskStateChip(task){
    const published=task.publication_state==="published"&&task.need_status==="needed"&&task.status==="open";
    return `<span class="commons-chip ${published?"volunteer":"planned"}">${published?"PUBLIC":"HIDDEN"} · ${esc(task.publication_state)} / ${esc(task.need_status)}</span>`;
  }

  function renderTaskCuration(items){
    const target=$("#adminTaskList");if(!target)return;
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No task records.</strong><span>The catalog is empty.</span></div>';return;}
    target.innerHTML=items.map(task=>`
      <article class="admin-card task-curation-card" data-curation-task="${esc(task.id)}">
        <div class="task-card-top"><div><span class="commons-chip level">L${esc(task.min_level)}</span>${taskStateChip(task)}<span class="commons-chip category">${esc(task.category||"research")}</span></div><code>${esc(task.id)}</code></div>
        <h3>${esc(task.title)}</h3><p>${esc(task.summary)}</p>
        <div class="task-curation-why"><strong>Why now</strong><span>${esc(task.why_now||"No current-need rationale recorded.")}</span></div>
        <div class="task-curation-grid">
          <label><span>Publication</span><select class="selectinput" data-curation-publication>
            ${["draft","published","paused","retired"].map(v=>`<option value="${v}" ${task.publication_state===v?"selected":""}>${v}</option>`).join("")}
          </select></label>
          <label><span>Need state</span><select class="selectinput" data-curation-need>
            ${["needed","satisfied","retired"].map(v=>`<option value="${v}" ${task.need_status===v?"selected":""}>${v}</option>`).join("")}
          </select></label>
          <label><span>Category</span><select class="selectinput" data-curation-category>
            ${["research","engineering","security","review","operations","administrative","marketing","outreach","design","documentation","community"].map(v=>`<option value="${v}" ${task.category===v?"selected":""}>${v}</option>`).join("")}
          </select></label>
          <label><span>Priority</span><input class="textinput" data-curation-priority type="number" min="0" max="100" value="${esc(task.priority??50)}"></label>
          <label><span>Expected duration (minutes)</span><input class="textinput" data-curation-minutes type="number" min="10" max="4800" step="5" value="${esc(task.expected_minutes??Number(task.expected_hours||1)*60)}"></label>
          <label><span>GitHub delivery</span><select class="selectinput" data-curation-github>
            ${[["none","Reviewer evidence only"],["core","Core repository PR"],["site","Website repository PR"]].map(([value,label])=>`<option value="${value}" ${task.integration_target===value?"selected":""}>${label}</option>`).join("")}
          </select></label>
        </div>
        <label class="field"><span>Current need rationale</span><textarea class="textinput" data-curation-why rows="2" maxlength="2000">${esc(task.why_now||"")}</textarea></label>
        <label class="field"><span>Reason for this publication change</span><textarea class="textinput" data-curation-reason rows="2" minlength="20" maxlength="2000" placeholder="Required when saving. Explain why this task should or should not be publicly available now."></textarea></label>
        <div class="actions">${currentAdmin?.is_owner?'<button class="button primary" type="button" data-save-curation>Save audited curation</button>':'<span class="tiny">Founder/Owner controls publication.</span>'}<a class="button secondary" href="task-graph.html?task=${encodeURIComponent(task.id)}" target="_blank" rel="noopener">View graph</a></div>
      </article>`).join("");
    all("[data-save-curation]",target).forEach(button=>button.addEventListener("click",async()=>{
      const card=button.closest("[data-curation-task]"),id=card.dataset.curationTask;
      const reason=card.querySelector("[data-curation-reason]").value.trim();
      if(reason.length<20)return alert("Give a curation rationale of at least 20 characters.");
      button.disabled=true;
      try{
        await api(`/api/admin/tasks/${encodeURIComponent(id)}/curation`,{method:"POST",body:{
          publication_state:card.querySelector("[data-curation-publication]").value,
          need_status:card.querySelector("[data-curation-need]").value,
          category:card.querySelector("[data-curation-category]").value,
          priority:Number(card.querySelector("[data-curation-priority]").value),
          expected_minutes:Number(card.querySelector("[data-curation-minutes]").value),
          integration_target:card.querySelector("[data-curation-github]").value,
          why_now:card.querySelector("[data-curation-why]").value,
          reason
        }});
        await load();
      }catch(e){alert(e.message);}
      finally{button.disabled=false;}
    }));
  }

  let adminGraphSnapshot={tasks:[],edges:[],groups:[]};

  function taskOptions(tasks,selected=""){
    return tasks.map(task=>`<option value="${esc(task.id)}" ${task.id===selected?"selected":""}>${esc(task.id)} · ${esc(task.title)}</option>`).join("");
  }

  function syncDependencyGroupOptions(){
    const form=$("#adminDependencyEdgeForm");if(!form)return;
    const taskId=form.elements.task_id.value;
    const groups=adminGraphSnapshot.groups.filter(group=>group.task_id===taskId);
    const current=form.elements.group_id.value;
    form.elements.group_id.innerHTML='<option value="">No group</option>'+groups.map(group=>`<option value="${esc(group.id)}">${esc(group.id)} · ${esc(group.label)}</option>`).join("");
    if(groups.some(group=>group.id===current))form.elements.group_id.value=current;
  }

  function renderDependencyEditor(tasks,edges,groups){
    adminGraphSnapshot={tasks:[...tasks],edges:[...edges],groups:[...groups]};
    const groupForm=$("#adminDependencyGroupForm"),edgeForm=$("#adminDependencyEdgeForm");
    if(groupForm){
      const previous=groupForm.elements.task_id.value;
      groupForm.elements.task_id.innerHTML=taskOptions(tasks,previous);
    }
    if(edgeForm){
      const previousTask=edgeForm.elements.task_id.value,previousPrereq=edgeForm.elements.depends_on_task_id.value;
      edgeForm.elements.task_id.innerHTML=taskOptions(tasks,previousTask);
      edgeForm.elements.depends_on_task_id.innerHTML=taskOptions(tasks,previousPrereq);
      syncDependencyGroupOptions();
    }

    const target=$("#adminDependencyList");if(!target)return;
    const byTask=new Map();
    for(const task of tasks)byTask.set(task.id,{task,edges:[],groups:[]});
    for(const edge of edges){if(byTask.has(edge.task_id))byTask.get(edge.task_id).edges.push(edge);}
    for(const group of groups){if(byTask.has(group.task_id))byTask.get(group.task_id).groups.push(group);}
    const populated=[...byTask.values()].filter(row=>row.edges.length||row.groups.length);
    if(!populated.length){
      target.innerHTML='<div class="commons-empty"><strong>No dependency structure declared yet.</strong><span>Create a blocking gate or an explicit informative/hard edge above.</span></div>';
      return;
    }
    target.innerHTML=populated.map(({task,edges:taskEdges,groups:taskGroups})=>`
      <article class="admin-card admin-dependency-card">
        <div class="task-card-top"><div><span class="commons-chip category">${esc(task.category||"research")}</span><span class="commons-chip level">L${esc(task.min_level)}</span></div><code>${esc(task.id)}</code></div>
        <h3>${esc(task.title)}</h3>
        ${taskGroups.length?`<div class="admin-dependency-groups"><strong>Gate groups</strong>${taskGroups.map(group=>{
          const members=taskEdges.filter(edge=>edge.group_id===group.id);
          return `<div><span><b>${esc(group.label)}</b><small>${esc(group.mode)} · min ${esc(group.min_satisfied)} · ${members.length} edge${members.length===1?"":"s"}</small></span>${currentAdmin?.is_owner?`<button class="smallbutton" type="button" data-delete-dependency-group="${esc(group.id)}" data-task="${esc(task.id)}" ${members.length?"disabled":""}>Delete empty group</button>`:""}</div>`;
        }).join("")}</div>`:""}
        <div class="admin-dependency-edges">
          ${taskEdges.length?taskEdges.map(edge=>`<div class="admin-dependency-edge">
            <div><span class="commons-chip ${edge.dependency_type==="hard"?"planned":"category"}">${esc(edge.dependency_type)}</span><code>${esc(edge.depends_on_task_id)}</code><b>→ ${esc(edge.relation||"requires")}</b><small>criticality ${esc(edge.criticality??50)}${edge.group_id?` · group ${esc(edge.group_id)}`:""}</small></div>
            <p>${esc(edge.artifact_contract||edge.rationale||"")}</p>
            ${currentAdmin?.is_owner?`<button class="smallbutton" type="button" data-delete-dependency="${esc(edge.depends_on_task_id)}" data-task="${esc(task.id)}">Delete edge</button>`:""}
          </div>`).join(""):'<span class="tiny">No edges yet.</span>'}
        </div>
      </article>`).join("");

    all("[data-delete-dependency]",target).forEach(button=>button.addEventListener("click",async()=>{
      const reason=prompt("Why are you deleting this dependency edge? This is audit-logged (minimum 20 characters).");
      if(!reason)return;
      try{
        await api(`/api/admin/tasks/${encodeURIComponent(button.dataset.task)}/dependencies/${encodeURIComponent(button.dataset.deleteDependency)}`,{method:"DELETE",body:{reason}});
        await load();
      }catch(e){alert(e.message);}
    }));
    all("[data-delete-dependency-group]",target).forEach(button=>button.addEventListener("click",async()=>{
      const reason=prompt("Why are you deleting this empty dependency gate? This is audit-logged (minimum 20 characters).");
      if(!reason)return;
      try{
        await api(`/api/admin/tasks/${encodeURIComponent(button.dataset.task)}/dependency-groups/${encodeURIComponent(button.dataset.deleteDependencyGroup)}`,{method:"DELETE",body:{reason}});
        await load();
      }catch(e){alert(e.message);}
    }));
  }

  async function roleDecision(application,decision){
    const result=await openAdminAction({
      title:`${decision==="approve"?"Approve":"Reject"} role application`,
      description:`${application.display_name} applied for ${application.title}. Record why this recurring responsibility is or is not a good fit.`,
      confirmLabel:decision==="approve"?"Approve role":"Reject application",
      warning:decision==="approve"?"Role approval does not change technical level, verified skills, or assurance-review authority.":"The applicant may continue taking ordinary eligible tasks."
    });
    if(!result)return;
    try{
      await api(`/api/admin/roles/applications/${encodeURIComponent(application.id)}/decision`,{method:"POST",body:{decision,note:result.note}});
      await load();
    }catch(e){alert(e.message);}
  }

  async function challengeDecision(entry,decision,card){
    const result=await openAdminAction({
      title:decision==="verify"?"Validate Arena entry":"Reject Arena entry",
      description:`${entry.display_name} submitted ${entry.leaderboard_alias} to ${entry.challenge_title}. The public leaderboard must reflect validity, not merely a low claimed score.`,
      confirmLabel:decision==="verify"?"Validate + rank":"Reject entry",
      warning:decision==="verify"?"Check the artifact itself and correct the structure counts below before validating. Arena rank never grants technical authority.":"Rejected entries stay out of the public leaderboard."
    });
    if(!result)return;
    const body={decision,note:result.note};
    if(decision==="verify"){
      body.workflow_nodes=Number(card.querySelector("[data-arena-workflow]").value);
      body.dependency_edges=Number(card.querySelector("[data-arena-edges]").value);
      body.evidence_items=Number(card.querySelector("[data-arena-evidence]").value);
      body.claims=Number(card.querySelector("[data-arena-claims]").value);
    }
    try{
      const response=await api(`/api/admin/challenges/entries/${encodeURIComponent(entry.id)}/decision`,{method:"POST",body});
      if(decision==="verify")alert(`Arena entry validated. Verified leaderboard score: ${response.score}.`);
      await load();
    }catch(e){alert(e.message);}
  }

  function renderChallengeEntries(items){
    const target=$("#adminChallengeEntryList");if(!target)return;
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No Arena entries awaiting validation.</strong><span>Only reviewed entries can appear on a public leaderboard.</span></div>';return;}
    target.innerHTML=items.map(entry=>`
      <article class="admin-card arena-review-card" data-arena-entry="${esc(entry.id)}">
        <div class="task-card-top"><div><span class="commons-chip program">${esc(entry.challenge_id)}</span><span class="commons-chip planned">PROVISIONAL SCORE ${esc(entry.raw_score)}</span><span class="commons-chip level">L${esc(entry.level)}</span></div><span class="tiny">${fmt(entry.submitted_at)}</span></div>
        <h3>${esc(entry.leaderboard_alias)} · ${esc(entry.challenge_title)}</h3>
        <p><strong>${esc(entry.display_name)}</strong> · ${esc(entry.email)}</p>
        <details open><summary>Candidate summary</summary><p>${esc(entry.summary)}</p></details>
        <details open><summary>Hidden-dependency explanation</summary><p>${esc(entry.hidden_dependency_explanation)}</p></details>
        <p><a href="${esc(entry.artifact_url)}" target="_blank" rel="noopener">Inspect submitted artifact ↗</a></p>
        <div class="arena-review-counts">
          <label><span>Workflow nodes</span><input class="textinput" data-arena-workflow type="number" min="0" max="1000" value="${esc(entry.workflow_nodes)}"></label>
          <label><span>Declared edges</span><input class="textinput" data-arena-edges type="number" min="0" max="1000" value="${esc(entry.dependency_edges)}"></label>
          <label><span>Evidence items</span><input class="textinput" data-arena-evidence type="number" min="1" max="1000" value="${esc(entry.evidence_items)}"></label>
          <label><span>Claims</span><input class="textinput" data-arena-claims type="number" min="2" max="1000" value="${esc(entry.claims)}"></label>
        </div>
        <div class="boundary"><strong>Scoring rule</strong><span>${esc(entry.scoring_rule)}</span></div>
        <div class="actions"><button class="button primary" data-arena-verify="${esc(entry.id)}">Validate + rank</button><button class="button secondary" data-arena-reject="${esc(entry.id)}">Reject</button></div>
      </article>`).join("");
    all("[data-arena-verify]",target).forEach(btn=>btn.addEventListener("click",()=>{
      const entry=items.find(x=>x.id===btn.dataset.arenaVerify),card=btn.closest("[data-arena-entry]");
      if(entry&&card)challengeDecision(entry,"verify",card);
    }));
    all("[data-arena-reject]",target).forEach(btn=>btn.addEventListener("click",()=>{
      const entry=items.find(x=>x.id===btn.dataset.arenaReject),card=btn.closest("[data-arena-entry]");
      if(entry&&card)challengeDecision(entry,"reject",card);
    }));
  }

  function renderRoleApplications(items){
    const target=$("#adminRoleApplicationList");if(!target)return;
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No role applications pending.</strong><span>Ongoing roles are reviewed separately from task reservations.</span></div>';return;}
    target.innerHTML=items.map(a=>`
      <article class="admin-card">
        <div class="task-card-top"><div><span class="commons-chip category">${esc(a.category)}</span><span class="commons-chip level">L${esc(a.level)}</span></div><span class="tiny">${fmt(a.requested_at)}</span></div>
        <h3>${esc(a.title)}</h3><p><strong>${esc(a.display_name)}</strong> · ${esc(a.email)} · expected role load ${esc(a.expected_hours_per_week)}h/week</p>
        <details open><summary>Why / contribution plan</summary><p>${esc(a.note)}</p></details>
        <details><summary>Relevant experience</summary><p>${esc(a.experience)}</p></details>
        <details><summary>Availability</summary><p>${esc(a.availability)}</p></details>
        <div class="actions"><button class="button primary" data-role-approve="${esc(a.id)}">Approve role</button><button class="button secondary" data-role-reject="${esc(a.id)}">Reject</button></div>
      </article>`).join("");
    all("[data-role-approve]",target).forEach(btn=>btn.addEventListener("click",()=>{
      const app=items.find(x=>x.id===btn.dataset.roleApprove);if(app)roleDecision(app,"approve");
    }));
    all("[data-role-reject]",target).forEach(btn=>btn.addEventListener("click",()=>{
      const app=items.find(x=>x.id===btn.dataset.roleReject);if(app)roleDecision(app,"reject");
    }));
  }

  function renderUsers(items,verifiedSkills=[]){
    const target=$("#adminUserList");
    const skillsByUser=new Map();
    for(const row of verifiedSkills){
      if(!skillsByUser.has(row.user_id))skillsByUser.set(row.user_id,[]);
      skillsByUser.get(row.user_id).push(row);
    }
    target.innerHTML=items.map(u=>{
      const owner=Boolean(u.is_owner);
      const canGovern=Boolean(currentAdmin?.is_owner)&&!owner;
      const canSetLevel=!owner&&(Boolean(currentAdmin?.is_owner)||(u.role!=="admin"&&Number(u.level)<6));
      const userSkills=skillsByUser.get(u.id)||[];
      const levelLabel=owner?"L7 · FOUNDER / OWNER":`L${esc(u.level)}`;
      const governanceLabel=owner?"OWNER":u.role==="admin"?"ADMIN":"CONTRIBUTOR";
      const statusClass=u.status==="active"?"volunteer":"planned";
      let actions="";
      if(owner){
        actions='<span class="tiny"><strong>Protected unique owner.</strong> Delegated admins cannot modify this account.</span>';
      }else{
        const buttons=[];
        if(canSetLevel)buttons.push(`<button class="smallbutton" data-level-user="${esc(u.id)}" data-current-level="${esc(u.level)}" data-user-name="${esc(u.display_name)}">Set technical level</button>`);
        if(!u.email_verified)buttons.push(`<button class="smallbutton" data-email-user="${esc(u.id)}">Verify email manually</button>`);
        if(canGovern&&u.status==="active"&&u.role!=="admin")buttons.push(`<button class="smallbutton" data-governance="grant-admin" data-user="${esc(u.id)}">Grant admin</button>`);
        if(canGovern&&u.role==="admin")buttons.push(`<button class="smallbutton" data-governance="revoke-admin" data-user="${esc(u.id)}">Revoke admin</button>`);
        if(canGovern&&u.status==="active")buttons.push(`<button class="smallbutton" data-governance="suspend" data-user="${esc(u.id)}">Suspend</button>`);
        if(canGovern&&u.status!=="active")buttons.push(`<button class="smallbutton" data-governance="reactivate" data-user="${esc(u.id)}">Reactivate</button>`);
        actions=buttons.join("");
      }
      const skillControls=userSkills.length
        ? `<div class="admin-user-skills"><span>Verified skills</span>${userSkills.map(s=>`
            <span class="skill-control"><span>${esc(s.skill)}</span>${currentAdmin?.is_owner&&!owner?`<button type="button" data-revoke-skill="${esc(s.skill)}" data-user="${esc(u.id)}" aria-label="Revoke ${esc(s.skill)} skill">Revoke</button>`:""}</span>`).join("")}</div>`
        : '<div class="admin-user-skills"><span>Verified skills</span><span class="tiny">none</span></div>';
      return `
      <article class="admin-user-row">
        <div><strong>${esc(u.display_name)}</strong><span>${esc(u.email)}</span>${skillControls}</div>
        <div><span class="commons-chip level">${levelLabel}</span><span class="commons-chip">${governanceLabel}</span><span class="commons-chip ${statusClass}">${esc(u.status)}</span><span class="commons-chip ${u.email_verified?"volunteer":"planned"}">${u.email_verified?"email verified":"email unverified"}</span><span class="commons-chip">${esc(u.track)}</span></div>
        <div class="actions">${actions}</div>
      </article>`;
    }).join("");
    all("[data-level-user]",target).forEach(button=>button.addEventListener("click",()=>setLevel(
      button.dataset.levelUser,
      Number(button.dataset.currentLevel),
      button.dataset.userName||"this contributor"
    )));
    all("[data-email-user]",target).forEach(button=>button.addEventListener("click",()=>verifyEmail(button.dataset.emailUser)));
    all("[data-revoke-skill]",target).forEach(button=>button.addEventListener("click",()=>{
      const user=items.find(u=>u.id===button.dataset.user);
      if(user)revokeSkill(user,button.dataset.revokeSkill);
    }));
    all("[data-governance]",target).forEach(button=>button.addEventListener("click",()=>{
      const user=items.find(u=>u.id===button.dataset.user);
      if(user)governanceChange(user,button.dataset.governance);
    }));
  }

  async function load(){
    try{
      const data=await api("/api/admin/overview");
      currentAdmin=data.admin||null;
      $("#adminUnavailable").hidden=true;$("#adminDashboard").hidden=false;
      $("#adminIdentity").textContent=currentAdmin?.is_owner?"L7 · Founder / Owner":(currentAdmin?.display_name||"Administrator");
      $("#adminPendingCount").textContent=String((data.pending_requests||[]).length);
      $("#adminSkillCount").textContent=String((data.skill_reviews||[]).length);
      $("#adminSubmissionCount").textContent=String((data.submissions||[]).length);
      $("#adminGithubStatus").textContent=data.github_transport_configured?"configured":"needs setup";
      $("#adminGithubStatus").className=data.github_transport_configured?"good-text":"warn-text";
      $("#adminEmailTransport").textContent=data.email_transport?"configured":"not configured";
      $("#adminEmailTransport").className=data.email_transport?"good-text":"warn-text";
      $("#adminEmailTransportDetail").textContent=data.email_transport_name==="gmail_apps_script"?"Gmail · Apps Script relay":data.email_transport_name==="resend"?"Resend":"No outbound provider";
      $("#adminMailTestButton").disabled=!data.email_transport;
      renderTaskCuration(data.tasks||[]);
      renderDependencyEditor(data.tasks||[],data.dependency_edges||[],data.dependency_groups||[]);
      renderChallengeEntries(data.challenge_entries||[]);
      renderRoleApplications(data.role_applications||[]);
      renderRequests(data.pending_requests||[]);
      renderCheckpoints(data.checkpoints||[]);
      renderSkills(data.skill_reviews||[]);
      renderSubmissions(data.submissions||[]);
      renderUsers(data.users||[],data.verified_skills||[]);
      await loadPromotions();
      await reloadAuditFeeds();
    }catch(e){
      $("#adminDashboard").hidden=true;$("#adminUnavailable").hidden=false;
      if(e.status!==401&&e.status!==403)console.error(e);
    }
  }

  $("#adminActionFiles")?.addEventListener("change",event=>{
    const files=Array.from(event.currentTarget.files||[]);
    const validation=validateEvidenceFiles(files);
    if(!validation.ok){
      adminActionFiles=[];
      event.currentTarget.value="";
      renderActionFiles();
      msg("adminActionMessage",validation.message);
      return;
    }
    adminActionFiles=files;
    msg("adminActionMessage",files.length?`${files.length} evidence file(s) ready · ${formatBytes(validation.total)} total.`:"",true);
    renderActionFiles();
  });

  $("#adminActionClose")?.addEventListener("click",()=>finishAdminAction(null));
  $("#adminActionCancel")?.addEventListener("click",()=>finishAdminAction(null));
  $("#adminActionDialog")?.addEventListener("cancel",event=>{event.preventDefault();finishAdminAction(null);});
  $("#adminActionForm")?.addEventListener("submit",event=>{
    event.preventDefault();
    const note=$("#adminActionNote").value.trim();
    if(note.length<20){msg("adminActionMessage","Give a justification of at least 20 characters.");$("#adminActionNote").focus();return;}
    const validation=validateEvidenceFiles(adminActionFiles);
    if(!validation.ok){msg("adminActionMessage",validation.message);return;}
    const result={
      note,
      level:$("#adminActionLevelField").hidden?null:Number($("#adminActionLevel").value),
      override:!$("#adminActionOverrideField").hidden&&$("#adminActionOverride").checked,
      files:[...adminActionFiles],
    };
    finishAdminAction(result);
  });

  $("#adminDependencyEdgeForm")?.elements.task_id?.addEventListener("change",syncDependencyGroupOptions);
  $("#adminDependencyEdgeForm")?.elements.dependency_type?.addEventListener("change",event=>{
    const form=$("#adminDependencyEdgeForm");
    if(event.currentTarget.value==="informative")form.elements.group_id.value="";
  });

  $("#adminDependencyGroupForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!currentAdmin?.is_owner){alert("Founder/Owner authority required.");return;}
    const form=event.currentTarget,fd=new FormData(form),taskId=String(fd.get("task_id")||""),message=$("#adminDependencyGroupMessage");
    const body=Object.fromEntries(fd.entries());
    delete body.task_id;
    body.min_satisfied=Number(body.min_satisfied);
    body.sort_order=Number(body.sort_order);
    message.textContent="Saving gate…";message.className="form-message";
    try{
      await api(`/api/admin/tasks/${encodeURIComponent(taskId)}/dependency-groups`,{method:"POST",body});
      message.textContent="Dependency gate saved.";message.className="form-message successline";
      form.elements.reason.value="";
      await load();
    }catch(e){message.textContent=e.message;message.className="form-message validation bad";}
  });

  $("#adminDependencyEdgeForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!currentAdmin?.is_owner){alert("Founder/Owner authority required.");return;}
    const form=event.currentTarget,fd=new FormData(form),taskId=String(fd.get("task_id")||""),message=$("#adminDependencyEdgeMessage");
    const body=Object.fromEntries(fd.entries());
    delete body.task_id;
    body.criticality=Number(body.criticality);
    message.textContent="Saving edge…";message.className="form-message";
    try{
      await api(`/api/admin/tasks/${encodeURIComponent(taskId)}/dependencies`,{method:"POST",body});
      message.textContent="Dependency edge saved.";message.className="form-message successline";
      form.elements.change_reason.value="";
      await load();
    }catch(e){message.textContent=e.message;message.className="form-message validation bad";}
  });

  $("#adminCreateTaskForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!currentAdmin?.is_owner){alert("Founder/Owner authority required.");return;}
    const form=event.currentTarget,fd=new FormData(form),message=$("#adminCreateTaskMessage");
    const body=Object.fromEntries(fd.entries());
    body.min_level=Number(body.min_level);
    body.expected_minutes=Number(body.expected_minutes);
    body.priority=Number(body.priority);
    message.textContent="Creating draft…";message.className="form-message";
    try{
      const result=await api("/api/admin/tasks",{method:"POST",body});
      message.textContent=result.message;message.className="form-message successline";
      form.reset();
      form.elements.expected_minutes.value="30";form.elements.priority.value="50";form.elements.compensation_label.value="Volunteer";
      await load();
    }catch(e){message.textContent=e.message;message.className="form-message validation bad";}
  });

  $("#adminGithubTestButton")?.addEventListener("click",async()=>{
    const button=$("#adminGithubTestButton"),target=$("#adminGithubTestResult");
    button.disabled=true; target.textContent="Checking permission scopes on both repositories…";
    try{
      const report=await api("/api/admin/github/diagnostics");
      const lines=(report.repositories||[]).map(r=>
        r.repository+": Git contents "+(r.contents_read?"accessible":"unavailable")+
        "; Actions runs "+(r.actions_read?"accessible":"unavailable")+
        (r.contents_error?"; "+r.contents_error:"")+
        (r.actions_error?"; "+r.actions_error:"")
      );
      target.textContent=[report.message,...lines].join(" | ");
    }catch(e){target.textContent="Diagnostic failed: "+e.message;}
    finally{button.disabled=false;}
  });

  $("#adminMailTestButton")?.addEventListener("click",async()=>{
    const button=$("#adminMailTestButton");
    button.disabled=true;
    const original=button.textContent;
    button.textContent="Sending…";
    try{
      const result=await api("/api/admin/mail/test",{method:"POST"});
      alert(result.message+" Provider: "+result.provider);
      await load();
    }catch(e){alert(e.message);}
    finally{button.textContent=original;button.disabled=false;}
  });

  $("#adminLogoutButton")?.addEventListener("click",async()=>{
    try{await api("/api/admin/logout",{method:"POST"});}catch(_){}
    location.replace("admin-login.html");
  });

  $("#loadMoreApprovals")?.addEventListener("click",()=>loadAuditFeed("approvals",{append:true}).catch(e=>alert(e.message)));
  $("#loadMoreAdminActions")?.addEventListener("click",()=>loadAuditFeed("admin",{append:true}).catch(e=>alert(e.message)));
  $("#loadMoreAudit")?.addEventListener("click",()=>loadAuditFeed("all",{append:true}).catch(e=>alert(e.message)));
  $("#adminAuditDatabaseDisclosure")?.addEventListener("toggle",event=>{
    if(event.target.open)loadAuditFeed("all",{verify:true}).catch(e=>alert(e.message));
  });
  $("#adminOpenAudit")?.addEventListener("click",()=>{
    const detail=$("#adminAuditDatabaseDisclosure");
    if(detail){detail.open=true;detail.scrollIntoView({behavior:"smooth",block:"start"});}
  });
  $("#refreshAuditButton")?.addEventListener("click",()=>reloadAuditFeeds().catch(e=>alert(e.message)));
  let auditSearchTimer;
  $("#adminAuditSearch")?.addEventListener("input",()=>{
    clearTimeout(auditSearchTimer);
    auditSearchTimer=setTimeout(()=>loadAuditFeed("all").catch(e=>alert(e.message)),300);
  });
  $("#adminAuditPageSize")?.addEventListener("change",()=>loadAuditFeed("all").catch(e=>alert(e.message)));

  $("#adminResearchStorageRefresh")?.addEventListener("click",async()=>{
    const button=$("#adminResearchStorageRefresh"),status=$("#adminResearchStorageStatus");
    button.disabled=true;status.textContent="Checking account-linked, consented research entries…";
    try{
      const result=await api("/api/admin/arena/storage");
      const pq=result.collections?.proof_quest, sf=result.collections?.safety_forge, duel=result.collections?.forge_duel;
      if(!pq||!sf||!duel)throw Error("Unexpected storage report.");
      const size=(Number(pq.approx_payload_bytes)+Number(sf.approx_payload_bytes)+Number(duel.approx_payload_bytes));
      status.textContent="Proof Quest: "+Number(pq.rows).toLocaleString()+
        " adult opt-in examples · Safety Forge: "+Number(sf.rows).toLocaleString()+
        " verified synthetic sessions · Shield Duel: "+Number(duel.rows).toLocaleString()+
        " consented ballot batches · approx. "+(size/1024).toFixed(1)+" KiB in gameplay JSON (excluding database overhead).";
    }catch(e){status.textContent="Storage check unavailable: "+e.message;}
    finally{button.disabled=false;}
  });

  $("#adminProofQuestExport")?.addEventListener("click",async()=>{
    const button=$("#adminProofQuestExport"),msg=$("#adminProofQuestExportMessage");
    button.disabled=true;msg.textContent="Collecting consented, deidentified puzzle pages...";
    try{
      let examples=[],cursor=null,pages=0,metadata=null;
      const seen=new Set();
      do{
        const suffix=cursor?"?after="+encodeURIComponent(cursor):"";
        const page=await api("/api/admin/arena/proof-order/dataset"+suffix);
        if(page.format!=="pcs-proof-order-optin-research-dataset-v1"||!Array.isArray(page.examples))
          throw Error("Unexpected research dataset schema.");
        metadata||=page;
        examples.push(...page.examples);
        if(page.next_cursor===null){cursor=null;break;}
        if(typeof page.next_cursor!=="string"||seen.has(page.next_cursor))
          throw Error("Invalid or nonmonotonic export cursor.");
        seen.add(page.next_cursor);cursor=page.next_cursor;
        pages++;
      }while(pages<250);
      if(cursor!==null)throw Error("Export exceeds 50,000 rows; request a reviewed batch export.");
      const dataset={format:metadata.format,provenance:metadata.provenance,
        excludes:metadata.excludes,source_validation:metadata.source_validation,
        limitations:metadata.limitations,count:examples.length,examples};
      const blob=new Blob([JSON.stringify(dataset,null,2)+"\n"],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement("a");anchor.href=url;
      anchor.download="pcs-proof-quest-adult-optin-"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
      msg.textContent="Exported "+examples.length+" deidentified puzzle choices. Keep puzzle families disjoint between training and evaluation.";
    }catch(e){msg.textContent="Export unavailable: "+e.message;}
    finally{button.disabled=false;}
  });

  $("#adminSafetyForgeExport")?.addEventListener("click",async()=>{
    const button=$("#adminSafetyForgeExport"),msg=$("#adminSafetyForgeExportMessage");
    button.disabled=true;msg.textContent="Collecting consented, deidentified pages...";
    try{
      let entries=[],offset=0,pages=0,metadata=null;
      while(pages<100){
        const data=await api("/api/admin/arena/safety-lab/dataset?offset="+offset);
        if(data.format!=="pcs-safety-forge-optin-dataset-v1"||!Array.isArray(data.entries))throw Error("Unexpected research dataset schema.");
        metadata||=data;
        entries.push(...data.entries);
        if(data.next_offset===null)break;
        if(!Number.isInteger(data.next_offset)||data.next_offset<=offset)throw Error("Nonmonotonic pagination.");
        offset=data.next_offset;pages++;
      }
      if(pages>=100)throw Error("Export exceeds 3,000 rows; request a bounded export policy review.");
      const data={format:metadata.format,scope:metadata.scope,privacy:metadata.privacy,
        checker:metadata.checker,limitations:metadata.limitations,
        entries};
      const blob=new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;
      a.download="pcs-safety-forge-consented-"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      msg.textContent="Exported "+entries.length+" deidentified synthetic research sessions. Do not publish raw participant research data without consent review.";
    }catch(e){msg.textContent="Export unavailable: "+e.message;}
    finally{button.disabled=false;}
  });

  $("#adminForgeDuelExport")?.addEventListener("click",async()=>{
    const button=$("#adminForgeDuelExport"),msg=$("#adminForgeDuelExportMessage");
    button.disabled=true;msg.textContent="Exporting independently replayed consented policy decisions…";
    try{
      let entries=[],offset=0,pages=0,metadata=null;
      while(pages<100){
        const data=await api("/api/admin/arena/forge-duel/dataset?offset="+offset);
        if(data.format!=="pcs-forge-duel-optin-research-dataset-v1"||!Array.isArray(data.entries))
          throw Error("Unexpected duel dataset schema.");
        metadata||=data;entries.push(...data.entries);
        if(data.next_offset===null)break;
        if(!Number.isInteger(data.next_offset)||data.next_offset<=offset)
          throw Error("Invalid page cursor.");
        offset=data.next_offset;pages++;
      }
      if(pages>=100)throw Error("Export exceeds 2,500 sessions. Obtain a reviewed bounded batch.");
      const dataset={format:metadata.format,scope:metadata.scope,excludes:metadata.excludes,
        limitations:metadata.limitations,entries};
      const blob=new Blob([JSON.stringify(dataset,null,2)+"\n"],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;
      a.download="pcs-forge-duel-adult-optin-"+new Date().toISOString().slice(0,10)+".json";
      document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      msg.textContent="Exported "+entries.length+" synthetic ballot batches. Do not publish participant data without consent review.";
    }catch(err){msg.textContent="Research export unavailable: "+err.message;}
    finally{button.disabled=false;}
  });
  document.addEventListener("DOMContentLoaded",load);
})();
