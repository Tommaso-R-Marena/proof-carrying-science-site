(() => {
  "use strict";
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function fmt(v){if(!v)return"—";try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));}catch{return v;}}
  async function api(path,options={}){
    const init={credentials:"same-origin",...options};
    if(init.body&&typeof init.body!=="string"){init.headers={...(init.headers||{}),"content-type":"application/json"};init.body=JSON.stringify(init.body);}
    const res=await fetch(path,init);const data=await res.json().catch(()=>({message:"Invalid server response."}));
    if(!res.ok){const e=new Error(data.message||"Request failed.");e.status=res.status;e.code=data.error;throw e;}return data;
  }
  function msg(id,text,good=false){const n=document.getElementById(id);if(!n)return;n.textContent=text||"";n.className=good?"form-message successline":"form-message validation bad";}

  async function requestDecision(id,decision){
    const note=prompt(decision==="approve"?"Why should this contributor receive this reserved task?":"Why is this application not being approved?");
    if(!note)return;
    try{await api(`/api/admin/requests/${encodeURIComponent(id)}/decision`,{method:"POST",body:{decision,note}});await load();}
    catch(e){alert(e.message);}
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

  async function setLevel(userId,current){
    const raw=prompt(`New verified level for this contributor (0–6). Current: L${current}`);
    if(raw===null)return;
    const level=Number(raw);
    const note=prompt("Give the evidence-based reason for this level change.");
    if(!note)return;
    let override=false;
    try{await api(`/api/admin/users/${encodeURIComponent(userId)}/level`,{method:"POST",body:{level,note,override}});}
    catch(e){
      if((e.code==="verified_skill_required"||e.code==="review_skill_required")&&confirm(e.message+"\n\nUse an explicit administrative override? This will be recorded in the audit log.")){
        override=true;
        await api(`/api/admin/users/${encodeURIComponent(userId)}/level`,{method:"POST",body:{level,note:note+" [ADMIN OVERRIDE]",override}});
      } else {alert(e.message);return;}
    }
    await load();
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
        <div class="task-card-top"><div><span class="commons-chip level">${esc(r.task_id)}</span><span class="commons-chip planned">L${esc(r.level)} applicant</span><span class="commons-chip ${r.email_verified?"volunteer":"planned"}">${r.email_verified?"email verified":"email unverified"}</span></div><span class="tiny">due ${fmt(r.decision_due_at)}</span></div>
        <h3>${esc(r.title)}</h3>
        <p><strong>${esc(r.display_name)}</strong> · ${esc(r.email)} · required skill: ${esc(r.required_skill||"none")}</p>
        <details open><summary>Application</summary><p>${esc(r.application_note)}</p></details>
        <details><summary>AI-use plan</summary><p>${esc(r.ai_use_plan)}</p></details>
        <details><summary>Independent verification plan</summary><p>${esc(r.verification_plan)}</p></details>
        <div class="actions"><button class="button primary" data-approve-request="${esc(r.id)}">Approve + reserve</button><button class="button secondary" data-reject-request="${esc(r.id)}">Reject</button></div>
      </article>`).join("");
    $$("[data-approve-request]",target).forEach(b=>b.addEventListener("click",()=>requestDecision(b.dataset.approveRequest,"approve")));
    $$("[data-reject-request]",target).forEach(b=>b.addEventListener("click",()=>requestDecision(b.dataset.rejectRequest,"reject")));
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
    $("[data-checkpoint-accept]",target).forEach(b=>b.addEventListener("click",()=>checkpointDecision(b.dataset.checkpointAccept,"accept")));
    $("[data-checkpoint-release]",target).forEach(b=>b.addEventListener("click",()=>checkpointDecision(b.dataset.checkpointRelease,"release")));
  }

  function renderSkills(items){
    const target=$("#adminSkillList");
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No skill reviews pending.</strong><span>High-trust access stays locked until exact skills are verified.</span></div>';return;}
    target.innerHTML=items.map(s=>`
      <article class="admin-card">
        <div class="task-card-top"><div><span class="commons-chip level">${esc(s.skill)}</span><span class="commons-chip planned">L${esc(s.level)}</span></div><span class="tiny">${fmt(s.requested_at)}</span></div>
        <h3>${esc(s.display_name)}</h3><p>${esc(s.email)}</p>
        <div class="boundary"><strong>Evidence</strong><span>${esc(s.evidence)}</span></div>
        <div class="actions"><button class="button primary" data-verify-skill="${esc(s.user_id)}" data-skill="${esc(s.skill)}">Verify skill</button><button class="button secondary" data-reject-skill="${esc(s.user_id)}" data-skill="${esc(s.skill)}">Reject</button></div>
      </article>`).join("");
    $$("[data-verify-skill]",target).forEach(b=>b.addEventListener("click",()=>skillDecision(b.dataset.verifySkill,b.dataset.skill,"verified")));
    $$("[data-reject-skill]",target).forEach(b=>b.addEventListener("click",()=>skillDecision(b.dataset.rejectSkill,b.dataset.skill,"rejected")));
  }

  function renderSubmissions(items){
    const target=$("#adminSubmissionList");
    if(!items.length){target.innerHTML='<div class="commons-empty"><strong>No submissions awaiting review.</strong><span>Accepted L0 work automatically advances a contributor to L1.</span></div>';return;}
    target.innerHTML=items.map(s=>`
      <article class="admin-card">
        <div class="task-card-top"><div><span class="commons-chip level">${esc(s.task_id)}</span><span class="commons-chip ${s.ai_used?"planned":"volunteer"}">${s.ai_used?"AI used":"no AI declared"}</span></div><span class="tiny">${fmt(s.submitted_at)}</span></div>
        <h3>${esc(s.title)}</h3><p><strong>${esc(s.display_name)}</strong> · L${esc(s.level)} · ${esc(s.email)}</p>
        <details open><summary>Contribution summary</summary><p>${esc(s.summary)}</p></details>
        ${s.artifact_url?`<p><a href="${esc(s.artifact_url)}" target="_blank" rel="noopener">Open submitted artifact ↗</a></p>`:""}
        <details><summary>Independent verification</summary><p>${esc(s.verification_note)}</p></details>
        <details><summary>Understanding / scope</summary><p>${esc(s.understanding_note)}</p></details>
        ${s.ai_used?`<details><summary>AI disclosure</summary><p>${esc(s.ai_tools||"AI used; tool not stated")}</p></details>`:""}
        <div class="actions"><button class="button primary" data-submission-accept="${esc(s.id)}">Accept</button><button class="button secondary" data-submission-changes="${esc(s.id)}">Needs changes</button><button class="button secondary" data-submission-reject="${esc(s.id)}">Reject</button></div>
      </article>`).join("");
    $$("[data-submission-accept]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionAccept,"accept")));
    $$("[data-submission-changes]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionChanges,"needs_changes")));
    $$("[data-submission-reject]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionReject,"reject")));
  }

  function renderUsers(items){
    const target=$("#adminUserList");
    target.innerHTML=items.map(u=>`
      <article class="admin-user-row">
        <div><strong>${esc(u.display_name)}</strong><span>${esc(u.email)}</span></div>
        <div><span class="commons-chip level">L${esc(u.level)}</span><span class="commons-chip ${u.email_verified?"volunteer":"planned"}">${u.email_verified?"email verified":"email unverified"}</span><span class="commons-chip">${esc(u.track)}</span></div>
        <div class="actions"><button class="smallbutton" data-level-user="${esc(u.id)}" data-current-level="${esc(u.level)}">Set level</button>${u.email_verified?"":`<button class="smallbutton" data-email-user="${esc(u.id)}">Verify email manually</button>`}</div>
      </article>`).join("");
    $$("[data-level-user]",target).forEach(b=>b.addEventListener("click",()=>setLevel(b.dataset.levelUser,Number(b.dataset.currentLevel))));
    $$("[data-email-user]",target).forEach(b=>b.addEventListener("click",()=>verifyEmail(b.dataset.emailUser)));
  }

  async function load(){
    try{
      const data=await api("/api/admin/overview");
      $("#adminUnavailable").hidden=true;$("#adminDashboard").hidden=false;
      $("#adminEmailTransport").textContent=data.email_transport?"configured":"not configured";
      $("#adminEmailTransport").className=data.email_transport?"good-text":"warn-text";
      renderRequests(data.pending_requests||[]);renderCheckpoints(data.checkpoints||[]);renderSkills(data.skill_reviews||[]);renderSubmissions(data.submissions||[]);renderUsers(data.users||[]);
    }catch(e){
      $("#adminDashboard").hidden=true;$("#adminUnavailable").hidden=false;
      if(e.status!==401&&e.status!==403)msg("bootstrapMessage",e.message);
    }
  }

  $("#bootstrapForm")?.addEventListener("submit",async event=>{
    event.preventDefault();const fd=new FormData(event.currentTarget);
    try{
      const result=await api("/api/admin/bootstrap",{method:"POST",body:{email:fd.get("email"),display_name:fd.get("display_name"),password:fd.get("password"),bootstrap_token:fd.get("bootstrap_token")}});
      $("#adminRecoveryCode").textContent=result.recovery_code;$("#adminRecoveryPanel").hidden=false;msg("bootstrapMessage","Owner account created. Save the recovery code.",true);await load();
    }catch(e){msg("bootstrapMessage",e.message);}
  });

  document.addEventListener("DOMContentLoaded",load);
})();
