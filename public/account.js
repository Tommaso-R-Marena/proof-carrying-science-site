(() => {
  "use strict";

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  let state = null;
  let activeEvaluation = null;
  let activeWorkRequest = null;

  function taskIntent() {
    const params = new URLSearchParams(location.search);
    const task = String(params.get("task") || "").trim();
    return /^[A-Za-z0-9._-]{2,64}$/.test(task) ? task : "";
  }

  function safeNextUrl() {
    const params = new URLSearchParams(location.search);
    const raw = String(params.get("next") || "").trim();
    if (!raw) {
      const task = taskIntent();
      return task ? `/tasks.html?task=${encodeURIComponent(task)}` : "";
    }
    try {
      const target = new URL(raw, location.origin);
      if (target.origin !== location.origin || !target.pathname.endsWith("/tasks.html")) return "";
      return target.pathname + target.search + target.hash;
    } catch {
      return "";
    }
  }

  function requestedSkill() {
    const params = new URLSearchParams(location.search);
    const skill = String(params.get("skill") || "").trim();
    return new Set(["nontechnical","research","python","ml","biology","security","lean","review"]).has(skill) ? skill : "";
  }

  function renderTaskContinuation(authenticated, liveReason="") {
    const panel = $("#taskContinuationPanel");
    if (!panel) return;
    const task = taskIntent();
    if (!task) { panel.hidden = true; return; }
    panel.hidden = false;
    const params = new URLSearchParams(location.search);
    const priorReason = String(params.get("reason") || "").trim();
    const reason = liveReason || priorReason;
    const skill = requestedSkill();
    $("#taskContinuationTitle").textContent = `Continue with ${task}`;
    $("#taskContinuationReason").textContent = authenticated
      ? (reason ? `Current access check: ${reason}${skill ? ` Required skill: ${skill}.` : ""}` : "You are signed in. Return to the marketplace to re-check your current eligibility and apply if the task is unlocked.")
      : (reason ? `Sign in first. Previous access check: ${reason}` : "Sign in first; PCS will then re-check your verified level and skills for this exact task.");
    const skillForm = $("#skillForm");
    if (authenticated && skillForm && skill && skillForm.elements.skill) skillForm.elements.skill.value = skill;
    const evaluationForm = $("#evaluationStartForm");
    if (authenticated && evaluationForm && skill && evaluationForm.elements.skill) evaluationForm.elements.skill.value = skill;
    const link = $("#taskContinuationLink");
    if (link) {
      link.href = safeNextUrl() || `/tasks.html?task=${encodeURIComponent(task)}`;
      link.textContent = authenticated ? "Return to selected task" : "Return after signing in";
    }
  }

  async function continueAfterLogin() {
    const next = safeNextUrl();
    if (!next) return false;
    const task = taskIntent();
    if (task) {
      try {
        const data = await api("/api/tasks");
        const selected = (data.tasks || []).find(item => item.id === task);
        const unlocked = Boolean(selected && (selected.eligibility?.can_request || selected.eligibility?.can_start || (selected.my_request && ["pending","approved"].includes(selected.my_request.status))));
        if (selected && !unlocked) {
          renderTaskContinuation(true, selected.eligibility?.reason || "This task is not currently unlocked for your account.");
          return true;
        }
      } catch (_) {
        // If the eligibility refresh fails, fall back to the preserved marketplace return path.
      }
    }
    location.assign(next);
    return true;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  async function api(path, options={}) {
    const init = { credentials:"same-origin", ...options };
    if (init.body && typeof init.body !== "string") {
      init.headers = { ...(init.headers||{}), "content-type":"application/json" };
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({ok:false,message:"Invalid server response."}));
    if (!response.ok) {
      const error = new Error(data.message || "Request failed.");
      error.code = data.error;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setMessage(id, message, good=false) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("successline", Boolean(good));
    node.classList.toggle("validation", !good);
    node.classList.toggle("bad", !good && Boolean(message));
  }

  function showRecovery(code) {
    if (!code) return;
    $("#recoveryCodeValue").textContent = code;
    $("#recoveryCodePanel").hidden = false;
    $("#recoveryCodePanel").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function formatDate(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)); }
    catch { return value; }
  }

  function levelCopy(level, owner=false) {
    if (owner) return "<strong>L7 · Founder / Owner</strong><span>Unique governance authority over PCS Commons. Technical competence remains tracked separately at L6; owner status cannot be delegated, self-assigned, or modified by other administrators.</span>";
    if (level === 0) return "<strong>L0 · Learner</strong><span>Open, non-exclusive L0 tasks. No founder approval required.</span>";
    if (level === 1) return "<strong>L1 · Contributor</strong><span>Open L0–L1 work. Higher levels still require reviewed promotion.</span>";
    if (level === 2) return "<strong>L2 · Verified Contributor</strong><span>May apply for reserved L2 work when the required skill is independently verified.</span>";
    if (level === 3) return "<strong>L3 · Investigator</strong><span>May apply for advanced investigation work; pending applications never reserve tasks.</span>";
    if (level === 4) return "<strong>L4 · Reviewer</strong><span>Reviewer-authority eligible only where the exact review skill is verified and PCS assigns the work.</span>";
    if (level === 5) return "<strong>L5 · Specialist</strong><span>Specialist tasks still require the matching verified skill and explicit PCS assignment.</span>";
    return "<strong>L6 · Research Lead</strong><span>Program-level authority remains scoped to explicitly assigned roles and verified competencies.</span>";
  }

  function renderSkills(skills=[]) {
    const target = $("#skillList");
    if (!target) return;
    if (!skills.length) {
      target.innerHTML = '<div class="commons-empty"><strong>No reviewed skills yet.</strong><span>Use either qualification path below. Auto-scored evaluations still require manual approval.</span></div>';
      return;
    }
    target.innerHTML = skills.map(item => `
      <div class="skill-row">
        <span class="commons-chip ${item.status === "verified" ? "volunteer" : item.status === "rejected" ? "planned" : "level"}">${esc(item.status)}</span>
        <div><strong>${esc(item.skill)}</strong><small>${item.verified_at ? "Verified "+formatDate(item.verified_at) : item.requested_at ? "Manual review requested "+formatDate(item.requested_at) : "Self-reported"}${item.source ? " · "+esc(item.source) : ""}</small></div>
        <p>${esc(item.verification_note || item.evidence || "")}${item.status==="pending"&&item.review_due_at ? " Review target: within 1 business day; no later than "+formatDate(item.review_due_at)+"." : ""}</p>
      </div>`).join("");
  }

  function renderEvaluation(evaluation) {
    activeEvaluation=evaluation;
    const target=$("#evaluationChallenge");
    if(!target)return;
    const questions=evaluation?.challenge?.objective_questions||[];
    target.hidden=false;
    target.innerHTML=`
      <div class="boundary"><strong>${esc(evaluation.skill)} competency screening</strong><span>Fresh generated variant · ${esc(evaluation.max_score)} objective questions · pass screen ${esc(evaluation.pass_score)}/${esc(evaluation.max_score)}. Passing does not grant authority; a human still approves.</span></div>
      <form id="evaluationSubmitForm">
        ${questions.map((q,index)=>`<fieldset class="evaluation-question"><legend>${index+1}. ${esc(q.prompt)}</legend>${(q.options||[]).map(opt=>`<label class="evaluation-option"><input type="radio" name="${esc(q.id)}" value="${esc(opt.id)}" required><span>${esc(opt.label)}</span></label>`).join("")}</fieldset>`).join("")}
        <label class="field"><span>Reasoning / independent check</span><textarea class="textinput" name="rationale" minlength="100" maxlength="3000" required placeholder="Explain your reasoning, what you checked independently, and any uncertainty. This is reviewed by a human even if the objective score passes."></textarea></label>
        <button class="button primary" type="submit">Submit for auto-score + manual review</button>
        <p id="evaluationSubmitMessage" class="form-message" aria-live="polite"></p>
      </form>`;
    $("#evaluationSubmitForm")?.addEventListener("submit",submitEvaluation);
    target.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function submitEvaluation(event) {
    event.preventDefault();
    if(!activeEvaluation)return;
    const fd=new FormData(event.currentTarget);
    const answers={};
    for(const q of activeEvaluation.challenge?.objective_questions||[]) answers[q.id]=fd.get(q.id);
    try{
      const result=await api(`/api/evaluations/${encodeURIComponent(activeEvaluation.id)}/submit`,{method:"POST",body:{answers,rationale:fd.get("rationale")}});
      setMessage("evaluationSubmitMessage",result.message,Boolean(result.auto_pass));
      if(result.auto_pass){
        activeEvaluation=null;
        await load();
      }
    }catch(e){setMessage("evaluationSubmitMessage",e.message);}
  }
  function requestActionButtons(r) {
    if (r.status === "pending") {
      return `<div class="actions"><button class="button secondary" data-withdraw="${esc(r.id)}" type="button">Withdraw application</button></div>`;
    }
    if (r.status === "approved") {
      const checkpoint = r.claim_mode !== "open" ? `<button class="button secondary" data-checkpoint="${esc(r.id)}" type="button">Send progress checkpoint</button>` : "";
      return `<div class="actions">${checkpoint}<button class="button primary" data-submit-work="${esc(r.id)}" type="button">Submit work</button><button class="button secondary" data-withdraw="${esc(r.id)}" type="button">Release / withdraw</button></div>`;
    }
    return "";
  }

  function renderRequests(requests=[]) {
    const target=$("#requestList");
    if (!target) return;
    if (!requests.length) {
      target.innerHTML='<div class="commons-empty"><strong>No task work yet.</strong><span>Browse the marketplace. L0 open tasks start immediately after account creation.</span></div>';
      return;
    }
    target.innerHTML=requests.map(r=>`
      <article class="account-request-card">
        <div class="task-card-top"><div><span class="commons-chip level">${esc(r.task_id)}</span><span class="commons-chip ${r.status==="approved"||r.status==="completed"?"volunteer":"planned"}">${esc(r.status)}</span></div><span class="tiny">${formatDate(r.requested_at)}</span></div>
        <h3>${esc(r.title)}</h3>
        <div class="task-meta">
          <span><b>L${esc(r.min_level)}</b> minimum</span>
          <span><b>${esc(r.claim_mode)}</b> access</span>
          ${r.required_skill ? `<span><b>${esc(r.required_skill)}</b> verified skill</span>` : ""}
        </div>
        ${r.status==="pending" ? `<p class="tiny"><strong>Approval SLA:</strong> PCS targets 1 business day and no later than 2 business days. Current decision deadline: ${formatDate(r.decision_due_at)}. This pending request does not reserve the task.</p>` : ""}
        ${r.status==="approved" && r.claim_mode!=="open" ? `<p class="tiny"><strong>Reservation:</strong> checkpoint due ${formatDate(r.checkpoint_due_at)} · current reservation ends ${formatDate(r.reservation_expires_at)}. Missing the checkpoint releases the work automatically.</p>` : ""}
        ${r.decision_note ? `<p class="tiny"><strong>PCS note:</strong> ${esc(r.decision_note)}</p>` : ""}
        ${(state?.submissions||[]).filter(s=>s.request_id===r.id).map(s=>`
          <div class="pcs-submission-history">
            <strong>Submission · ${esc(s.status)}</strong>
            <span>GitHub: ${esc(s.github_stage_state||"not applicable")}
            ${s.github_pr_url&&String(s.github_pr_url).startsWith("https://github.com/Tommaso-R-Marena/")?` · <a href="${esc(s.github_pr_url)}" target="_blank" rel="noopener noreferrer">Open PR ↗</a>`:""}</span>
            ${s.github_pr_number?`<button class="button secondary" data-my-git-checks="${esc(s.id)}" type="button">Refresh CI result</button><span id="myGitStatus-${esc(s.id)}" aria-live="polite"></span>`:""}
            ${s.review_note?`<p><strong>Reviewer feedback:</strong> ${esc(s.review_note)}</p>`:""}
            ${s.production_promotion_state?`<p><strong>Production promotion:</strong> ${esc(s.production_promotion_state)} ${s.production_promotion_url&&String(s.production_promotion_url).startsWith("https://github.com/Tommaso-R-Marena/")?` · <a href="${esc(s.production_promotion_url)}" target="_blank" rel="noopener noreferrer">View production PR ↗</a>`:""} ${s.production_merge_sha?` · deployed-source commit: <code>${esc(s.production_merge_sha)}</code>`:""}</p>`:""}
          </div>`).join("")}
        ${requestActionButtons(r)}
      </article>`).join("");

    $$("[data-withdraw]",target).forEach(btn=>btn.addEventListener("click",async()=>{
      if (!confirm("Release/withdraw this task?")) return;
      try { await api(`/api/requests/${encodeURIComponent(btn.dataset.withdraw)}/withdraw`,{method:"POST",body:{}}); await load(); }
      catch(e){ alert(e.message); }
    }));
    $$("[data-checkpoint]",target).forEach(btn=>btn.addEventListener("click",async()=>{
      const note=prompt("Give a concrete progress checkpoint (what you did, what remains, and evidence that work is active). Minimum 80 characters.");
      if (!note) return;
      try { await api(`/api/requests/${encodeURIComponent(btn.dataset.checkpoint)}/checkpoint`,{method:"POST",body:{note}}); alert("Checkpoint submitted."); await load(); }
      catch(e){ alert(e.message); }
    }));
    $("[data-my-git-checks]",target).forEach(button=>button.addEventListener("click",async()=>{
      const id=button.dataset.myGitChecks;
      const status=document.getElementById("myGitStatus-"+id);
      if(status)status.textContent="Checking GitHub CI…";
      button.disabled=true;
      try{
        const result=await api(`/api/submissions/${encodeURIComponent(id)}/checks`);
        if(status)status.textContent=`${result.state}: ${result.message}`;
      }catch(e){if(status)status.textContent=e.message;}
      finally{button.disabled=false;}
    }));
    $("[data-submit-work]",target).forEach(btn=>btn.addEventListener("click",()=>{
      const task=requests.find(r=>r.id===btn.dataset.submitWork);
      if(task)openWorkSubmission(task);
    }));
  }

  function openWorkSubmission(task){
    activeWorkRequest=task;
    const dialog=$("#workSubmissionDialog"),form=$("#workSubmissionForm");
    if(!dialog||!form)return;
    form.reset();
    $("#workSubmissionTitle").textContent="Submit "+task.task_id+" — "+task.title;
    $("#workSubmissionRequirements").textContent="Your submission is linked to your approved work record. Include exact artifacts and independent verification; technical work is checked before review.";
    const checklist=$("#workSubmissionChecklist");
    checklist.replaceChildren();
    for(const [label,description] of [
      ["Deliverable",task.deliverable||"Use the published task deliverable."],
      ["Verification",task.verification_rule||"Explain your independent checks."],
      ["Acceptance",task.acceptance_criteria||"Meet the published task criteria."]
    ]){
      const line=document.createElement("p");
      const strong=document.createElement("strong");strong.textContent=label+": ";
      line.append(strong,document.createTextNode(description));checklist.appendChild(line);
    }
    const route=task.integration_target||"none";
    $("#workGithubHint").textContent=route==="core"
      ?"GitHub-enabled: attach text artifacts. PCS will stage them into a review PR in the core repository and request Lean/PCS checks."
      :route==="site"
        ?"GitHub-enabled: attach text artifacts. PCS will stage them into a review PR in the site repository and request website checks."
        :"This is a review-only task. Evidence files and/or a verifiable URL are sent to PCS reviewers; no code is automatically merged.";
    $("#outreachEvidenceSection").hidden=!["marketing","outreach"].includes(task.task_category);
    $("#workSubmissionMessage").textContent="";
    dialog.showModal();
  }

  $("#workSubmissionCancel")?.addEventListener("click",()=>$("#workSubmissionDialog").close());
  $("#workSubmissionForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const form=event.currentTarget,msg=$("#workSubmissionMessage"),send=$("#workSubmissionSend");
    if(!activeWorkRequest)return;
    const fd=new FormData(form);
    const files=[...($("#workSubmissionFiles").files||[])];
    if(files.length>3){setMessage("workSubmissionMessage","Attach at most three text files.");return;}
    const attachments=[];
    let total=0;
    for(const file of files){
      if(file.size>20000||file.size===0){setMessage("workSubmissionMessage","Each text file must be between 1 byte and 20 KB.");return;}
      total+=file.size;
      if(total>40000){setMessage("workSubmissionMessage","Files must total at most 40 KB.");return;}
      if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,78}\.(lean|py|md|txt|json|js|mjs|html|css|csv)$/.test(file.name)||file.name.includes("..")){
        setMessage("workSubmissionMessage","Rename attachments using simple safe filenames and supported text extensions.");return;
      }
      attachments.push({name:file.name,content:await file.text()});
    }
    const isOutreach=["marketing","outreach"].includes(activeWorkRequest.task_category);
    const body={
      summary:fd.get("summary"),artifact_url:fd.get("artifact_url"),
      ai_used:fd.get("ai_used")==="on",ai_tools:fd.get("ai_tools"),
      verification_note:fd.get("verification_note"),understanding_note:fd.get("understanding_note"),
      evidence_kind:isOutreach?fd.get("evidence_kind"):"none",
      outcome_metric:isOutreach?fd.get("outcome_metric"):null,
      outcome_count:isOutreach?fd.get("outcome_count"):null,
      files:attachments
    };
    send.disabled=true;
    msg.textContent="Saving submission and requesting applicable checks…";
    try{
      const response=await api(`/api/requests/${encodeURIComponent(activeWorkRequest.id)}/submit`,{method:"POST",body});
      setMessage("workSubmissionMessage",response.message,true);
      form.reset();
      await load();
      $("#workSubmissionDialog").close();
    }catch(e){setMessage("workSubmissionMessage",e.message);}
    finally{send.disabled=false;}
  });

  function renderNotifications(items=[]) {
    const target=$("#notificationList");
    if (!target) return;
    if (!items.length) {
      target.innerHTML='<div class="commons-empty"><strong>No notifications yet.</strong><span>Approval decisions and review results will remain visible here even if email delivery is unavailable.</span></div>';
      return;
    }
    target.innerHTML=items.map(n=>`
      <article class="notification-card">
        <div><strong>${esc(n.subject)}</strong><span>${formatDate(n.created_at)} · email: ${esc(n.email_state)}</span></div>
        <p>${esc(n.body)}</p>
      </article>`).join("");
  }

  function renderLoggedIn(data) {
    const user=data.user;
    $("#accountLoggedOut").hidden=true;
    $("#accountLoggedIn").hidden=false;
    $("#accountLevel").textContent="L"+(user.display_level ?? user.level);
    $("#accountName").textContent=user.display_name;
    $("#accountEmail").textContent=user.email;
    $("#accountRoleChip").textContent=user.is_owner ? "FOUNDER / OWNER" : user.role.toUpperCase();
    $("#adminDashboardLink").hidden=!(user.role==="admin"||user.is_owner);
    $("#emailVerifyChip").textContent=user.email_verified ? "EMAIL VERIFIED" : "EMAIL UNVERIFIED";
    $("#emailVerifyChip").className="commons-chip "+(user.email_verified?"volunteer":"planned");
    $("#resendVerification").hidden=user.email_verified;
    $("#levelAccessSummary").innerHTML=levelCopy(user.level,Boolean(user.is_owner));
    const guide=$("#accountLevelGuide");
    if(guide){
      const level=Number(user.level)||0;
      guide.textContent=level<2
        ? "L"+level+": Begin with open, non-exclusive work. Explore roles and Arena, or request a competency review to qualify for harder tasks."
        : level<4
          ? "L"+level+": Explore published tasks you qualify for, including paid work when available. Individual tasks still check your verified skills and eligibility."
          : "L"+level+": Explore specialist work and review-related opportunities. Reviewer authority is separately approved; your level alone does not grant administrative access.";
    }

    const deleteForm=$("#deleteAccountForm");
    const deletePanel=deleteForm?.closest(".danger-panel");
    if(deleteForm&&deletePanel){
      deleteForm.hidden=Boolean(user.is_owner);
      const heading=deletePanel.querySelector("h2");
      const copy=deletePanel.querySelector("p.muted");
      if(user.is_owner){
        if(heading)heading.textContent="Founder/Owner account protection";
        if(copy)copy.textContent="The unique PCS Founder/Owner account cannot be deleted through self-service. Ownership must be deliberately transferred or governance shut down through a separate protected procedure first.";
      }else{
        if(heading)heading.textContent="Delete my Commons account";
        if(copy)copy.textContent="This deletes your contributor account and its linked sessions, skill records, task requests, submissions, and account notifications. Enter your password to confirm. This does not delete unrelated public GitHub contributions or short-retention infrastructure logs.";
      }
    }

    const form=$("#profileForm");
    form.elements.availability_hours.value=String(user.availability_hours||1);
    form.elements.track.value=user.track||"nontechnical";
    form.elements.compensation_preference.value=user.compensation_preference||"either";
    form.elements.profile_note.value=user.profile_note||"";

    renderSkills(data.skills);
    renderRequests(data.requests);
    renderNotifications(data.notifications);
    renderTaskContinuation(true);
  }

  function renderLoggedOut() {
    $("#accountLoggedOut").hidden=false;
    $("#accountLoggedIn").hidden=true;
    renderTaskContinuation(false);
  }

  async function load() {
    try {
      state=await api("/api/me");
      if (state.authenticated) renderLoggedIn(state); else renderLoggedOut();
    } catch(e) {
      renderLoggedOut();
      setMessage("loginMessage",e.message);
    }
  }

  $("#registerForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    if (fd.get("password")!==fd.get("password_confirm")) return setMessage("registerMessage","Passwords do not match.");
    try {
      const result=await api("/api/auth/register",{method:"POST",body:{
        display_name:fd.get("display_name"),email:fd.get("email"),password:fd.get("password"),
        website:fd.get("website"),ai_policy_ack:fd.get("ai_policy_ack")==="on",
        terms_version:fd.get("terms_ack")==="on" ? "commons-v1" : ""
      }});
      setMessage("registerMessage","Account created. Save your recovery code.",true);
      showRecovery(result.recovery_code);
      await load();
    } catch(e){ setMessage("registerMessage",e.message); }
  });

  $("#loginForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    try {
      await api("/api/auth/login",{method:"POST",body:{email:fd.get("email"),password:fd.get("password")}});
      setMessage("loginMessage","Signed in.",true);
      await load();
      if (await continueAfterLogin()) return;
    }
    catch(e){ setMessage("loginMessage",e.message); }
  });

  $("#recoverForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    try {
      const result=await api("/api/auth/recover",{method:"POST",body:{email:fd.get("email"),recovery_code:fd.get("recovery_code"),new_password:fd.get("new_password")}});
      setMessage("recoverMessage",result.message,true); showRecovery(result.recovery_code);
    } catch(e){ setMessage("recoverMessage",e.message); }
  });

  $("#profileForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    try {
      await api("/api/profile",{method:"PATCH",body:{
        availability_hours:Number(fd.get("availability_hours")),track:fd.get("track"),
        compensation_preference:fd.get("compensation_preference"),profile_note:fd.get("profile_note")
      }});
      setMessage("profileMessage","Profile saved. Your verified PCS level was not changed.",true); await load();
    } catch(e){ setMessage("profileMessage",e.message); }
  });

  $("#evaluationStartForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    try{
      const result=await api("/api/evaluations/start",{method:"POST",body:{skill:fd.get("skill"),task_id:taskIntent()||null}});
      setMessage("evaluationStartMessage",result.message,true);
      renderEvaluation(result.evaluation);
    }catch(e){setMessage("evaluationStartMessage",e.message);}
  });

  $("#skillForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    const fd=new FormData(event.currentTarget);
    try {
      const result=await api("/api/skills/request",{method:"POST",body:{skill:fd.get("skill"),evidence:fd.get("evidence")}});
      setMessage("skillMessage",result.message,true); event.currentTarget.reset(); await load();
    } catch(e){ setMessage("skillMessage",e.message); }
  });

  $("#deleteAccountForm")?.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!confirm("Permanently delete your PCS Commons account and linked account/task data? This cannot be undone.")) return;
    const fd=new FormData(event.currentTarget);
    try{
      await api("/api/account/delete",{method:"POST",body:{password:fd.get("password")}});
      setMessage("deleteAccountMessage","Account deleted.",true);
      await load();
    }catch(e){setMessage("deleteAccountMessage",e.message);}
  });

  $("#logoutButton")?.addEventListener("click",async()=>{ try { await api("/api/auth/logout",{method:"POST",body:{}}); await load(); } catch(e){ alert(e.message); } });
  $("#resendVerification")?.addEventListener("click",async()=>{
    try {
      const result=await api("/api/auth/resend-verification",{method:"POST",body:{}});
      setMessage("emailStatusMessage",result.message,result.email_state==="sent");
    } catch(e){ setMessage("emailStatusMessage",e.message); }
  });

  $("#copyRecoveryCode")?.addEventListener("click",async()=>{
    try { await navigator.clipboard.writeText($("#recoveryCodeValue").textContent); $("#copyRecoveryCode").textContent="Copied"; }
    catch { $("#copyRecoveryCode").textContent="Copy unavailable"; }
  });
  $("#recoveryCodeSaved")?.addEventListener("click",async()=>{
    $("#recoveryCodePanel").hidden=true;
    await load();
    if (await continueAfterLogin()) return;
  });

  async function processVerificationLink() {
    const params=new URLSearchParams(location.search);
    const token=params.get("verify");
    if (!token) return;
    try {
      const result=await api("/api/auth/verify-email",{method:"POST",body:{token}});
      history.replaceState({},document.title,"account.html");
      alert(result.message);
    } catch(e) {
      history.replaceState({},document.title,"account.html");
      alert(e.message);
    }
  }

  document.addEventListener("DOMContentLoaded",async()=>{
    await processVerificationLink();
    await load();
    const params=new URLSearchParams(location.search);
    if(state?.authenticated && params.get("evaluation")==="1"){
      setTimeout(()=>document.getElementById("competency")?.scrollIntoView({behavior:"smooth",block:"start"}),120);
    }
  });
})();
