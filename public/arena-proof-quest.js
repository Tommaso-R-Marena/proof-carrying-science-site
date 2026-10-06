import {PUZZLES,PUZZLE_VERSION,gradeOrder} from "./proof-order-core.mjs";

const $=id=>document.getElementById(id);
let selected=PUZZLES[0],chosen=[],hints=0,seen=new Set(),stars=0,last=null;
const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const shuffled=a=>[...a].sort(()=>Math.random()-.5); // cosmetic only; scoring is order-independent

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
  selected=PUZZLES.find(p=>p.id===id)||PUZZLES[0];chosen=[];hints=0;last=null;
  $("questLevel").textContent="LEVEL "+selected.level;
  $("questTitle").textContent=selected.title;
  $("questTopic").textContent=selected.topic;
  $("questStory").textContent=selected.story;
  $("questGoal").textContent=selected.goal;
  $("questFeedback").hidden=true;$("questHintText").hidden=true;
  $("questResearch").hidden=true;$("questAdult").checked=false;$("questConsent").checked=false;
  $("questDonationMessage").textContent="";
  buttonList();render();
}
function render(){
  const available=$("questAvailable");const trail=$("questTrail");
  available.replaceChildren();trail.replaceChildren();
  // Display order is stable for this render, so clicking a step does not reorder other available options.
  for(const n of selected.nodes.filter(n=>!chosen.includes(n.id))){
    const b=document.createElement("button");b.type="button";b.className="quest-step";
    b.textContent=n.label;b.title="Add "+n.label+" to your proof path";
    b.addEventListener("click",()=>{
      chosen.push(n.id);last=null;$("questFeedback").hidden=true;$("questResearch").hidden=true;
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
}
$("questUndo").addEventListener("click",()=>{
  chosen.pop();last=null;$("questFeedback").hidden=true;$("questResearch").hidden=true;render();
});
$("questRestart").addEventListener("click",()=>choosePuzzle(selected.id));
$("questHint").addEventListener("click",()=>{
  hints++;
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
    box.scrollIntoView({behavior:"smooth",block:"nearest"});
  }catch(e){
    const box=$("questFeedback");box.hidden=false;box.textContent=e.message;box.classList.add("bad");
  }
});
$("questDonate").addEventListener("click",async()=>{
  const message=$("questDonationMessage");message.textContent="";
  if(!last){message.textContent="Finish a puzzle first.";return;}
  if(!$("questAdult").checked||!$("questConsent").checked){message.textContent="Data contribution requires both adult confirmation and explicit consent. Everyone can still play.";return;}
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
