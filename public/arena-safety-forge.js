import {
  SAFETY_LAB_VERSION,ACTIONS,GUARDS,MAX_STEPS,MAX_TRIALS,
  scenarioForSeed,initialState,applyAction,replayActions,verifyShield
} from "./safety-forge-core.mjs";
import {classifyPolicyTrials,traceFrames} from "./arena-lab-tools.mjs";

// All gameplay is local. These are the only two network requests, each
// triggered by a separate explicit research-data donation or erasure click.
const $=id=>document.getElementById(id);
const actionById=new Map(ACTIONS.map(a=>[a.id,a]));
let seed=1,mission=null,mode="attack",agent=initialState(),acted=[],ended=false;
let shield=new Set(),attacks=[],repairs=[],hinted=false,lastCheck=null;
let hintExposed=false,oracleExposed=false,repairFeedbackExposed=false,tourStep=0;
let verifiedPolicies=new Map(),traceScene=null,tracePointer=0,checkedGuards=[];
const tour=[
  ["Find a loophole 🔎","Tap actions to experiment with a fictional bot. Try routes, request permission, and look for a safety failure."],
  ["Build a better shield 🛡️","Choose Repair the shield, then flip protection switches on and off. Cheap fixes are great, but don't stop the real mission."],
  ["Check and level up 🏆","Check every possible state. Green means no unsafe behavior is reachable AND the intended mission can still finish. Then try another seed."]
];
function renderTour(){const [title,description]=tour[tourStep];
  $("forgeTourTitle").textContent=title;$("forgeTourText").textContent=description;
  $("forgeTourCount").textContent=(tourStep+1)+" / "+tour.length;
  $("forgeTourBack").disabled=tourStep===0;
  $("forgeTourNext").textContent=tourStep===tour.length-1?"Start playing →":"Next →";
}
$("forgeShowTutorial").addEventListener("click",()=>{tourStep=0;renderTour();$("forgeTutorial").hidden=false;$("forgeTutorial").scrollIntoView({behavior:"smooth",block:"center"});});
$("forgeTourBack").addEventListener("click",()=>{tourStep=Math.max(0,tourStep-1);renderTour();});
$("forgeTourNext").addEventListener("click",()=>{if(tourStep===tour.length-1){$("forgeTutorial").hidden=true;$("forgeActionCards").querySelector("button")?.focus();}else{tourStep++;renderTour();}});
$("forgeTourSkip").addEventListener("click",()=>{$("forgeTutorial").hidden=true;});
renderTour();
$("forgeAdult").addEventListener("change",()=>{
  $("forgeConsent").checked=$("forgeAdult").checked;
  $("forgeOptStatus").textContent=$("forgeAdult").checked?"Opted in for this mission. Nothing has been uploaded.":"Research sharing is switched off.";
});
const badges={counterexample:false,verified_repair:false,overblocking:false};

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
function renderBadges(){
  const names=[];
  if(badges.counterexample)names.push("🔎 Counterexample detective");
  if(badges.overblocking)names.push("🧩 Overblocking spotted");
  if(badges.verified_repair)names.push("🛡️ Shield architect");
  $("forgeAchievements").textContent=names.length?names.join(" · "):"🏅 Earn your first safety badge!";
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
  renderRouteMap(state);
  stats();
}
// Side-by-side strategy notebook: never infer score from a player's declaration.
// All comparisons are computed with exactly the same deterministic verifier used
// for the existing research session and its server-side independent replay.
function policyKey(ids){return [...ids].sort().join("|");}
function renderStrategyBoard(){
  const root=$("forgeStrategyBoard");root.replaceChildren();
  if(!repairs.length){
    addText(root,"p","No tested shields yet. Try a guard combination and press Check every possible state.");return;
  }
  const ranked=classifyPolicyTrials(repairs.map(trial=>{
    const key=policyKey(trial.guards);
    if(!verifiedPolicies.has(key))verifiedPolicies.set(key,verifyShield(seed,trial.guards));
    return {guards:[...trial.guards],result:verifiedPolicies.get(key)};
  }));
  for(const item of ranked.slice(0,8)){
    const row=addText(root,"div","","forge-strategy-row");
    row.dataset.rating=String(item.rating);
    const icon=addText(row,"span",item.result.passed?"🏆":item.result.safe?"🚧":"⚠️","forge-strategy-icon");
    const copy=addText(row,"div","","forge-strategy-copy");
    addText(copy,"strong",item.label+" · "+item.result.score+"/100");
    addText(copy,"small",item.guards.length+" shields · cost "+item.result.guard_cost+" · "+item.result.checked_states+" states inspected");
    addText(copy,"small",item.guards.map(id=>GUARDS.find(g=>g.id===id)?.label||id).join(" + ")||"No shields");
    const button=addText(row,"button","Load","forge-strategy-load");
    button.type="button";button.title="Load this previously verified shield configuration";
    button.addEventListener("click",()=>{
      shield=new Set(item.guards);repairFeedbackExposed=true;lastCheck=null;
      renderGuards();$("forgeCheckerPath").hidden=true;$("forgeVictoryNext").hidden=true;
      $("forgeVerification").className="forge-verification";
      $("forgeVerification").textContent="Loaded a prior verified configuration. Run a fresh check before declaring a new result.";
      addLog("🧩 Restored earlier shield recipe ("+item.result.guard_cost+" cost units).");
      $("forgeGuardCards").scrollIntoView({behavior:"smooth",block:"nearest"});
    });
  }
}
function renderRouteMap(state){
  const root=$("forgeRouteMap");root.replaceChildren();
  const milestones=[
    ["🔎","Site inspected",state.inspected],["🗝️","Human approved",state.authorized],
    ["🛤️","Reached site",state.at_site],["🚀","Device deployed",state.deployed],
    ["📡","Report shared",state.shared]
  ];
  for(const [icon,label,done] of milestones){
    const el=addText(root,"div","","forge-route-step");
    el.dataset.done=String(done);
    addText(el,"span",icon+" "+label);
    addText(el,"b",done?"✓":"○");
  }
}
function renderTraceScene(){
  const root=$("forgeTracePlayer"),scene=traceScene;
  root.hidden=!scene;
  if(!scene)return;
  const frame=scene.frames[tracePointer];
  $("forgeTraceTitle").textContent=scene.title;
  $("forgeTraceIndex").textContent="Action "+(tracePointer+1)+" of "+scene.frames.length;
  $("forgeTraceProgress").max=scene.frames.length;
  $("forgeTraceProgress").value=tracePointer+1;
  const label=actionById.get(frame.action)?.label||frame.action;
  $("forgeTraceStage").textContent=(frame.unsafe?"🔴 SAFETY FAILURE":frame.blocked?"🚧 BLOCKED":frame.goal?"🟢 MISSION COMPLETE":"🤖 ACTION EXECUTED")+
    " — "+label+(frame.reason?" · "+frame.reason:"")+
    (frame.violations.length?" · "+frame.violations.join(", ").replaceAll("_"," "):"");
  $("forgeTraceStage").dataset.state=frame.unsafe?"unsafe":frame.blocked?"blocked":frame.goal?"goal":"normal";
  $("forgeTraceState").textContent="Risk: "+frame.before.risk+" → "+frame.after.risk+
    " · authorization: "+(frame.after.authorized?"yes":"no")+
    " · inspection: "+(frame.after.inspected?"yes":"no")+
    " · consent: "+(frame.after.consented?"yes":"no")+
    " · redacted: "+(frame.after.redacted?"yes":"no");
  $("forgeTracePrev").disabled=tracePointer===0;
  $("forgeTraceNext").disabled=tracePointer>=scene.frames.length-1;
}
function startTrace(title,guardList,actions){
  if(!Array.isArray(actions)||!actions.length)return;
  const frames=traceFrames(seed,guardList,actions);
  if(!frames.length)return;
  traceScene={title,frames};tracePointer=0;renderTraceScene();
  $("forgeTracePlayer").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function renderTheaterButtons(){
  $("forgeShowCounterexample").disabled=!lastCheck?.counterexample?.sequence?.length;
  $("forgeShowSafe").disabled=!lastCheck?.safe_mission?.length;
  $("forgeShowLastAttack").disabled=!attacks.length;
}
$("forgeShowCounterexample").addEventListener("click",()=>{
  if(lastCheck?.counterexample?.sequence)startTrace("Shortest discovered unsafe route",checkedGuards,lastCheck.counterexample.sequence);
});
$("forgeShowSafe").addEventListener("click",()=>{
  if(lastCheck?.safe_mission)startTrace("A legitimate mission the verified shield still permits",checkedGuards,lastCheck.safe_mission);
});
$("forgeShowLastAttack").addEventListener("click",()=>{
  if(attacks.length)startTrace("My actual recorded attack · existing mission shield",mission.initial_guards,attacks.at(-1).actions);
});
$("forgeTracePrev").addEventListener("click",()=>{if(tracePointer>0){tracePointer--;renderTraceScene();}});
$("forgeTraceNext").addEventListener("click",()=>{if(traceScene&&tracePointer<traceScene.frames.length-1){tracePointer++;renderTraceScene();}});

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
    badges.counterexample=true;renderBadges();
    addLog("🧠 Counterexample discovered: this exact trace can be replayed. Try repairing the guardrail system.","unsafe");
    $("forgeTabRepair").textContent="🛠️ 2 · Repair the shield ✨";
  }
  if(ended&&!event.unsafe&&!event.goal)addLog("Experiment ended. Every attempt, including failures, can inform search.","");
  if(ended){
    recordAttack(); // Record locally only; never auto-upload.
    $("forgeGoRepair").hidden=false;
    $("forgeCoach").textContent=event.unsafe
      ?"🎯 You found a breach! Try repairing the shield and blocking every unsafe route."
      :event.goal?"✅ The bot completed this route. Can you protect every possible route?"
      :"🧪 Your attempt is saved locally. Try another route or repair the shield.";
  }else{
    $("forgeCoach").textContent=event.blocked
      ?"🚧 That action was blocked. Try a different route or strategy."
      :"🤖 The bot acted. Keep exploring until you find a failure or reach the goal.";
  }
  agentStatus();renderActionCards();
}
function recordAttack(){
  if(!acted.length)return false;
  if(attacks.length>=MAX_TRIALS){addLog("Notebook full for attack trials; start a new mission to continue.");return false;}
  const entry={actions:[...acted],assisted:hintExposed||oracleExposed};
  if(!attacks.some(x=>JSON.stringify(x.actions)===JSON.stringify(entry.actions))){
    attacks.push(entry);
    const result=replayActions(seed,mission.initial_guards,entry.actions);
    addLog("🧾 Trace recorded ("+result.events.length+" steps, "+(result.unsafe?"unsafe witness found":"no unsafe witness")+")",result.unsafe?"unsafe":"");
  }else addLog("This same trace is already in your notebook; no duplicate saved.");
  stats();renderTheaterButtons();return true;
}
function resetAttack(record=true){
  if(record)recordAttack();
  agent=initialState();acted=[];ended=false;hinted=false;
  $("forgeAttackNotice").textContent="New local experiment ready! Change the order or choose another route.";
  $("forgeAttackNotice").className="forge-notice";
  $("forgeHintPanel").hidden=true;$("forgeGoRepair").hidden=true;
  $("forgeCoach").textContent="🔎 Part 1: experiment with actions and find a safety problem. You can always restart.";
  agentStatus();renderActionCards();
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
      $("forgeCheckerPath").hidden=true;$("forgeVictoryNext").hidden=true;updateGuardCost();
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
    lastCheck=result;checkedGuards=[...shield];verifiedPolicies.set(policyKey(checkedGuards),result);
    if(result.passed)badges.verified_repair=true;
    if(result.safe&&!result.live)badges.overblocking=true;
    renderBadges();
    const trial={guards:[...shield].sort(),feedback_exposed:repairFeedbackExposed};
    if(!repairs.some(x=>JSON.stringify(x.guards)===JSON.stringify(trial.guards))){
      if(repairs.length<MAX_TRIALS)repairs.push(trial);
      else addLog("Notebook full for shield trials; you can keep practicing.", "");
    }
    $("forgeVictoryNext").hidden=!result.passed;
    $("forgeCoach").textContent=result.passed
      ?"🏆 Your shield passed! Can you beat your score, or try a new world?"
      :result.safe?"🚧 Safe, but too restrictive. Remove a guard to let the real mission finish."
      :"🔎 A counterexample remains. Study its path, adjust your switches, and check again.";
    const status=$("forgeVerification");
    status.className="forge-verification "+(result.passed?"passed":"failed");
    status.textContent=result.passed
      ?"🏆 VERIFIED IN THE GAME! All "+result.checked_states+" reachable states checked, no violation, and the legitimate mission can finish. Score: "+result.score+"/100. Shield cost: "+result.guard_cost+"."
      :!result.safe
      ?"🔎 Counterexample found. After checking "+result.checked_states+" states, your policy still allows "+result.counterexample.violations.join(", ").replaceAll("_"," ")+". Keep improving the shield!"
      :"🚧 No unsafe trace found in "+result.checked_states+" states, but your shield blocks completing the legitimate mission. Safety without usefulness is not a win.";
    repairFeedbackExposed=true;
    if(result.counterexample)oracleExposed=true;
    const path=$("forgeCheckerPath");path.replaceChildren();path.hidden=false;
    const actions=result.counterexample?.sequence||result.safe_mission||[];
    const h=result.counterexample?"Shortest discovered counterexample":"Example safe mission path";
    addText(path,"strong",h);
    const ol=document.createElement("ol");
    for(const id of actions)addText(ol,"li",actionById.get(id)?.label||id);
    path.appendChild(ol);
    addLog("🔬 Bounded shield check: "+(result.passed?"VALID REPAIR":result.safe?"OVERBLOCKED MISSION":"UNSAFE")+" · "+result.checked_states+" states · score "+result.score,result.passed?"pass":result.safe?"":"unsafe");
    stats();renderStrategyBoard();renderTheaterButtons();
  }catch(e){$("forgeVerification").textContent=e.message;$("forgeVerification").className="forge-verification failed";}
}
function selectSeed(nextSeed){
  seed=nextSeed;mission=scenarioForSeed(seed);
  attacks=[];repairs=[];shield=new Set(mission.initial_guards);lastCheck=null;
  checkedGuards=[];verifiedPolicies=new Map();traceScene=null;tracePointer=0;
  $("forgeTracePlayer").hidden=true;
  hintExposed=false;oracleExposed=false;repairFeedbackExposed=false;
  $("forgeWorldIcon").textContent=mission.icon;$("forgeMissionTitle").textContent=mission.name;
  $("forgeMissionStory").textContent=mission.story+" Shortcut risk: "+mission.shortcut_risk+"; budget: "+mission.risk_budget+". Report: "+(mission.report_sensitive?"sensitive — permission matters":"public telemetry — no personal consent needed")+". Each seed has its own rules.";
  $("forgeMissionGoal").textContent=mission.mission;
  $("forgeSeed").textContent=String(seed);
  $("forgeTabRepair").textContent="🛠️ 2 · Repair the shield";
  $("forgeAdult").checked=false;$("forgeConsent").checked=false;
  $("forgeOptStatus").textContent="";$("forgeVictoryNext").hidden=true;
  $("forgeDonateMessage").textContent="";
  $("forgeEventLog").replaceChildren();
  addLog("🎲 Generated scenario "+seed+". Challenge: find a counterexample, then redesign the shield.");
  showMode("attack");resetAttack(false);renderGuards();renderStrategyBoard();renderTheaterButtons();
  try{
    const url=new URL(location.href);
    url.searchParams.set("seed",String(seed));
    url.searchParams.delete("guards"); // A new mission must not inherit an old remixed policy.
    history.replaceState({},"",url.pathname+url.search+url.hash);
  }catch{ /* Browser URL decoration is optional. */ }
}
$("forgeGoRepair").addEventListener("click",()=>{recordAttack();showMode("repair");$("forgeGuardCards").scrollIntoView({behavior:"smooth",block:"nearest"});});
$("forgeVictoryNext").addEventListener("click",()=>selectSeed(1+Math.floor(Math.random()*9999999)));
$("forgeTabAttack").addEventListener("click",()=>showMode("attack"));
$("forgeTabRepair").addEventListener("click",()=>{if(acted.length)recordAttack();showMode("repair");});
$("forgeNew").addEventListener("click",()=>selectSeed(1+Math.floor(Math.random()*9999999)));
$("forgeDaily").addEventListener("click",()=>selectSeed(1+(Math.floor(Date.now()/86400000)%9999999)));
$("forgeShare").addEventListener("click",async()=>{
  const output=$("forgeShareStatus");
  try{
    if(!navigator.clipboard?.writeText)throw Error("Copy unavailable in this browser.");
    await navigator.clipboard.writeText(location.href);
    output.textContent="Challenge link copied. Anyone can replay the same seed.";
  }catch(e){output.textContent="Copy unavailable; copy the page URL to share this seed.";}
});
$("forgeResetAttack").addEventListener("click",()=>resetAttack());
$("forgeFinishAttack").addEventListener("click",()=>{recordAttack();resetAttack(false);});
$("forgeHint").addEventListener("click",()=>{
  hinted=true;hintExposed=true;
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
  $("forgeVerification").className="forge-verification";$("forgeCheckerPath").hidden=true;$("forgeVictoryNext").hidden=true;
  renderTheaterButtons();
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
  if(!$("forgeAdult").checked||!$("forgeConsent").checked){msg.textContent="Turn on research sharing to confirm that you are 18+ and agree to donate this mission. Anyone can play.";$("forgeOptStatus").textContent=msg.textContent;$("forgeAdult").focus();return;}
  if(attacks.length+repairs.length<2){msg.textContent="Try at least two different experiments first (agent routes or shield checks).";$("forgeOptStatus").textContent=msg.textContent;return;}
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
  finally{$("forgeOptStatus").textContent=msg.textContent;button.disabled=false;}
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
renderBadges();
