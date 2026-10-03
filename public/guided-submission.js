(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const api=window.PCSProjectMapper;
  let state=null,busy=false,demoMode=false;

  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  function notify(text,kind="info"){const b=$("guidedMessage");b.hidden=!text;b.className="guided-message "+kind;b.textContent=text||""}
  function setBusy(on,text="Analyzing your project locally…"){busy=on;document.body.classList.toggle("guided-busy",on);document.querySelectorAll(".guided-stage button").forEach(btn=>{if(on){btn.dataset.guidedWasDisabled=btn.disabled?"1":"0";btn.disabled=true}else if("guidedWasDisabled" in btn.dataset){btn.disabled=btn.dataset.guidedWasDisabled==="1";delete btn.dataset.guidedWasDisabled}});if(on)notify(text);else if($("guidedMessage").classList.contains("info"))notify("")}
  const GUIDE={
    1:["1. Choose the project you want PCS to inspect","PCS is only discovering files here. Nothing has been verified, executed, signed, or accepted.","DISCOVERY","Question: what should PCS inspect?"],
    2:["2. Confirm the exact claim PCS is allowed to evaluate","Your words are navigation help only. The typed predicate below is the authoritative scientific meaning.","CLAIM CONTRACT","Question: is this exactly what you mean?"],
    3:["3. Inspect the draft before any attestation","Review the bound files, typed claim, inferred workflow, and environment. This page is still not a PASS.","HUMAN REVIEW","Question: did PCS bind the right things?"],
    4:["4. Approve the handoff to the authoritative verifier","The CLI will re-hash the original project and refuse stale bytes before it can sign anything.","CONFIRMATION","Question: should this exact draft be frozen?"],
    5:["5. Run independent verification","A prepared draft is not a scientific verdict. The signed bundle must still be replayed by the verifier/reviewer.","READY TO VERIFY","Question: what did independent replay establish?"]
  };
  const DEMO_ACTIONS={
    2:["Claim looks right · review evidence →","Next: inspect what PCS bound to this typed claim."],
    3:["Evidence looks right · prepare handoff →","Next: review the draft boundary before any signing."],
    4:["I reviewed this demo draft →","This prepares a browser draft only; it does not issue a scientific verdict."],
    5:["See a completed reviewer result →","Next: switch to the reviewer view and see how validity, support, and policy differ."]
  };
  function renderGuide(step){
    const g=GUIDE[step]||GUIDE[1];
    if($("guidedDemoGuideTitle"))$("guidedDemoGuideTitle").textContent=g[0];
    if($("guidedDemoGuideDetail"))$("guidedDemoGuideDetail").textContent=g[1];
    if($("guidedDemoGuideState"))$("guidedDemoGuideState").textContent=g[2];
    if($("guidedDemoGuideQuestion"))$("guidedDemoGuideQuestion").textContent=g[3];
    const action=$("guidedDemoGuideAction"),next=$("guidedDemoNext"),hint=$("guidedDemoNextHint"),a=DEMO_ACTIONS[step];
    if(action)action.hidden=!(demoMode&&a);
    if(next&&a)next.textContent=a[0];
    if(hint&&a)hint.textContent=a[1];
  }
  function go(step){document.querySelectorAll("[data-guided-stage]").forEach(x=>x.hidden=Number(x.dataset.guidedStage)!==step);document.querySelectorAll("[data-step-indicator]").forEach(x=>{const n=Number(x.dataset.stepIndicator);x.classList.toggle("active",n===step);x.classList.toggle("complete",n<step);if(n===step)x.setAttribute("aria-current","step");else x.removeAttribute("aria-current")});renderGuide(step);const demo=$("guidedDemoContext");if(demo)demo.hidden=!demoMode;const takeaway=$("guidedDemoTakeaway");if(takeaway)takeaway.hidden=!(demoMode&&step===5);window.scrollTo({top:document.querySelector(".guided-stepper").offsetTop-24,behavior:"smooth"})}
  const claims=()=>state?.draft?.claims||[];
  const rootName=()=>String(state?.report?.project_root_name||state?.draft?.pcs_intake?.project_root_name||state?.subject||"my-project").replace(/[^A-Za-z0-9._-]+/g,"-")||"my-project";
  function outputs(){const out=new Set();for(const w of state?.workflow_inferences||[])if(w.selected)for(const p of w.write_paths||[])out.add(p);for(const x of state?.inventory||[])if(x.role==="tabular-output")out.add(x.path);return[...out]}
  function inputs(){const out=new Set(outputs()),v=new Set();for(const w of state?.workflow_inferences||[])if(w.selected)for(const p of w.read_paths||[])if(!out.has(p))v.add(p);if(!v.size)for(const x of state?.inventory||[])if(!["source-code","tabular-output"].includes(x.role))v.add(x.path);return[...v]}
  function env(){const e=state?.environment_capture;if(!e)return{label:"Not declared",detail:"No recognized dependency or environment declaration was found."};return{label:e.hermeticity||"environment_unspecified",detail:`${e.python?.dependencies?.length||0} Python · ${e.r?.dependencies?.length||0} R dependency record(s) · ${e.containers?.length||0} container spec(s)`}}
  function renderDiscoveryBrief(){
    if(!$("guidedDiscoveryBrief")||!state)return;
    const inventory=state.inventory||[],recs=state.recommendations||[],flows=state.workflow_inferences||[];
    const sourceCount=inventory.filter(x=>x.role==="source-code").length;
    const likelyInputs=inputs().length,likelyOutputs=outputs().length;
    const environment=env();
    const unresolved=(state.workflow_unresolved?.length||0)+(state.environment_capture?.unresolved?.length||0);
    const skipped=state.skipped?.length||0;
    const selected=recs.filter(r=>r.selected).length;
    const roleBits=[];
    if(sourceCount)roleBits.push(`${sourceCount} source`);
    if(likelyInputs)roleBits.push(`${likelyInputs} likely input${likelyInputs===1?"":"s"}`);
    if(likelyOutputs)roleBits.push(`${likelyOutputs} likely output${likelyOutputs===1?"":"s"}`);
    $("guidedDiscoveryFound").textContent=`${inventory.length} file${inventory.length===1?"":"s"} inventoried locally`;
    $("guidedDiscoveryFoundDetail").textContent=roleBits.length?roleBits.join(" · "):"PCS hashed the selected files, but did not confidently classify code/input/output roles.";
    if(recs.length){
      $("guidedDiscoveryProposed").textContent=`${recs.length} supported check${recs.length===1?"":"s"} proposed`;
      $("guidedDiscoveryProposedDetail").textContent=`${flows.length} static workflow inference${flows.length===1?"":"s"} · environment: ${environment.label}`;
    }else{
      $("guidedDiscoveryProposed").textContent="0 supported scientific checks proposed";
      $("guidedDiscoveryProposedDetail").textContent=`PCS will not invent semantics. ${flows.length} static workflow inference${flows.length===1?"":"s"} found · environment: ${environment.label}`;
    }
    const reviewBits=[];
    reviewBits.push(selected?`${selected} proposed claim${selected===1?" is":"s are"} currently included`:"no scientific claim is currently selected");
    if(unresolved)reviewBits.push(`${unresolved} unresolved workflow/environment item${unresolved===1?"":"s"}`);
    if(skipped)reviewBits.push(`${skipped} file${skipped===1?" was":"s were"} excluded during browser discovery`);
    $("guidedDiscoveryConfirm").textContent=recs.length?"Confirm the exact scientific meaning":"Define a supported meaning before continuing";
    $("guidedDiscoveryConfirmDetail").textContent=reviewBits.join(" · ")+ ".";
    $("guidedDiscoveryNext").textContent=recs.length
      ?"Next: describe the scientific check you care about, then confirm one exact supported predicate below."
      :"Next: PCS did not detect a supported formal claim. Review the available templates below or use Advanced Mapper/CLI rather than treating free-form prose as verified.";
    $("guidedDiscoveryBrief").classList.toggle("needs-attention",!recs.length||!!unresolved||!!skipped);
  }
  function claimIntentTokens(value){
    return String(value||"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2&&!["the","and","that","with","from","into","make","sure","want","check","verify","data"].includes(x))
  }
  function renderIntentMatch(){
    const query=$("guidedClaimIntent")?.value||"",tokens=claimIntentTokens(query),cards=[...$("guidedClaims").querySelectorAll("[data-claim-card]")];
    cards.forEach(c=>{c.classList.remove("intent-match");const badge=c.querySelector("[data-intent-badge]");if(badge)badge.hidden=true});
    if($("guidedClaimWords"))$("guidedClaimWords").textContent=query.trim()||"Describe the scientific check above.";
    if(!tokens.length){
      $("guidedIntentHint").textContent="PCS will suggest among the formal templates it actually supports.";
      if($("guidedClaimTranslationState"))$("guidedClaimTranslationState").textContent="WAITING FOR INTENT";
      if($("guidedClaimMeaning"))$("guidedClaimMeaning").textContent="No formal meaning selected yet.";
      if($("guidedClaimMeaningScope"))$("guidedClaimMeaningScope").textContent="PCS will not infer unsupported semantics.";
      if($("guidedClaimExact"))$("guidedClaimExact").textContent="No typed predicate yet.";
      return
    }
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
      const rec=(state?.recommendations||[]).find(r=>String(r.id)===String(best.dataset.claimCard));
      const x=rec?.formal_explanation||api.explainPredicate(rec?.claim?.predicate||{});
      if($("guidedClaimTranslationState"))$("guidedClaimTranslationState").textContent="SUPPORTED TEMPLATE FOUND";
      if($("guidedClaimMeaning"))$("guidedClaimMeaning").textContent=x.template||"Supported PCS predicate";
      if($("guidedClaimMeaningScope"))$("guidedClaimMeaningScope").textContent=x.summary||rec?.claim?.statement||"";
      if($("guidedClaimExact"))$("guidedClaimExact").textContent=JSON.stringify(rec?.claim?.predicate||{});
    }else{
      $("guidedIntentHint").textContent="No detected supported template clearly matches those words. PCS will not invent a formal meaning from free text.";
      if($("guidedClaimTranslationState"))$("guidedClaimTranslationState").textContent="NOT YET FORMALIZED";
      if($("guidedClaimMeaning"))$("guidedClaimMeaning").textContent="PCS has no supported typed meaning for this wording.";
      if($("guidedClaimMeaningScope"))$("guidedClaimMeaningScope").textContent="Rephrase toward a supported template or define the claim explicitly in Advanced Mapper/CLI.";
      if($("guidedClaimExact"))$("guidedClaimExact").textContent="No predicate generated — fail closed.";
    }
  }
  function renderClaims(){
    const recs=state?.recommendations||[];$("guidedNoClaims").hidden=!!recs.length;
    $("guidedClaims").innerHTML=recs.map(r=>{
      const x=r.formal_explanation||api.explainPredicate(r.claim?.predicate||{});
      const fieldRows=x.fields||[];
      const fields=fieldRows.length
        ?fieldRows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")
        :'<div><dt>Predicate</dt><dd>See exact machine predicate below.</dd></div>';
      const search=[r.detector,r.claim?.statement,x.template,x.summary,x.scope,...fieldRows.flat()].join(" ");
      return `<article class="guided-claim-card guided-claim-workbench ${r.selected?"selected":""}" data-claim-card="${esc(r.id)}" data-search="${esc(search)}">
        <header class="guided-claim-workbench-head">
          <div>
            <span class="guided-claim-template-label">Supported PCS template</span>
            <h3>${esc(x.template||"Supported PCS predicate")}</h3>
            <p>Proposed because PCS matched this project to a known checker pattern.</p>
          </div>
          <label class="guided-claim-approval">
            <input type="checkbox" data-rec="${esc(r.id)}" ${r.selected?"checked":""} aria-label="${r.selected?"Remove":"Include"} exact claim: ${esc(x.template)}">
            <span><strong>${r.selected?"Included in draft":"Use this exact claim"}</strong><small>${r.selected?"Uncheck to remove it.":"Include only if all three columns below match your intent."}</small></span>
          </label>
        </header>
        <div class="guided-claim-comparison">
          <section class="meaning">
            <span>1 · Proposed meaning</span>
            <strong>${esc(x.summary||r.claim?.statement||"No plain-language summary available.")}</strong>
            <small>This is PCS's human-readable explanation of the supported template.</small>
            <span class="chip pending guided-intent-badge" data-intent-badge hidden>Closest supported match</span>
          </section>
          <section class="literal">
            <span>2 · Literal verifier fields</span>
            <dl>${fields}</dl>
            <small>These typed values—not the surrounding prose—define what verification later evaluates.</small>
          </section>
          <section class="boundary">
            <span>3 · Outside this claim</span>
            <strong>${esc(x.scope||"No broader scientific meaning is implied beyond the typed predicate.")}</strong>
            <small>Do not treat successful verification as evidence for claims outside this boundary.</small>
          </section>
        </div>
        <div class="guided-claim-workbench-foot">
          <p><strong>Why PCS proposed it:</strong> ${esc(r.reason||"No discovery rationale available.")}</p>
          <span class="guided-confidence-note"><b>${Math.round(r.confidence*100)}% discovery match</b> · template-matching signal only, not scientific confidence</span>
          <details class="guided-predicate-details">
            <summary>Show exact machine predicate</summary>
            <pre>${esc(JSON.stringify(r.claim?.predicate||{},null,2))}</pre>
          </details>
        </div>
      </article>`;
    }).join("");
    $("guidedClaims").querySelectorAll("[data-rec]").forEach(x=>x.onchange=async e=>{setBusy(true,"Updating the draft…");try{state=await api.setRecommendationSelected(e.target.dataset.rec,e.target.checked);renderClaims()}catch(err){notify(err.message||String(err),"error")}finally{setBusy(false)}});
    $("guidedToReview").disabled=!claims().length;
    renderDiscoveryBrief();
    renderIntentMatch()
  }
  function reviewCard(title,value,detail,warn=false){return`<article class="guided-review-card ${warn?"warn":"good"}"><span class="guided-review-status">${warn?"!":"✓"}</span><div><small>${esc(title)}</small><strong>${esc(value)}</strong><p>${esc(detail)}</p></div></article>`}
  function selectedRecommendations(){return(state?.recommendations||[]).filter(r=>r.selected)}
  function renderReviewGate(){
    const e=env();
    const workflowUnresolved=state?.workflow_unresolved?.length||0;
    const environmentUnresolved=state?.environment_capture?.unresolved?.length||0;
    const unresolved=workflowUnresolved+environmentUnresolved;
    const skipped=state?.skipped?.length||0;
    const selected=selectedRecommendations();
    const artifacts=state?.draft?.artifacts?.length||0;
    const items=[];
    items.push({
      tone:selected.length?"pass":"stop",
      title:"Exact scientific claim",
      value:selected.length?`${selected.length} claim${selected.length===1?"":"s"} selected`:"No selected claim",
      detail:selected.length?"Each selected claim has a typed predicate; confirm its meaning and scope below.":"Select at least one supported typed claim before continuing."
    });
    items.push({
      tone:artifacts?"pass":"stop",
      title:"Artifact binding",
      value:artifacts?`${artifacts} artifact${artifacts===1?"":"s"} bound`:"No bound artifacts",
      detail:artifacts?"The draft contains exact browser SHA-256 snapshots for the selected artifacts.":"There is no artifact set to carry into the draft."
    });
    items.push({
      tone:unresolved?"warn":"pass",
      title:"Workflow + environment",
      value:unresolved?`${unresolved} unresolved item${unresolved===1?"":"s"}`:"No unresolved browser items",
      detail:unresolved?`${workflowUnresolved} workflow · ${environmentUnresolved} environment item(s) still require review or authoritative CLI resolution.`:"Browser discovery found no unresolved workflow/environment items."
    });
    items.push({
      tone:e.label==="Not declared"?"warn":"pass",
      title:"Reproducibility environment",
      value:e.label,
      detail:e.label==="Not declared"?"No recognized environment declaration was found. That may limit reproducibility and should be reviewed before signing.":e.detail
    });
    items.push({
      tone:skipped?"warn":"pass",
      title:"Excluded files",
      value:skipped?`${skipped} excluded`:"None reported",
      detail:skipped?"Review exclusions in Advanced Mapper and confirm none are required by the claim or workflow.":"No browser safety exclusions were reported."
    });
    const hard=items.some(x=>x.tone==="stop");
    const warnings=items.filter(x=>x.tone==="warn").length;
    const gate=$("guidedReviewGate");
    gate.classList.toggle("blocked",hard);
    gate.classList.toggle("attention",!hard&&warnings>0);
    gate.classList.toggle("ready",!hard&&!warnings);
    $("guidedReviewGateBadge").textContent=hard?"CANNOT PREPARE":warnings?"ATTENTION REQUIRED":"READY FOR HANDOFF REVIEW";
    $("guidedReviewGateTitle").textContent=hard
      ?"This browser draft is missing something required to prepare a meaningful handoff."
      :warnings
        ?"You can continue, but these discovery caveats should be resolved or explicitly reviewed before signing."
        :"The browser draft has no flagged discovery caveats.";
    $("guidedReviewGateDetail").textContent=hard
      ?"Return to the claim/project steps and fix the red items below."
      :warnings
        ?"Yellow items are not verifier failures. The authoritative CLI may resolve them, but do not overlook them."
        :"This is still only a discovery review; no scientific PASS has been issued.";
    $("guidedReviewGateItems").innerHTML=items.map(x=>`<article class="${x.tone}"><span>${x.tone==="pass"?"✓":x.tone==="warn"?"!":"×"}</span><div><small>${esc(x.title)}</small><strong>${esc(x.value)}</strong><p>${esc(x.detail)}</p></div></article>`).join("");
    $("guidedToPrepare").disabled=hard;
    $("guidedToPrepare").textContent=hard
      ?"Resolve required items first"
      :warnings
        ?`Continue with ${warnings} caveat${warnings===1?"":"s"} →`
        :"Continue to handoff review →";
    $("guidedScopeReviewList").innerHTML=selected.length
      ?selected.map(r=>{const x=r.formal_explanation||api.explainPredicate(r.claim?.predicate||{});return`<article><strong>${esc(x.template||r.claim?.statement||"Selected claim")}</strong><span>${esc(x.scope||"No broader scientific meaning is implied beyond the typed predicate.")}</span></article>`}).join("")
      :'<article class="empty"><strong>No selected claim</strong><span>Select a supported claim before reviewing scope boundaries.</span></article>';
  }
  function renderReview(){const e=env(),u=(state?.workflow_unresolved?.length||0)+(state?.environment_capture?.unresolved?.length||0),sk=state?.skipped?.length||0;const src=(state?.inventory||[]).filter(x=>x.role==="source-code").length;renderReviewGate();$("guidedReviewCards").innerHTML=[reviewCard("Files",`${state?.inventory?.length||0} inventoried`,`${inputs().length} likely input(s) · ${outputs().length} likely output(s) · ${src} source file(s)`),reviewCard("Claims",`${claims().length} selected`,claims().map(c=>c.statement).join(" · ")||"No selected claims",!claims().length),reviewCard("Workflow",`${state?.draft?.workflow?.nodes?.length||0} step(s)`,u?`${u} item(s) still need review`:"No unresolved browser workflow/environment items",!!u),reviewCard("Environment",e.label,e.detail,e.label==="Not declared"),reviewCard("Safety",`${sk} excluded file(s)`,sk?"Review exclusions in Advanced Mapper.":"No browser safety exclusions.",!!sk)].join("");$("guidedManifestPreview").textContent=JSON.stringify(state?.draft||{},null,2);$("guidedEnvironmentPreview").textContent=JSON.stringify(state?.environment_capture||{status:"No environment declaration detected."},null,2)}
  function renderFinal(){const e=env(),u=(state?.workflow_unresolved?.length||0)+(state?.environment_capture?.unresolved?.length||0);$("guidedFinalChecks").innerHTML=[["Project",state?.subject||"scientific-project","Name written into the draft."],["Claims",String(claims().length),claims().map(c=>c.statement).join(" · ")],["Artifacts",String(state?.draft?.artifacts?.length||0),"Exact browser SHA-256 snapshots selected into the draft."],["Environment",e.label,e.detail],["Items to review",String(u),u?"The CLI should resolve these before signing.":"No unresolved browser items."]].map(([a,b,c])=>`<div><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div>`).join("")}
  function renderResult(){const root=rootName(),manifest=`./${root}/manifest.json`,confirm=`pcs confirm-v06 ~/Downloads/pcs-manifest.draft.json --project-root ./${root} -o ${manifest}`,attest=`pcs attest-v06 ${manifest} -o ${root}.pcs.zip --private-key organization-private.pem --public-key organization-public.pem`;$("guidedConfirmCommand").textContent=confirm;$("guidedAttestCommand").textContent=attest;$("guidedCopyConfirm").dataset.value=confirm;$("guidedCopyAttest").dataset.value=attest}
  async function load(files){demoMode=false;const list=[...(files||[])];if(!list.length)return;if(list.some(f=>/\.zip$/i.test(f.name))){notify("The browser flow does not unpack ZIP archives. Choose the unzipped folder or use the PCS CLI locally.","error");return}setBusy(true,"Hashing and mapping your project locally…");try{state=await api.loadFiles(list);$("guidedSubject").value=state.subject;renderClaims();notify(`PCS inventoried ${state.inventory.length} file(s) and proposed ${state.recommendations.length} scientific check(s).`,"success");go(2)}catch(err){notify(err.message||String(err),"error")}finally{setBusy(false)}}
  async function example(){demoMode=true;setBusy(true,"Loading the synthetic example…");try{state=await api.loadExample();$("guidedSubject").value=state.subject;$("guidedClaimIntent").value="Check that the PK/PD model is well-formed and the prediction output exactly reproduces the declared equations within tolerance";renderClaims();notify("Demo mode: PCS found a supported PK/PD claim structure. Follow the highlighted chain from intent to exact predicate.","success");go(2)}catch(err){demoMode=false;notify(err.message||String(err),"error")}finally{setBusy(false)}}
  async function copy(btn){const t=btn.textContent;try{await navigator.clipboard.writeText(btn.dataset.value||"");btn.textContent="Copied"}catch{btn.textContent="Select + copy"}setTimeout(()=>btn.textContent=t,1300)}
  if(!api){notify("The local PCS discovery engine could not be initialized. Refresh the page or open Advanced Mapper.","error");return}
  $("guidedClaimIntent").addEventListener("input",renderIntentMatch);
  if($("guidedDemoNext"))$("guidedDemoNext").onclick=()=>{
    const step=Number(document.querySelector("[data-step-indicator].active")?.dataset.stepIndicator||1);
    if(step===2){$("guidedToReview").click();return}
    if(step===3){$("guidedToPrepare").click();return}
    if(step===4){$("guidedConfirmReview").checked=true;$("guidedPrepare").click();return}
    if(step===5){window.location.href="result-anatomy.html?scenario=accepted"}
  };
  $("guidedChooseFolder").onclick=()=>$("guidedFolderFiles").click();$("guidedChooseFiles").onclick=()=>$("guidedLooseFiles").click();$("guidedLoadExample").onclick=example;if($("guidedHeroExample"))$("guidedHeroExample").onclick=example;$("guidedFolderFiles").onchange=e=>load(e.target.files);$("guidedLooseFiles").onchange=e=>load(e.target.files);
  const d=$("guidedDropzone");["dragenter","dragover"].forEach(t=>d.addEventListener(t,e=>{e.preventDefault();d.classList.add("dragging")}));["dragleave","drop"].forEach(t=>d.addEventListener(t,e=>{e.preventDefault();d.classList.remove("dragging")}));d.ondrop=e=>load(e.dataTransfer.files);d.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("guidedLooseFiles").click()}};
  $("guidedSubject").onchange=async e=>{if(!state)return;setBusy(true,"Updating project name…");try{state=await api.setSubject(e.target.value);e.target.value=state.subject}catch(err){notify(err.message||String(err),"error")}finally{setBusy(false)}};
  $("guidedToReview").onclick=()=>{if(!claims().length){notify("Select at least one claim to continue.","error");return}renderReview();notify(demoMode?"Demo checkpoint: this page shows what PCS is preparing to verify. No PASS has been issued yet.":"");go(3)};$("guidedToPrepare").onclick=()=>{if($("guidedToPrepare").disabled){notify("Resolve the required review items before preparing the handoff.","error");return}renderFinal();$("guidedConfirmReview").checked=false;notify("");go(4)};$("guidedPrepare").onclick=()=>{if(!$("guidedConfirmReview").checked){notify("Confirm that you reviewed what PCS found before preparing the handoff.","error");return}renderResult();notify(demoMode?"Demo checkpoint: the browser draft is ready, but the scientific claim is still not verified. The cards below explain what the later verifier statuses mean.":"");go(5)};
  document.querySelectorAll("[data-guided-back]").forEach(b=>b.onclick=()=>{notify("");go(Number(b.dataset.guidedBack))});$("guidedDownloadDraft").onclick=()=>api.downloadDraft();$("guidedDownloadReview").onclick=()=>api.downloadReview();$("guidedCopyConfirm").onclick=()=>copy($("guidedCopyConfirm"));$("guidedCopyAttest").onclick=()=>copy($("guidedCopyAttest"));$("guidedStartOver").onclick=()=>window.location.reload();
  if(new URLSearchParams(window.location.search).get("demo")==="1")setTimeout(example,0);
})();
