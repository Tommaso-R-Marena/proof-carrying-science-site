// PCS ProofLab v2: a deterministic *pedagogical* evidence-planning engine.
// This is not Lean elaboration, model-checked safety, or a source-code proof.
import {PROOFLAB_CASES,PROOFLAB_SOURCE_COMMIT,PROOFLAB_WITHHELD} from "./prooflab-source-data.mjs";

export const PROOFLAB_VERSION="pcs-prooflab-plan-v2";
export const PROOFLAB_REASONS=Object.freeze([
  {id:"premises",label:"Establish assumptions"},
  {id:"source",label:"Check source provenance"},
  {id:"dependency",label:"Resolve a cited theorem"},
  {id:"falsification",label:"Try to falsify the claim"},
  {id:"scope",label:"Clarify limitations"},
  {id:"efficiency",label:"Reduce later rework"},
  {id:"intuition",label:"Research intuition"},
  {id:"unsure",label:"Not sure yet"}
]);
export const PROOFLAB_CAMPAIGNS=Object.freeze([
  {id:"Binding",label:"Evidence Lockdown",icon:"🔐",color:"blue",description:"Stop claim and evidence substitution"},
  {id:"Workflow",label:"Workflow Detective",icon:"🧭",color:"teal",description:"Resolve exact workflow dependencies"},
  {id:"PKPDCheck",label:"Pharmacology Lab",icon:"🧪",color:"purple",description:"Interrogate numerical model claims"}
]);
export const PROOFLAB_MIN_STEPS=4;
export const PROOFLAB_MAX_STEPS=26;
const INDEX=new Map(PROOFLAB_CASES.map(c=>[c.id,c]));
const REASONS=new Set(PROOFLAB_REASONS.map(x=>x.id));
export function proofLabCase(id){return INDEX.get(id)||null;}
export function allProofLabCases(){return PROOFLAB_CASES;}
function exactKeys(value,keys){
  return Boolean(value&&typeof value==="object"&&!Array.isArray(value)&&
    Object.keys(value).sort().join("|")===keys.slice().sort().join("|"));
}
function nodeMap(c){return new Map(c.nodes.map(n=>[n.id,n]));}
export function availablePlanMoves(caseId,completed=[]){
  const c=proofLabCase(caseId);
  if(!c||!Array.isArray(completed))return [];
  const set=new Set(completed);
  return c.nodes.filter(n=>!set.has(n.id)&&n.needs.every(dep=>set.has(dep))).map(n=>n.id);
}
export function proofLabDecisionSet(caseId,completed=[],stepIndex=0){
  const c=proofLabCase(caseId);
  if(!c||!Array.isArray(completed)||!Number.isInteger(stepIndex)||stepIndex<0)return [];
  const done=new Set(completed);
  if(done.size!==completed.length||completed.some(id=>typeof id!=="string"||!c.nodes.some(n=>n.id===id)))return [];
  const remaining=c.nodes.filter(n=>!done.has(n.id));
  const feasible=remaining.filter(n=>n.needs.every(dep=>done.has(dep)));
  const blocked=remaining.filter(n=>!n.needs.every(dep=>done.has(dep))).sort((a,b)=>{
    const am=a.needs.filter(dep=>!done.has(dep)).length,bm=b.needs.filter(dep=>!done.has(dep)).length;
    return am-bm||a.needs.length-b.needs.length||a.id.localeCompare(b.id);
  });
  // Controlled candidate sets turn a broad DAG into a repeated planning decision:
  // include up to three members of the actually feasible frontier, plus plausible
  // near-frontier distractors. The deterministic shuffle prevents position from
  // becoming a label; later rounds rotate remaining feasible work into view.
  let pool=[...feasible.slice(0,3),...blocked.slice(0,Math.max(0,4-Math.min(3,feasible.length)))];
  if(!pool.length)return [];
  const seed=[...caseId].reduce((n,ch)=>(Math.imul(n,33)+ch.charCodeAt(0))>>>0,5381) ^
    ((stepIndex+1)*2654435761>>>0) ^ (completed.length*2246822519>>>0);
  pool=pool.map((node,index)=>({node,key:(seed^Math.imul(index+1,1597334677)^
    [...node.id].reduce((n,ch)=>(Math.imul(n,31)+ch.charCodeAt(0))>>>0,7))>>>0}))
    .sort((a,b)=>a.key-b.key||a.node.id.localeCompare(b.node.id)).map(x=>x.node);
  return pool.map(n=>n.id);
}

