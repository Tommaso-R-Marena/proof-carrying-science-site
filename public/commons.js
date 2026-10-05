(() => {
  "use strict";

  const LEVELS = [
    {level:0,name:"Learner",review:false,paid:false,description:"Start immediately on open, non-exclusive orientation, annotation, and reproduction tasks."},
    {level:1,name:"Contributor",review:false,paid:"limited",description:"Earned after reviewed entry-level work; expands open evidence and research tasks."},
    {level:2,name:"Verified Contributor",review:false,paid:true,description:"Eligible to apply for bounded paid/technical tasks when the exact required skill is verified."},
    {level:3,name:"Investigator",review:false,paid:true,description:"Advanced decomposition, benchmarking, evaluator analysis, and technical investigation."},
    {level:4,name:"Reviewer",review:true,paid:true,description:"Independent-review authority eligible only with verified review competence and explicit assignment."},
    {level:5,name:"Specialist",review:true,paid:true,description:"Formal methods, security, ML evaluation, biology, and other specialist work—still skill-gated per task."},
    {level:6,name:"Research Lead",review:true,paid:true,description:"Program ownership and assurance-case leadership under explicit PCS authority."},
  ];

  const META = {
    "AS-001":{project:"AI Safety v0.1",impact:"Evaluation integrity",difficulty:"Easy",deliverable:"A structured reproduction record: expected count, observed count, ambiguities, and whether the instructions were sufficient.",verification:"A second reviewer compares the record against the frozen trace fixture."},
    "AS-002":{project:"AI Safety v0.1",impact:"Trace semantics",difficulty:"Easy",deliverable:"Structured allowed/forbidden/ambiguous labels plus a short justification for ambiguous cases.",verification:"Agreement against a hidden reference set plus review of disagreements."},
    "AS-003":{project:"AI Safety v0.1",impact:"Epistemic calibration",difficulty:"Easy",deliverable:"A claim/evidence table marking supported, overstated, under-specified, or OPEN statements.",verification:"Independent review using the same evidence rubric."},
    "OPS-001":{project:"Contributor infrastructure",impact:"Usability / access",difficulty:"Easy",deliverable:"Structured usability notes and a yes/no answer: could you tell what useful result was expected?",verification:"Product maintainer triage and before/after copy comparison."},
    "AS-004":{project:"AI Safety v0.1",impact:"Authorization invariants",difficulty:"Moderate",deliverable:"Machine-readable adversarial test cases plus expected accept/reject outcomes and attack rationale.",verification:"Cases execute deterministically and are reviewed for novelty and correctness."},
    "AS-005":{project:"AI Safety v0.1",impact:"Resource / authority safety",difficulty:"Moderate",deliverable:"Checker, unit tests, malformed-input tests, and a short trust-boundary note.",verification:"PCS reruns the tests and adversarially mutates fixtures."},
    "AS-006":{project:"AI Safety v0.1",impact:"Evaluation integrity",difficulty:"Advanced",deliverable:"Threat model, missing-binding findings, and concrete regression tests.",verification:"Findings are reproduced by a second technical reviewer."},
    "AS-007":{project:"AI Safety v0.1",impact:"Claim IR / obligation graph",difficulty:"Advanced",deliverable:"A proposed obligation DAG with dependency rationale and unresolved assumptions.",verification:"Separate reviewer checks completeness and non-circularity."},
    "AS-008":{project:"AI Safety v0.1",impact:"Independent review",difficulty:"Reviewer",deliverable:"A review record with accept/reject/OPEN findings per node.",verification:"Reviewer eligibility is assigned by PCS; disagreement is escalated rather than averaged."},
    "AS-009":{project:"AI Safety v0.1",impact:"Formal assurance",difficulty:"Specialist",deliverable:"Compiling Lean theorem, axiom audit, counterexample attempts, and explanation of assumptions.",verification:"Independent Lean review plus clean build and proof-escape audit."},
    "AS-010":{project:"Distributed assurance",impact:"Crowdsource work, not authority",difficulty:"Specialist",deliverable:"Attack corpus, successful/failed exploits, and regression recommendations.",verification:"Every claimed exploit must be independently reproduced."},
    "SCI-001":{project:"Cross-domain pilot",impact:"Domain generality",difficulty:"Advanced",deliverable:"Claim specification, data-world boundary, leaf obligations, and explicit external-world assumptions.",verification:"Domain review plus PCS structural review."},
    "CAL-PY-001":{project:"Contributor calibration",impact:"Python skill verification",difficulty:"Calibration",deliverable:"Repair the synthetic fail-open checker and add a regression test; explain why the original behavior was unsafe.",verification:"Founder/technical review. Acceptance may verify Python skill but is not production work."},
    "CAL-LEAN-001":{project:"Contributor calibration",impact:"Lean skill verification",difficulty:"Calibration",deliverable:"Repair the synthetic theorem/proof boundary and explain statement, assumptions, axiom footprint, and why compilation alone is not enough.",verification:"Founder/formal review. Acceptance may verify Lean skill but grants no automatic high level."},
    "CAL-SEC-001":{project:"Contributor calibration",impact:"Security skill verification",difficulty:"Calibration",deliverable:"Give a concrete synthetic bypass or a rigorous reason proposed attacks fail, plus a regression case.",verification:"Founder/security review on a non-production fixture."},
    "CAL-ML-001":{project:"Contributor calibration",impact:"ML evaluation skill verification",difficulty:"Calibration",deliverable:"Identify leakage/binding/metric issues in the synthetic evaluation and specify a reproducible correction.",verification:"Founder/ML review on a non-production fixture."},
    "CAL-RES-001":{project:"Contributor calibration",impact:"Research skill verification",difficulty:"Calibration",deliverable:"Separate supported, overstated, under-specified, and OPEN statements in the synthetic evidence packet.",verification:"Founder/research review on a non-production fixture."},
    "CAL-BIO-001":{project:"Contributor calibration",impact:"Computational-biology skill verification",difficulty:"Calibration",deliverable:"Check sequence/index/score semantics and explicitly separate committed-artifact truth from external biological truth.",verification:"Founder/domain review on a non-production fixture."},
    "CAL-REV-001":{project:"Contributor calibration",impact:"Review skill verification",difficulty:"Calibration",deliverable:"Identify missing dependencies and over-closure in a synthetic assurance graph and issue reasoned accept/reject/OPEN findings.",verification:"Founder review. Passing verifies review skill only; L4 still requires separate promotion evidence."},
  };

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  let snapshot={authenticated:false,user:null,requests:[],skills:[],tasks:[]};
  let taskIntentHandled=false;

  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  async function api(path,options={}){
    const init={credentials:"same-origin",...options};
    if(init.body&&typeof init.body!=="string"){init.headers={...(init.headers||{}),"content-type":"application/json"};init.body=JSON.stringify(init.body);}
    const res=await fetch(path,init);const data=await res.json().catch(()=>({message:"Invalid server response."}));
    if(!res.ok){const e=new Error(data.message||"Request failed.");e.code=data.error;e.status=res.status;throw e;}return data;
  }
  function fmt(v){if(!v)return"—";try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));}catch{return v;}}
  function compensationLabel(task){return task.compensation_label||"Volunteer";}
  function paid(task){return task.compensation_type!=="volunteer";}
  function difficulty(task){return META[task.id]?.difficulty||("L"+task.min_level);}
  function taskMeta(task){return META[task.id]||{project:"PCS Commons",impact:"Public assurance",difficulty:"L"+task.min_level,deliverable:"Deliver the bounded output described by the task.",verification:"PCS reviews the result against the stated acceptance criteria."};}

  function accountTaskHref(task, eligibility, apply=true){
    const next=new URL("tasks.html",location.origin);
    next.searchParams.set("task",task.id);
    if(apply)next.searchParams.set("apply","1");
    const account=new URL("account.html",location.origin);
    account.searchParams.set("task",task.id);
    account.searchParams.set("next",next.pathname+next.search);
    if(task.required_skill)account.searchParams.set("skill",task.required_skill);
    if(eligibility?.reason)account.searchParams.set("reason",eligibility.reason);
    return account.pathname+account.search;
  }

  function requestedTaskIntent(){
    const params=new URLSearchParams(location.search);
    const task=String(params.get("task")||"").trim();
    if(!/^[A-Za-z0-9._-]{2,64}$/.test(task))return null;
    return {task,apply:params.get("apply")==="1"};
  }

  function renderProjectTaskReturn(){
    if(!location.pathname.endsWith("/projects.html"))return;
    const intent=requestedTaskIntent();
    if(!intent)return;
    const head=document.querySelector(".commons-pagehead");
    if(!head||document.getElementById("projectTaskReturn"))return;
    const panel=document.createElement("div");
    panel.id="projectTaskReturn";
    panel.className="commons-policy-note";
    panel.innerHTML=`<strong>Inspecting path for ${esc(intent.task)}:</strong><span>This page explains the assurance path; it does not change your task eligibility.</span><a class="button secondary" href="tasks.html?task=${encodeURIComponent(intent.task)}">Return to selected task</a>`;
    head.insertAdjacentElement("afterend",panel);
  }

  function renderLevelTable(){
    const target=$("#commonsLevels");if(!target)return;
    const actual=snapshot.user?.level;
    target.innerHTML=LEVELS.map(item=>`
      <article class="level-card ${actual===item.level?"current-level":""}">
        <div class="level-number">L${item.level}</div>
        <div><h3>${esc(item.name)}${actual===item.level?" · your verified level":""}</h3><p>${esc(item.description)}</p>
        <div class="level-access"><span>${item.paid===true?"Paid-task eligibility":"Public/entry task access"}</span><span>${item.review?"Reviewer-authority eligible":"No review authority"}</span></div></div>
      </article>`).join("");
  }

  function profileForm(){
    return $("#contributorProfileForm");
  }

  function renderProfile(){
    const target=$("#localContributorProfile");if(!target)return;
    const form=profileForm();
    if(!snapshot.authenticated){
      target.innerHTML='<div class="commons-empty"><strong>Account required.</strong><span>Create an account to contribute. Every account starts at L0; nobody can self-declare L4 or L5.</span><a class="button primary" href="account.html">Create / sign in</a></div>';
      if(form){$$("input,select,textarea,button",form).forEach(el=>el.disabled=true);}
      return;
    }
    const u=snapshot.user;
    target.innerHTML=`
      <div class="local-profile-head"><span class="commons-level-badge">L${u.level}</span><div><strong>${esc(LEVELS[u.level]?.name||"Contributor")}</strong><small>Verified PCS level · controlled by reviewed work</small></div></div>
      <dl class="local-profile-grid">
        <div><dt>Email</dt><dd>${u.email_verified?"Verified":"Unverified"}</dd></div>
        <div><dt>Time</dt><dd>${u.availability_hours} h/week</dd></div>
        <div><dt>Track</dt><dd>${esc(u.track)}</dd></div>
        <div><dt>Work preference</dt><dd>${esc(u.compensation_preference)}</dd></div>
      </dl>
      <p class="tiny"><strong>Authority:</strong> your level cannot be edited here. L2+ tasks also require the exact verified skill and PCS approval; L4/L5 work is never self-claimed.</p>
      <div class="actions"><a class="button secondary" href="account.html">Manage account + skills</a></div>`;
    if(form){
      $$("input,select,textarea,button",form).forEach(el=>el.disabled=false);
      form.elements.availability_hours.value=String(u.availability_hours||1);
      form.elements.track.value=u.track||"nontechnical";
      form.elements.compensation_preference.value=u.compensation_preference||"either";
      form.elements.profile_note.value=u.profile_note||"";
    }
  }

  function recommendTask(){
    const target=$("#commonsRecommendation");if(!target)return;
    if(!snapshot.authenticated){
      target.innerHTML='<div class="commons-empty"><strong>Create an account first.</strong><span>You will start at L0 and can begin open, non-exclusive work immediately.</span><a class="button primary" href="account.html">Create account</a></div>';return;
    }
    const u=snapshot.user;
    const eligible=snapshot.tasks.filter(t=>t.eligibility?.can_start||t.eligibility?.can_request);
    const preferred=eligible.find(t=>(t.required_skill||"nontechnical")===u.track&&Number(t.expected_hours)<=Number(u.availability_hours))||eligible.find(t=>Number(t.expected_hours)<=Number(u.availability_hours))||eligible[0];
    if(!preferred){target.innerHTML='<div class="commons-empty"><strong>No current task matches your verified access.</strong><span>Do an open task at your current level or request skill verification from your account.</span></div>';return;}
    const m=taskMeta(preferred);
    target.innerHTML=`<div class="recommendation-card"><div><span class="commons-chip level">L${preferred.min_level}</span><span class="commons-chip ${paid(preferred)?"paid":"volunteer"}">${esc(compensationLabel(preferred))}</span></div><h3>${esc(preferred.title)}</h3><p>${esc(preferred.summary)}</p><div class="task-meta"><span><b>${preferred.expected_hours}h</b> expected</span><span><b>${esc(m.impact)}</b> impact</span><span><b>${esc(preferred.claim_mode)}</b> access</span></div><div class="actions"><a class="button primary" href="tasks.html">Open marketplace</a></div></div>`;
  }

  async function initContributorForm(){
    const form=profileForm();if(!form)return;
    form.addEventListener("submit",async e=>{
      e.preventDefault();
      if(!snapshot.authenticated){location.href="account.html";return;}
      const fd=new FormData(form);
      try{
        const result=await api("/api/profile",{method:"PATCH",body:{
          availability_hours:Number(fd.get("availability_hours")),track:fd.get("track"),
          compensation_preference:fd.get("compensation_preference"),profile_note:fd.get("profile_note")
        }});
        snapshot.user=result.user;
        const msg=$("#profileSaved");if(msg){msg.hidden=false;setTimeout(()=>msg.hidden=true,3000);}
        renderProfile();recommendTask();renderLevelTable();
      }catch(err){alert(err.message);}
    });
  }

  function accessButton(task){
    const req=task.my_request;
    if(req&&["pending","approved"].includes(req.status)){
      const label=req.status==="pending"?"Application pending · does not reserve":"Active work record";
      return `<a class="button secondary" href="${esc(accountTaskHref(task,task.eligibility,false))}">${label}</a>`;
    }
    const e=task.eligibility||{};
    if(e.can_start)return `<button class="button primary" type="button" data-start-task="${esc(task.id)}">Start now · non-exclusive</button>`;
    if(e.can_request)return `<button class="button primary" type="button" data-apply-task="${esc(task.id)}">Apply for PCS approval</button>`;
    if(e.state==="login_required")return `<a class="button primary" href="${esc(accountTaskHref(task,e,true))}">Sign in, then return to this task</a>`;
    return `<a class="button secondary" href="${esc(accountTaskHref(task,e,true))}">See what unlocks this task</a>`;
  }

  function taskCard(task){
    const m=taskMeta(task), e=task.eligibility||{};
    const paidClass=paid(task)?"paid":"volunteer";
    const accessLabel=task.claim_mode==="open"?"OPEN · NON-EXCLUSIVE":task.claim_mode==="approval"?"FOUNDER APPROVAL":"HIGH-TRUST ASSIGNMENT";
    return `<article class="commons-task-card" data-task-id="${esc(task.id)}" data-level="${task.min_level}" data-comp="${paid(task)?"paid":"volunteer"}" data-skill="${esc(task.required_skill||"nontechnical")}" data-hours="${task.expected_hours}">
      <div class="task-card-top"><div><span class="commons-chip level">L${task.min_level}</span><span class="commons-chip ${paidClass}">${esc(compensationLabel(task))}</span><span class="commons-chip ${task.claim_mode==="open"?"volunteer":"planned"}">${accessLabel}</span>${task.calibrates_skill?`<span class="commons-chip level">SYNTHETIC ${esc(task.calibrates_skill)} CALIBRATION</span>`:""}</div><code>${esc(task.id)}</code></div>
      <h3>${esc(task.title)}</h3><p>${esc(task.summary)}</p>
      <div class="task-meta"><span><b>${task.expected_hours}h</b> expected</span><span><b>${esc(m.difficulty)}</b> difficulty</span><span><b>${esc(task.required_skill||"entry")}</b> skill gate</span><span><b>${esc(m.impact)}</b> impact</span></div>
      <div class="task-access-state ${e.can_start||e.can_request?"allowed":"locked"}"><strong>${esc(e.reason||"")}</strong>${task.calibrates_skill?"<span>This is a short, synthetic qualification fixture—not unpaid production work. Passing may verify the named skill; it never self-promotes you to L4/L5.</span>":task.claim_mode!=="open"?"<span>Pending applications never reserve the task. If approved, the first progress checkpoint is due within 24 hours.</span>":""}</div>
      <details class="task-details"><summary>What counts as done?</summary><p><strong>Deliverable:</strong> ${esc(m.deliverable)}</p><p><strong>Verification:</strong> ${esc(m.verification)}</p><p><strong>Project:</strong> ${esc(m.project)}</p></details>
      <div class="task-actions">${accessButton(task)}<a class="button secondary" href="projects.html?task=${encodeURIComponent(task.id)}">See impact path</a></div>
    </article>`;
  }

  function filterAndRenderTasks(){
    const target=$("#commonsTaskList");if(!target)return;
    const level=Number($("#taskLevel")?.value??6),comp=$("#taskComp")?.value||"all",skill=$("#taskSkill")?.value||"all",hours=Number($("#taskHours")?.value||99);
    const shown=snapshot.tasks.filter(t=>Number(t.min_level)<=level&&(comp==="all"||(comp==="paid"?paid(t):!paid(t)))&&(skill==="all"||(t.required_skill||"nontechnical")===skill)&&Number(t.expected_hours)<=hours);
    target.innerHTML=shown.map(taskCard).join("")||'<div class="commons-empty"><strong>No tasks match those filters.</strong><span>Adjust level, time, compensation, or track.</span></div>';
    const count=$("#taskCount");if(count)count.textContent=`${shown.length} task${shown.length===1?"":"s"} shown`;
    $$("[data-start-task]",target).forEach(btn=>btn.addEventListener("click",()=>startTask(btn.dataset.startTask)));
    $$("[data-apply-task]",target).forEach(btn=>btn.addEventListener("click",()=>openApplication(btn.dataset.applyTask)));
  }

  async function startTask(id){
    try{
      const result=await api(`/api/tasks/${encodeURIComponent(id)}/request`,{method:"POST",body:{application_note:"Starting an eligible open non-exclusive task.",ai_use_plan:"AI use, if any, will be disclosed at submission.",verification_plan:"I will follow the task acceptance criteria and record enough evidence for independent review."}});
      alert(result.message);await refresh();
    }catch(err){alert(err.message);}
  }

  function openApplication(id){
    const dialog=$("#taskApplicationDialog"),form=$("#taskApplicationForm");if(!dialog||!form)return;
    const task=snapshot.tasks.find(t=>t.id===id);
    form.reset();form.elements.task_id.value=id;$("#taskApplicationTitle").textContent=`Apply for ${id} — ${task?.title||"task"}`;$("#taskApplicationMessage").textContent="";dialog.showModal();
  }

  function initApplicationDialog(){
    const dialog=$("#taskApplicationDialog"),form=$("#taskApplicationForm");if(!dialog||!form)return;
    $("#closeTaskApplication")?.addEventListener("click",()=>dialog.close());
    form.addEventListener("submit",async e=>{
      e.preventDefault();const fd=new FormData(form),id=fd.get("task_id");const msg=$("#taskApplicationMessage");
      try{
        const result=await api(`/api/tasks/${encodeURIComponent(id)}/request`,{method:"POST",body:{application_note:fd.get("application_note"),ai_use_plan:fd.get("ai_use_plan"),verification_plan:fd.get("verification_plan")}});
        msg.textContent=result.message+" Decision deadline: "+fmt(result.decision_due_at);msg.className="form-message successline";
        setTimeout(()=>{dialog.close();refresh();},1400);
      }catch(err){msg.textContent=err.message;msg.className="form-message validation bad";}
    });
  }

  function renderTaskAccountBanner(){
    const banner=$("#taskAccountBanner");if(!banner)return;
    if(!snapshot.authenticated){banner.innerHTML='<strong>Account required:</strong><span>Create an account to contribute. You start at L0 and can immediately start open, non-exclusive tasks. Nobody can self-select L4/L5.</span>';return;}
    const u=snapshot.user;
    banner.innerHTML=`<strong>Signed in: L${u.level} · ${esc(u.display_name)}</strong><span>${u.email_verified?"Email verified.":"Email not verified yet."} Higher-trust work also checks the exact verified skill and founder approval.</span>`;
  }

  function renderImpact(){
    const target=$("#personalImpact");if(!target)return;
    if(!snapshot.authenticated){target.innerHTML='<p class="muted">Sign in to see your actual task applications and work records.</p>';return;}
    const reqs=snapshot.requests||[];
    if(!reqs.length){target.innerHTML='<p class="muted">No work records yet. Start an open L0 task from the marketplace.</p>';return;}
    target.innerHTML=reqs.map(r=>`<div class="impact-request"><code>${esc(r.task_id)}</code><div><strong>${esc(r.title)}</strong><span>${esc(r.status)} · requested ${fmt(r.requested_at)}</span></div><b>${esc(r.status).toUpperCase()}</b></div>`).join("");
  }

  function handleTaskIntent(){
    const intent=requestedTaskIntent();
    if(!intent)return;
    const task=snapshot.tasks.find(t=>t.id===intent.task);
    const card=[...document.querySelectorAll("[data-task-id]")].find(el=>el.dataset.taskId===intent.task);
    if(card){
      card.classList.add("task-focus");
      card.scrollIntoView({behavior:"smooth",block:"center"});
    }
    if(taskIntentHandled||!intent.apply||!task)return;
    taskIntentHandled=true;
    const url=new URL(location.href);
    url.searchParams.delete("apply");
    history.replaceState({},document.title,url.pathname+url.search+url.hash);
    if(task.my_request&&["pending","approved"].includes(task.my_request.status))return;
    if(task.eligibility?.can_request){
      setTimeout(()=>openApplication(task.id),250);
      return;
    }
    const banner=$("#taskAccountBanner");
    if(task.eligibility?.can_start){
      if(banner)banner.innerHTML=`<strong>Selected task ${esc(task.id)} is unlocked:</strong><span>Use “Start now · non-exclusive” on the highlighted task card. PCS will not start work automatically after sign-in.</span>`;
      return;
    }
    if(banner){
      const reason=task.eligibility?.reason||"This task is not currently unlocked for your account.";
      banner.innerHTML=`<strong>Selected task ${esc(task.id)}:</strong><span>${esc(reason)} Update the required level/skill on your account, then return here to apply.</span>`;
    }
  }

  async function refresh(){
    const [me,tasks]=await Promise.all([api("/api/me"),api("/api/tasks")]);
    snapshot={...me,tasks:tasks.tasks||[],user:me.user||tasks.user||null,authenticated:Boolean(me.authenticated),requests:me.requests||[],skills:me.skills||[]};
    renderLevelTable();renderProfile();recommendTask();filterAndRenderTasks();renderTaskAccountBanner();renderImpact();handleTaskIntent();
  }

  function initFilters(){
    ["taskLevel","taskComp","taskSkill","taskHours"].forEach(id=>{const el=document.getElementById(id);if(el){el.addEventListener("input",filterAndRenderTasks);el.addEventListener("change",filterAndRenderTasks);}});
  }

  document.addEventListener("DOMContentLoaded",async()=>{
    renderProjectTaskReturn();initFilters();initApplicationDialog();await initContributorForm();
    try{await refresh();}catch(err){
      const target=$("#commonsTaskList");if(target)target.innerHTML=`<div class="commons-empty"><strong>Account service unavailable.</strong><span>${esc(err.message)}</span></div>`;
      renderLevelTable();
    }
  });
})();
