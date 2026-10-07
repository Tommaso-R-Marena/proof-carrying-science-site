import {
  PROOFLAB_VERSION,PROOFLAB_REASONS,PROOFLAB_CAMPAIGNS,PROOFLAB_MAX_STEPS,
  allProofLabCases,proofLabCase,replayProofLabSteps,evaluateProofLabSession
} from "./prooflab-core.mjs";
const $=id=>document.getElementById(id);
const CASES=allProofLabCases(),ICON={interpretation:"🔎",premise:"📜",provenance:"🧬","cited-lemma":"🔗",
  "proof-review":"🧠",falsification:"⚔️",uncertainty:"⚠️","external-check":"🔐"};
const KEY="pcs-prooflab-local-v1";
let current=CASES[0],campaign="Binding",actions=[],hints=0,graphOpen=false,coach=false,awarded=false,replayIndex=-1,
  local={xp:0,best:{}};
try{const v=JSON.parse(localStorage.getItem(KEY)||"null");if(v&&Number.isSafeInteger(v.xp)&&v.xp>=0&&
  v.xp<=200000&&v.best&&typeof v.best==="object"&&!Array.isArray(v.best))local=v;}catch{}
function store(){try{localStorage.setItem(KEY,JSON.stringify(local));}catch{}}
const replay=()=>replayProofLabSteps(current.id,actions);
const el=(tag,label,cls)=>{const n=document.createElement(tag);n.textContent=label||"";if(cls)n.className=cls;return n;};
const add=(parent,tag,label,cls)=>{const n=el(tag,label,cls);parent.appendChild(n);return n;};
const report=(message,type="info")=>{const n=$("plFeedback");n.textContent=message;n.dataset.type=type;};
const moveReason=()=>document.querySelector('input[name="plReason"]:checked')?.value||"unsure";
const moveConfidence=()=>Number(document.querySelector('input[name="plConfidence"]:checked')?.value||2);
const threat=()=>document.querySelector('input[name="plThreat"]:checked')?.value||"";
const svg=(tag,props)=>{const x=document.createElementNS("http://www.w3.org/2000/svg",tag);
  for(const [k,v] of Object.entries(props||{}))x.setAttribute(k,String(v));return x;};
