(() => {
  "use strict";

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  let state = null;

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

  function levelCopy(level) {
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
      target.innerHTML = '<div class="commons-empty"><strong>No reviewed skills yet.</strong><span>You may still start eligible L0 open work immediately.</span></div>';
      return;
    }
    target.innerHTML = skills.map(item => `
      <div class="skill-row">
        <span class="commons-chip ${item.status === "verified" ? "volunteer" : item.status === "rejected" ? "planned" : "level"}">${esc(item.status)}</span>
        <div><strong>${esc(item.skill)}</strong><small>${item.verified_at ? "Verified "+formatDate(item.verified_at) : item.requested_at ? "Review requested "+formatDate(item.requested_at) : "Self-reported"}</small></div>
        <p>${esc(item.verification_note || item.evidence || "")}</p>
      </div>`).join("");
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
    $$("[data-submit-work]",target).forEach(btn=>btn.addEventListener("click",async()=>{
      const summary=prompt("Summarize the contribution (minimum 100 characters).");
      if (!summary) return;
      const artifact_url=prompt("Artifact / PR / commit URL (optional):") || "";
      const ai_used=confirm("Did you use an AI assistant in producing this contribution? Click OK for yes, Cancel for no.");
      const ai_tools=ai_used ? (prompt("Which AI tool(s) did you use?") || "") : "";
      const verification_note=prompt("How did you independently verify the work? Higher-trust tasks require a detailed note.") || "";
      const understanding_note=prompt("Explain what your contribution establishes, what it does NOT establish, and any remaining assumptions. Higher-trust tasks require a detailed answer.") || "";
      try {
        await api(`/api/requests/${encodeURIComponent(btn.dataset.submitWork)}/submit`,{
          method:"POST",body:{summary,artifact_url,ai_used,ai_tools,verification_note,understanding_note}
        });
        alert("Submission received for review.");
        await load();
      } catch(e){ alert(e.message); }
    }));
  }

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
    $("#accountLevel").textContent="L"+user.level;
    $("#accountName").textContent=user.display_name;
    $("#accountEmail").textContent=user.email;
    $("#accountRoleChip").textContent=user.role.toUpperCase();\n    $("#adminDashboardLink").hidden=user.role!=="admin";
    $("#emailVerifyChip").textContent=user.email_verified ? "EMAIL VERIFIED" : "EMAIL UNVERIFIED";
    $("#emailVerifyChip").className="commons-chip "+(user.email_verified?"volunteer":"planned");
    $("#resendVerification").hidden=user.email_verified;
    $("#levelAccessSummary").innerHTML=levelCopy(user.level);

    const form=$("#profileForm");
    form.elements.availability_hours.value=String(user.availability_hours||1);
    form.elements.track.value=user.track||"nontechnical";
    form.elements.compensation_preference.value=user.compensation_preference||"either";
    form.elements.profile_note.value=user.profile_note||"";

    renderSkills(data.skills);
    renderRequests(data.requests);
    renderNotifications(data.notifications);
  }

  function renderLoggedOut() {
    $("#accountLoggedOut").hidden=false;
    $("#accountLoggedIn").hidden=true;
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
    try { await api("/api/auth/login",{method:"POST",body:{email:fd.get("email"),password:fd.get("password")}}); setMessage("loginMessage","Signed in.",true); await load(); }
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
  $("#recoveryCodeSaved")?.addEventListener("click",()=>{$("#recoveryCodePanel").hidden=true;});

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
  });
})();
