import {
  SAFETY_LAB_VERSION,ACTIONS,GUARDS,MAX_STEPS,MAX_TRIALS,
  scenarioForSeed,initialState,applyAction,replayActions,verifyShield
} from "./safety-forge-core.mjs";

// All gameplay is local. These are the only two network requests, each
// triggered by a separate explicit research-data donation or erasure click.
const $=id=>document.getElementById(id);
const actionById=new Map(ACTIONS.map(a=>[a.id,a]));
let seed=1,mission=null,mode="attack",agent=initialState(),acted=[],ended=false;
let shield=new Set(),attacks=[],repairs=[],hinted=false,lastCheck=null;

async function researchApi(path,body){
  if(typeof path!=="string"||!path.startsWith("/api/")||!["/api/arena/safety-lab/donate","/api/arena/safety-lab/erase"].includes(path))throw Error("Unsupported same-origin research endpoint.");
  const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({message:"Invalid response."}));
  if(!response.ok)throw Error(data.message||"Research request failed.");
  return data;
}
function addText(parent,tag,text,cls=""){
  const element=document.createElement(tag);if(cls)element.className=cls;
  element.textContent=text;parent.appendChild(element);return element;
}
function addLog(message,status=""){
  const log=$("forgeEventLog"),li=document.createElement("li");li.className=status;li.textContent=message;
  if(log.children.length===1&&log.firstElementChild.textContent==="Choose an action to begin...")log.replaceChildren();
  log.prepend(li);
  while(log.children.length>35)log.lastElementChild.remove();
}
function stats(){
  $("forgeNotebook").textContent=(attacks.length+repairs.length)+" recorded experiments";
  $("forgeAttemptCounts").textContent=attacks.length+" agent traces · "+repairs.length+" shield trials";
}
function agentStatus(state=agent){
  $("forgeRisk").textContent=state.risk+" / "+mission.risk_budget;
  $("forgeRiskFill").style.width=Math.min(100,100*state.risk/mission.risk_budget)+"%";
  const rows=[
    ["🔎 Site inspected",state.inspected],
    ["🗝️ Authorized",state.authorized],
    ["🤝 Data consent",state.consented],
    ["🗺️ At mission site",state.at_site],
    ["🚀 Device deployed",state.deployed],
    ["📡 Report shared",state.shared],
  ];
  const target=$("forgeStateBadges");target.replaceChildren();
  for(const [name,flag] of rows){const row=addText(target,"div","", "forge-state-row");addText(row,"span",name);addText(row,"b",flag?"YES":"NOT YET",flag?"":"pending");}
  const list=$("forgeCurrentGuards");list.replaceChildren();
  if(!mission.initial_guards.length)addText(list,"span","No safety rules enabled yet.");
  for(const g of mission.initial_guards)addText(list,"span",(GUARDS.find(v=>v.id===g)?.icon||"🛡️")+" "+(GUARDS.find(v=>v.id===g)?.label||g));
  $("forgeActionCounter").textContent=acted.length+" / "+MAX_STEPS+" actions";
  stats();
}
function showMode(next){
  mode=next;
  $("forgeAttackPanel").hidden=next!=="attack";
  $("forgeRepairPanel").hidden=next!=="repair";
  for(const [id,active] of [["forgeTabAttack",next==="attack"],["forgeTabRepair",next==="repair"]]){
    $(id).classList.toggle("active",active);$(id).setAttribute("aria-pressed",String(active));
  }
  if(next==="repair")renderGuards();
}
function renderActionCards(){
  const target=$("forgeActionCards");target.replaceChildren();
  for(const action of ACTIONS){
    const button=document.createElement("button");
    button.type="button";button.className="forge-action";
    button.disabled=ended||acted.length>=MAX_STEPS;
    const icon=addText(button,"span",action.icon,"forge-action-icon");
    const wrap=addText(button,"span","");
    addText(wrap,"strong",action.label);
    addText(wrap,"small",action.detail);
    button.addEventListener("click",()=>play(action.id));
    target.appendChild(button);
  }
}
function play(action){
  if(ended||acted.length>=MAX_STEPS)return;
  const event=applyAction(seed,mission.initial_guards,agent,action);
  const display=actionById.get(action);
  acted.push(action);agent=event.after;
  let summary=display.icon+" "+display.label+": ";
  summary+=event.blocked?"BLOCKED — "+event.reason
    :event.unsafe?"SAFETY FAILURE — "+event.violations.join(", ").replaceAll("_"," ")
    :event.goal?"Safe mission completed!":"Executed; no failure yet.";
  addLog(summary,event.unsafe?"unsafe":event.goal?"pass":"");
  const notice=$("forgeAttackNotice");notice.textContent=summary;
  notice.classList.toggle("unsafe",event.unsafe);notice.classList.toggle("goal",event.goal);
  ended=event.unsafe||event.goal||acted.length>=MAX_STEPS;
  if(event.unsafe){
    addLog("🧠 Counterexample discovered: this exact trace can be replayed. Try repairing the guardrail system.","unsafe");
    $("forgeTabRepair").textContent="🛠️ 2 · Repair the shield ✨";
  }
  if(ended&&!event.unsafe&&!event.goal)addLog("Experiment ended. Every attempt, including failures, can inform search.","");
  agentStatus();renderActionCards();
}
function recordAttack(){
  if(!acted.length)return false;
  if(attacks.length>=MAX_TRIALS){addLog("Notebook full for attack trials; start a new mission to continue.");return false;}
  const entry={actions:[...acted]};
  if(!attacks.some(x=>JSON.stringify(x)===JSON.stringify(entry))){
    attacks.push(entry);
    const result=replayActions(seed,mission.initial_guards,entry.actions);
    addLog("🧾 Trace recorded ("+result.events.length+" steps, "+(result.unsafe?"unsafe witness found":"no unsafe witness")+")",result.unsafe?"unsafe":"");
  }else addLog("This same trace is already in your notebook; no duplicate saved.");
  stats();return true;
}
function resetAttack(record=true){
  if(record)recordAttack();
  agent=initialState();acted=[];ended=false;hinted=false;
  $("forgeAttackNotice").textContent="New local experiment ready! Change the order or choose another route.";
  $("forgeAttackNotice").className="forge-notice";
  $("forgeHintPanel").hidden=true;agentStatus();renderActionCards();
}
function renderGuards(){
  const target=$("forgeGuardCards");target.replaceChildren();
  for(const guard of GUARDS){
    const label=document.createElement("label");label.className="forge-guard-toggle";
    const check=document.createElement("input");check.type="checkbox";check.value=guard.id;check.checked=shield.has(guard.id);
    check.addEventListener("change",()=>{
      if(check.checked)shield.add(guard.id);else shield.delete(guard.id);
      lastCheck=null;$("forgeVerification").className="forge-verification";
      $("forgeVerification").textContent="Shield changed. Run the checker to validate this exact configuration.";
      $("forgeCheckerPath").hidden=true;updateGuardCost();
    });
    label.appendChild(check);addText(label,"span",guard.icon,"forge-guard-icon");
    const text=addText(label,"span","");
    addText(text,"strong",guard.label+" · cost "+guard.cost);
    addText(text,"small",guard.detail);
    target.appendChild(label);
  }
  updateGuardCost();
}
function updateGuardCost(){
  const cost=GUARDS.filter(g=>shield.has(g.id)).reduce((n,g)=>n+g.cost,0);
  $("forgeGuardCost").textContent="Shield cost: "+cost;
}
function verify(){
  try{
    const result=verifyShield(seed,[...shield]);
    lastCheck=result;
    const trial={guards:[...shield].sort()};
    if(!repairs.some(x=>JSON.stringify(x)===JSON.stringify(trial))){
      if(repairs.length<MAX_TRIALS)repairs.push(trial);
      else addLog("Notebook full for shield trials; you can keep practicing.", "");
    }
    const status=$("forgeVerification");
    status.className="forge-verification "+(result.passed?"passed":"failed");
    status.textContent=result.passed
      ?"🏆 VERIFIED IN THE GAME! All "+result.checked_states+" reachable states checked, no violation, and the legitimate mission can finish. Score: "+result.score+"/100. Shield cost: "+result.guard_cost+"."
      :!result.safe
      ?"🔎 Counterexample found. After checking "+result.checked_states+" states, your policy still allows "+result.counterexample.violations.join(", ").replaceAll("_"," ")+". Keep improving the shield!"
      :"🚧 No unsafe trace found in "+result.checked_states+" states, but your shield blocks completing the legitimate mission. Safety without usefulness is not a win.";
    const path=$("forgeCheckerPath");path.replaceChildren();path.hidden=false;
    const actions=result.counterexample?.sequence||result.safe_mission||[];
    const h=result.counterexample?"Shortest discovered counterexample":"Example safe mission path";
    addText(path,"strong",h);
    const ol=document.createElement("ol");
    for(const id of actions)addText(ol,"li",actionById.get(id)?.label||id);
    path.appendChild(ol);
    addLog("🔬 Bounded shield check: "+(result.passed?"VALID REPAIR":result.safe?"OVERBLOCKED MISSION":"UNSAFE")+" · "+result.checked_states+" states · score "+result.score,result.passed?"pass":result.safe?"":"unsafe");
    stats();
  }catch(e){$("forgeVerification").textContent=e.message;$("forgeVerification").className="forge-verification failed";}
}
function selectSeed(nextSeed){
  seed=nextSeed;mission=scenarioForSeed(seed);
  attacks=[];repairs=[];shield=new Set(mission.initial_guards);lastCheck=null;
  $("forgeWorldIcon").textContent=mission.icon;$("forgeMissionTitle").textContent=mission.name;
  $("forgeMissionStory").textContent=mission.story+" Shortcut risk: "+mission.shortcut_risk+"; budget: "+mission.risk_budget+". Report: "+(mission.report_sensitive?"sensitive — permission matters":"public telemetry — no personal consent needed")+". Each seed has its own rules.";
  $("forgeMissionGoal").textContent=mission.mission;
  $("forgeSeed").textContent=String(seed);
  $("forgeTabRepair").textContent="🛠️ 2 · Repair the shield";
  $("forgeAdult").checked=false;$("forgeConsent").checked=false;
  $("forgeDonateMessage").textContent="";
  $("forgeEventLog").replaceChildren();
  addLog("🎲 Generated scenario "+seed+". Challenge: find a counterexample, then redesign the shield.");
  showMode("attack");resetAttack(false);renderGuards();
  try{
    const url=new URL(location.href);
    url.searchParams.set("seed",String(seed));
    history.replaceState({},"",url.pathname+url.search+url.hash);
  }catch{ /* Browser URL decoration is optional. */ }
}
$("forgeTabAttack").addEventListener("click",()=>showMode("attack"));
$("forgeTabRepair").addEventListener("click",()=>{if(acted.length)recordAttack();showMode("repair");});
$("forgeNew").addEventListener("click",()=>selectSeed(1+Math.floor(Math.random()*9999999)));
$("forgeResetAttack").addEventListener("click",()=>resetAttack());
$("forgeFinishAttack").addEventListener("click",()=>{recordAttack();resetAttack(false);});
$("forgeHint").addEventListener("click",()=>{
  hinted=true;
  const check=verifyShield(seed,mission.initial_guards);
  const one=check.counterexample?.sequence[0];
  const info=$("forgeHintPanel");info.hidden=false;
  info.textContent=one
    ?"💡 Start experimenting with “"+(actionById.get(one)?.label||one)+"”. It may reveal a way around an existing safeguard; look at each step's outcome."
    :"💡 Think about reaching the site and taking an action before its human authorization or inspection is complete.";
});
$("forgeRestore").addEventListener("click",()=>{
  shield=new Set(mission.initial_guards);renderGuards();lastCheck=null;
  $("forgeVerification").textContent="Original shield restored; run a new bounded check.";
  $("forgeVerification").className="forge-verification";$("forgeCheckerPath").hidden=true;
});
$("forgeVerify").addEventListener("click",verify);
$("forgeClearLog").addEventListener("click",()=>{$("forgeEventLog").replaceChildren();addLog("Experiment view cleared. Notebook traces remain local for this mission.");});
$("forgeDonationJump").addEventListener("click",()=>{
  $("forgeResearch").scrollIntoView({behavior:"smooth",block:"start"});
  $("forgeConsentDisclosure").open=true;
});
$("forgeDonate").addEventListener("click",async()=>{
  const msg=$("forgeDonateMessage");msg.textContent="";
  if(acted.length)recordAttack();
  if(!$("forgeAdult").checked||!$("forgeConsent").checked){msg.textContent="Optional donation requires both adult confirmation and research consent. Everyone can still play.";return;}
  if(attacks.length+repairs.length<2){msg.textContent="Try at least two different experiments first. Gameplay remains private until you choose to donate.";return;}
  const button=$("forgeDonate");button.disabled=true;
  try{
    const result=await researchApi("/api/arena/safety-lab/donate",{
      scenario_seed:seed,scenario_version:SAFETY_LAB_VERSION,
      attack_trials:attacks.slice(0,MAX_TRIALS),repair_trials:repairs.slice(0,MAX_TRIALS),
      adult_confirmation:true,consent_training:true
    });
    msg.textContent=(result.recorded?"Thank you! Your independently replayed experiments were saved. ":"This identical research session was already donated. ")+
      "Breach examples: "+result.unsafe_trials+". Valid repair examples: "+result.valid_repairs+".";
  }catch(e){msg.textContent=e.message+" Your local game remains playable without donation.";}
  finally{button.disabled=false;}
});
$("forgeErase").addEventListener("click",async()=>{
  if(!confirm("Delete all your previously donated Safety Forge sessions from the active database?"))return;
  const msg=$("forgeDonateMessage");msg.textContent="";
  try{
    const result=await researchApi("/api/arena/safety-lab/erase",{});
    msg.textContent="Deleted "+result.deleted+" donated Safety Forge session(s) from the active database. Historic exports or backups may be retained under separate terms.";
  }catch(e){msg.textContent=e.message;}
});
const qs=new URLSearchParams(location.search),fromUrl=Number(qs.get("seed"));
selectSeed(Number.isSafeInteger(fromUrl)&&fromUrl>=1&&fromUrl<=9999999?fromUrl:1+Math.floor(Math.random()*9999999));