function stats(){
 $("plXP").textContent=String(local.xp);
 $("plFinishedCount").textContent=Object.keys(local.best).length+" / 22 completed";
}
function campaigns(){
 const n=$("plCampaigns");n.replaceChildren();
 for(const entry of PROOFLAB_CAMPAIGNS){
  const subset=CASES.filter(x=>x.campaign===entry.id),b=add(n,"button","","pl-campaign");
  b.type="button";b.dataset.active=String(entry.id===campaign);
  add(b,"span",entry.icon,"pl-campaign-icon");
  add(b,"strong",entry.label);
  add(b,"small",entry.description);
  add(b,"span",subset.filter(x=>Object.hasOwn(local.best,x.id)).length+" / "+subset.length+
      " missions completed","pl-campaign-count");
  b.addEventListener("click",()=>load(subset[0].id));
 }
 stats();
}
function missionOptions(){
 const n=$("plMissionSelect");n.replaceChildren();
 const subset=CASES.filter(x=>x.campaign===campaign);
 for(const [i,c] of subset.entries()){
  const opt=add(n,"option",(Object.hasOwn(local.best,c.id)?"✓ ":"")+String(i+1).padStart(2,"0")+" · "+c.theorem);
  opt.value=c.id;
 }
 n.value=current.id;
}
function dossier(){
 const c=current,meta=PROOFLAB_CAMPAIGNS.find(x=>x.id===campaign);
 $("plMissionIcon").textContent=meta?.icon||"🔐";
 $("plTheoremTitle").textContent=c.title;
 $("plTheoremSummary").textContent=c.public_summary;
 $("plTheoremSymbol").textContent=c.theorem;
 $("plSourcePath").textContent=c.source.path+":"+c.source.line;
 $("plSourceRevision").textContent=c.source.revision.slice(0,16)+"…";
 $("plDependencyCount").textContent=c.cited_theorems.length+" real source-cited indexed theorem"+
  (c.cited_theorems.length===1?"":"s");
 const n=$("plThreatCards");n.replaceChildren();
 c.threats.forEach((t,i)=>{
  const lab=add(n,"label",""),r=el("input");r.type="radio";r.name="plThreat";r.value=t;
  lab.append(r,el("span",["🎯","🧯","🛡️","🕳️"][i]+" "+t));
  r.addEventListener("change",render);
 });
 $("plThreatConfidence").value="1";
}
function layout(){
 const m=new Map(current.nodes.map(n=>[n.id,n])),levels=new Map();
 const find=id=>{if(levels.has(id))return levels.get(id);
  const node=m.get(id),d=node.needs.length?Math.max(...node.needs.map(find))+1:0;
  levels.set(id,d);return d;};
 for(const n of current.nodes)find(n.id);
 const byLevel=new Map();
 for(const n of current.nodes){const d=levels.get(n.id);
  if(!byLevel.has(d))byLevel.set(d,[]);byLevel.get(d).push(n);}
 const layers=Math.max(...byLevel.keys())+1,maxRows=Math.max(...[...byLevel.values()].map(x=>x.length));
 const width=Math.max(650,layers*185+35),height=Math.max(240,maxRows*91+37);
 const pos=new Map();
 for(const [layer,nodes] of byLevel)nodes.forEach((n,i)=>{
  pos.set(n.id,{x:17+layer*185,y:17+i*91+Math.max(0,(height-nodes.length*91)/2)});
 });
 return {width,height,pos};
}
function graph(r){
 const root=$("plGraph");root.replaceChildren();
 const {width,height,pos}=layout();root.setAttribute("viewBox","0 0 "+width+" "+height);
 root.style.width=width+"px";root.style.height=height+"px";
 const done=new Set(r.completed_node_ids),ready=new Set(r.next_available);
 for(const n of current.nodes){
  const target=pos.get(n.id);
  for(const dep of n.needs){
   const from=pos.get(dep);
   root.appendChild(svg("path",{
    d:"M"+(from.x+158)+" "+(from.y+31)+" C"+(from.x+171)+" "+(from.y+31)+","+
       (target.x-15)+" "+(target.y+31)+","+target.x+" "+(target.y+31),
    fill:"none",stroke:done.has(dep)?"#3eaa8d":"#b2c8d9","stroke-width":done.has(dep)?2.5:1.6
   }));
  }
 }
 for(const n of current.nodes){
  const {x,y}=pos.get(n.id),complete=done.has(n.id),eligible=ready.has(n.id);
  const group=svg("g",{role:"button",tabindex:0,cursor:complete?"default":"pointer",
    "aria-label":n.label+"; "+(complete?"done":eligible?"ready":"blocked")});
  const title=svg("title");title.textContent=n.label;group.appendChild(title);
  group.appendChild(svg("rect",{x,y,width:158,height:62,rx:9,
    fill:complete?"#ddf8e9":eligible?"#e8f3ff":"#ffffff",
    stroke:complete?"#3caf84":eligible?"#7eadd1":"#c2d1de","stroke-width":complete?2.2:1.4}));
  const ico=svg("text",{x:x+10,y:y+24,"font-size":17});
  ico.textContent=ICON[n.kind]||"🔎";group.appendChild(ico);
  const t=svg("text",{x:x+36,y:y+24,"font-size":10.5,"font-weight":750,fill:"#224566"});
  t.textContent=n.label.length>20?n.label.slice(0,19)+"…":n.label;group.appendChild(t);
  const subt=svg("text",{x:x+10,y:y+46,"font-size":10,fill:complete?"#178a65":"#6a819c"});
  subt.textContent=complete?"✓ Investigated":eligible?"Ready to explore":"Prerequisites missing";group.appendChild(subt);
  group.addEventListener("click",()=>attempt(n.id));
  group.addEventListener("keydown",ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();attempt(n.id);}});
  root.appendChild(group);
 }
 $("plGraphCover").hidden=graphOpen;
}
function cards(r){
 const root=$("plCards");root.replaceChildren(),done=new Set(r.completed_node_ids),ready=new Set(r.next_available);
 for(const n of current.nodes){
  const b=add(root,"button","","pl-card");b.type="button";b.disabled=done.has(n.id);
  b.dataset.state=done.has(n.id)?"done":ready.has(n.id)?"ready":"blocked";
  b.dataset.coach=String(coach&&ready.has(n.id)&&!done.has(n.id));
  b.draggable=!done.has(n.id);
  add(b,"span",ICON[n.kind]||"🔎");
  const info=add(b,"span","","pl-card-info");
  add(info,"strong",n.label);
  add(info,"small",done.has(n.id)?"✓ Investigated":ready.has(n.id)?"READY TO INVESTIGATE":"🔒 Needs previous work");
  b.addEventListener("click",()=>attempt(n.id));
  b.addEventListener("dragstart",ev=>{ev.dataTransfer.setData("text/plain",n.id);ev.dataTransfer.effectAllowed="move";});
 }
 $("plDeckCount").textContent="· "+(current.nodes.length-done.size)+" to investigate";
}
function history(r){
 const root=$("plHistory");root.replaceChildren();
 for(const step of r.checked_steps.slice(-18)){
  const n=current.nodes.find(x=>x.id===step.node);
  const row=add(root,"li",(step.accepted?"✓ ":"✕ ")+n.label);
  row.dataset.valid=String(step.accepted);
  add(row,"small",step.accepted?"Success · "+step.reason+" · confidence "+step.confidence+"/3":
   "Blocked by "+(step.repeated?"already complete":step.missing_prerequisites.join(", ")));
 }
 $("plHistorySummary").textContent=actions.length+" moves · "+r.rejected+" blocked";
}
function replayFrame(r){
 const rows=r.checked_steps;
 if(!rows.length){$("plReplayStage").textContent="No moves recorded.";
  $("plReplayPrev").disabled=true;$("plReplayNext").disabled=true;return;}
 replayIndex=Math.max(0,Math.min(replayIndex,rows.length-1));
 const step=rows[replayIndex],node=current.nodes.find(n=>n.id===step.node);
 $("plReplayStage").textContent="Decision "+(replayIndex+1)+"/"+rows.length+
  " · "+(step.accepted?"✓ valid":"✕ blocked")+" · "+node.label+
  (step.missing_prerequisites.length?" · needs "+step.missing_prerequisites.join(", "):"");
 $("plReplayPrev").disabled=replayIndex===0;
 $("plReplayNext").disabled=replayIndex>=rows.length-1;
}
function render(){
 const r=replay(),completed=r.completed_node_ids.length,score=Math.max(0,r.score-3*hints);
 $("plProgressFill").style.width=(100*completed/current.nodes.length).toFixed(1)+"%";
 $("plCompleted").textContent=completed+" / "+current.nodes.length+" obligations";
 $("plScore").textContent=String(score);
 $("plErrorCount").textContent=r.rejected+" blockers found";
 let combo=0;for(let i=r.checked_steps.length-1;i>=0&&r.checked_steps[i].accepted;i--)combo++;
 $("plCombo").textContent=combo+" in a row";
 $("plCheck").disabled=actions.length<4||!threat();
 $("plCheck").textContent=r.completed?"Finalize full review →":"Review partial investigation →";
 $("plReportStatus").textContent=r.completed?
  "✓ Educational plan assembled. The proposed attack is still an untested hypothesis.":
  "Investigated "+completed+"/"+current.nodes.length+". Blocked moves are learning signals, not proof failures.";
 $("plDonateCount").textContent=actions.length+" moves · "+r.rejected+" blocked";
 $("plDonateCase").textContent=current.theorem;
 $("plVictory").hidden=!awarded;
 graph(r);cards(r);history(r);replayFrame(r);
}
function attempt(id){
 const node=current.nodes.find(n=>n.id===id);
 if(!node||replay().completed_node_ids.includes(id))return;
 if(actions.length>=PROOFLAB_MAX_STEPS){report("26-action limit reached. Undo, review or restart.","error");return;}
 const move={node:id,reason:moveReason(),confidence:moveConfidence()};
 let checked;
 try{checked=replayProofLabSteps(current.id,[...actions,move]);}
 catch(e){report(e.message,"error");return;}
 actions.push(move);
 const last=checked.checked_steps.at(-1);
 if(last.accepted)report("Good. This planning action has its required prerequisites."+
   (checked.completed?" The educational graph is assembled!":""),"success");
 else report("Blocked! First investigate: "+last.missing_prerequisites.map(k=>
   current.nodes.find(n=>n.id===k)?.label||k).join(" + ")+". This mistake remains in your notebook.","error");
 awarded=false;replayIndex=actions.length-1;render();
}
function load(id){
 const c=proofLabCase(id);if(!c)return;
 current=c;campaign=c.campaign;actions=[];hints=0;graphOpen=false;coach=false;awarded=false;replayIndex=-1;
 $("plVictory").hidden=true;$("plAdult").checked=false;$("plConsent").checked=false;
 $("plDonateMessage").textContent="No gameplay data has been donated.";
 try{const u=new URL(location.href);u.searchParams.set("case",c.id);
  history.replaceState({},"",u.pathname+u.search+u.hash);}catch{}
 campaigns();missionOptions();dossier();render();
 report("This real Lean theorem already exists. Investigate its educational review obligations; no kernel runs here.");
}
function finish(){
 if(actions.length<4||!threat()){report("Try four planning moves and choose an attack hypothesis first.","error");return;}
 let result;try{result=evaluateProofLabSession({case_id:current.id,version:PROOFLAB_VERSION,actions,
   hints_used:hints,threat:threat(),threat_confidence:Number($("plThreatConfidence").value)});}
 catch(e){report(e.message,"error");return;}
 const r=result.graph_replay,old=Number(local.best[current.id]||0),gain=r.completed?Math.max(0,r.score-old):0;
 if(r.completed){local.best[current.id]=Math.max(old,r.score);local.xp=Math.min(200000,local.xp+gain);store();}
 awarded=true;
 $("plVictoryTitle").textContent=r.completed?"Source review assembled!":"Partial investigation documented.";
 $("plVictoryBody").textContent=r.accepted+" feasible moves, "+r.rejected+
   " blocked attempts. Your “"+threat()+"” attack is a hypothesis, not a verified counterexample. "+
   "Completing this game has not checked any new Lean theorem.";
 $("plVictoryXP").textContent=gain?"+"+gain+" local XP · personal best":
   (r.completed?"No new personal best":"Resolve more prerequisites to earn XP");
 $("plVictory").hidden=false;campaigns();render();
 $("plVictory").scrollIntoView({behavior:"smooth",block:"nearest"});
}
async function post(path,data){
 if(typeof path!=="string"||!path.startsWith("/api/")||
    !new Set(["/api/arena/prooflab/donate","/api/arena/prooflab/erase"]).has(path))
  throw Error("Unreviewed ProofLab research API path.");
 const response=await fetch(path,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
  body:JSON.stringify(data)});
 const json=await response.json().catch(()=>({message:"Invalid server response"}));
 if(!response.ok||!json.ok)throw Error(json.message||json.error||"PCS request unsuccessful");
 return json;
}
async function donate(){
 const output=$("plDonateMessage");
 if(!$("plAdult").checked||!$("plConsent").checked){output.textContent="Check both explicit 18+ and research consent fields first.";return;}
 if(actions.length<4||!threat()){output.textContent="Record four choices and a review hypothesis first.";return;}
 let valid;try{valid=evaluateProofLabSession({case_id:current.id,version:PROOFLAB_VERSION,
   actions,hints_used:hints,threat:threat(),threat_confidence:Number($("plThreatConfidence").value)});}
 catch(e){output.textContent=e.message;return;}
 $("plDonate").disabled=true;output.textContent="Recomputing educational plan on PCS server…";
 try{
  const data=await post("/api/arena/prooflab/donate",{case_id:current.id,version:PROOFLAB_VERSION,
    actions:valid.actions,hints_used:valid.hints_used,threat:valid.challenge.threat,
    threat_confidence:valid.challenge.confidence,adult_confirmation:true,consent_training:true});
  output.textContent=data.recorded?
   "✓ Verified educational record stored: "+data.accepted+" feasible and "+data.rejected+
   " blocked moves. No new Lean proof was generated.":
   "This exact trace was already contributed. No duplicate stored.";
 }catch(e){output.textContent="Donation not confirmed: "+e.message+
   ". A reply can be lost after server acceptance. Retry safely or request erasure.";}
 finally{$("plDonate").disabled=false;}
}
async function erase(){
 if(!confirm("Delete your active ProofLab research records? Previously exported copies may not be retractable."))return;
 try{const d=await post("/api/arena/prooflab/erase",{});
  $("plDonateMessage").textContent="Deleted "+d.deleted+" active research records.";}
 catch(e){$("plDonateMessage").textContent="Delete failed: "+e.message;}
}
for(const r of PROOFLAB_REASONS){
 const l=add($("plReasons"),"label","");
 const input=el("input");input.type="radio";input.name="plReason";input.value=r.id;input.checked=r.id==="unsure";
 l.append(input,el("span",r.label));
}
$("plMissionSelect").addEventListener("change",()=>load($("plMissionSelect").value));
$("plDaily").addEventListener("click",()=>{
 load(CASES[Math.floor(Date.now()/86400000)%CASES.length].id);
 report("UTC daily puzzle selected. Local gameplay is not automatically uploaded.");
});
$("plShare").addEventListener("click",async()=>{
 try{await navigator.clipboard.writeText(location.href);report("Shareable real-theorem challenge copied.","success");}
 catch{report("Copy this page's URL to share the challenge.","error");}
});
$("plScout").addEventListener("click",()=>{
 if(!graphOpen){graphOpen=true;hints=Math.min(12,hints+1);}
 render();report("Dependency X-ray opened. Source-cited lemma names differ from pedagogical process edges.");
});
$("plCoach").addEventListener("click",()=>{
 coach=true;hints=Math.min(12,hints+1);render();
 report("Eligible moves: "+replay().next_available.map(id=>current.nodes.find(n=>n.id===id).label).join("; "),"success");
});
$("plUndo").addEventListener("click",()=>{
 if(!actions.length)return;actions.pop();awarded=false;replayIndex=actions.length-1;
 render();report("Last local move discarded from any later donated sequence.");
});
$("plRestart").addEventListener("click",()=>{
 actions=[];hints=0;graphOpen=false;coach=false;awarded=false;replayIndex=-1;
 render();report("Case restarted. No gameplay was uploaded.");
});
$("plCheck").addEventListener("click",finish);
$("plNext").addEventListener("click",()=>{
 const pool=CASES.filter(x=>x.campaign===campaign),index=pool.findIndex(x=>x.id===current.id);
 load(pool[(index+1)%pool.length].id);$("plGame").scrollIntoView({behavior:"smooth",block:"start"});
});
$("plReplayPrev").addEventListener("click",()=>{replayIndex--;replayFrame(replay());});
$("plReplayNext").addEventListener("click",()=>{replayIndex++;replayFrame(replay());});
$("plDonate").addEventListener("click",donate);
$("plErase").addEventListener("click",erase);
$("plClearLocal").addEventListener("click",()=>{
 if(!confirm("Clear only browser XP? Existing research donations require separate erasure."))return;
 local={xp:0,best:{}};store();campaigns();report("Local XP reset. No server data was changed.");
});
const tray=$("plTray");
tray.addEventListener("dragover",e=>{e.preventDefault();tray.classList.add("dragging");});
tray.addEventListener("dragleave",()=>tray.classList.remove("dragging"));
tray.addEventListener("drop",e=>{e.preventDefault();tray.classList.remove("dragging");
 const id=e.dataTransfer.getData("text/plain");if(current.nodes.some(n=>n.id===id))attempt(id);});
const first=new URLSearchParams(location.search).get("case");
load(proofLabCase(first)?first:CASES[0].id);