export function replayProofLabSteps(caseId,actions){
  const c=proofLabCase(caseId);
  if(!c)throw Error("Unknown or reserved ProofLab case.");
  if(!Array.isArray(actions)||actions.length>PROOFLAB_MAX_STEPS)throw Error("Invalid or oversized plan.");
  const nodes=nodeMap(c),completed=new Set(),attempts=new Map(),steps=[];
  let rejected=0,accepted=0,wrongSequence=0;
  for(const [index,action] of actions.entries()){
    if(!exactKeys(action,["node","reason","confidence","assisted"])||
      typeof action.node!=="string"||!nodes.has(action.node)||
      !REASONS.has(action.reason)||!Number.isInteger(action.confidence)||
      action.confidence<1||action.confidence>3||typeof action.assisted!=="boolean")
      throw Error("Malformed action or unsupported reasoning tag.");
    const completedBefore=[...completed];
    const choiceSet=proofLabDecisionSet(caseId,completedBefore,index);
    const feasibleBefore=availablePlanMoves(caseId,completedBefore).filter(id=>choiceSet.includes(id));
    if(!choiceSet.includes(action.node))throw Error("Selected investigation is outside the deterministic decision set.");
    const n=nodes.get(action.node),prior=attempts.get(action.node)||0;
    if(prior>=4)throw Error("Excessive repeated attempts on one plan step.");
    attempts.set(action.node,prior+1);
    const missing=n.needs.filter(dep=>!completed.has(dep));
    const repeated=completed.has(n.id);
    const valid=!repeated&&missing.length===0;
    if(valid){completed.add(n.id);accepted++;}else{rejected++;if(missing.length)wrongSequence++;}
    steps.push({index,node:n.id,kind:n.kind,reason:action.reason,confidence:action.confidence,
      assisted:action.assisted,choice_set:choiceSet,feasible_choices:feasibleBefore,
      accepted:valid,missing_prerequisites:missing,repeated,
      available_next:availablePlanMoves(caseId,[...completed])});
  }
  const finished=completed.size===c.nodes.length&&completed.has("review");
  const hintsPenalty=0; // Hints are tracked and applied separately in the session grade.
  const score=Math.max(0,Math.min(100,Math.round(100*completed.size/c.nodes.length)-
    rejected*9-hintsPenalty));
  return {case_id:caseId,version:PROOFLAB_VERSION,source_commit:PROOFLAB_SOURCE_COMMIT,
    completed:finished,accepted,rejected,wrong_sequence:wrongSequence,checked_steps:steps,
    completed_node_ids:[...completed],next_available:availablePlanMoves(caseId,[...completed]),
    score,source_status:c.evidence_status,
    verdict_scope:"Source-anchored educational graph replay ONLY; no Lean kernel check."};
}
export function evaluateProofLabSession(payload){
  if(!exactKeys(payload,["case_id","version","actions","hints_used","threat","threat_confidence"]))
    throw Error("Unexpected ProofLab research payload.");
  const c=proofLabCase(payload.case_id);
  if(!c||payload.version!==PROOFLAB_VERSION)throw Error("Unknown task or outdated benchmark version.");
  if(!Array.isArray(payload.actions)||payload.actions.length<PROOFLAB_MIN_STEPS||
    payload.actions.length>PROOFLAB_MAX_STEPS)throw Error("Contribute 4 to 26 bounded interactions.");
  if(!Number.isInteger(payload.hints_used)||payload.hints_used<0||payload.hints_used>12)
    throw Error("Invalid hint count.");
  if(typeof payload.threat!=="string"||!c.threats.includes(payload.threat)||
    !Number.isInteger(payload.threat_confidence)||payload.threat_confidence<1||
    payload.threat_confidence>3)throw Error("Invalid threat hypothesis.");
  const replay=replayProofLabSteps(c.id,payload.actions);
  return {format:"pcs-prooflab-verified-education-session-v2",
    case_id:c.id,source_commit:PROOFLAB_SOURCE_COMMIT,
    campaign:c.campaign,split:"training",case_theorem:c.theorem,
    actions:payload.actions.map(x=>({...x})),
    hints_used:payload.hints_used,
    challenge:{threat:payload.threat,confidence:payload.threat_confidence,
      status:"human-selected hypothesis; not empirically verified"},
    graph_replay:{completed:replay.completed,accepted:replay.accepted,
      rejected:replay.rejected,wrong_sequence:replay.wrong_sequence,
      completed_node_ids:replay.completed_node_ids,checked_steps:replay.checked_steps,
      score:Math.max(0,replay.score-payload.hints_used*3)},
    training_labels:{task:"source-anchored listwise next-investigation choice",
      verified_label_scope:"Deterministic source-indexed candidate set plus graph prerequisite feasibility; not a Lean proof.",
      human_reason_status:"self-reported; timing and authorship unverifiable",
      decision_count:replay.checked_steps.length,
      blind_decisions:replay.checked_steps.filter(x=>!x.assisted).length,
      assisted_decisions:replay.checked_steps.filter(x=>x.assisted).length,
      listwise_supervision:replay.checked_steps.map(x=>({choice_set:[...x.choice_set],
        selected:x.node,feasible_choices:[...x.feasible_choices],selected_feasible:x.accepted,
        assisted:x.assisted,reason:x.reason,confidence:x.confidence}))},
    privacy:"only explicit account-backed adult opt-in; no browser telemetry by default"};
}
export function graphIntegrity(){
  if(PROOFLAB_CASES.length!==22||PROOFLAB_WITHHELD.validation!==8||PROOFLAB_WITHHELD.evaluation!==10)
    throw Error("Incorrect training/heldout benchmark boundary.");
  for(const c of PROOFLAB_CASES){
    if(c.split!=="training")throw Error("Held-out theorem leaked to public game.");
    const byId=nodeMap(c),seen=new Set(),walking=new Set();
    if(byId.size!==c.nodes.length||!byId.has("review"))throw Error("Invalid instructional graph.");
    const visit=id=>{
      if(walking.has(id))throw Error("Cyclic educational obligation graph.");
      if(seen.has(id))return;
      const node=byId.get(id);if(!node)throw Error("Undefined node dependency.");
      walking.add(id);
      for(const dep of node.needs)visit(dep);
      walking.delete(id);seen.add(id);
    };
    for(const n of c.nodes)visit(n.id);
    for(const thm of c.cited_theorems){
      if(byId.get("lemma-"+thm)?.source_theorem!==thm)throw Error("Cited lemma missing provenance.");
    }
  }
  return true;
}
graphIntegrity();
