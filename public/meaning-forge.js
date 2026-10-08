import {MISSIONS,FIELDS,MEANING_VERSION,initialClaim,renderLean,renderEnglish,
  validateClaim,replaySession,differences} from "./meaning-forge-core.mjs";
const el=id=>document.getElementById(id);
const controls=[...document.querySelectorAll("[data-meaning-field]")];
const names={quantifier:"quantifier",left:"first predicate",left_negated:"first predicate's negation",
  connective:"logical relationship",right:"second predicate",right_negated:"second predicate's negation"};
let current=null,mission=null,moves=[],mode="english-to-lean",hints=0,checked=false,solved=false,locked=false;
const fakeExplanation="Local structured comparison only; no human annotation was supplied.";
function say(id,txt,type=""){
 const node=el(id);node.textContent=txt;node.className="meaning-feedback "+type;
}
function selectOptions(node,items){
 node.replaceChildren();
 for(const item of items){const o=document.createElement("option");o.value=item;o.textContent=item;node.append(o);}
}
function updateControls(){
 for(const node of controls){
  const key=node.dataset.meaningField;
  if(key==="left"||key==="right")selectOptions(node,mission.predicates);
  node.value=String(current[key]);
 }
}
function showState(){
 const display=mode==="english-to-lean"?renderLean(mission,current):renderEnglish(mission,current);
 el("meaningPreview").textContent=display;
 el("meaningPreviewTitle").textContent=mode==="english-to-lean"?"LIVE LEAN PROPOSITION":"LIVE STRUCTURED ENGLISH";
 el("meaningMoves").textContent=moves.length+" edits";
 el("meaningHintCount").textContent=hints+" hints";
 el("meaningDonate").disabled=!checked;
}
function drawHistory(){
 const root=el("meaningHistory");root.replaceChildren();
 if(!moves.length){const li=document.createElement("li");li.textContent="Start changing the candidate to repair its meaning.";root.append(li);return;}
 for(const move of moves){
  const li=document.createElement("li");li.textContent=names[move.field]+" → "+
    (typeof move.value==="boolean"?(move.value?"negated":"positive"):move.value);
  root.append(li);
 }
 root.scrollTop=root.scrollHeight;
}
function pick(){
 mode=el("meaningMode").value;
 mission=MISSIONS.find(m=>m.id===el("meaningMission").value)||MISSIONS[0];
 current=initialClaim(mission,mode);moves=[];hints=0;checked=false;solved=false;locked=false;
 el("meaningIndex").textContent="Mission "+(MISSIONS.indexOf(mission)+1)+" / "+MISSIONS.length+" · difficulty "+mission.difficulty;
 el("meaningTargetTitle").textContent=mode==="english-to-lean"?"Human claim to formalize":"Lean proposition to explain";
 el("meaningCandidateTitle").textContent=mode==="english-to-lean"?"Construct its formal meaning":"Interpret the formal statement";
 el("meaningTarget").textContent=mode==="english-to-lean"?mission.description:renderLean(mission,mission.target);
 el("meaningTarget").classList.toggle("lean",mode==="lean-to-english");
 const dictionary=el("meaningPredicates");dictionary.replaceChildren();
 for(const name of mission.predicates){
  const span=document.createElement("span");
  span.textContent=name+" : "+mission.type+" → Prop · PCS game dictionary";
  dictionary.append(span);
 }
 el("meaningScore").textContent="Score: —";
 el("meaningExplanation").value="";
 el("meaningAdult").checked=false;el("meaningConsent").checked=false;
 el("meaningHint").disabled=false;el("meaningCheck").disabled=false;
 say("meaningFeedback","Your initial candidate has two planted semantic errors. Can you find and repair them?");
 say("meaningDonationStatus","Research upload is optional and off by default.");
 updateControls();drawHistory();showState();
}
function changeField(node){
 if(locked)return;
 const field=node.dataset.meaningField;
 const value=field.endsWith("_negated")?node.value==="true":node.value;
 try{
  current=validateClaim(mission,{...current,[field]:value});
  if(moves.length>=36){say("meaningFeedback","36-edit limit reached. Start the mission again.","warn");updateControls();return;}
  moves.push({field,value});checked=false;solved=false;
  say("meaningFeedback","Candidate updated. Keep experimenting, then check its meaning.");
  showState();drawHistory();
 }catch(e){updateControls();say("meaningFeedback",e.message,"warn");}
}
function hint(){
 if(hints>=5){say("meaningFeedback","All five hints have been used.","warn");return;}
 const wrong=differences(mission,current);
 if(!wrong.length){say("meaningFeedback","No remaining structured differences. Press Check.");return;}
 hints++;
 say("meaningFeedback","Inspect the "+names[wrong[0]]+". That part differs from the target. ("+hints+"/5 hints)","warn");
 if(hints===5)el("meaningHint").disabled=true;
 showState();
}
function buildPayload(){
 return {version:MEANING_VERSION,mission_id:mission.id,mode,
   moves:moves.map(x=>({...x})),hints_used:hints,
   confidence:Number(el("meaningConfidence").value),
   explanation:el("meaningExplanation").value.trim()||fakeExplanation};
}
function check(){
 if(!moves.length){say("meaningFeedback","Make at least one edit before checking.","warn");return;}
 try{
  const result=replaySession(buildPayload());
  checked=true;solved=result.structural_correct;locked=false;
  el("meaningScore").textContent="Score: "+result.score+" / 100";
  say("meaningFeedback",solved?
   "Exact structural match! The bounded Lean proposition round-tripped through its parser. This does NOT prove the empirical claim.":
   "Not matched yet. "+result.errors.length+" semantic component(s) still differ. Keep repairing and try again.",
   solved?"good":"warn");
  showState();
 }catch(e){say("meaningFeedback","Replay failed: "+e.message,"warn");}
}
async function call(path,body){
 const init={method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"}};
 if(body!==undefined)init.body=JSON.stringify(body);
 const response=await fetch(path,init);
 const data=await response.json().catch(()=>({message:"Invalid server response."}));
 if(!response.ok)throw Error(data.message||"Server request failed.");
 return data;
}
async function donate(){
 if(!checked){say("meaningDonationStatus","Check your attempt before donating.","warn");return;}
 if(!el("meaningAdult").checked||!el("meaningConsent").checked){
  say("meaningDonationStatus","Both the 18+ confirmation and explicit research consent are required.","warn");return;
 }
 const p=buildPayload();
 if(p.explanation===fakeExplanation||p.explanation.length<25){
  say("meaningDonationStatus","Explain the interpretation in at least 25 characters first.","warn");return;
 }
 const button=el("meaningDonate");button.disabled=true;
 say("meaningDonationStatus","Verifying your edit trace against the independent server replay...");
 try{
  const result=await call("/api/arena/meaning/donate",{
    adult_confirmation:true,consent_training:true,session:p
  });
  say("meaningDonationStatus",result.recorded?
    "Donated successfully. The server recomputed the structure; your explanation remains an unverified human annotation.":
    "This identical attempt was already donated. No duplicate was stored.","good");
 }catch(e){
  say("meaningDonationStatus",e.message+" You can keep playing locally. To donate, sign in and verify your email.","warn");
 }finally{button.disabled=!checked;}
}
async function erase(){
 if(!confirm("Erase your donated Meaning Forge attempts from the live PCS database? Offline exports may require separate removal."))return;
 const button=el("meaningErase");button.disabled=true;
 try{
  const r=await call("/api/arena/meaning/erase");
  say("meaningDonationStatus","Removed "+r.deleted+" live research attempt(s).","good");
 }catch(e){say("meaningDonationStatus",e.message,"warn");}
 finally{button.disabled=false;}
}
for(const m of MISSIONS){
 const o=document.createElement("option");o.value=m.id;o.textContent=
   m.id.replaceAll("-"," ")+" · "+m.domain;el("meaningMission").append(o);
}
controls.forEach(x=>x.addEventListener("change",()=>changeField(x)));
el("meaningStart").addEventListener("click",pick);
el("meaningMode").addEventListener("change",pick);
el("meaningMission").addEventListener("change",pick);
el("meaningHint").addEventListener("click",hint);
el("meaningCheck").addEventListener("click",check);
el("meaningDonate").addEventListener("click",donate);
el("meaningErase").addEventListener("click",erase);
el("meaningNext").addEventListener("click",()=>{
 const i=MISSIONS.indexOf(mission);
 el("meaningMission").value=MISSIONS[(i+1)%MISSIONS.length].id;pick();
 el("meaningTargetTitle").scrollIntoView({block:"start",behavior:"smooth"});
});
pick();
