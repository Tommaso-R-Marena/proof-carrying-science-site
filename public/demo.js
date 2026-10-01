const $=id=>document.getElementById(id);
const Engine=window.PCSBrowserEngine;
let pkg=JSON.parse(JSON.stringify(window.PCS_V05_REFERENCE_PACKAGE));
let sourceName="PCS 0.5.0 reference";
let lastReceipt=null;

function clone(x){return JSON.parse(JSON.stringify(x));}
function short(x){return x?x.slice(0,12)+"…"+x.slice(-8):"—";}
function errfmt(x){return Number.isFinite(x)?Number(x).toExponential(2):"—";}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}
function setStatus(cardId,valueId,value){
  const state=value==="PASS"||value==="VERIFIED"?"pass":value==="NOT_APPLIED"?"na":value==="UNSUPPORTED"||value==="UNSIGNED"?"warn":"fail";
  const card=$(cardId);card.classList.remove("pass","fail","warn","na");card.classList.add(state);$(valueId).textContent=value;
}
function bytesToB64(bytes){
  let out="";const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(out);
}
function textToEntry(text){return {content:text,encoding:"utf8"};}
function replaceFileText(entry,replacer){
  const text=Engine.fileText(entry);
  return textToEntry(replacer(text));
}
function activePackage(){
  const p=clone(pkg);
  const scenario=$("attackScenario")?.value||"none";

  if(scenario==="artifact_substitution"){
    const cert=JSON.parse(Engine.fileText(p.files["certificate.json"]));
    const pred=cert.artifacts.find(a=>a.id==="pk_predictions");
    if(pred&&p.files[pred.path]){
      p.files[pred.path]=replaceFileText(p.files[pred.path],text=>
        text.replace("4,6.70320046035639,77.0199479018078","4,7.70320046035639,77.0199479018078")
      );
    }
  }

  if(scenario==="status_escalation"){
    const cert=JSON.parse(Engine.fileText(p.files["certificate.json"]));
    const target=(cert.claims||[]).find(c=>c.kind==="computational")||cert.claims?.[0];
    if(target){
      target.assessment={
        status:"FORMALLY_VERIFIED_UNDER_ASSUMPTIONS",
        reason:"forged recorded status for threat-lab demonstration"
      };
      p.files["certificate.json"]=textToEntry(JSON.stringify(cert,null,2));
    }
  }

  if(scenario==="signature_stripping"){
    delete p.files["package_signature.json"];
  }

  return p;
}

