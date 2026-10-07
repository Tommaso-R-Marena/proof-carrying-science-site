import {
 TASKS,PROOFLAB_VERSION,CORE_SOURCE_COMMIT,findTask,proofPlan,nextReady,
 repairPuzzle,scopePuzzle,evaluateSession,taskDeck
} from "./prooflab-core.mjs";
const $=id=>document.getElementById(id);
const state={id:TASKS[0].id,actions:[],placed:[],invalid:0,hints:0,repair:null,interpretation:null,
  graph:false,diary:[],checked:null,filter:"all",module:"all",term:"",submitted:false};
const txt=(parent,tag,value,cls)=>{
 const x=document.createElement(tag);x.textContent=String(value);
 if(cls)x.className=cls;parent.appendChild(x);return x;
};
function selectTask(id,{reset=true}={}){
 const task=findTask(id);
 if(!task)return false;
 state.id=task.id;
 if(reset){
  state.actions=[];state.placed=[];state.invalid=0;state.hints=0;
  state.repair=null;state.interpretation=null;state.graph=false;state.checked=null;state.submitted=false;
  $("labAdult").checked=false;$("labConsent").checked=false;
  $("labDonateStatus").textContent="No research data has been submitted.";
  $("labResult").hidden=true;
 }
 const plan=proofPlan(id);
 $("labDomain").textContent=task.module+" · "+(task.split==="challenge"?"PUBLIC CHALLENGE":"PRACTICE");
 $("labDifficulty").textContent="Complexity "+Math.min(5,1+Math.floor(task.statement.length/160)+(task.syntactic_reference_mentions.length?1:0))+"/5";
 $("labTaskTitle").textContent=task.name;
 $("labTaskContext").textContent="This is a real Lean theorem header. The strategy cards are a separate learning exercise, not its actual proof or dependency graph.";
 $("labStatement").textContent=task.statement;
 $("labSourceLine").textContent=task.source.path+":"+task.source.line;
 $("labSourceRevision").textContent="Pinned "+CORE_SOURCE_COMMIT.slice(0,12);
 $("labSourceStatus").textContent="Source pinned · Lean kernel result NOT checked here";
 $("labSourceStatus").title=task.source.blob_sha;
 $("labRepairFeedback").textContent="Select the missing dependency. Your answer is not sent anywhere automatically.";
 $("labScopeFeedback").textContent="Choose the best interpretation and commit your confidence.";
 $("labPlanFeedback").textContent="Inspect the theorem before building your strategy. Incorrect moves are instructive.";
 $("labGraphBox").hidden=true;$("labShowGraph").setAttribute("aria-expanded","false");
 $("labShowGraph").textContent="🕸️ X-ray graph (hint)";
 renderRepair();renderScope();renderCards();renderTasks();
 try{const url=new URL(location.href);url.searchParams.set("task",task.id);history.replaceState({},"",url.pathname+url.search+url.hash);}catch{}
 return true;
}
function visibleTasks(){
 return taskDeck(state.filter).filter(t=>(state.module==="all"||t.module===state.module)&&
 (t.id+" "+findTask(t.id).statement).toLowerCase().includes(state.term));
}
function renderModuleButtons(){
 const root=$("labModules");root.replaceChildren();
 const opts=["all",...new Set(taskDeck(state.filter).map(t=>t.module))];
 for(const module of opts){
  const btn=txt(root,"button",module==="all"?"All modules":module);
  btn.type="button";btn.setAttribute("aria-pressed",String(module===state.module));
  btn.addEventListener("click",()=>{state.module=module;renderModuleButtons();renderTasks();});
 }
}
function renderTasks(){
 const root=$("labTaskList");root.replaceChildren();
 const found=visibleTasks();
 if(!found.length){txt(root,"p","No matching real theorem statements.");return;}
 for(const task of found){
  const btn=txt(root,"button","");btn.type="button";btn.setAttribute("role","listitem");
  btn.setAttribute("aria-current",String(task.id===state.id));btn.title="Read and plan "+task.name;
  txt(btn,"strong",task.name);
  const sub=txt(btn,"small",task.module+" · Complexity "+task.difficulty+"/5");
  if(task.split==="challenge")txt(sub,"span","Public challenge","lab-task-chip challenge");
  btn.addEventListener("click",()=>selectTask(task.id));
 }
}
function localScore(){
 const n=proofPlan(state.id).nodes.length;
 const max=Math.floor(40*state.placed.length/n);
 return Math.max(0,(state.placed.length===n?60:max)+(state.repair?.correct?20:0)+
  (state.interpretation?.correct?20:0)-4*state.invalid-5*state.hints);
}
function renderCards(){
 const plan=proofPlan(state.id),ready=new Set(nextReady(state.id,state.placed).map(x=>x.id)),done=new Set(state.placed);
 $("labStageCount").textContent=state.placed.length+" / "+plan.nodes.length;
 $("labInvalidCount").textContent=String(state.invalid);
 $("labHintCount").textContent=String(state.hints);
 $("labScore").textContent=String(localScore());
 $("labPathNarrator").textContent=state.placed.length===plan.nodes.length?"All educational stages connected. The Lean kernel has NOT been run.":state.placed.length+" stages ordered.";
 $("labUndo").disabled=!state.placed.length;
 const lane=$("labLane");lane.replaceChildren();
 if(!state.placed.length){txt(lane,"span","Drop cards here or tap a card below.","lab-lane-empty");}
 state.placed.forEach((id,index)=>{
  const node=plan.nodes.find(x=>x.id===id);
  const block=txt(lane,"div","","lab-lane-step");
  txt(block,"b",String(index+1).padStart(2,"0"));txt(block,"span",node.label);
 });
 const root=$("labCards");root.replaceChildren();
 const order=[...plan.nodes].sort((a,b)=>a.label.localeCompare(b.label));
 for(const node of order){
  const status=done.has(node.id)?"done":ready.has(node.id)?"ready":"waiting";
  const b=txt(root,"button","","lab-card");
  b.type="button";b.dataset.status=status;b.draggable=status!=="done";b.disabled=status==="done";
  b.setAttribute("aria-label",node.label+"; "+(status==="ready"?"ready":"not ready")+"; "+node.description);
  txt(b,"strong",node.label);txt(b,"small",node.description);
  const missing=node.needs.filter(dep=>!done.has(dep));
  txt(b,"em",status==="done"?"✓ Already placed":status==="ready"?"✦ Ready to investigate":missing.length+" prerequisite(s) missing");
  b.addEventListener("click",()=>placeNode(node.id));
  b.addEventListener("dragstart",e=>{e.dataTransfer?.setData("text/plain",node.id);});
 }
 if(state.graph)renderGraph();
}
function placeNode(id){
 if(state.actions.length>=78){$("labPlanFeedback").textContent="Research action limit reached. Start another attempt.";return;}
 const plan=proofPlan(state.id),node=plan.nodes.find(n=>n.id===id);
 if(!node||state.placed.includes(id))return;
 const missing=node.needs.filter(dep=>!state.placed.includes(dep)),correct=missing.length===0;
 state.actions.push({kind:"place",node:id});
 if(correct){
  state.placed.push(id);
  $("labPlanFeedback").textContent="✅ "+node.label+" is ready. "+(plan.nodes.length-state.placed.length)+" strategy stages remain.";
 }else{
  state.invalid++;
  $("labPlanFeedback").textContent="🔎 Blocked: "+missing.map(x=>plan.nodes.find(n=>n.id===x).label).join(" + ")+". Try a prerequisite first.";
 }
 state.checked=null;$("labResult").hidden=true;
 renderCards();
}
function undo(){
 if(!state.placed.length||state.actions.length>=78)return;
 const last=state.placed.pop();state.actions.push({kind:"undo"});
 $("labPlanFeedback").textContent="↶ Removed "+proofPlan(state.id).nodes.find(n=>n.id===last).label+". Try a different path.";
 state.checked=null;$("labResult").hidden=true;renderCards();
}
function hintGraph(){
 state.graph=!state.graph;
 if(state.graph&&state.hints<8&&state.actions.length<78){
  state.hints++;state.actions.push({kind:"hint"});
 }
 $("labGraphBox").hidden=!state.graph;
 $("labShowGraph").setAttribute("aria-expanded",String(state.graph));
 $("labShowGraph").textContent=state.graph?"Hide X-ray":"🕸️ X-ray graph (hint)";
 renderCards();
}
function renderGraph(){
 const plan=proofPlan(state.id),levels=new Map(),memo=new Map();
 const depth=id=>{
  if(memo.has(id))return memo.get(id);
  const n=plan.nodes.find(z=>z.id===id);
  const d=n.needs.length?1+Math.max(...n.needs.map(depth)):0;
  memo.set(id,d);return d;
 };
 for(const n of plan.nodes){const d=depth(n.id);if(!levels.has(d))levels.set(d,[]);levels.get(d).push(n);}
 const maxLevel=Math.max(...levels.keys()),maxCols=Math.max(...[...levels.values()].map(x=>x.length));
 const w=Math.max(710,maxCols*183+50),h=(maxLevel+1)*105+24,boxW=165,boxH=63;
 const positions=new Map();
 for(const [d,nodes] of levels){
  const start=(w-nodes.length*183+18)/2;
  nodes.forEach((n,i)=>positions.set(n.id,{x:start+i*183,y:20+d*105}));
 }
 const svg=$("labGraph"),NS="http://www.w3.org/2000/svg";svg.replaceChildren();svg.setAttribute("viewBox","0 0 "+w+" "+h);
 const el=(tag,attrs,parent=svg)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));parent.appendChild(n);return n;};
 for(const edge of plan.edges){
  const a=positions.get(edge.from),b=positions.get(edge.to);
  el("path",{d:"M "+(a.x+boxW/2)+" "+(a.y+boxH)+" C "+(a.x+boxW/2)+" "+(a.y+boxH+25)+" "+(b.x+boxW/2)+" "+(b.y-23)+" "+(b.x+boxW/2)+" "+b.y,
    fill:"none",stroke:"#8196b0","stroke-width":"2"});
 }
 for(const n of plan.nodes){
  const p=positions.get(n.id),placed=state.placed.includes(n.id),ready=nextReady(state.id,state.placed).some(x=>x.id===n.id);
  const group=el("g",{transform:"translate("+p.x+","+p.y+")"});
  el("rect",{width:boxW,height:boxH,rx:"11",stroke:placed?"#218b73":ready?"#c58f34":"#93a5b9",fill:placed?"#e8f7ee":ready?"#fff6e5":"#edf3fa","stroke-width":2},group);
  const title=el("title",{},group);title.textContent=n.label;
  const words=n.label.split(" "),rows=[""];
  for(const word of words){if((rows.at(-1)+" "+word).trim().length>21&&rows.length<3)rows.push(word);else rows[rows.length-1]=(rows.at(-1)+" "+word).trim();}
  const text=el("text",{"font-size":11,"text-anchor":"middle",x:boxW/2,y:24,fill:"#254665","font-weight":"700"},group);
  rows.forEach((row,i)=>{const t=el("tspan",{x:boxW/2,dy:i?15:0},text);t.textContent=row;});
 }
}
function renderRepair(){
 const puzzle=repairPuzzle(state.id);
 $("labRepairTarget").textContent=puzzle.target_label;
 const root=$("labRepairOptions");root.replaceChildren();
 for(const opt of puzzle.choices){
  const button=txt(root,"button",opt.label);button.type="button";
  button.setAttribute("aria-pressed",String(state.repair?.choice===opt.id));
  button.disabled=state.repair!==null;
  button.addEventListener("click",()=>commitRepair(opt.id));
 }
}
function commitRepair(choice){
 if(state.repair||state.actions.length>=78)return;
 const p=repairPuzzle(state.id);
 state.repair={choice,correct:choice===p.missing_source};
 state.actions.push({kind:"repair",choice});
 $("labRepairFeedback").textContent=state.repair.correct?
  "✅ Found the missing prerequisite. This is an educational graph repair; it is not a Lean proof repair.":
  "🔬 The missing stage was "+proofPlan(state.id).nodes.find(n=>n.id===p.missing_source).label+". A wrong repair is useful negative training data.";
 $("labResult").hidden=true;state.checked=null;
 renderRepair();renderCards();
}
function renderScope(){
 const p=scopePuzzle(state.id);
 $("labScopeQuestion").textContent=p.question;
 const root=$("labScopeOptions");root.replaceChildren();
 for(const choice of p.choices){
  const label=txt(root,"label","");
  const input=document.createElement("input");input.type="radio";input.name="prooflabScope";input.value=choice.id;
  input.disabled=state.interpretation!==null;input.checked=state.interpretation?.choice===choice.id;
  label.appendChild(input);txt(label,"span",choice.label);
 }
 $("labCommitScope").disabled=state.interpretation!==null;
 $("labConfidence").disabled=state.interpretation!==null;
 if(!state.interpretation)$("labConfidence").value="1";
}
function commitScope(){
 if(state.interpretation||state.actions.length>=78)return;
 const opt=document.querySelector('input[name="prooflabScope"]:checked');
 if(!opt){$("labScopeFeedback").textContent="Select a claim interpretation before committing.";return;}
 const confidence=Number($("labConfidence").value),p=scopePuzzle(state.id);
 state.interpretation={choice:opt.value,confidence,correct:opt.value===p.correct};
 state.actions.push({kind:"scope",choice:opt.value,confidence});
 $("labScopeFeedback").textContent=(state.interpretation.correct?"✅ Scoped correctly. ":"⚠️ Overclaim rejected. ")+p.explanation+" No real-world safety conclusion follows without independent evidence.";
 $("labResult").hidden=true;state.checked=null;renderScope();renderCards();
}
function payload(){return{version:PROOFLAB_VERSION,task_id:state.id,actions:state.actions.map(a=>({...a}))};}
function runAssessment(){
 if(state.actions.length<3){$("labAssessment").textContent="Make at least three decisions before checking your workshop.";return null;}
 let result;
 try{result=evaluateSession(payload());}
 catch(error){$("labAssessment").textContent="The evaluator refused this session: "+error.message;return null;}
 state.checked=result;
 const view=$("labResult");view.replaceChildren();view.hidden=false;
 txt(view,"strong","Workshop score "+result.score+"/100 · "+(result.game_scaffold_passed?"All educational challenges complete":"Progress recorded"));
 txt(view,"p",result.placed.length+"/"+result.planned_stages+" scaffold steps · "+
  result.invalid_moves+" blocked moves · "+result.hints+" hints · missing-link "+
  (result.repair.correct?"repaired":"not repaired")+" · scope "+(result.interpretation.correct?"correct":"open/incorrect"));
 txt(view,"small","Lean kernel proof verified: NO. Game success is not an authority decision, a candidate proof term, or scientific validation.");
 $("labAssessment").textContent=result.game_scaffold_passed?"Strong educational result. Actual theorem verification remains a separate requirement.":
  "Partial or incorrect learning path. Continue building, repair and critique before making any assurance claim.";
 state.diary.unshift({id:state.id,score:result.score,steps:result.attempted_actions.length});
 state.diary=state.diary.slice(0,10);renderDiary();
 return result;
}
function renderDiary(){
 const root=$("labDiary");root.replaceChildren();
 $("labDiaryCount").textContent=String(state.diary.length);
 for(const row of state.diary){txt(root,"li",row.id+" · "+row.score+"/100 · "+row.steps+" decisions");}
}
function dailyTask(){
 const daily=Math.floor(Date.now()/86400000);
 return TASKS[daily%TASKS.length].id;
}
function rotateTask(){
 const list=visibleTasks().length?visibleTasks():taskDeck("all");
 let index=list.findIndex(x=>x.id===state.id);
 selectTask(list[(index+1)%list.length].id);
 $("labWorkspace").scrollIntoView({behavior:"smooth",block:"start"});
}
async function api(path,data){
 const resp=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(data)});
 const body=await resp.json().catch(()=>({message:"The PCS API did not return JSON."}));
 if(!resp.ok||!body.ok)throw Error(body.message||body.error||"Research API unavailable.");
 return body;
}
async function donate(){
 const status=$("labDonateStatus");
 if(!state.checked||state.checked.attempted_actions.length<6||!state.repair||!state.interpretation){
  status.textContent="Complete at least six decisions, both reflection challenges, and check your result before donating.";return;
 }
 if(!$("labAdult").checked||!$("labConsent").checked){
  status.textContent="No research request sent: confirm both 18+ eligibility and explicit consent.";return;
 }
 const button=$("labDonate");button.disabled=true;status.textContent="Independently replaying your bounded strategy on PCS…";
 try{
  const data=await api("/api/arena/prooflab/donate",{version:PROOFLAB_VERSION,task_id:state.id,
   actions:payload().actions,adult_confirmation:true,consent_training:true});
  state.submitted=true;
  status.textContent=data.recorded?
   "Your source-backed educational planning trace was stored. "+data.score+"/100; Lean proof verified: NO.":
   "That exact session was already stored. No duplicate was created.";
 }catch(error){
  status.textContent="No donation was confirmed. A response can fail after storage; retry to check for duplicates, or use Erase. "+
   "Error: "+error.message;
 }finally{button.disabled=false;}
}
async function erase(){
 if(!confirm("Erase all your active ProofLab research donations? Previous exports and learned model weights may not be fully retractable."))return;
 try{const r=await api("/api/arena/prooflab/erase",{});$("labDonateStatus").textContent="Deleted "+r.deleted+" active ProofLab research row(s).";}
 catch(error){$("labDonateStatus").textContent=error.message;}
}
$("labFilter").addEventListener("change",e=>{state.filter=e.target.value;state.module="all";renderModuleButtons();renderTasks();});
$("labFind").addEventListener("input",e=>{state.term=e.target.value.trim().toLowerCase();renderTasks();});
$("labUndo").addEventListener("click",undo);
$("labShowGraph").addEventListener("click",hintGraph);
$("labLane").addEventListener("dragover",e=>e.preventDefault());
$("labLane").addEventListener("drop",e=>{
 e.preventDefault();const id=e.dataTransfer?.getData("text/plain");
 if(proofPlan(state.id).nodes.some(x=>x.id===id))placeNode(id);
});
$("labCommitScope").addEventListener("click",commitScope);
$("labCheck").addEventListener("click",runAssessment);
$("labReset").addEventListener("click",()=>selectTask(state.id));
$("labNewMission").addEventListener("click",rotateTask);
$("labDonate").addEventListener("click",donate);
$("labErase").addEventListener("click",erase);
$("labCopyStatement").addEventListener("click",async()=>{
 try{await navigator.clipboard.writeText(findTask(state.id).statement);$("labCopyStatement").textContent="Copied ✓";}
 catch{$("labCopyStatement").textContent="Unavailable";}
});
for(const [button,id] of [["labJumpPlan","labPlanSection"],["labJumpRepair","labRepairSection"],["labJumpScope","labScopeSection"]]){
 $(button).addEventListener("click",()=>{
  document.querySelectorAll(".lab-journey button").forEach(x=>x.classList.remove("current"));
  $(button).classList.add("current");
  $(id).scrollIntoView({behavior:"smooth",block:"start"});
 });
}
const fromUrl=new URLSearchParams(location.search).get("task");
renderModuleButtons();selectTask(findTask(fromUrl)?.id||dailyTask());renderDiary();
