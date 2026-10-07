// PCS ProofLab v1: genuine *source-backed* Lean theorem statements paired with
// explicitly PEDAGOGICAL strategy scaffolds. No theorem is proved by this game.
import {RECORDS_Units} from "./prooflab-data-Units.mjs";
import {RECORDS_Binding} from "./prooflab-data-Binding.mjs";
import {RECORDS_EnvFacts} from "./prooflab-data-EnvFacts.mjs";
import {RECORDS_Checkers} from "./prooflab-data-Checkers.mjs";
import {RECORDS_IndexProofs} from "./prooflab-data-IndexProofs.mjs";
import {RECORDS_PackageProofs} from "./prooflab-data-PackageProofs.mjs";

export const PROOFLAB_VERSION="pcs-prooflab-educational-plan-v1";
export const CORE_SOURCE_COMMIT="cff0b67595abd4862ab0c156b157f262b169eca5";
export const TASKS=Object.freeze([
 ...RECORDS_Units,...RECORDS_Binding,...RECORDS_EnvFacts,
 ...RECORDS_Checkers,...RECORDS_IndexProofs,...RECORDS_PackageProofs
]);
const LOOKUP=new Map(TASKS.map(t=>[t.id,t]));
const MAX_ACTIONS=80;
function fail(message){throw Error(message);}
export function findTask(id){return typeof id==="string"?LOOKUP.get(id)||null:null;}
function seedOf(value){let h=2166136261;for(const c of value){h=Math.imul(h^c.charCodeAt(0),16777619);}return h>>>0;}
function shuffle(items,seed){
 let n=seed>>>0,copy=[...items];
 const rand=()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};
 for(let i=copy.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}
 return copy;
}
function makeNode(id,label,description,needs=[]){return{id,label,description,needs:[...needs]};}
export function proofPlan(taskId){
 const task=findTask(taskId);if(!task)fail("Unknown genuine source-backed task.");
 const statement=task.statement,hasHyp=/\([A-Za-z_][^)]{0,130} :/.test(statement),
 compound=/∧|↔|∨|∀|∃/.test(statement),
 hasRefs=task.syntactic_reference_mentions.length>0;
 let nodes=[
 makeNode("read","Decode the Lean theorem statement","Read the exact published theorem header; proof bodies are deliberately withheld."),
 makeNode("scope","Identify assumptions and scope","Mark explicit premises in the signature, including what is not implied.",["read"]),
 makeNode("terms","Identify formal definitions","Determine which model, checker, parser, or typed relation occurs in the goal.",["read"]),
 makeNode("goal","State the proof obligation","Write down the target proposition without pretending it already follows.",["scope","terms"])
 ];
 if(compound)nodes.push(makeNode("split","Break apart the compound goal","Distinguish conjuncts, quantifiers or directions before planning a derivation.",["goal"]));
 if(hasRefs)nodes.push(makeNode("helpers","Inspect referenced lemmas","Identifier mentions in the source proof are hints, NOT a formally extracted dependency graph.",["terms"]));
 const drafting=["goal",...(compound?["split"]:[]),...(hasRefs?["helpers"]:[])];
 nodes.push(makeNode("candidate","Propose a typed Lean proof term","A concrete candidate would need real elaboration and kernel checking.",drafting));
 nodes.push(makeNode("kernel","Run an actual Lean kernel check","A game score cannot substitute for a Lean proof object; this node is aspirational.",["candidate"]));
 if(/Sha256Collision|NoForgery/.test(statement)){
  nodes.push(makeNode("boundary","Carry cryptographic assumptions","Record collision or no-forgery disjunctions rather than silently dropping hypotheses.",["scope"]));
 }
 nodes.push(makeNode("limits","Check the exact conclusion's limits","Do not promote a scoped theorem into unconditional science or deployed-AI safety.",["scope"]));
 nodes.push(makeNode("report","Report only the demonstrated formal result","In real PCS a signed package, authority boundary, and independent checker must be checked.",["kernel","limits",...(/Sha256Collision|NoForgery/.test(statement)?["boundary"]:[])]));
 const ids=new Set(nodes.map(x=>x.id));
 for(const n of nodes)for(const dep of n.needs)if(!ids.has(dep)||dep===n.id)fail("Invalid educational scaffold.");
 return{task,nodes,edges:nodes.flatMap(n=>n.needs.map(from=>({from,to:n.id}))),
  graph_status:"Human-learning scaffold only; not a kernel-extracted proof DAG.",
  role:"Planning and critical review of a real Lean theorem statement, not proving it."};
}
export function nextReady(taskId,placed){
 const plan=proofPlan(taskId),seen=new Set();
 if(!Array.isArray(placed)||placed.length>plan.nodes.length)fail("Invalid route.");
 for(const id of placed){if(!plan.nodes.some(n=>n.id===id)||seen.has(id))fail("Duplicate or unknown stage.");seen.add(id);}
 return plan.nodes.filter(n=>!seen.has(n.id)&&n.needs.every(dep=>seen.has(dep)));
}
export function repairPuzzle(taskId){
 const plan=proofPlan(taskId),candidates=plan.edges.filter(e=>!["read","report"].includes(e.to));
 const chosen=candidates[seedOf(taskId)%candidates.length];
 const byId=new Map(plan.nodes.map(n=>[n.id,n]));
 let alternatives=plan.nodes.filter(n=>n.id!==chosen.from&&n.id!==chosen.to&&!byId.get(chosen.to).needs.includes(n.id));
 alternatives=shuffle(alternatives,seedOf(taskId+"repair"));
 const choices=shuffle([chosen.from,...alternatives.slice(0,3).map(n=>n.id)],seedOf(taskId+"options"))
  .map(id=>({id,label:byId.get(id).label}));
 if(choices.length<3)fail("Insufficient repair alternatives.");
 return {target:chosen.to,target_label:byId.get(chosen.to).label,
  missing_source:chosen.from,choices,
  visible_edges:plan.edges.filter(e=>!(e.from===chosen.from&&e.to===chosen.to)),
  prompt:"A required educational prerequisite edge disappeared. Which earlier stage must point into the highlighted stage?"};
}
export function scopePuzzle(taskId){
 const t=findTask(taskId);if(!t)fail("Unknown theorem.");
 const statement=t.statement;
 let key="conditional",correct="The theorem's typed conclusion is conditional on its stated inputs and assumptions.";
 if(statement.includes("Sha256Collision")){key="collision";correct="The conclusion expressly permits a SHA-256 collision alternative. It is not unconditional equality.";}
 else if(statement.includes("NoForgery")){key="forgery";correct="The theorem expressly assumes a no-forgery contract; it does not prove that cryptography is unbreakable.";}
 else if(statement.includes("↔")){key="iff";correct="An equivalence goal requires both directions of implication, not just the easy direction.";}
 else if(statement.includes("PKModel")||statement.includes("Qty")){key="model";correct="This is a formal model/checker claim, not independent experimental validation of a physical model.";}
 const distractors=[
 "Passing a browser game is equivalent to passing Lean's kernel.",
 "The theorem makes any unregistered AI-safety checker safe by declaration.",
 "Its source declaration alone proves that every scientific application is true.",
 "All named assumptions can be dropped because the system uses cryptographic hashes."
 ];
 const choices=shuffle([{id:"scoped",label:correct},...shuffle(distractors,seedOf(taskId)).slice(0,3).map((label,i)=>({id:"trap-"+i,label}))],seedOf(taskId+"scope"));
 return{key,choices,correct:"scoped",question:"Which interpretation respects the actual scope of this Lean declaration?",explanation:correct};
}
function exactKeys(value,keys){return value&&typeof value==="object"&&!Array.isArray(value)&&
 Object.keys(value).sort().join(",")===keys.slice().sort().join(",");}