const MAX_FILES=1000,MAX_TOTAL=100*1024*1024,MAX_SINGLE=50*1024*1024;
const WINDOWS_RESERVED=new Set(["con","prn","aux","nul",..."com1 com2 com3 com4 com5 com6 com7 com8 com9 lpt1 lpt2 lpt3 lpt4 lpt5 lpt6 lpt7 lpt8 lpt9".split(" ")]);
function validatePortablePath(path,seen){
  if(!path||path.startsWith("/")||path.includes("\\")||path.includes("\0"))throw new Error("unsafe package path: "+path);
  const parts=path.split("/");
  if(parts.some(x=>!x||x==="."||x===".."))throw new Error("non-canonical package path: "+path);
  const portable=[];
  for(const part of parts){
    const n=part.normalize("NFC");
    if(n!==part)throw new Error("package path is not NFC-normalized: "+path);
    if(/[<>:"|?*]/.test(part)||/[ .]$/.test(part))throw new Error("non-portable package filename: "+part);
    const stem=part.split(".",1)[0].toLowerCase();
    if(WINDOWS_RESERVED.has(stem))throw new Error("Windows-reserved package filename: "+part);
    portable.push(n.toLowerCase());
  }
  const key=portable.join("/");
  if(seen.has(key))throw new Error("cross-platform package path collision: "+path);
  seen.add(key);
}
async function directoryPackage(fileList){
  const selected=[...fileList];
  if(!selected.length)throw new Error("no directory files selected");
  if(selected.length>MAX_FILES)throw new Error(`too many files: ${selected.length} > ${MAX_FILES}`);
  const rels=selected.map(f=>f.webkitRelativePath||f.name);
  const roots=rels.map(p=>p.split("/")[0]);
  const commonRoot=roots.every(x=>x===roots[0])&&rels.every(p=>p.includes("/"))?roots[0]:null;
  const files={},seen=new Set();let total=0;
  for(let i=0;i<selected.length;i++){
    const f=selected[i];
    if(f.size>MAX_SINGLE)throw new Error("package member too large: "+rels[i]);
    total+=f.size;if(total>MAX_TOTAL)throw new Error("package exceeds 100 MB browser-profile limit");
    let rel=rels[i];
    if(commonRoot)rel=rel.slice(commonRoot.length+1);
    validatePortablePath(rel,seen);
    const bytes=new Uint8Array(await f.arrayBuffer());
    files[rel]={content:bytesToB64(bytes),encoding:"base64"};
  }
  return {transport_format:"pcs-browser-directory-package-v1",files};
}

function baselinePolicyFor(cert,requireSignature){
  return {
    policy_version:"pcs-acceptance-policy-v1",
    require_signature:Boolean(requireSignature),
    expected_signer_fingerprint:null,
    required_claims:Object.fromEntries((cert.claims||[]).map(c=>[c.id,[c.assessment.status]]))
  };
}
function strictPolicyFor(cert,fp){
  return {
    policy_version:"pcs-acceptance-policy-v1",
    require_signature:true,
    expected_signer_fingerprint:fp,
    required_claims:Object.fromEntries((cert.claims||[]).map(c=>[c.id,["FORMALLY_VERIFIED_UNDER_ASSUMPTIONS"]]))
  };
}
function inspectPackageFile(name,meta,p){
  const entry=p.files?.[name];
  $("packageFileName").textContent=name;
  $("packageFileMeta").textContent=`${Number(meta?.size??0).toLocaleString()} bytes · ${short(meta?.sha256||"")}`;
  if(!entry){
    $("packageFilePreview").textContent="File is missing from the selected package.";
    return;
  }
  try{
    const bytes=Engine.fileBytes(entry);
    if(bytes.byteLength>64*1024){
      $("packageFilePreview").textContent=`Preview suppressed: ${bytes.byteLength.toLocaleString()} bytes exceeds the 64 KiB local preview limit.`;
      return;
    }
    const text=Engine.fileText(entry);
    const suspicious=[...text].some(ch=>{
      const code=ch.charCodeAt(0);
      return code===0||(code<9)||(code>13&&code<32);
    });
    if(suspicious){
      $("packageFilePreview").textContent="Preview suppressed: selected member appears to contain binary/control bytes.";
      return;
    }
    $("packageFilePreview").textContent=text||"(empty text file)";
  }catch(e){
    $("packageFilePreview").textContent="Preview unavailable: "+String(e);
  }
}

function renderPackage(result,p){
  const manifest=result.manifest||{};
  const entries=Object.entries(manifest.files||{});
  $("packageRows").innerHTML=entries.map(([name,meta])=>
    `<tr><td><button class="filelink" data-package-file="${esc(name)}"><code>${esc(name)}</code></button></td><td>${Number(meta.size).toLocaleString()}</td><td><code>${esc(short(meta.sha256))}</code></td></tr>`
  ).join("");
  $("packageRows").querySelectorAll("[data-package-file]").forEach(button=>{
    button.addEventListener("click",()=>{
      const name=button.getAttribute("data-package-file");
      inspectPackageFile(name,manifest.files[name],p);
    });
  });
  if(entries.length){
    inspectPackageFile(entries[0][0],entries[0][1],p);
  }else{
    $("packageFileName").textContent="No staged files";
    $("packageFileMeta").textContent="—";
    $("packageFilePreview").textContent="The package manifest contains no staged files.";
  }
}
function renderClaims(result){
  const cert=result.certificate||{};
  const byId=Object.fromEntries((result.claimResults||[]).map(x=>[x.id,x.assessment]));
  $("claimRows").innerHTML=(cert.claims||[]).map(c=>{
    const got=byId[c.id]||{status:"MISSING",reason:"no reassessment"};
    const matches=got.status===c.assessment?.status;
    return `<div class="claimrow"><span class="dot ${matches&&got.status!=="FALSIFIED_OR_CHECK_FAILED"?"pass":"fail"}"></span><div><strong>${esc(c.id)} · ${esc(got.status)}</strong><span>${esc(got.reason)}<br>Recorded: ${esc(c.assessment?.status||"—")} · ${matches?"matches":"DIFFERS from"} certificate</span></div></div>`;
  }).join("");
}
function renderEvidence(result){
  $("evidenceRows").innerHTML=(result.replayRows||[]).map(({recorded,replayed})=>{
    const ok=recorded.outcome===replayed.outcome&&recorded.kind===replayed.kind;
    const d=replayed.details||{};
    const metrics=replayed.id==="E_PK_REPLAY"
      ?`Rows: ${d.row_count??"—"} · max PK rel: ${errfmt(d.max_concentration_rel_error)} · max PD rel: ${errfmt(d.max_effect_rel_error)}`
      : replayed.id==="E_PK_CONTRACT"?"Restricted dimensional/positivity contract replayed.":"";
    return `<div class="claimrow"><span class="dot ${ok?"pass":"fail"}"></span><div><strong>${esc(replayed.id)} · ${esc(replayed.outcome)}</strong><span>Kind: ${esc(replayed.kind)} · recorded outcome: ${esc(recorded.outcome)}<br>${esc(metrics)}</span></div></div>`;
  }).join("");
}
function renderDecisionTrace(result){
  const cert=result.certificate||{};
  const replayById=Object.fromEntries((result.replayRows||[]).map(x=>[x.recorded.id,x.replayed]));
  const reassessed=Object.fromEntries((result.claimResults||[]).map(x=>[x.id,x.assessment]));
  $("decisionTraceRows").innerHTML=(cert.claims||[]).map(claim=>{
    const assessment=reassessed[claim.id]||{};
    const evidence=(claim.required_evidence||[]).map(id=>{
      const e=replayById[id];
      return e
        ?`<span class="tracepill"><strong>Evidence</strong>${esc(id)} · ${esc(e.kind)} · ${esc(e.outcome)}</span>`
        :`<span class="tracepill"><strong>Evidence</strong>${esc(id)} · MISSING</span>`;
    }).join('<span class="tracearrow">→</span>');
    const assumptions=(claim.assumptions||[]).length
      ?claim.assumptions.map(id=>`<span class="tracepill"><strong>Assumption</strong>${esc(id)}</span>`).join("")
      :'<span class="tracepill"><strong>Assumption</strong>none</span>';
    return `<article class="decisiontrace">
      <header>
        <div><h3>${esc(claim.id)}</h3><p class="statement">${esc(claim.statement||"")}</p></div>
        <span class="chip ${assessment.status&&assessment.status!=="OPEN"&&assessment.status!=="FALSIFIED_OR_CHECK_FAILED"?"verified":"open"}">${esc(assessment.status||"UNKNOWN")}</span>
      </header>
      <div class="tracechain">${assumptions}<span class="tracearrow">+</span>${evidence}<span class="tracearrow">→</span><span class="tracepill"><strong>Decision</strong>${esc(assessment.status||"UNKNOWN")}</span></div>
      <div class="predicatebox">${esc(JSON.stringify(claim.predicate??null))}</div>
    </article>`;
  }).join("");
}

function renderParity(){
  const rows=Engine.runDecisionParity(),passed=rows.filter(x=>x.pass).length;
  $("parityBadge").textContent=`Decision parity: ${passed}/${rows.length}`;
  $("parityRows").innerHTML=rows.map(r=>`<div class="parityrow ${r.pass?"pass":"fail"}"><span>${esc(r.name)}</span><b>${r.pass?"PASS":"FAIL"}</b></div>`).join("");
  return {passed,total:rows.length,rows};
}
function renderTrace(result){
  const c=result.certificate||{},m=result.manifest||{},s=result.signature||{};
  $("certificateTrace").innerHTML=[
    ["Specification",c.spec_version],["Checker",c.checker_version],["Subject",c.subject],
    ["Package format",m.package_format],["Signer",s.fingerprint||"—"],
    ["Semantic hash",c.semantic_hash],["Integrity hash",c.integrity_hash]
  ].map(([a,b])=>`<dt>${esc(a)}</dt><dd class="mono">${esc(b||"—")}</dd>`).join("");
  $("certificateView").textContent=JSON.stringify(c,null,2);
}
function downloadReceipt(){
  if(!lastReceipt)return;
  const blob=new Blob([JSON.stringify(lastReceipt,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="pcs-browser-v05-verification-receipt.json";a.click();URL.revokeObjectURL(url);
}
function explainVerificationResult(result){
  const d=result.assurance_dimensions||{};
  const claimStatuses=(result.claimResults||[]).map(x=>x.assessment?.status).filter(Boolean);
  const supported=claimStatuses.filter(x=>["COMPUTATIONALLY_SUPPORTED","FORMALLY_VERIFIED_UNDER_ASSUMPTIONS","EMPIRICALLY_VALIDATED_WITHIN_SCOPE","MIXED_SUPPORT_UNDER_ASSUMPTIONS"].includes(x));
  const failed=claimStatuses.filter(x=>x==="FALSIFIED_OR_CHECK_FAILED");
  const open=claimStatuses.filter(x=>x==="OPEN");
  const accepted=d.reviewer_policy==="PASS"&&result.valid;
  const packageOk=d.package_integrity==="PASS";
  const replayOk=d.scientific_replay==="PASS";
  const authOk=["VERIFIED","UNSIGNED"].includes(d.signer_authenticity);
  let headline,means,doesNot,next;
  if(accepted){
    headline="Accepted under this reviewer policy";
    means=`The delivered bytes passed integrity checks, the declared evidence replayed consistently, and this reviewer policy accepts the resulting claim status${supported.length===1?"":"es"}.`;
    doesNot="This does not prove biological or clinical validity, universal correctness, or acceptance by every reviewer. It establishes only the exact scoped claims represented in the package.";
    next="Inspect Claim reassessment to see the derived assurance status, then Replay metrics to see the numerical evidence.";
  }else if(!packageOk){
    headline="Rejected: package integrity failed";
    means="The delivered file set or hashes do not match the authenticated package commitment, so PCS refuses to treat the staged bytes as the claimed package.";
    doesNot="This does not necessarily show that the underlying scientific model is false; the trust chain was broken before that conclusion could be drawn safely.";
    next="Inspect Package and Verification log to find the changed, missing, or unexpected bytes.";
  }else if(!replayOk||failed.length){
    headline="Rejected: required scientific replay failed";
    means="At least one required computational check did not reproduce the recorded result, so the corresponding claim cannot receive the requested support.";
    doesNot="A failed replay does not automatically identify why the science failed; it establishes that this evidence does not support the exact declared claim.";
    next="Inspect Evidence replay and Claim reassessment to locate the failing check and derived claim status.";
  }else if(open.length){
    headline="Not accepted: at least one claim remains OPEN";
    means="PCS does not have enough independently verified evidence to justify the requested assurance level for at least one claim.";
    doesNot="OPEN is not the same as falsified. It means the evidence is missing, unverified, or of the wrong assurance class.";
    next="Inspect Claim reassessment to see which evidence class or required item is missing.";
  }else if(d.reviewer_policy==="FAIL"){
    headline="Verified evidence, but this reviewer policy does not accept it";
    means="The package and replay may be internally valid, but the receiver requires a different signer or a stronger claim status than this package provides.";
    doesNot="Policy rejection does not mean the computation failed. It means the verified result is insufficient for this reviewer’s acceptance rule.";
    next="Inspect Reviewer policy and compare the required claim status or signer constraint with the verified package.";
  }else if(!authOk){
    headline="Rejected: signer authenticity failed";
    means="PCS could not authenticate the signer required by this review policy.";
    doesNot="This does not by itself show that the computation is numerically wrong; it means the reviewer cannot trust the claimed producer identity.";
    next="Inspect Signer authenticity and the package-signature details.";
  }else{
    headline="Verification did not satisfy the current profile";
    means="At least one required assurance dimension did not meet the current verifier or policy requirements.";
    doesNot="Do not collapse this into a scientific truth judgment; inspect the failed dimension first.";
    next="Use the four assurance dimensions and Verification log below.";
  }
  return {headline,means,doesNot,next};
}

async function verify(){
  $("verify").disabled=true;
  try{
    const p=activePackage();
    const cert=JSON.parse(Engine.fileText(p.files["certificate.json"]));
    const sigrec=p.files["package_signature.json"]?JSON.parse(Engine.fileText(p.files["package_signature.json"])):null;
    const policy=$("strictPolicy").checked
      ?strictPolicyFor(cert,sigrec?.public_key_fingerprint||null)
      :baselinePolicyFor(cert,$("requireSignature").checked);
    const result=await Engine.verifyVirtualPackage(p,policy);
    const parity=renderParity();

    setStatus("replayCard","replayStatus",result.assurance_dimensions.scientific_replay);
    setStatus("integrityCard","integrityStatus",result.assurance_dimensions.package_integrity);
    setStatus("authCard","authStatus",result.assurance_dimensions.signer_authenticity);
    setStatus("policyCard","policyStatus",result.assurance_dimensions.reviewer_policy);

    const oc=$("overallCard");oc.classList.remove("pass","fail");oc.classList.add(result.valid?"pass":"fail");
    const interpretation=explainVerificationResult(result);
    $("overallStatus").textContent=result.valid?"ACCEPTED under this reviewer policy":"NOT ACCEPTED under this reviewer policy";
    $("overallDetail").textContent=result.valid
      ?"The package, replay, authenticity requirements, and current reviewer policy all passed. See the interpretation below for the exact scope."
      :`${result.errors.length} verification issue${result.errors.length===1?"":"s"} detected. The interpretation below identifies which layer failed.`;
    $("demoMeaningHeadline").textContent=interpretation.headline;
    $("demoMeans").textContent=interpretation.means;
    $("demoDoesNotMean").textContent=interpretation.doesNot;
    $("demoNext").textContent=interpretation.next;
    $("specBadge").textContent=(result.certificate?.spec_version||"unknown")+" · "+(result.certificate?.checker_version||"");

    renderPackage(result,p);renderClaims(result);renderEvidence(result);renderDecisionTrace(result);renderTrace(result);

    const replay=(result.replayRows||[]).find(x=>x.replayed.id==="E_PK_REPLAY")?.replayed?.details||{};
    $("rowsReplayed").textContent=replay.row_count??"—";
    $("pkError").textContent=errfmt(replay.max_concentration_rel_error);
    $("pdError").textContent=errfmt(replay.max_effect_rel_error);
    $("fingerprintShort").textContent=short(result.signature?.fingerprint);
    $("semanticShort").textContent=short(result.certificate?.semantic_hash);
    $("integrityShort").textContent=short(result.certificate?.integrity_hash);

    $("errorLog").innerHTML=result.errors.length
      ?`<ul class="errorlist">${result.errors.map(e=>`<li>${esc(e)}</li>`).join("")}</ul>`
      :'<div class="successline">No verification errors. Every requested check passed.</div>';

    lastReceipt={
      verification_receipt_format:"pcs-browser-v05-verification-receipt-v1",
      verifier_profile:"pcs-browser-engine/v0.5-parity",
      verified_at:new Date().toISOString(),
      source:sourceName,
      attack_scenario:$("attackScenario")?.value||"none",
      reviewer_policy_profile:{
        require_authenticated_package:$("requireSignature").checked,
        require_formal_status:$("strictPolicy").checked
      },
      valid:result.valid,
      errors:result.errors,
      assurance_dimensions:result.assurance_dimensions,
      signer_fingerprint:result.signature?.fingerprint||null,
      claim_results:result.claimResults,
      decision_vector_parity:{passed:parity.passed,total:parity.total},
      scope:"Static-browser parity profile for PCS v0.5 staged-file/package-manifest verification, optional package signature verification, built-in PK/PD replay, claim decision, and reviewer policy. Extracted-directory verification begins after ZIP extraction and is not the production ZIP/runtime verifier."
    };
    $("downloadReceipt").disabled=false;
  }catch(e){
    const message=String(e);
    ["replay","integrity","auth","policy"].forEach(x=>setStatus(x+"Card",x+"Status","FAIL"));
    $("overallCard").classList.remove("pass");$("overallCard").classList.add("fail");
    $("overallStatus").textContent="VERIFIER ERROR";$("overallDetail").textContent=message;
    $("demoMeaningHeadline").textContent="The verifier could not complete";
    $("demoMeans").textContent="No trustworthy acceptance or claim-support conclusion should be drawn from an incomplete verification run.";
    $("demoDoesNotMean").textContent="A software/runtime error is not itself evidence that the scientific claim is false.";
    $("demoNext").textContent="Resolve the verifier error first, then rerun the same package.";
    $("errorLog").innerHTML=`<ul class="errorlist"><li>${esc(message)}</li></ul>`;
    lastReceipt=null;$("downloadReceipt").disabled=true;
  }finally{$("verify").disabled=false;}
}
function attackHint(){
  const value=$("attackScenario")?.value||"none";
  const hints={
    none:"Baseline: verify the signed reference package without mutation.",
    artifact_substitution:"Expected separation: scientific replay and package integrity fail; the signer can still authenticate the unchanged manifest.",
    status_escalation:"Expected separation: claim reassessment rejects the forged status and package integrity fails, even though the original manifest signature can still verify.",
    signature_stripping:"Expected separation: scientific replay and package integrity can remain valid, but signer authenticity becomes UNSIGNED and authenticated-package policy fails."
  };
  $("attackHint").textContent=hints[value]||"";
}
function reset(){
  pkg=clone(window.PCS_V05_REFERENCE_PACKAGE);
  sourceName="PCS 0.5.0 reference";
  $("sourceLabel").textContent=sourceName;
  $("attackScenario").value="none";
  $("requireSignature").checked=true;
  $("strictPolicy").checked=false;
  attackHint();
  verify();
}
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tabpane").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");$("tab-"+btn.dataset.tab).classList.add("active");
}));
$("verify").onclick=verify;$("loadReference").onclick=reset;$("downloadReceipt").onclick=downloadReceipt;
$("attackScenario").onchange=()=>{attackHint();verify();};
$("requireSignature").onchange=verify;
$("strictPolicy").onchange=verify;
$("directoryInput").addEventListener("change",async ev=>{
  try{
    pkg=await directoryPackage(ev.target.files);
    sourceName="Extracted PCS directory";
    $("sourceLabel").textContent=sourceName;
    $("attackScenario").value="none";attackHint();
    await verify();
  }catch(e){
    $("overallStatus").textContent="Could not read directory";
    $("overallDetail").textContent=String(e);
  }
});
$("fileInput").addEventListener("change",async ev=>{
  const file=ev.target.files?.[0];if(!file)return;
  try{
    pkg=JSON.parse(await file.text());sourceName=file.name;$("sourceLabel").textContent=file.name;$("attackScenario").value="none";attackHint();await verify();
  }catch(e){$("overallStatus").textContent="Could not read package";$("overallDetail").textContent=String(e);}
});
renderParity();reset();
