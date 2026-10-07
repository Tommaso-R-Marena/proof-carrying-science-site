import {evaluateTrace,evaluateModel,examples} from "./research-preview-engine.mjs";
const $=id=>document.getElementById(id);
let mode="trace",count=0,last=null;
function sourceInput(){
  if(mode==="trace"){
    return {policy:{forbidden_action:7,max_cumulative_risk:4},
      events:[{action:1,risk:1},{action:Number($("xpAction").value),risk:Number($("xpRisk").value)}]};
  }
  const sample=structuredClone(examples.model_pass);
  sample.tolerance=0.05;
  sample.observations[1].concentration_mg_per_l+=Number($("xpDeviation").value)/100;
  return sample;
}
function updateControlLabels(){
  $("xpRiskValue").textContent=$("xpRisk").value;
  $("xpDeviationValue").textContent=(Number($("xpDeviation").value)/100).toFixed(2)+" mg/L";
}
function markPending(){
  $("xpVerdict").dataset.result="pending";
  $("xpVerdictSymbol").textContent="?";$("xpVerdictTitle").textContent="Your experiment has changed.";
  $("xpVerdictExplain").textContent="Run the check again to recompute the result from the new inputs.";
  $("xpLayerStatus").textContent="NOT RUN";$("xpLayerStatus").className="xp-layer-flag";
  $("xpLayerCheck").textContent="Run your new example to see what its declared rule establishes.";
  $("xpCopy").disabled=true;last=null;
}
function switchMode(next){
  mode=next;
  for(const [id,value] of [["xpTabTrace","trace"],["xpTabModel","model"]]){
    $(id).classList.toggle("active",value===mode);
    $(id).setAttribute("aria-pressed",String(value===mode));
  }
  $("xpTraceControls").hidden=mode!=="trace";$("xpModelControls").hidden=mode!=="model";
  $("xpEvents").replaceChildren();
  const li=document.createElement("li");li.textContent="Set the input and run the check."; $("xpEvents").appendChild(li);
  markPending();
}
function reset(){
  $("xpRisk").value="2";$("xpAction").value="2";$("xpDeviation").value="0";
  updateControlLabels();markPending();
}
function makeFail(){
  if(mode==="trace"){$("xpRisk").value="6";$("xpAction").value="7";}
  else $("xpDeviation").value="18";
  updateControlLabels();
  run();
}
function run(){
  updateControlLabels();
  const input=sourceInput(),result=mode==="trace"?evaluateTrace(input):evaluateModel(input);
  last={input,result};
  count++;
  $("xpRunCount").textContent="Run #"+count;
  const passed=result.verdict==="PASS";
  $("xpVerdict").dataset.result=passed?"pass":"fail";
  $("xpVerdictSymbol").textContent=passed?"✓":"!";
  $("xpVerdictTitle").textContent=passed?"This local check passed.":"This local check found a failure.";
  $("xpVerdictExplain").textContent=result.conclusion;
  $("xpLayerStatus").textContent=passed?"LOCAL PASS":"LOCAL FAIL";
  $("xpLayerStatus").className="xp-layer-flag "+(passed?"yes":"no");
  $("xpLayerCheck").textContent=result.checked;
  $("xpCheckLabel").textContent="Checked in your browser · "+(mode==="trace"?"bounded action trace":"declared numeric tolerance");
  $("xpBoundary").textContent=result.limits;
  const root=$("xpEvents");root.replaceChildren();
  for(const step of result.steps){
    const li=document.createElement("li");
    li.dataset.ok=String(step.passed);
    li.textContent=mode==="trace"
      ?"Action #"+step.action+" · declared risk +"+step.increment+" · total "+step.cumulative_risk+" — "+(step.passed?"within the rule":"VIOLATION")
      :"t="+step.time_h+" h · model "+step.predicted.toFixed(4)+" · supplied "+step.observed.toFixed(4)+" mg/L — "+(step.passed?"within tolerance":"MISMATCH");
    root.appendChild(li);
  }
  $("xpCopy").disabled=false;
}
$("xpTabTrace").addEventListener("click",()=>switchMode("trace"));
$("xpTabModel").addEventListener("click",()=>switchMode("model"));
for(const id of ["xpRisk","xpDeviation"])$(id).addEventListener("input",()=>{updateControlLabels();markPending();});
$("xpAction").addEventListener("change",markPending);
$("xpRun").addEventListener("click",run);
$("xpMakeFail").addEventListener("click",makeFail);
$("xpReset").addEventListener("click",reset);
$("xpCopy").addEventListener("click",async()=>{
  if(!last)return;
  const text="PCS educational browser evaluation (not a certificate)\n"+
    "Example: "+mode+"\nVerdict: "+last.result.verdict+"\n"+
    last.result.conclusion+"\n\nWhat was checked: "+last.result.checked+
    "\nNot checked: "+last.result.limits;
  try{await navigator.clipboard.writeText(text);$("xpCopy").textContent="Copied explanation ✓";}
  catch{$("xpCopy").textContent="Copy unavailable";}
});
reset();run();