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
      next:"Read the typed predicate and assumptions first, then inspect the replay evidence and the exact reviewer policy."
    },
    policy:{
      badge:"VALID + NOT ACCEPTED",
      title:"The package and computation verify, but this reviewer requires something stronger.",
      subtitle:"Policy rejection does not rewrite a valid computational record as invalid.",
      valid:true,accepted:false,claim:"COMPUTATIONALLY_SUPPORTED",
      axes:["pass","pass","warn"],
      means:"The exact package verified and the declared computational evidence supports the typed claim. PCS has preserved a valid scientific record.",
      not:"The receiver is obligated to accept it. A policy may require a particular signer, formal evidence, empirical validation, or another status.",
      next:"Compare the verified claim status and signer with the receiver's policy. The scientific replay may need no correction at all."
    },
    "failed-claim":{
      badge:"VALID PACKAGE + FAILED CLAIM",
      title:"The package is valid because PCS faithfully verified a negative scientific result.",
      subtitle:"A valid PCS package can truthfully carry FALSIFIED_OR_CHECK_FAILED.",
      valid:true,accepted:false,claim:"FALSIFIED_OR_CHECK_FAILED",
      axes:["pass","fail","warn"],
      means:"The bytes, signatures, replay process, and normalized decisions are internally valid—and at least one required scientific check failed, so the claim does not receive the requested support.",
      not:"The PCS system malfunctioned merely because the claim failed. Correctly preserving a falsification is successful assurance behavior.",
      next:"Inspect the failed evidence object and determine whether the scientific claim, data, code, or assumptions need revision."
    },
    invalid:{
      badge:"INVALID PACKAGE",
      title:"PCS cannot establish a trustworthy review chain for these delivered bytes.",
      subtitle:"Integrity/authentication/replay failure blocks downstream reliance on the package.",
      valid:false,accepted:false,claim:"NOT TRUSTWORTHY FROM THIS RUN",
      axes:["fail","neutral","warn"],
      means:"At least one required verifier stage failed, so PCS refuses to certify that these bytes are the authenticated, replay-consistent package being claimed.",
      not:"The underlying scientific hypothesis is necessarily false. Package invalidity and scientific falsification are different failure modes.",
      next:"Identify the failed verifier stage—canonical bytes, signature, package binding, environment/workflow replay, scientific replay, or normalized decisions—then rerun after remediation."
    }
  };
  const buttons=[...document.querySelectorAll("[data-result-scenario]")];
  function axis(id,tone,label,detail){
    const el=$(id);el.className="axis-card "+tone;el.querySelector("strong").textContent=label;el.querySelector("small").textContent=detail;
  }
  function render(name){
    const s=scenarios[name]||scenarios.accepted;
    buttons.forEach(b=>{const on=b.dataset.resultScenario===name;b.classList.toggle("active",on);b.setAttribute("aria-pressed",on?"true":"false")});
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
    const url=new URL(window.location.href);url.searchParams.set("scenario",name);history.replaceState(null,"",url);
  }
  buttons.forEach(b=>b.addEventListener("click",()=>render(b.dataset.resultScenario)));
  const requested=new URLSearchParams(window.location.search).get("scenario");
  render(Object.hasOwn(scenarios,requested)?requested:"accepted");
})();
