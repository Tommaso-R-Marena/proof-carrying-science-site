(() => {
  "use strict";
  const $=(s,r=document)=>r.querySelector(s);
  const all=(s,r=document)=>[...r.querySelectorAll(s)];
  let currentAdmin=null;
  const auditFeeds={
    approvals:{events:[],next:null},
    admin:{events:[],next:null},
    all:{events:[],next:null},
  };

  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function fmt(v){if(!v)return"—";try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));}catch{return v;}}
  async function api(path,options={}){
    const init={credentials:"same-origin",...options};
    const isForm=typeof FormData!=="undefined" && init.body instanceof FormData;
    if(init.body&&typeof init.body!=="string"&&!isForm){init.headers={...(init.headers||{}),"content-type":"application/json"};init.body=JSON.stringify(init.body);}
    const res=await fetch(path,init);const data=await res.json().catch(()=>({message:"Invalid server response."}));
    if(!res.ok){const e=new Error(data.message||"Request failed.");e.status=res.status;e.code=data.error;throw e;}return data;
  }
  function msg(id,text,good=false){const n=document.getElementById(id);if(!n)return;n.textContent=text||"";n.className=good?"form-message successline":"form-message validation bad";}

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

  async function setLevel(userId,current){
    const raw=prompt(`New verified technical level for this contributor (0–6). Current: L${current}. L7 is reserved for the unique Founder/Owner and cannot be assigned.`);
    if(raw===null)return;
    const level=Number(raw);
    const note=prompt("Give the evidence-based reason for this level change.");
    if(!note)return;
    let override=false;
    try{await api(`/api/admin/users/${encodeURIComponent(userId)}/level`,{method:"POST",body:{level,note,override}});}
    catch(e){
      const overrideCodes=new Set(["verified_skill_required","l2_work_required","l3_work_required","l4_review_required","l5_specialist_required","l6_override_required"]);
      if(overrideCodes.has(e.code)&&currentAdmin?.is_owner&&confirm(e.message+"\n\nUse an explicit Founder/Owner override? This is audited and should be used only when the evidence is equivalent to the ordinary gate.")){
        override=true;
        await api(`/api/admin/users/${encodeURIComponent(userId)}/level`,{method:"POST",body:{level,note:note+" [FOUNDER CALIBRATION OVERRIDE]",override}});
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
    all("[data-submission-accept]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionAccept,"accept")));
    all("[data-submission-changes]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionChanges,"needs_changes")));
    all("[data-submission-reject]",target).forEach(b=>b.addEventListener("click",()=>submissionDecision(b.dataset.submissionReject,"reject")));
  }

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
    const search=kind==="all"?($("#adminAuditSearch")?.value||"").trim():"";
    const items=auditFeeds[kind].events.filter(event=>auditMatches(event,search));
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

  async function loadAuditFeed(kind,{append=false}={}){
    const feed=auditFeeds[kind];
    const qs=new URLSearchParams({kind,limit:"100"});
    if(append&&feed.next)qs.set("before_seq",String(feed.next));
    const data=await api("/api/admin/audit?"+qs.toString());
    feed.events=append?[...feed.events,...(data.events||[])]:data.events||[];
    feed.next=data.next_before||null;
    renderAuditIntegrity(data.integrity);
    renderAuditFeed(kind);
  }

  async function reloadAuditFeeds(){
    for(const feed of Object.values(auditFeeds)){feed.events=[];feed.next=null;}
    await Promise.all([
      loadAuditFeed("approvals"),
      loadAuditFeed("admin"),
      loadAuditFeed("all"),
    ]);
  }

  function renderUsers(items){
    const target=$("#adminUserList");
    target.innerHTML=items.map(u=>{
      const owner=Boolean(u.is_owner);
      const canGovern=Boolean(currentAdmin?.is_owner)&&!owner;
      const canSetLevel=!owner&&(Boolean(currentAdmin?.is_owner)||(u.role!=="admin"&&Number(u.level)<6));
      const levelLabel=owner?"L7 · FOUNDER / OWNER":`L${esc(u.level)}`;
      const governanceLabel=owner?"OWNER":u.role==="admin"?"ADMIN":"CONTRIBUTOR";
      const statusClass=u.status==="active"?"volunteer":"planned";
      let actions="";
      if(owner){
        actions='<span class="tiny"><strong>Protected unique owner.</strong> Delegated admins cannot modify this account.</span>';
      }else{
        const buttons=[];
        if(canSetLevel)buttons.push(`<button class="smallbutton" data-level-user="${esc(u.id)}" data-current-level="${esc(u.level)}">Set technical level</button>`);
        if(!u.email_verified)buttons.push(`<button class="smallbutton" data-email-user="${esc(u.id)}">Verify email manually</button>`);
        if(canGovern&&u.status==="active"&&u.role!=="admin")buttons.push(`<button class="smallbutton" data-governance="grant-admin" data-user="${esc(u.id)}">Grant admin</button>`);
        if(canGovern&&u.role==="admin")buttons.push(`<button class="smallbutton" data-governance="revoke-admin" data-user="${esc(u.id)}">Revoke admin</button>`);
        if(canGovern&&u.status==="active")buttons.push(`<button class="smallbutton" data-governance="suspend" data-user="${esc(u.id)}">Suspend</button>`);
        if(canGovern&&u.status!=="active")buttons.push(`<button class="smallbutton" data-governance="reactivate" data-user="${esc(u.id)}">Reactivate</button>`);
        actions=buttons.join("");
      }
      return `
      <article class="admin-user-row">
        <div><strong>${esc(u.display_name)}</strong><span>${esc(u.email)}</span></div>
        <div><span class="commons-chip level">${levelLabel}</span><span class="commons-chip">${governanceLabel}</span><span class="commons-chip ${statusClass}">${esc(u.status)}</span><span class="commons-chip ${u.email_verified?"volunteer":"planned"}">${u.email_verified?"email verified":"email unverified"}</span><span class="commons-chip">${esc(u.track)}</span></div>
        <div class="actions">${actions}</div>
      </article>`;
    }).join("");
    all("[data-level-user]",target).forEach(b=>b.addEventListener("click",()=>setLevel(b.dataset.levelUser,Number(b.dataset.currentLevel))));
    all("[data-email-user]",target).forEach(b=>b.addEventListener("click",()=>verifyEmail(b.dataset.emailUser)));
    all("[data-governance]",target).forEach(b=>b.addEventListener("click",()=>{
      const user=items.find(u=>u.id===b.dataset.user);
      if(user)governanceChange(user,b.dataset.governance);
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
      $("#adminEmailTransport").textContent=data.email_transport?"configured":"not configured";
      $("#adminEmailTransport").className=data.email_transport?"good-text":"warn-text";
      $("#adminEmailTransportDetail").textContent=data.email_transport_name==="gmail_apps_script"?"Gmail · Apps Script relay":data.email_transport_name==="resend"?"Resend":"No outbound provider";
      $("#adminMailTestButton").disabled=!data.email_transport;
      renderRequests(data.pending_requests||[]);
      renderCheckpoints(data.checkpoints||[]);
      renderSkills(data.skill_reviews||[]);
      renderSubmissions(data.submissions||[]);
      renderUsers(data.users||[]);
      await reloadAuditFeeds();
    }catch(e){
      $("#adminDashboard").hidden=true;$("#adminUnavailable").hidden=false;
      if(e.status!==401&&e.status!==403)console.error(e);
    }
  }

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
  $("#refreshAuditButton")?.addEventListener("click",()=>reloadAuditFeeds().catch(e=>alert(e.message)));
  $("#adminAuditSearch")?.addEventListener("input",()=>renderAuditFeed("all"));

  document.addEventListener("DOMContentLoaded",load);
})();
