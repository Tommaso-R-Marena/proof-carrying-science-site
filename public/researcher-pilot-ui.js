import {DEFAULTS, makePilotDraft, emailSummary} from "./researcher-pilot-core.mjs";

const form=document.getElementById("pilotDraftForm");
const error=document.getElementById("pilotDraftError");
const result=document.getElementById("pilotDraftResult");
const preview=document.getElementById("pilotDraftPreview");
const download=document.getElementById("pilotDownload");
const email=document.getElementById("pilotEmail");
let lastDraft=null, lastInput=null;

function read() {
  const data=Object.fromEntries(new FormData(form));
  return data;
}
function clear() {
  error.hidden=true;
  result.hidden=true;
  lastDraft=null;
  lastInput=null;
}
function loadExample() {
  for(const [name,value] of Object.entries(DEFAULTS)){
    const field=form.elements.namedItem(name);
    if(field)field.value=value;
  }
  clear();
}
function saveJson(obj) {
  const blob=new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="pcs-independent-pilot-plan.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
form.addEventListener("input",clear);
form.addEventListener("change",clear);
form.addEventListener("submit",event=>{
  event.preventDefault();
  clear();
  try{
    const input=read();
    const draft=makePilotDraft(input);
    lastDraft=draft;
    lastInput=input;
    preview.textContent=JSON.stringify(draft,null,2);
    result.hidden=false;
    result.scrollIntoView({behavior:"smooth",block:"nearest"});
  }catch(cause){
    error.textContent=cause instanceof Error?cause.message:"This plan could not be validated.";
    error.hidden=false;
  }
});
document.getElementById("pilotExample").addEventListener("click",loadExample);
download.addEventListener("click",()=>{if(lastDraft)saveJson(lastDraft)});
email.addEventListener("click",()=>{
  if(!lastInput)return;
  const summary=emailSummary(lastInput);
  window.location.href="mailto:marenatommaso@gmail.com?subject="+encodeURIComponent("PCS independent research pilot — "+lastInput.track)+"&body="+encodeURIComponent(summary);
});
loadExample();
