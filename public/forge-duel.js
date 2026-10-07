import {GUARDS} from "./safety-forge-core.mjs";
import {DUEL_VERSION,DUEL_ROUNDS,DUEL_REASONS,duelFor,evaluateDuelVote,evaluateDuelSession} from "./forge-duel-core.mjs";
const $=id=>document.getElementById(id);
const guardNames=new Map(GUARDS.map(g=>[g.id,g]));
let seed=197,round=0,ballots=[],points=0,streak=0,duel=null,chosen=null,correctTotal=0;
function addText(parent,tag,text,cls){
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  el.textContent=text;parent.appendChild(el);return el;
}
function selectionReason(){
  return document.querySelector('input[name="duelReason"]:checked')?.value||"uncertain";
}
function selectionConfidence(){
  return Number(document.querySelector('input[name="duelConfidence"]:checked')?.value||1);
}
function cleanScene(){
  $("duelReveal").hidden=true;$("duelFinish").hidden=true;
  $("duelCardA").dataset.verdict="pending";$("duelCardB").dataset.verdict="pending";
  for(const id of ["A","B"]){
    $("duelEvidence"+id).hidden=true;
    $("duelEvidence"+id).replaceChildren();
    $("duelPick"+id).disabled=false;
  }
  $("duelPickNeither").disabled=false;
  chosen=null;
  $("duelReasons").querySelector('input[value="uncertain"]').checked=true;
  document.querySelector('input[name="duelConfidence"][value="1"]').checked=true;
}
function policyCard(id,policy){
  const target=$("duelGuards"+id);target.replaceChildren();
  $("duelCost"+id).textContent="Budget cost "+policy.cost;
  for(const guardId of policy.guards){
    const g=guardNames.get(guardId);
    const guard=addText(target,"div","","duel-guard");
    addText(guard,"span",g.icon,"duel-guard-icon");
    const info=addText(guard,"span","","duel-guard-info");
    addText(info,"strong",g.label);
    addText(info,"small",g.detail);
  }
  if(!policy.guards.length){
    addText(target,"p","No active safeguards. The robot can follow every action.","duel-empty-policy");
  }
}
function updateStats(){
  $("duelScore").textContent=String(points);
  $("duelStreak").textContent=String(streak);
  $("duelAccuracy").textContent=ballots.length?Math.round(correctTotal/ballots.length*100)+"%":"—";
  $("duelProgress").setAttribute("aria-valuenow",String(ballots.length));
  $("duelProgressFill").style.width=(ballots.length/DUEL_ROUNDS*100)+"%";
  $("duelTrialCount").textContent=ballots.length+" of "+DUEL_ROUNDS;
}
function openRound(){
  cleanScene();duel=duelFor(seed,round);
  $("duelWorld").textContent=duel.scenario.icon+" "+duel.scenario.name;
  $("duelRound").textContent="Round "+(round+1)+" of "+DUEL_ROUNDS;
  $("duelMissionTitle").textContent=duel.category;
  $("duelMission").textContent=duel.scenario.mission;
  $("duelRisk").textContent="RISK LIMIT "+duel.scenario.risk_budget+
    (duel.scenario.report_sensitive?" · PRIVATE REPORT":" · PUBLIC REPORT");
  $("duelCaseLabel").textContent="Evaluate safety, mission completion, then safeguard cost. Hidden verifier results will appear after your decision.";
  policyCard("A",duel.A);policyCard("B",duel.B);
  updateStats();
}
function explainPolicy(id,oracle){
  const el=$("duelEvidence"+id),safe=oracle.safe,live=oracle.live;
  el.hidden=false;
  addText(el,"strong",oracle.passed?"✅ SAFE + MISSION WORKS":safe?"🚧 SAFE, BUT MISSION BLOCKED":"❌ COUNTEREXAMPLE FOUND");
  addText(el,"p","Safety: "+(safe?"yes":"no")+" · Mission possible: "+(live?"yes":"no")+" · Checker states explored: "+oracle.checked_states);
  if(oracle.counterexample) {
    addText(el,"p","Failure class: "+oracle.counterexample.violations.map(x=>x.replaceAll("_"," ").toLowerCase()).join("; "),"duel-failure");
    addText(el,"p","Witness trace: "+oracle.counterexample.sequence.join(" → "),"duel-witness");
  }else if(oracle.safe_mission) addText(el,"p","A valid route: "+oracle.safe_mission.join(" → "),"duel-witness");
  const remix=document.createElement("a");
  remix.className="duel-remix";remix.textContent="🧪 Remix this guard recipe in Safety Forge →";
  const url=new URL("arena-safety-forge.html",location.href);
  url.searchParams.set("seed",String(seed));url.searchParams.set("guards",duel[id].guards.join(","));
  remix.href=url.pathname+url.search;el.appendChild(remix);
}
function reveal(choice){
  if(chosen!==null)return;
  // Freeze exactly the inputs seen by the human, before any oracle is displayed.
  chosen=choice;
  const ballot={seed,round,version:DUEL_VERSION,choice,reason:selectionReason(),confidence:selectionConfidence()};
  const verdict=evaluateDuelVote(ballot);
  ballots.push(ballot);
  if(verdict.correct){streak++;correctTotal++;}
  else streak=0;
  const earned=verdict.correct?100+(streak>1?Math.min(80,(streak-1)*15):0):0;
  points+=earned;updateStats();
  for(const id of ["A","B"]){
    const info=duel.oracle[id],card=$("duelCard"+id);
    card.dataset.verdict=info.passed?"pass":info.safe?"blocked":"unsafe";
    explainPolicy(id,info);$("duelPick"+id).disabled=true;
  }
  $("duelPickNeither").disabled=true;
  const winner=duel.oracle.winner;
  const outcome=winner==="neither"?"NEITHER":winner==="either"?"EITHER":winner;
  $("duelResultIcon").textContent=verdict.correct?"🏆":"🧠";
  $("duelResultTitle").textContent=verdict.correct?"Well spotted. The check agrees.":"A useful mistake. Here is what the verifier found.";
  $("duelEarned").textContent="+"+earned+" XP";
  $("duelResultBody").textContent="Verifier verdict: "+outcome+
    ". You chose "+(choice==="neither"?"neither":choice)+
    ". Correctness: "+(verdict.correct?"yes":"not this time")+
    ". Confidence: "+["","unsure","somewhat sure","very sure"][ballot.confidence]+".";
  const details=$("duelExplain");details.replaceChildren();
  const costA=duel.oracle.A.guard_cost,costB=duel.oracle.B.guard_cost;
  const heading=addText(details,"strong","Why this answer is checkable");
  const msg=winner==="neither"?
    "Neither candidate passed BOTH safety and mission liveness. Rejecting both is stronger than accepting an unsafe or unusable policy.":
    winner==="either"?"Both candidates passed and used equal-cost guards. The toy oracle is indifferent between them.":
    "The valid shield takes priority over any unsafe or overblocking plan. If both pass, the cheaper guard set wins. Cost "+costA+" vs "+costB+".";
  addText(details,"p",msg);
  addText(details,"small","The verifier searched the finite simulation (depth 7). This verdict is NOT about an actual autonomous AI system or a Lean certificate.");
  $("duelReveal").hidden=false;
  $("duelNext").textContent=round===DUEL_ROUNDS-1?"See my tournament result →":"Next showdown →";
  $("duelReveal").scrollIntoView({behavior:"smooth",block:"center"});
}
function finish(){
  $("duelFinish").hidden=false;
  const accuracy=Math.round(correctTotal/DUEL_ROUNDS*100);
  $("duelFinishTitle").textContent=accuracy>=85?"Legendary shield detective!":accuracy>=60?"Expert in training!":"Every failed case teaches a new rule.";
  $("duelFinishDescription").textContent="You earned "+points+" local XP and matched the bounded verifier on "+
    correctTotal+" of "+DUEL_ROUNDS+" cases ("+accuracy+"%). Your blind reason/confidence labels are saved in this browser session ONLY, unless you explicitly donate them as a verified adult.";
  $("duelFinish").scrollIntoView({behavior:"smooth",block:"center"});
}
function next(){
  if(chosen===null)return;
  if(round<DUEL_ROUNDS-1){round++;openRound();}
  else finish();
}
function newTournament(id){
  seed=id;round=0;ballots=[];points=0;streak=0;correctTotal=0;
  $("duelAdult").checked=false;$("duelConsent").checked=false;
  $("duelDonateMessage").textContent="";
  try{
    const url=new URL(location.href);url.searchParams.set("seed",String(seed));
    history.replaceState({},"",url.pathname+url.search+url.hash);
  }catch{}
  openRound();window.scrollTo({top:0,behavior:"smooth"});
}
async function copySeed(){
  try{await navigator.clipboard.writeText(location.href);$("duelDonateMessage").textContent="Challenge link copied.";}
  catch{$("duelDonateMessage").textContent="Copy the URL to share this tournament seed.";}
}
async function researchApi(path,body){
  if(typeof path!=="string"||!path.startsWith("/api/")||
     !["/api/arena/forge-duel/donate","/api/arena/forge-duel/erase"].includes(path))
    throw Error("Only reviewed same-origin Duel research actions are permitted.");
  const resp=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(body)});
  const data=await resp.json().catch(()=>({message:"The PCS API did not return JSON."}));
  if(!resp.ok||!data.ok)throw Error(data.message||data.error||"Research API request failed.");
  return data;
}
async function donate(){
  const status=$("duelDonateMessage");
  if(ballots.length!==DUEL_ROUNDS){status.textContent="Finish all 8 decisions before sharing the research record.";return;}
  if(!$("duelAdult").checked||!$("duelConsent").checked){status.textContent="Research donation requires both explicit 18+ and consent checkboxes. Gameplay stays private otherwise.";return;}
  const button=$("duelDonate");button.disabled=true;status.textContent="Independently checking the 8 donated decisions…";
  try{
    // Free Workers allow 10 ms CPU/request. Verify one small batch per request;
    // one explicit donation click sends up to three separate, fail-closed batches.
    // If interrupted, only completed batches are committed; users can retry.
    let recorded=0,duplicates=0;
    for(let i=0;i<ballots.length;i+=3){
      const chunk=ballots.slice(i,i+3);
      const checked=evaluateDuelSession({session_version:DUEL_VERSION,ballots:chunk});
      if(checked.ballots.length!==chunk.length)throw Error("Incomplete bounded duel batch.");
      const result=await researchApi("/api/arena/forge-duel/donate",{
        session_version:DUEL_VERSION,ballots:chunk,adult_confirmation:true,consent_training:true
      });
      if(result.recorded)recorded+=result.record_count;
      else duplicates+=result.record_count;
    }
    status.textContent="Verified "+ballots.length+" comparisons. "+recorded+" new decisions stored, "+duplicates+
      " were already donated. Each 2–3 ballot batch was rechecked independently.";
  }catch(err){status.textContent=err.message+" Your play remains local.";}
  finally{button.disabled=false;}
}
async function erase(){
  if(!confirm("Delete all previously donated Forge Duel votes from the active PCS research database?"))return;
  try{
    const r=await researchApi("/api/arena/forge-duel/erase",{});
    $("duelDonateMessage").textContent="Deleted "+r.deleted+" stored tournament(s). Historical backups/exports can have separate retention.";
  }catch(err){$("duelDonateMessage").textContent=err.message;}
}
for(const r of DUEL_REASONS){
  const label=addText($("duelReasons"),"label","","duel-reason");
  const input=document.createElement("input");input.type="radio";input.name="duelReason";
  input.value=r.id;input.checked=r.id==="uncertain";label.append(input);
  addText(label,"span",r.label);
}
$("duelPickA").addEventListener("click",()=>reveal("A"));
$("duelPickB").addEventListener("click",()=>reveal("B"));
$("duelPickNeither").addEventListener("click",()=>reveal("neither"));
$("duelNext").addEventListener("click",next);
$("duelAgain").addEventListener("click",()=>newTournament(1+Math.floor(Math.random()*9999999)));
$("duelDaily").addEventListener("click",()=>newTournament(1+(Math.floor(Date.now()/86400000)%9999999)));
$("duelShare").addEventListener("click",copySeed);
$("duelDonate").addEventListener("click",donate);
$("duelErase").addEventListener("click",erase);
document.addEventListener("keydown",event=>{
  if(chosen!==null||event.repeat||event.altKey||event.ctrlKey||event.metaKey||
     ["INPUT","TEXTAREA","SELECT","BUTTON"].includes(event.target?.tagName))return;
  if(event.key==="1")reveal("A");
  if(event.key==="2")reveal("B");
  if(event.key==="3")reveal("neither");
});
const fromUrl=Number(new URLSearchParams(location.search).get("seed"));
newTournament(Number.isSafeInteger(fromUrl)&&fromUrl>=1&&fromUrl<=9999999?fromUrl:197);
