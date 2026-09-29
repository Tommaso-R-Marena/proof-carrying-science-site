const $=id=>document.getElementById(id);
const Engine=window.PCSBrowserEngine;
let pkg=JSON.parse(JSON.stringify(window.PCS_V05_REFERENCE_PACKAGE));
let sourceName="PCS v0.5 reference";
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
  if($("tamper").checked){
    const cert=JSON.parse(Engine.fileText(p.files["certificate.json"]));
    const pred=cert.artifacts.find(a=>a.id==="pk_predictions");
    if(pred&&p.files[pred.path]){
      p.files[pred.path]=replaceFileText(p.files[pred.path],text=>
        text.replace("4,6.70320046035639,77.0199479018078","4,7.70320046035639,77.0199479018078")
      );
    }
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

function strictPolicyFor(cert,fp){
  return {
    policy_version:"pcs-acceptance-policy-v1",
    require_signature:true,
    expected_signer_fingerprint:fp,
    required_claims:Object.fromEntries((cert.claims||[]).map(c=>[c.id,["FORMALLY_VERIFIED_UNDER_ASSUMPTIONS"]]))
  };
}
function renderPackage(result,p){
  const manifest=result.manifest||{};
  $("packageRows").innerHTML=Object.entries(manifest.files||{}).map(([name,meta])=>
    `<tr><td><code>${esc(name)}</code></td><td>${Number(meta.size).toLocaleString()}</td><td><code>${esc(short(meta.sha256))}</code></td></tr>`
  ).join("");
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
async function verify(){
  $("verify").disabled=true;
  try{
    const p=activePackage();
    const cert=JSON.parse(Engine.fileText(p.files["certificate.json"]));
    const sigrec=p.files["package_signature.json"]?JSON.parse(Engine.fileText(p.files["package_signature.json"])):null;
    const policy=$("strictPolicy").checked?strictPolicyFor(cert,sigrec?.public_key_fingerprint||null):null;
    const result=await Engine.verifyVirtualPackage(p,policy);
    const parity=renderParity();

    setStatus("replayCard","replayStatus",result.assurance_dimensions.scientific_replay);
    setStatus("integrityCard","integrityStatus",result.assurance_dimensions.package_integrity);
    setStatus("authCard","authStatus",result.assurance_dimensions.signer_authenticity);
    setStatus("policyCard","policyStatus",result.assurance_dimensions.reviewer_policy);

    const oc=$("overallCard");oc.classList.remove("pass","fail");oc.classList.add(result.valid?"pass":"fail");
    $("overallStatus").textContent=result.valid?"Package accepted by this browser profile":"Package rejected by this browser profile";
    $("overallDetail").textContent=result.valid
      ?"All requested package, replay, authenticity, and policy checks passed."
      :`${result.errors.length} verification issue${result.errors.length===1?"":"s"} detected; inspect the log below.`;
    $("specBadge").textContent=(result.certificate?.spec_version||"unknown")+" · "+(result.certificate?.checker_version||"");

    renderPackage(result,p);renderClaims(result);renderEvidence(result);renderTrace(result);

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
      valid:result.valid,
      errors:result.errors,
      assurance_dimensions:result.assurance_dimensions,
      signer_fingerprint:result.signature?.fingerprint||null,
      claim_results:result.claimResults,
      decision_vector_parity:{passed:parity.passed,total:parity.total},
      scope:"Static-browser parity profile for PCS v0.5 package structure, package signature, built-in PK/PD predicates, claim decision, and reviewer policy. Not the production ZIP/runtime verifier."
    };
    $("downloadReceipt").disabled=false;
  }catch(e){
    const message=String(e);
    ["replay","integrity","auth","policy"].forEach(x=>setStatus(x+"Card",x+"Status","FAIL"));
    $("overallCard").classList.remove("pass");$("overallCard").classList.add("fail");
    $("overallStatus").textContent="Verifier error";$("overallDetail").textContent=message;
    $("errorLog").innerHTML=`<ul class="errorlist"><li>${esc(message)}</li></ul>`;
    lastReceipt=null;$("downloadReceipt").disabled=true;
  }finally{$("verify").disabled=false;}
}
function reset(){
  pkg=clone(window.PCS_V05_REFERENCE_PACKAGE);sourceName="PCS v0.5 reference";$("sourceLabel").textContent=sourceName;$("tamper").checked=false;$("strictPolicy").checked=false;verify();
}
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".tabpane").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");$("tab-"+btn.dataset.tab).classList.add("active");
}));
$("verify").onclick=verify;$("loadReference").onclick=reset;$("downloadReceipt").onclick=downloadReceipt;
$("tamper").onchange=verify;$("strictPolicy").onchange=verify;
$("directoryInput").addEventListener("change",async ev=>{
  try{
    pkg=await directoryPackage(ev.target.files);
    sourceName="Extracted PCS directory";
    $("sourceLabel").textContent=sourceName;
    $("tamper").checked=false;
    await verify();
  }catch(e){
    $("overallStatus").textContent="Could not read directory";
    $("overallDetail").textContent=String(e);
  }
});
$("fileInput").addEventListener("change",async ev=>{
  const file=ev.target.files?.[0];if(!file)return;
  try{
    pkg=JSON.parse(await file.text());sourceName=file.name;$("sourceLabel").textContent=file.name;$("tamper").checked=false;await verify();
  }catch(e){$("overallStatus").textContent="Could not read package";$("overallDetail").textContent=String(e);}
});
renderParity();reset();
