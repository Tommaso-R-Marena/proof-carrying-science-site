(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const scenarios={
    accepted:{
      badge:"VALID + ACCEPTED",
      title:"The exact package verified, the claim is computationally supported, and this reviewer accepts that support level.",
      subtitle:"This is the clean positive case—but its scope is still the exact typed claim, evidence, assumptions, and reviewer policy.",
      valid:true,accepted:true,claim:"COMPUTATIONALLY_SUPPORTED",
      axes:["pass","pass","pass"],
      means:"The delivered package passed the PCS v0.6 verification chain; all declared computational evidence required by this claim passed; and the receiver's explicit policy accepts that support level.",
      not:"The biological mechanism, clinical usefulness, safety, efficacy, or every possible scientific interpretation has been proved true.",
      next:"Read the typed predicate and assumptions first, then inspect the replay evidence and the exact reviewer policy.",
      inspect:{href:"#typed-claim-inspection",label:"Inspect exact predicate →",title:"Inspect the exact typed predicate first.",why:"The positive result only has meaning relative to the precise predicate, bound artifacts, tolerances, and assumption scope."}
    },
    policy:{
      badge:"VALID + NOT ACCEPTED",
      title:"The package and computation verify, but this reviewer requires something stronger.",
      subtitle:"Policy rejection does not rewrite a valid computational record as invalid.",
      valid:true,accepted:false,claim:"COMPUTATIONALLY_SUPPORTED",
      axes:["pass","pass","warn"],
      means:"The exact package verified and the declared computational evidence supports the typed claim. PCS has preserved a valid scientific record.",
      not:"The receiver is obligated to accept it. A policy may require a particular signer, formal evidence, empirical validation, or another status.",
      next:"Compare the verified claim status and signer with the receiver's policy. The scientific replay may need no correction at all.",
      inspect:{href:"#policy-receipt",label:"Inspect policy + receipt →",title:"Inspect the reviewer policy decision first.",why:"The package and claim verified; the disagreement is now about what this receiver requires, not whether the replay record is valid."}
    },
    "failed-claim":{
      badge:"VALID PACKAGE + FAILED CLAIM",
      title:"The package is valid because PCS faithfully verified a negative scientific result.",
      subtitle:"A valid PCS package can truthfully carry FALSIFIED_OR_CHECK_FAILED.",
      valid:true,accepted:false,claim:"FALSIFIED_OR_CHECK_FAILED",
      axes:["pass","fail","warn"],
      means:"The bytes, signatures, replay process, and normalized decisions are internally valid—and at least one required scientific check failed, so the claim does not receive the requested support.",
      not:"The PCS system malfunctioned merely because the claim failed. Correctly preserving a falsification is successful assurance behavior.",
      next:"Inspect the failed evidence object and determine whether the scientific claim, data, code, or assumptions need revision.",
      inspect:{href:"#scientific-replay-stage",label:"Inspect scientific replay →",title:"Inspect the failed replay stage first.",why:"The package is valid, so the actionable question is which required scientific check failed and what that failure says about the claim, data, code, or assumptions."}
    },
    invalid:{
      badge:"INVALID PACKAGE",
      title:"PCS cannot establish a trustworthy review chain for these delivered bytes.",
      subtitle:"Integrity/authentication/replay failure blocks downstream reliance on the package.",
      valid:false,accepted:false,claim:"NOT TRUSTWORTHY FROM THIS RUN",
      axes:["fail","neutral","warn"],
      means:"At least one required verifier stage failed, so PCS refuses to certify that these bytes are the authenticated, replay-consistent package being claimed.",
      not:"The underlying scientific hypothesis is necessarily false. Package invalidity and scientific falsification are different failure modes.",
      next:"Identify the failed verifier stage—canonical bytes, signature, package binding, environment/workflow replay, scientific replay, or normalized decisions—then rerun after remediation.",
      inspect:{href:"#verification-chain",label:"Inspect verification chain →",title:"Diagnose the package failure before reading the claim.",why:"An invalid package blocks downstream claim interpretation. Start with the verifier stage that failed, then remediate and rerun."}
    }
  };
  const buttons=[...document.querySelectorAll("[data-result-scenario]")];
  function axis(id,tone,label,detail){
    const el=$(id);el.className="axis-card "+tone;el.querySelector("strong").textContent=label;el.querySelector("small").textContent=detail;
  }
  function glance(id,tone,status,detail){
    const el=$(id);el.className="glance-card "+tone;
    const statusEl=$(id+"Status"),detailEl=$(id+"Detail");
    if(statusEl)statusEl.textContent=status;
    if(detailEl)detailEl.textContent=detail;
  }
  function renderFirstGlance(s){
    glance("glancePackage",s.axes[0],s.valid?"VALID":"INVALID",s.valid
      ?"Integrity, authentication, replay, and normalized-decision chain accepted."
      :"The package trust chain failed. Stop before interpreting the scientific claim.");
    glance("glanceClaim",s.axes[1],s.valid?s.claim:"NO TRUSTWORTHY CLAIM CONCLUSION",s.valid
      ?(s.claim==="COMPUTATIONALLY_SUPPORTED"
        ?"The exact illustrative typed claim received computational support from freshly replayed required evidence."
        :"The exact illustrative typed claim did not receive the requested support.")
      :"No downstream claim status from this run is trustworthy because package verification failed.");
    if(!s.valid){
      glance("glanceTrust","warn","STOP AT PACKAGE FAILURE","The underlying scientific hypothesis remains outside what this invalid run can establish; diagnose the failed verifier stage first.");
    }else if(s.claim==="FALSIFIED_OR_CHECK_FAILED"){
      glance("glanceTrust","warn","DOMAIN JUDGMENT REMAINS","Why the required check failed, and whether the data/model assumptions are adequate, remains outside the PCS decision.");
    }else if(!s.accepted){
      glance("glanceTrust","warn","POLICY REQUIREMENT REMAINS","The computation verified, but sufficiency for this use case remains a receiver-owned governance decision.");
    }else{
      glance("glanceTrust","warn","EXPLICIT TRUST BOUNDARY","Runtime/platform behavior, cryptographic implementations, unsupported scientific semantics, and domain adequacy remain outside the proved claim.");
    }
    glance("glancePolicy",s.axes[2],s.accepted?"ACCEPTED":"NOT ACCEPTED",s.accepted
      ?"This receiver's explicit policy accepts the verified claim status and signer."
      :s.valid
        ?"The receiver policy does not accept this verified state. That does not make the package invalid."
        :"No receiver acceptance follows from an invalid package.");
    $("glanceBottom").innerHTML=s.valid
      ?'<strong>Read next:</strong> inspect the exact predicate and assumptions, then the fresh replay evidence, then the reviewer policy.'
      :'<strong>Read next:</strong> diagnose the failed package stage before reading any scientific claim conclusion.';
  }
  function render(name){
    const s=scenarios[name]||scenarios.accepted;
    buttons.forEach(b=>{const on=b.dataset.resultScenario===name;b.classList.toggle("active",on);b.setAttribute("aria-pressed",on?"true":"false")});
    renderFirstGlance(s);
    $("reviewerNextPrimary").href=s.inspect.href;
    $("reviewerNextPrimary").textContent=s.inspect.label;
    $("reviewerNextTitle").textContent=s.inspect.title;
    $("reviewerNextWhy").textContent=s.inspect.why;
    $("resultScenarioBadge").textContent=s.badge;
    $("resultScenarioTitle").textContent=s.title;
    $("resultScenarioSubtitle").textContent=s.subtitle;
    axis("axisValid",s.axes[0],s.valid?"VALID":"INVALID",s.valid?"PCS trust chain accepted":"PCS trust chain rejected");
    axis("axisClaim",s.axes[1],s.claim,s.claim==="COMPUTATIONALLY_SUPPORTED"?"Required computational evidence passed":s.claim==="FALSIFIED_OR_CHECK_FAILED"?"At least one required scientific check failed":"No trustworthy claim conclusion from this invalid run");
    axis("axisAccepted",s.axes[2],s.accepted?"ACCEPTED":"NOT ACCEPTED",s.accepted?"Receiver policy accepts verified state":"Receiver policy does not accept this state");
    $("receiptValid").textContent=String(s.valid);
    $("receiptAccepted").textContent=String(s.accepted);
    $("receiptClaim").textContent=s.claim;
    $("resultMeans").textContent=s.means;
    $("resultDoesNotMean").textContent=s.not;
    $("resultNext").textContent=s.next;
    const formal=$("summaryFormal"), replay=$("summaryReplay"), trusted=$("summaryTrusted"), bottom=$("summaryBottom");
    if(!s.valid){
      formal.textContent="No downstream PCS assurance is established because the package verification chain failed.";
      replay.textContent="At least one required integrity, authentication, replay, or normalized-decision stage failed.";
      trusted.textContent="The underlying scientific hypothesis remains outside what this invalid run can establish.";
      bottom.textContent="Bottom line: INVALID PACKAGE means stop before interpreting the scientific claim.";
    }else if(s.claim==="FALSIFIED_OR_CHECK_FAILED"){
      formal.textContent="PCS formally preserves the replay-derived negative decision for this exact typed claim.";
      replay.textContent="The package and required checks replayed coherently, and at least one required scientific check failed.";
      trusted.textContent="Why the scientific check failed—and whether the model/data assumptions are adequate—still requires domain judgment.";
      bottom.textContent="Bottom line: the assurance system worked, but the requested claim support did not.";
    }else if(!s.accepted){
      formal.textContent="PCS establishes the verified computational claim status independently of reviewer policy.";
      replay.textContent="The exact package and declared required checks passed fresh verification.";
      trusted.textContent="Whether that support is sufficient for this use case remains a receiver-owned policy decision.";
      bottom.textContent="Bottom line: verified computation and organizational acceptance are deliberately separate.";
    }else{
      formal.textContent="PCS establishes the decision relationship for the exact typed predicate, evidence, and policy inputs.";
      replay.textContent="The delivered bytes, supported checks, environment/workflow bindings, and normalized decisions passed fresh verification.";
      trusted.textContent="Runtime/platform behavior, cryptographic implementations, unsupported scientific semantics, and domain adequacy remain explicit trust boundaries.";
      bottom.textContent="Bottom line: this is strong assurance for the declared computational claim—not a proof of every broader scientific interpretation.";
    }
    const url=new URL(window.location.href);url.searchParams.set("scenario",name);history.replaceState(null,"",url);
  }
  buttons.forEach(b=>b.addEventListener("click",()=>render(b.dataset.resultScenario)));
  const requested=new URLSearchParams(window.location.search).get("scenario");
  render(Object.hasOwn(scenarios,requested)?requested:"accepted");
})();
