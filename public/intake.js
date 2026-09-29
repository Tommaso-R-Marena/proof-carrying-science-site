const $=id=>document.getElementById(id);
const enc=new TextEncoder();
let claimN=0,assumptionN=0,lastIntake=null,lastHash=null;

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function stableStringify(v){
  if(v===null||typeof v!=="object")return JSON.stringify(v);
  if(Array.isArray(v))return "["+v.map(stableStringify).join(",")+"]";
  return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stableStringify(v[k])).join(",")+"}";
}
async function sha256Text(s){
  const digest=await crypto.subtle.digest("SHA-256",enc.encode(s));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function claimCard(v={}){
  claimN++;
  const div=document.createElement("div");div.className="rowcard";div.dataset.kind="claim";
  div.innerHTML=`
    <header><h3>Claim</h3><button class="smallbutton remove" type="button">Remove</button></header>
    <div class="grid2">
      <div class="field"><label>Claim ID</label><input class="textinput cid" value="${esc(v.id||("C"+claimN))}"></div>
      <div class="field"><label>Desired assurance</label><select class="selectinput assurance">
        ${["computational","formal","empirical","mixed"].map(x=>`<option ${x===(v.desired_assurance||"computational")?"selected":""}>${x}</option>`).join("")}
      </select></div>
    </div>
    <div class="field"><label>Claim statement</label><textarea class="statement">${esc(v.statement||"")}</textarea></div>
    <div class="field"><label>Rationale</label><textarea class="rationale">${esc(v.rationale||"")}</textarea></div>`;
  div.querySelector(".remove").onclick=()=>{div.remove();refresh()};
  div.querySelectorAll("input,textarea,select").forEach(x=>x.addEventListener("input",refresh));
  $("claims").appendChild(div);
}
function assumptionCard(v={}){
  assumptionN++;
  const div=document.createElement("div");div.className="rowcard";div.dataset.kind="assumption";
  div.innerHTML=`
    <header><h3>Assumption</h3><button class="smallbutton remove" type="button">Remove</button></header>
    <div class="field"><label>Assumption ID</label><input class="textinput aid" value="${esc(v.id||("A"+assumptionN))}"></div>
    <div class="field"><label>Statement</label><textarea class="astatement">${esc(v.statement||"")}</textarea></div>`;
  div.querySelector(".remove").onclick=()=>{div.remove();refresh()};
  div.querySelectorAll("input,textarea").forEach(x=>x.addEventListener("input",refresh));
  $("assumptions").appendChild(div);
}
function build(){
  const claims=[...$("claims").querySelectorAll('[data-kind="claim"]')].map(x=>({
    id:x.querySelector(".cid").value.trim(),
    statement:x.querySelector(".statement").value.trim(),
    desired_assurance:x.querySelector(".assurance").value,
    rationale:x.querySelector(".rationale").value.trim()
  }));
  const assumptions=[...$("assumptions").querySelectorAll('[data-kind="assumption"]')].map(x=>({
    id:x.querySelector(".aid").value.trim(),
    statement:x.querySelector(".astatement").value.trim()
  }));
  return {
    intake_format:"pcs-pilot-intake-v1",
    pilot_id:$("pilotId").value.trim(),
    workflow_summary:$("workflow").value.trim(),
    claims,
    assumptions,
    data_classification:$("classification").value,
    notes:$("notes").value.trim()
  };
}
function validate(x){
  const errs=[],idrx=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
  if(!idrx.test(x.pilot_id))errs.push("Pilot ID must use letters, numbers, . _ : - and begin with a letter/number.");
  if(!x.workflow_summary)errs.push("Workflow summary is required.");
  if(x.claims.length<1)errs.push("At least one claim is required.");
  const ids=[];
  for(const c of x.claims){
    if(!idrx.test(c.id))errs.push("Every claim needs a valid ID.");
    if(!c.statement)errs.push(`Claim ${c.id||"(unnamed)"} needs a statement.`);
    ids.push(c.id);
  }
  for(const a of x.assumptions){
    if(!idrx.test(a.id))errs.push("Every assumption needs a valid ID.");
    if(!a.statement)errs.push(`Assumption ${a.id||"(unnamed)"} needs a statement.`);
    ids.push(a.id);
  }
  const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
  if(dup.length)errs.push("IDs must be unique across claims and assumptions: "+[...new Set(dup)].join(", "));
  return errs;
}
async function refresh(){
  const intake=build(),errs=validate(intake);
  $("preview").textContent=JSON.stringify(intake,null,2);
  const v=$("validation");
  if(errs.length){
    v.className="validation bad";v.textContent=errs.join(" ");
    $("semanticHash").textContent="—";$("downloadIntake").disabled=true;$("downloadLock").disabled=true;
    lastIntake=null;lastHash=null;return;
  }
  const h=await sha256Text(stableStringify(intake));
  lastIntake=intake;lastHash=h;
  v.className="validation good";v.textContent="Valid intake. The semantic commitment below is computed from canonical JSON in this browser.";
  $("semanticHash").textContent=h;$("downloadIntake").disabled=false;$("downloadLock").disabled=false;
}
function downloadJson(name,obj){
  const blob=new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
function loadPkpd(){
  $("claims").innerHTML="";$("assumptions").innerHTML="";claimN=assumptionN=0;
  $("pilotId").value="PCS-DEMO-PKPD-001";
  $("workflow").value="Synthetic one-compartment IV-bolus PK with direct Emax PD; verify the restricted model contract and analytic replay only.";
  $("classification").value="synthetic";
  $("notes").value="No biological, clinical, regulatory, or model-adequacy claim is requested.";
  claimCard({id:"C_PK_CONTRACT",statement:"The PK model artifact satisfies the restricted positivity and dimensional contract.",desired_assurance:"computational",rationale:"Establish the representation, unit, and positivity contract before output replay."});
  claimCard({id:"C_PK_REPLAY",statement:"The prediction artifact matches the declared analytic one-compartment IV-bolus PK and direct Emax PD model within the stated numeric tolerance.",desired_assurance:"computational",rationale:"Independently replay the declared equations against the delivered output artifact."});
  assumptionCard({id:"A_PK_MODEL",statement:"The restricted one-compartment IV-bolus equation is the declared computational model; no claim of biological adequacy is made."});
  refresh();
}
function clearAll(){
  $("claims").innerHTML="";$("assumptions").innerHTML="";claimN=assumptionN=0;
  $("pilotId").value="PCS-PILOT-001";$("workflow").value="";$("classification").value="non_sensitive";$("notes").value="";
  claimCard({id:"C1"});assumptionCard({id:"A1"});refresh();
}
$("addClaim").onclick=()=>{claimCard();refresh()};
$("addAssumption").onclick=()=>{assumptionCard();refresh()};
$("loadPkpd").onclick=loadPkpd;$("clearAll").onclick=clearAll;
$("downloadIntake").onclick=()=>{if(lastIntake)downloadJson("pilot_intake.json",lastIntake)};
$("downloadLock").onclick=()=>{if(lastIntake&&lastHash)downloadJson("pilot_intake.lock.json",{lock_format:"pcs-pilot-intake-lock-v1",frozen_at:new Date().toISOString(),intake_semantic_hash:lastHash,intake:lastIntake})};
["pilotId","workflow","classification","notes"].forEach(id=>$(id).addEventListener("input",refresh));
loadPkpd();
