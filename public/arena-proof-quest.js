import {PUZZLES,PUZZLE_VERSION,gradeOrder} from "./proof-order-core.mjs";
import {dependencyState,graphLayout,inspectPlacement,repairFirstInversion} from "./arena-lab-tools.mjs";

const $=id=>document.getElementById(id);
let selected=PUZZLES[0],chosen=[],hints=0,seen=new Set(),stars=0,last=null,bankOrder=[],tourStep=0;
let coachOn=false,mapOn=false,combo=0,attempts=[];
const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
// Randomizing the deck prevents the original source-order solution being given away.
function shuffled(input){const a=[...input];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const tour=[["Find the next step 🧩","Each card is part of a little mystery. Put the steps in an order that makes sense."],["Tap, undo, or hint 🃏","Tap a card to place it. Try different orders, Undo a choice, or request a gentle Hint."],["Check, learn, and level up ⭐","Once you've placed every card, check your route. You'll see your mistakes and can retry or play the next mission."]];
function tourRender(){
  const [name,description]=tour[tourStep];
  $("questTourTitle").textContent=name;$("questTourText").textContent=description;
  $("questTourCount").textContent=(tourStep+1)+" / "+tour.length;
  $("questTourBack").disabled=tourStep===0;
  $("questTourNext").textContent=tourStep===tour.length-1?"Play now →":"Next →";
}
$("questShowTutorial").addEventListener("click",()=>{tourStep=0;tourRender();$("questTutorial").hidden=false;$("questTutorial").scrollIntoView({behavior:"smooth",block:"center"});});
$("questTourBack").addEventListener("click",()=>{tourStep=Math.max(0,tourStep-1);tourRender();});
$("questTourNext").addEventListener("click",()=>{if(tourStep===tour.length-1){$("questTutorial").hidden=true;$("questAvailable").querySelector("button")?.focus();}else{tourStep++;tourRender();}});
$("questTourSkip").addEventListener("click",()=>{$("questTutorial").hidden=true;});
tourRender();
$("questAdult").addEventListener("change",()=>{
  $("questConsent").checked=$("questAdult").checked;
  $("questDonationMessage").textContent=$("questAdult").checked
    ?"Opted in for this run. Nothing has been submitted yet.":"Research sharing is switched off.";
});

async function proofQuestApi(path,body){
  if(typeof path!=="string" || !path.startsWith("/api/"))throw Error("Same-origin PCS API path required.");
  if(!["/api/arena/proof-order/attempt","/api/arena/proof-order/erase"].includes(path)){
    throw Error("Proof Quest allows only explicit opt-in submission and personal erasure.");
  }
  const response=await fetch(path,{method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({message:"Invalid response from PCS."}));
  return {response,data};
}
// Optional learning aids remain local; their use increments the existing
// server-validated hints_used field rather than being silently labeled unassisted.
function useLearningAid(){hints=Math.min(20,hints+1);}
function renderDiary(){
  const target=$("questHistory");target.replaceChildren();
  $("questAttemptCount").textContent=String(attempts.length);
  if(!attempts.length){const li=document.createElement("li");li.textContent="No checks yet. Experiment, then press Check my proof path.";target.appendChild(li);return;}
  for(const a of attempts.slice(0,12)){
    const li=document.createElement("li");
    li.textContent=(a.valid?"✅ ":"🛠️ ")+a.title+" · "+a.correct+"/"+a.total+" dependencies · "+a.score+"/100 · "+a.hints+" hints";
    target.appendChild(li);
  }
}
function renderMap(){
  const panel=$("questMapPanel");panel.hidden=!mapOn;
  if(!mapOn)return;
  const plan=graphLayout(selected,chosen),svg=$("questMap");
  const NS="http://www.w3.org/2000/svg";
  svg.setAttribute("viewBox","0 0 "+plan.width+" "+plan.height);
  svg.replaceChildren();
  const create=(tag,attributes,parent=svg)=>{
    const el=document.createElementNS(NS,tag);
    for(const [name,value] of Object.entries(attributes))el.setAttribute(name,String(value));
    parent.appendChild(el);return el;
  };
  const defs=create("defs",{});
  const marker=create("marker",{id:"questArrow",viewBox:"0 0 10 10",refX:"8",refY:"5",markerWidth:"6",markerHeight:"6",orient:"auto-start-reverse"},defs);
  create("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:"#7185a5"},marker);
  for(const edge of plan.edges){
    create("path",{d:"M "+edge.x1+" "+edge.y1+" C "+edge.x1+" "+(edge.y1+40)+" "+edge.x2+" "+(edge.y2-40)+" "+edge.x2+" "+edge.y2,
      fill:"none",stroke:"#8198b7","stroke-width":"2.5","marker-end":"url(#questArrow)"});
  }
  for(const n of plan.nodes){
    const group=create("g",{"data-state":n.state,transform:"translate("+n.x+","+n.y+")"});
    const paint=n.state==="done"?["#e4f8e9","#218257"]:n.state==="ready"?["#fff4da","#b47a20"]:["#e9eef7","#75849a"];
    create("rect",{x:"0",y:"0",width:plan.nodeWidth,height:plan.nodeHeight,rx:"13",fill:paint[0],stroke:paint[1],"stroke-width":"2"},group);
    const title=create("title",{},group);title.textContent=n.label+" — "+(n.state==="done"?"placed":n.state==="ready"?"ready":"waiting");
    const text=create("text",{x:plan.nodeWidth/2,y:"28","text-anchor":"middle","font-size":"12.5","font-weight":"700",fill:"#1d354f"},group);
    const words=n.label.split(" "),lines=[""];
    for(const word of words){if((lines.at(-1)+" "+word).trim().length>19&&lines.length<3)lines.push(word);else lines[lines.length-1]=(lines.at(-1)+" "+word).trim();}
    lines.forEach((line,i)=>{const t=create("tspan",{x:plan.nodeWidth/2,dy:i?"17":"0"},text);t.textContent=line;});
  }
  const ready=dependencyState(selected,chosen).ready.length;
  $("questMapNarration").textContent=ready+" step"+(ready===1?"":"s")+" ready · "+chosen.length+" placed";
}
function renderDetective(){
  $("questCombo").textContent=coachOn?String(combo):"—";
  renderMap();
}
$("questCoach").addEventListener("click",()=>{
  coachOn=!coachOn;
  if(coachOn)useLearningAid();
  $("questCoach").setAttribute("aria-pressed",String(coachOn));
  $("questCoach").textContent=coachOn?"🧠 Coach mode: on":"🧠 Coach mode: off";
  $("questDecision").textContent=coachOn?"Coach is watching! Gold-ready steps respect all earlier prerequisites.":"Independent mode: the game won't reveal readiness until you check.";
  renderDetective();
});
$("questRevealMap").addEventListener("click",()=>{
  mapOn=!mapOn;
  if(mapOn)useLearningAid();
  $("questRevealMap").setAttribute("aria-expanded",String(mapOn));
  $("questRevealMap").textContent=mapOn?"🕸️ Hide dependency map":"🕸️ X-ray dependency map (hint)";
  renderMap();
});
$("questDaily").addEventListener("click",()=>{
  const day=Math.floor(Date.now()/86400000);
  choosePuzzle(PUZZLES[day%PUZZLES.length].id);
  $("questDecision").textContent="📅 Today's mission selected. The daily challenge is the same puzzle for all visitors; play remains local.";
});
$("questFixOne").addEventListener("click",()=>{
  if(chosen.length!==selected.nodes.length)return;
  const result=gradeOrder(selected.id,chosen,hints);
  if(result.valid)return;
  const fix=repairFirstInversion(selected,chosen,result.mistakes);
  if(!fix.changed)return;
  useLearningAid();
  chosen=fix.order;last=null;combo=0;
  $("questFeedback").hidden=true;$("questNext").hidden=true;$("questTryAgain").hidden=true;$("questFixOne").hidden=true;
  $("questDecision").textContent="🛠️ Moved a missing prerequisite before its dependent card. Check the new route and see what else still needs repair.";
  render();
});
renderDiary();

function buttonList(){
  $("questPuzzleList").replaceChildren();
  PUZZLES.forEach((p,index)=>{
    const b=document.createElement("button");b.type="button";
    b.className="quest-puzzle-button";b.dataset.active=String(p.id===selected.id);
    const name=document.createElement("strong");name.textContent=(seen.has(p.id)?"✅ ":"🧩 ")+p.title;
    const kind=document.createElement("span");kind.textContent="Level "+p.level+" · "+p.topic;
    b.append(name,kind);b.addEventListener("click",()=>choosePuzzle(p.id));
    $("questPuzzleList").appendChild(b);
  });
}
function choosePuzzle(id){
  selected=PUZZLES.find(p=>p.id===id)||PUZZLES[0];chosen=[];hints=0;last=null;bankOrder=shuffled(selected.nodes.map(n=>n.id));
  coachOn=false;mapOn=false;combo=0;
  $("questCoach").setAttribute("aria-pressed","false");$("questCoach").textContent="🧠 Coach mode: off";
  $("questRevealMap").setAttribute("aria-expanded","false");$("questRevealMap").textContent="🕸️ X-ray dependency map (hint)";
  $("questMapPanel").hidden=true;$("questDecision").textContent="Detective tip: what must happen before the next card?";
  $("questLevel").textContent="LEVEL "+selected.level;
  $("questTitle").textContent=selected.title;
  $("questTopic").textContent=selected.topic;
  $("questStory").textContent=selected.story;
  $("questGoal").textContent=selected.goal;
  $("questFeedback").hidden=true;$("questHintText").hidden=true;
  $("questResearch").hidden=false;$("questAdult").checked=false;$("questConsent").checked=false;
  $("questNext").hidden=true;$("questTryAgain").hidden=true;$("questFixOne").hidden=true;
  $("questDonationMessage").textContent="";
  buttonList();render();
}
function render(){
  const available=$("questAvailable");const trail=$("questTrail");
  available.replaceChildren();trail.replaceChildren();
  // Display order is stable for this render, so clicking a step does not reorder other available options.
  for(const n of bankOrder.map(id=>selected.nodes.find(n=>n.id===id)).filter(n=>!chosen.includes(n.id))){
    const b=document.createElement("button");b.type="button";b.className="quest-step";
    b.textContent=n.label;b.title="Add "+n.label+" to your proof path";
    b.addEventListener("click",()=>{
      const inspected=inspectPlacement(selected,chosen,n.id);
      combo=inspected.valid?combo+1:0;
      if(coachOn){
        const byId=new Map(selected.nodes.map(card=>[card.id,card.label]));
        $("questDecision").textContent=inspected.valid?"✅ Ready card! All prerequisites were satisfied. Streak "+combo+"."
          :"🔎 Wait! The missing prerequisites were: "+inspected.missing.map(id=>byId.get(id)).join(", ")+".";
      }else $("questDecision").textContent="Placed a card. Check the full order to learn whether the prerequisites work.";
      chosen.push(n.id);last=null;$("questFeedback").hidden=true;$("questResearch").hidden=false;
      $("questNext").hidden=true;$("questTryAgain").hidden=true;$("questFixOne").hidden=true;
      render();
    });available.appendChild(b);
  }
  chosen.forEach((id,i)=>{
    const node=selected.nodes.find(n=>n.id===id);
    const li=document.createElement("li");li.dataset.index=String(i+1);li.textContent=node.label;
    trail.appendChild(li);
  });
  $("questEmpty").hidden=chosen.length>0;
  $("questUndo").disabled=chosen.length===0;
  $("questCheck").disabled=chosen.length!==selected.nodes.length;
  $("questProgress").max=selected.nodes.length;$("questProgress").value=chosen.length;
  $("questProgressLabel").textContent=chosen.length+" / "+selected.nodes.length+" steps placed";
  $("questLive").textContent=chosen.length===0?"Tap a card to start!":chosen.length===selected.nodes.length
    ?"Path complete! Check whether your steps work.":(selected.nodes.length-chosen.length)+" cards left. You can Undo at any time.";
  renderDetective();
}
$("questUndo").addEventListener("click",()=>{
  chosen.pop();last=null;combo=0;$("questFeedback").hidden=true;$("questResearch").hidden=false;
  $("questDecision").textContent="Undo complete. Explore another route.";
  $("questNext").hidden=true;$("questTryAgain").hidden=true;render();
});
$("questRestart").addEventListener("click",()=>choosePuzzle(selected.id));
$("questHint").addEventListener("click",()=>{
  useLearningAid();
  const completed=new Set(chosen);
  const next=selected.nodes.find(n=>!completed.has(n.id)&&n.needs.every(x=>completed.has(x)));
  const box=$("questHintText");box.hidden=false;
  box.textContent=next
    ?"💡 One possible next step is “"+next.label+"” because all its prerequisites are already placed. Other steps might also work."
    :"💡 Check your ordering and use Undo if you have placed a step before something it needs.";
});
$("questCheck").addEventListener("click",()=>{
  try{
    const result=gradeOrder(selected.id,chosen,hints);
    last={puzzle_id:selected.id,puzzle_version:PUZZLE_VERSION,order:[...chosen],hints_used:hints};
    attempts.unshift({title:selected.title,valid:result.valid,score:result.score,correct:result.correct,total:result.total,hints});
    attempts=attempts.slice(0,12);renderDiary();
    const box=$("questFeedback");box.replaceChildren();box.hidden=false;
    box.classList.toggle("bad",!result.valid);
    const h=document.createElement("h3");
    h.textContent=result.valid?"🌟 You built a valid proof path!":"🧩 Almost! Some steps need to move.";
    box.appendChild(h);
    const p=document.createElement("p");
    p.textContent=result.correct+" of "+result.total+" prerequisite links are in the right order. Practice score: "+result.score+"/100.";
    box.appendChild(p);
    if(!result.valid){
      const bad=result.mistakes.slice(0,3);
      for(const mistake of bad){
        const node=selected.nodes.find(x=>x.id===mistake.after);
        const before=selected.nodes.find(x=>x.id===mistake.before);
        const item=document.createElement("p");
        item.textContent="🔎 “"+before.label+"” must come before “"+node.label+"”. "+node.why;
        box.appendChild(item);
      }
    }else if(!seen.has(selected.id)){
      seen.add(selected.id);stars+=Math.max(1,Math.ceil(result.score/34));
      $("questStars").textContent=String(stars);$("questSolved").textContent=String(seen.size);buttonList();
    }
    const fine=document.createElement("p");
    fine.textContent="This checks the toy ordering, not an actual Lean proof or deployed AI behavior.";
    box.appendChild(fine);
    $("questResearch").hidden=false;
    $("questNext").hidden=!result.valid;$("questTryAgain").hidden=result.valid;$("questFixOne").hidden=result.valid;
    $("questLive").textContent=result.valid?"🎉 Great job! Ready for another mission?":"Every mistake teaches a dependency. Try another route!";
    box.scrollIntoView({behavior:"smooth",block:"nearest"});
  }catch(e){
    const box=$("questFeedback");box.hidden=false;box.textContent=e.message;box.classList.add("bad");
  }
});
$("questNext").addEventListener("click",()=>{
  const index=PUZZLES.findIndex(p=>p.id===selected.id);
  choosePuzzle(PUZZLES[(index+1)%PUZZLES.length].id);
  $("questAvailable").scrollIntoView({behavior:"smooth",block:"center"});
});
$("questTryAgain").addEventListener("click",()=>choosePuzzle(selected.id));
$("questDonate").addEventListener("click",async()=>{
  const message=$("questDonationMessage");message.textContent="";
  if(!last){message.textContent="Finish a puzzle first.";return;}
  if(!$("questAdult").checked||!$("questConsent").checked){message.textContent="Turn on the switch to confirm you are 18+ and agree to share this run. Anyone can still play.";$("questAdult").focus();return;}
  $("questDonate").disabled=true;
  try{
    const {response,data}=await proofQuestApi("/api/arena/proof-order/attempt",{...last,adult_confirmation:true,consent_training:true});
    if(!response.ok)throw Error(data.message||"Could not contribute attempt.");
    message.textContent="Thank you! "+data.message+" Only synthetic puzzle order data was stored.";
  }catch(e){message.textContent=e.message+" You can keep playing without contributing research data.";}
  finally{$("questDonate").disabled=false;}
});
$("questErase").addEventListener("click",async()=>{
  if(!confirm("Delete all your donated Proof Quest data?"))return;
  const message=$("questDonationMessage");
  try{
    const {response,data}=await proofQuestApi("/api/arena/proof-order/erase",{});
    if(!response.ok)throw Error(data.message||"Could not delete research data.");
    message.textContent="Your donated puzzle attempts were deleted.";
  }catch(e){message.textContent=e.message;}
});
choosePuzzle(PUZZLES[0].id);