export function evaluateSession(payload){
 if(!exactKeys(payload,["version","task_id","actions"]))fail("Unexpected session payload.");
 if(payload.version!==PROOFLAB_VERSION)fail("Unknown workshop version.");
 const plan=proofPlan(payload.task_id),repair=repairPuzzle(payload.task_id),scope=scopePuzzle(payload.task_id);
 if(!Array.isArray(payload.actions)||payload.actions.length<3||payload.actions.length>MAX_ACTIONS)fail("Session action limit (3–80).");
 const nodes=new Map(plan.nodes.map(n=>[n.id,n]));
 const placed=[],seen=new Set(),steps=[];let invalid=0,hints=0,repairVote=null,scopeVote=null;
 for(let i=0;i<payload.actions.length;i++){
  const a=payload.actions[i];
  if(!a||typeof a!=="object"||Array.isArray(a)||typeof a.kind!=="string")fail("Bad action.");
  if(a.kind==="place"){
    if(!exactKeys(a,["kind","node"])||typeof a.node!=="string"||!nodes.has(a.node))fail("Unknown plan stage.");
    const needed=nodes.get(a.node).needs.filter(id=>!seen.has(id)),accepted=!seen.has(a.node)&&needed.length===0;
    if(accepted){seen.add(a.node);placed.push(a.node);}else invalid++;
    steps.push({index:i,kind:"place",node:a.node,accepted,missing:needed});
  }else if(a.kind==="undo"){
    if(!exactKeys(a,["kind"])||!placed.length)fail("Invalid undo.");
    const last=placed.pop();seen.delete(last);steps.push({index:i,kind:"undo",node:last});
  }else if(a.kind==="hint"){
    if(!exactKeys(a,["kind"])||hints>=8)fail("Invalid hint count.");
    hints++;steps.push({index:i,kind:"hint",assisted:true});
  }else if(a.kind==="repair"){
    if(!exactKeys(a,["kind","choice"])||repairVote!==null||!repair.choices.some(c=>c.id===a.choice))fail("Invalid repair vote.");
    repairVote=a.choice;steps.push({index:i,kind:"repair",choice:a.choice,correct:a.choice===repair.missing_source});
  }else if(a.kind==="scope"){
    if(!exactKeys(a,["kind","choice","confidence"])||scopeVote!==null||
      !scope.choices.some(c=>c.id===a.choice)||!Number.isInteger(a.confidence)||a.confidence<1||a.confidence>3)
      fail("Invalid theorem interpretation.");
    scopeVote={choice:a.choice,confidence:a.confidence};
    steps.push({index:i,kind:"scope",correct:a.choice===scope.correct,confidence:a.confidence});
  }else fail("Unknown action kind.");
 }
 const complete=placed.length===plan.nodes.length,repairCorrect=repairVote===repair.missing_source,
 scopeCorrect=scopeVote?.choice===scope.correct;
 const score=Math.max(0,(complete?60:Math.floor(40*placed.length/plan.nodes.length))+
   (repairCorrect?20:0)+(scopeCorrect?20:0)-invalid*4-hints*5);
 return {format:"pcs-prooflab-educational-replay-v1",version:PROOFLAB_VERSION,
   task_id:plan.task.id,source_revision:CORE_SOURCE_COMMIT,module:plan.task.module,
   public_split:plan.task.split,task_source:{path:plan.task.source.path,line:plan.task.source.line,blob_sha:plan.task.source.blob_sha},
   attempted_actions:steps,placed,planned_stages:plan.nodes.length,complete,invalid_moves:invalid,hints,
   repair:{choice:repairVote,correct:repairCorrect,expected_stage:repair.missing_source},
   interpretation:{choice:scopeVote?.choice||null,confidence:scopeVote?.confidence||null,correct:Boolean(scopeCorrect)},
   score,game_scaffold_passed:Boolean(complete&&repairCorrect&&scopeCorrect),
   kernel_proof_verified:false,authentic_human_choice_verified:false,
   limitations:[
     "Stages and graph edges are an educational design, not actual extracted Lean proof obligations.",
     "No Lean proof object was elaborated or kernel checked by the website.",
     "Browser submissions cannot establish that a choice was made blindly by a human."
   ]};
}
export function taskDeck(split="all"){
 const items=split==="all"?TASKS:TASKS.filter(x=>x.split===split);
 return items.map(t=>({id:t.id,module:t.module,name:t.name,split:t.split,
  difficulty:Math.min(5,1+Math.floor(t.statement.length/160)+(t.syntactic_reference_mentions.length>0?1:0))}));
}
