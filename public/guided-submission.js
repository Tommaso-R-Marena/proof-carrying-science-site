(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const api=window.PCSProjectMapper;
  let state=null,busy=false,demoMode=false;

  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  function notify(text,kind="info"){const b=$("guidedMessage");b.hidden=!text;b.className="guided-message "+kind;b.textContent=text||""}
  function setBusy(on,text="Analyzing your project locally…"){busy=on;document.body.classList.toggle("guided-busy",on);document.querySelectorAll(".guided-stage button").forEach(btn=>{if(on){btn.dataset.guidedWasDisabled=btn.disabled?"1":"0";btn.disabled=true}else if("guidedWasDisabled" in btn.dataset){btn.disabled=btn.dataset.guidedWasDisabled==="1";delete btn.dataset.guidedWasDisabled}});if(on)notify(text);else if($("guidedMessage").classList.contains("info"))notify("")}
  function go(step){document.querySelectorAll("[data-guided-stage]").forEach(x=>x.hidden=Number(x.dataset.guidedStage)!==step);document.querySelectorAll("[data-step-indicator]").forEach(x=>{const n=Number(x.dataset.stepIndicator);x.classList.toggle("active",n===step);x.classList.toggle("complete",n<step);if(n===step)x.setAttribute("aria-current","step");else x.removeAttribute("aria-current")});const demo=$("guidedDemoContext");if(demo)demo.hidden=!demoMode;const takeaway=$("guidedDemoTakeaway");if(takeaway)takeaway.hidden=!(demoMode&&step===5);window.scrollTo({top:document.querySelector(".guided-stepper").offsetTop-24,behavior:"smooth"})}
  const claims=()=>state?.draft?.claims||[];
  const rootName=()=>String(state?.report?.project_root_name||state?.draft?.pcs_intake?.project_root_name||state?.subject||"my-project").replace(/[^A-Za-z0-9._-]+/g,"-")||"my-project";
  function outputs(){const out=new Set();for(const w of state?.workflow_inferences||[])if(w.selected)for(const p of w.write_paths||[])out.add(p);for(const x of state?.inventory||[])if(x.role==="tabular-output")out.add(x.path);return[...out]}
  function inputs(){const out=new Set(outputs()),v=new Set();for(const w of state?.workflow_inferences||[])if(w.selected)for(const p of w.read_paths||[])if(!out.has(p))v.add(p);if(!v.size)for(const x of state?.inventory||[])if(!["source-code","tabular-output"].includes(x.role))v.add(x.path);return[...v]}
  function env(){const e=state?.environment_capture;if(!e)return{label:"Not declared",detail:"No recognized dependency or environment declaration was found."};return{label:e.hermeticity||"environment_unspecified",detail:`${e.python?.dependencies?.length||0} Python · ${e.r?.dependencies?.length||0} R dependency record(s) · ${e.containers?.length||0} container spec(s)`}}
  function claimIntentTokens(value){
    return String(value||"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2&&!["the","and","that","with","from","into","make","sure","want","check","verify","data"].includes(x))
  }
  function renderIntentMatch(){
    const query=$("guidedClaimIntent")?.value||"",tokens=claimIntentTokens(query),cards=[...$("guidedClaims").querySelectorAll("[data-claim-card]")];
    cards.forEach(c=>{c.classList.remove("intent-match");const badge=c.querySelector("[data-intent-badge]");if(badge)badge.hidden=true});
    if(!tokens.length){$("guidedIntentHint").textContent="PCS will suggest among the formal templates it actually supports.";return}
    let best=null,bestScore=0;
    for(const card of cards){
      const blob=(card.dataset.search||"").toLowerCase();
      const score=tokens.reduce((n,t)=>n+(blob.includes(t)?1:0),0);
      if(score>bestScore){best=card;bestScore=score}
    }
    if(best&&bestScore>0){
      best.classList.add("intent-match");
      const badge=best.querySelector("[data-intent-badge]");if(badge)badge.hidden=false;
      $("guidedIntentHint").textContent="Closest supported template highlighted below. This is a navigation suggestion only; you still confirm the exact typed predicate.";
    }else{
      $("guidedIntentHint").textContent="No detected supported template clearly matches those words. PCS will not invent a formal meaning from free text.";
    }
  }
  function renderClaims(){
    const recs=state?.recommendations||[];$("guidedNoClaims").hidden=!!recs.length;
    $("guidedClaims").innerHTML=recs.map(r=>{
      const x=r.formal_explanation||api.explainPredicate(r.claim?.predicate||{});
      const fields=(x.fields||[]).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
      const search=[r.detector,r.claim?.statement,x.template,x.summary,x.scope,...(x.fields||[]).flat()].join(" ");
      return `<article class="guided-claim-card ${r.selected?"selected":""}" data-claim-card="${esc(r.id)}" data-search="${esc(search)}">
        <label class="guided-claim-toggle">
          <input type="checkbox" data-rec="${esc(r.id)}" ${r.selected?"checked":""} aria-label="${r.selected?"Remove":"Include"} ${esc(x.template)}">
          <span><strong>${esc(x.template)}</strong><small>Supported PCS predicate · ${Math.round(r.confidence*100)}% discovery confidence</small></span>
          <span class="chip ${r.selected?"verified":"open"}">${r.selected?"Included":"Not included"}</span>
        </label>
        <div class="guided-formal-meaning">
          <span class="guided-meaning-label">What this means</span>
          <p class="guided-human-summary">${esc(x.summary||r.claim?.statement||"")}</p>
          <span class="chip pending guided-intent-badge" data-intent-badge hidden>Closest supported match</span>
          <div class="guided-check-box">
            <strong>What PCS will actually check</strong>
            <dl>${fields}</dl>
          </div>
          <div class="guided-scope-box"><strong>What this does not establish</strong><span>${esc(x.scope||"")}</span></div>
          <details class="guided-predicate-details">
            <summary>Show exact machine predicate</summary>
            <pre>${esc(JSON.stringify(r.claim?.predicate||{},null,2))}</pre>
          </details>
        </div>
        <p class="guided-detection-reason"><strong>Why PCS proposed it:</strong> ${esc(r.reason||"")}</p>
      </article>`;
    }).join("");
    $("guidedClaims").querySelectorAll("[data-rec]").forEach(x=>x.onchange=async e=>{setBusy(true,"Updating the draft…");try{state=await api.setRecommendationSelected(e.target.dataset.rec,e.target.checked);renderClaims()}catch(err){notify(err.message||String(err),"error")}finally{setBusy(false)}});
    $("guidedToReview").disabled=!claims().length;
    renderIntentMatch()
  }
  function reviewCard(title,value,detail,warn=false){return`<article class="guided-review-card ${warn?"warn":"good"}"><span class="guided-review-status">${warn?"!":"✓"}</span><div><small>${esc(title)}</small><strong>${esc(value)}</strong><p>${esc(detail)}</p></div></article>`}
  function renderReview(){const e=env(),u=(state?.workflow_unresolved?.length||0)+(state?.environment_capture?.unresolved?.length||0),sk=state?.skipped?.length||0;const src=(state?.inventory||[]).filter(x=>x.role==="source-code").length;$("guidedReviewCards").innerHTML=[reviewCard("Files",`${state?.inventory?.length||0} inventoried`,`${inputs().length} likely input(s) · ${outputs().length} likely output(s) · ${src} source file(s)`),reviewCard("Claims",`${claims().length} selected`,claims().map(c=>c.statement).join(" · ")||"No selected claims",!claims().length),reviewCard("Workflow",`${state?.draft?.workflow?.nodes?.length||0} step(s)`,u?`${u} item(s) still need review`:"No unresolved browser workflow/environment items",!!u),reviewCard("Environment",e.label,e.detail,e.label==="Not declared"),reviewCard("Safety",`${sk} excluded file(s)`,sk?"Review exclusions in Advanced Mapper.":"No browser safety exclusions.",!!sk)].join("");$("guidedManifestPreview").textContent=JSON.stringify(state?.draft||{},null,2);$("guidedEnvironmentPreview").textContent=JSON.stringify(state?.environment_capture||{status:"No environment declaration detected."},null,2)}
  function renderFinal(){const e=env(),u=(state?.workflow_unresolved?.length||0)+(state?.environment_capture?.unresolved?.length||0);$("guidedFinalChecks").innerHTML=[["Project",state?.subject||"scientific-project","Name written into the draft."],["Claims",String(claims().length),claims().map(c=>c.statement).join(" · ")],["Artifacts",String(state?.draft?.artifacts?.length||0),"Exact browser SHA-256 snapshots selected into the draft."],["Environment",e.label,e.detail],["Items to review",String(u),u?"The CLI should resolve these before signing.":"No unresolved browser items."]].map(([a,b,c])=>`<div><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`).join("")}
  function renderResult(){const root=rootName(),manifest=`./${root}/manifest.json`,confirm=`pcs confirm-v06 ~/Downloads/pcs-manifest.draft.json --project-root ./${root} -o ${manifest}`,attest=`pcs attest-v06 ${manifest} -o ${root}.pcs.zip --private-key organization-private.pem --public-key organization-public.pem`;$("guidedConfirmCommand").textContent=confirm;$("guidedAttestCommand").textContent=attest;$("guidedCopyConfirm").dataset.value=confirm;$("guidedCopyAttest").dataset.value=attest}
  async function load(files){demoMode=false;const list=[...(files||[])];if(!list.length)return;if(list.some(f=>/\.zip$/i.test(f.name))){notify("The browser flow does not unpack ZIP archives. Choose the unzipped folder or use the PCS CLI locally.","error");return}setBusy(true,"Hashing and mapping your project locally…");try{state=await api.loadFiles(list);$("guidedSubject").value=state.subject;renderClaims();notify(`PCS inventoried ${state.inventory.length} file(s) and proposed ${state.recommendations.length} scientific check(s).`,"success");go(2)}catch(err){notify(err.message||String(err),"error")}finally{setBusy(false)}}
  async function example(){demoMode=true;setBusy(true,"Loading the synthetic example…");try{state=await api.loadExample();$("guidedSubject").value=state.subject;$("guidedClaimIntent").value="Check that the PK/PD model is well-formed and the prediction output exactly reproduces the declared equations within tolerance";renderClaims();notify("Demo mode: PCS found a supported PK/PD claim structure. Follow the highlighted chain from intent to exact predicate.","success");go(2)}catch(err){demoMode=false;notify(err.message||String(err),"error")}finally{setBusy(false)}}
  async function copy(btn){const t=btn.textContent;try{await navigator.clipboard.writeText(btn.dataset.value||"");btn.textContent="Copied"}catch{btn.textContent="Select + copy"}setTimeout(()=>btn.textContent=t,1300)}
  if(!api){notify("The local PCS discovery engine could not be initialized. Refresh the page or open Advanced Mapper.","error");return}
  $("guidedClaimIntent").addEventListener("input",renderIntentMatch);
  $("guidedChooseFolder").onclick=()=>$("guidedFolderFiles").click();$("guidedChooseFiles").onclick=()=>$("guidedLooseFiles").click();$("guidedLoadExample").onclick=example;$("guidedFolderFiles").onchange=e=>load(e.target.files);$("guidedLooseFiles").onchange=e=>load(e.target.files);
  const d=$("guidedDropzone");["dragenter","dragover"].forEach(t=>d.addEventListener(t,e=>{e.preventDefault();d.classList.add("dragging")}));["dragleave","drop"].forEach(t=>d.addEventListener(t,e=>{e.preventDefault();d.classList.remove("dragging")}));d.ondrop=e=>load(e.dataTransfer.files);d.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("guidedLooseFiles").click()}};
  $("guidedSubject").onchange=async e=>{if(!state)return;setBusy(true,"Updating project name…");try{state=await api.setSubject(e.target.value);e.target.value=state.subject}catch(err){notify(err.message||String(err),"error")}finally{setBusy(false)}};
  $("guidedToReview").onclick=()=>{if(!claims().length){notify("Select at least one claim to continue.","error");return}renderReview();notify(demoMode?"Demo checkpoint: this page shows what PCS is preparing to verify. No PASS has been issued yet.":"");go(3)};$("guidedToPrepare").onclick=()=>{renderFinal();$("guidedConfirmReview").checked=false;notify("");go(4)};$("guidedPrepare").onclick=()=>{if(!$("guidedConfirmReview").checked){notify("Confirm that you reviewed what PCS found before preparing the handoff.","error");return}renderResult();notify(demoMode?"Demo checkpoint: the browser draft is ready, but the scientific claim is still not verified. The cards below explain what the later verifier statuses mean.":"");go(5)};
  document.querySelectorAll("[data-guided-back]").forEach(b=>b.onclick=()=>{notify("");go(Number(b.dataset.guidedBack))});$("guidedDownloadDraft").onclick=()=>api.downloadDraft();$("guidedDownloadReview").onclick=()=>api.downloadReview();$("guidedCopyConfirm").onclick=()=>copy($("guidedCopyConfirm"));$("guidedCopyAttest").onclick=()=>copy($("guidedCopyAttest"));$("guidedStartOver").onclick=()=>window.location.reload();
  if(new URLSearchParams(window.location.search).get("demo")==="1")setTimeout(example,0);
})();
