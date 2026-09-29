const $ = id => document.getElementById(id);
const enc = new TextEncoder();

let envelope = JSON.parse($("referenceEnvelope").textContent);
let lastReceipt = null;
let sourceName = "Built-in reference";

function b64bytes(s){
  const raw = atob(s);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
function hex(bytes){
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function sha256Text(s){
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
async function sha256Bytes(bytes){
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}
function clone(x){ return JSON.parse(JSON.stringify(x)); }

function stableStringify(value){
  if(value === null || typeof value !== "object") return JSON.stringify(value);
  if(Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k)+":"+stableStringify(value[k])).join(",") + "}";
}
function setStatus(cardId, valueId, state, text){
  const card=$(cardId); card.classList.remove("pass","fail","warn","na"); card.classList.add(state);
  $(valueId).textContent=text;
}
function relErr(a,b){
  const d=Math.abs(a-b); return d/Math.max(Math.abs(b),1e-300);
}
function validModel(m){
  return !!m &&
    m.model_type==="one_compartment_iv_bolus" &&
    m.dose?.unit==="mg" && m.volume?.unit==="L" && m.clearance?.unit==="L/h" &&
    m.time_unit==="h" && m.concentration_unit==="mg/L" &&
    Number.isFinite(m.dose?.value) && m.dose.value>0 &&
    Number.isFinite(m.volume?.value) && m.volume.value>0 &&
    Number.isFinite(m.clearance?.value) && m.clearance.value>0 &&
    m.pd?.model_type==="direct_emax" &&
    m.pd?.ec50?.unit==="mg/L" && m.pd?.effect_unit==="1" &&
    Number.isFinite(m.pd?.e0?.value) &&
    Number.isFinite(m.pd?.emax?.value) && m.pd.emax.value>0 &&
    Number.isFinite(m.pd?.ec50?.value) && m.pd.ec50.value>0;
}
function replay(cert){
  const m=cert.model;
  if(!validModel(m)) return {contract:false,replay:false,rows:0,maxPk:Infinity,maxPd:Infinity};
  if(!Array.isArray(cert.predictions) || cert.predictions.length===0) return {contract:true,replay:false,rows:0,maxPk:Infinity,maxPd:Infinity};
  const kel=m.clearance.value/m.volume.value;
  const c0=m.dose.value/m.volume.value;
  let maxPk=0,maxPd=0;
  let ok=true;
  for(const row of cert.predictions){
    const t=Number(row.time_h), observed=Number(row.concentration_mg_L), observedEffect=Number(row.effect);
    if(!Number.isFinite(t)||t<0||!Number.isFinite(observed)||!Number.isFinite(observedEffect)){ok=false;continue;}
    const expected=c0*Math.exp(-kel*t);
    const expectedEffect=m.pd.e0.value + m.pd.emax.value*expected/(m.pd.ec50.value+expected);
    const ep=relErr(observed,expected), ed=relErr(observedEffect,expectedEffect);
    maxPk=Math.max(maxPk,ep); maxPd=Math.max(maxPd,ed);
    if(ep>1e-9 || ed>1e-9) ok=false;
  }
  return {contract:true,replay:ok,rows:cert.predictions.length,maxPk,maxPd};
}
async function verifySignature(payload, env){
  if(!crypto?.subtle) return {supported:false,valid:false,error:"Web Crypto unavailable"};
  try{
    const key=await crypto.subtle.importKey("raw",b64bytes(env.public_key_raw_b64),{name:"Ed25519"},false,["verify"]);
    const valid=await crypto.subtle.verify({name:"Ed25519"},key,b64bytes(env.signature_b64),enc.encode(payload));
    return {supported:true,valid};
  }catch(e){
    return {supported:false,valid:false,error:String(e)};
  }
}
function effectivePolicy(cert, derived, strict){
  if(strict){
    return {
      pass: cert.assurance_class==="formal" &&
        derived.C_PK_CONTRACT==="FORMALLY_VERIFIED_UNDER_ASSUMPTIONS" &&
        derived.C_PK_REPLAY==="FORMALLY_VERIFIED_UNDER_ASSUMPTIONS",
      description:"Requires formal assurance for both claims"
    };
  }
  const req=cert.policy?.required_claims||{};
  for(const [id,allowed] of Object.entries(req)){
    if(!Array.isArray(allowed) || !allowed.includes(derived[id]||"MISSING")) return {pass:false,description:"Certificate policy"};
  }
  return {pass:true,description:"Certificate policy"};
}
function tamperedCertificate(cert){
  const x=clone(cert);
  const row=x.predictions?.find(r=>r.time_h===4) || x.predictions?.[0];
  if(row) row.concentration_mg_L=Number(row.concentration_mg_L)+0.75;
  return x;
}
function formatErr(x){ return Number.isFinite(x)?x.toExponential(2):"—"; }
function shortHash(x){ return x?x.slice(0,12)+"…"+x.slice(-8):"—"; }

async function runVerification(){
  $("verify").disabled=true;
  try{
    if(!envelope || envelope.format!=="pcs-browser-signed-envelope-v1") throw new Error("Unsupported envelope format.");
    const originalCert=JSON.parse(envelope.signed_payload);
    const isTampered=$("tamper").checked;
    const cert=isTampered?tamperedCertificate(originalCert):originalCert;
    const activePayload=isTampered?stableStringify(cert):envelope.signed_payload;

    const digest=await sha256Text(activePayload);
    const integrity=digest===envelope.certificate_sha256;
    const sig=await verifySignature(activePayload,envelope);
    const calcFingerprint=await sha256Bytes(b64bytes(envelope.public_key_raw_b64));
    const fingerprintMatches=calcFingerprint===envelope.public_key_fingerprint_sha256;
    const scientific=replay(cert);

    const derived={
      C_PK_CONTRACT:scientific.contract?"COMPUTATIONALLY_SUPPORTED":"FALSIFIED_OR_CHECK_FAILED",
      C_PK_REPLAY:scientific.replay?"COMPUTATIONALLY_SUPPORTED":"FALSIFIED_OR_CHECK_FAILED"
    };
    const policy=effectivePolicy(cert,derived,$("strictPolicy").checked);

    setStatus("replayCard","replayStatus",scientific.replay?"pass":"fail",scientific.replay?"PASS":"FAIL");
    setStatus("integrityCard","integrityStatus",integrity?"pass":"fail",integrity?"PASS":"FAIL");
    if(!sig.supported) setStatus("authCard","authStatus","warn","UNSUPPORTED");
    else setStatus("authCard","authStatus",(sig.valid&&fingerprintMatches)?"pass":"fail",(sig.valid&&fingerprintMatches)?"VERIFIED":"INVALID");
    setStatus("policyCard","policyStatus",policy.pass?"pass":"fail",policy.pass?"PASS":"FAIL");

    $("contractDot").className="dot "+(scientific.contract?"pass":"fail");
    $("replayDot").className="dot "+(scientific.replay?"pass":"fail");
    $("contractText").textContent=scientific.contract?"Restricted model contract satisfied.":"Restricted model contract failed.";
    $("replayText").textContent=scientific.replay?"All prediction rows independently reproduced within 1e-9 relative tolerance.":"At least one prediction does not reproduce from the declared model.";

    $("hashShort").textContent=shortHash(digest);
    $("fingerprintShort").textContent=shortHash(envelope.public_key_fingerprint_sha256);
    $("rowsReplayed").textContent=String(scientific.rows);
    $("pkError").textContent=formatErr(scientific.maxPk);
    $("pdError").textContent=formatErr(scientific.maxPd);
    $("certificateView").textContent=JSON.stringify(cert,null,2);

    lastReceipt={
      format:"pcs-browser-verification-receipt-v1",
      verified_at:new Date().toISOString(),
      source:sourceName,
      certificate_sha256_observed:digest,
      certificate_sha256_expected:envelope.certificate_sha256,
      signer_fingerprint_sha256:envelope.public_key_fingerprint_sha256,
      dimensions:{
        scientific_replay:scientific.replay?"PASS":"FAIL",
        sha256_integrity:integrity?"PASS":"FAIL",
        ed25519_signature:sig.supported?((sig.valid&&fingerprintMatches)?"VERIFIED":"INVALID"):"UNSUPPORTED",
        reviewer_policy:policy.pass?"PASS":"FAIL"
      },
      derived_claims:derived,
      replay:{
        rows:scientific.rows,
        max_pk_relative_error:scientific.maxPk,
        max_pd_relative_error:scientific.maxPd,
        tolerance:1e-9
      },
      reviewer_policy:policy.description,
      browser_note:"Generated entirely client-side. This demo receipt is not a production PCS attestation."
    };
    $("downloadReceipt").disabled=false;
  }catch(e){
    ["replay","integrity","auth","policy"].forEach(name=>setStatus(name+"Card",name+"Status","fail","ERROR"));
    $("certificateView").textContent="Verification error: "+String(e);
    lastReceipt=null;$("downloadReceipt").disabled=true;
  }finally{
    $("verify").disabled=false;
  }
}
function resetReference(){
  envelope=JSON.parse($("referenceEnvelope").textContent);
  sourceName="Built-in signed reference";
  $("sourceLabel").textContent="Built-in reference";
  $("tamper").checked=false;$("strictPolicy").checked=false;
  $("certificateView").textContent=JSON.stringify(JSON.parse(envelope.signed_payload),null,2);
  runVerification();
}
function downloadReceipt(){
  if(!lastReceipt)return;
  const blob=new Blob([JSON.stringify(lastReceipt,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="pcs-browser-verification-receipt.json";a.click();URL.revokeObjectURL(url);
}
$("verify").addEventListener("click",runVerification);
$("loadReference").addEventListener("click",resetReference);
$("tamper").addEventListener("change",runVerification);
$("strictPolicy").addEventListener("change",runVerification);
$("downloadReceipt").addEventListener("click",downloadReceipt);
$("fileInput").addEventListener("change",async ev=>{
  const file=ev.target.files?.[0]; if(!file)return;
  try{
    envelope=JSON.parse(await file.text());
    sourceName=file.name;$("sourceLabel").textContent=file.name;
    $("tamper").checked=false;
    await runVerification();
  }catch(e){
    $("certificateView").textContent="Could not read package: "+String(e);
  }
});
resetReference();
