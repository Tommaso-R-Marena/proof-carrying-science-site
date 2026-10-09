// PCS Multi-Step Semantic Repair v1: untrusted learned proposal ranking + independent finite replay.
// This browser-safe module NEVER treats a ranking score as a proof or Lean result.
import {getGauntletTask,GAUNTLET_VERSION} from './semantic-gauntlet-core.mjs';
import {REPAIR_VERSION,listRepairMoves,finiteRepairCheck,validateRepairFormula} from './semantic-repair-core.mjs';
import {POLICY_DIM,repairFeatures,dot} from './semantic-repair-policy.mjs';

export const MULTISTEP_VERSION='pcs-learned-semantic-multistep-v1';
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const clone=v=>structuredClone(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const MAX_CHECKS=240,MAX_BEAM=48,MAX_MOVE_CAP=240;
function randomGen(seed){let s=seed>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);}
export function makeMultiStepRequest(task_id,{candidate,max_edits=2,checker_budget=40,beam_width=12,move_cap=120,seed=23,mode='learned'}={}){
 const task=getGauntletTask(task_id);if(!task)throw Error('UNKNOWN_TASK_ID');
 return {format:MULTISTEP_VERSION,task_id,candidate:clone(candidate??task.candidate),
   max_edits,checker_budget,beam_width,move_cap,seed,mode};
}
function validate(req,model){
 if(!exact(req,['format','task_id','candidate','max_edits','checker_budget','beam_width','move_cap','seed','mode'])||req.format!==MULTISTEP_VERSION)
  throw Error('INVALID_MULTISTEP_REQUEST');
 const task=getGauntletTask(req.task_id);if(!task)throw Error('UNKNOWN_TASK_ID');
 if(!Number.isInteger(req.max_edits)||req.max_edits<1||req.max_edits>2||
    !Number.isInteger(req.checker_budget)||req.checker_budget<1||req.checker_budget>MAX_CHECKS||
    !Number.isInteger(req.beam_width)||req.beam_width<1||req.beam_width>MAX_BEAM||
    !Number.isInteger(req.move_cap)||req.move_cap<1||req.move_cap>MAX_MOVE_CAP||
    !Number.isInteger(req.seed)||req.seed<0||req.seed>0xffffffff||
    !['learned','original','seeded_random','source_guided','hybrid'].includes(req.mode))throw Error('INVALID_SEARCH_SETTINGS');
 validateRepairFormula(task,req.candidate);
 if(!model||!Array.isArray(model.weights)||model.weights.length!==POLICY_DIM||
    !model.weights.every(x=>typeof x==='number'&&Number.isFinite(x))||model.authority!=='NONE_UNTRUSTED_PROPOSALS_ONLY')
  throw Error('UNTRUSTED_MODEL_INVALID');
 return task;
}
/** Executes a bounded, level-ordered search. Every candidate is checked AFTER being ranked. */
export function searchMultiStepRepair(model,request){
 const task=validate(request,model),start=clone(request.candidate);
 const initial=finiteRepairCheck(task.id,start); // baseline check, counted explicitly
 const result={format:'pcs-learned-semantic-multistep-result-v1',request:clone(request),
   scope:'EXHAUSTIVE_FINITE_WORLD_CHECK_PER_EVALUATED_CANDIDATE',
   gauntlet_version:GAUNTLET_VERSION,repair_version:REPAIR_VERSION,
   checker:'PCS_FINITE_FIRST_ORDER_ENUMERATOR',kernel_checked:false,pcs_authority:false,
   claimed_unbounded_equivalence:false,
   initial_check:initial,checks_used:1,visited_formulas:1,attempts:[],
   complete_in_bounded_grammar:false,search_pruned:false,
   status:'NOT_STARTED',verified_repair:null,
   limitations:['No Lean kernel verification or full first-order equivalence proof',
     'Fixed public DSL, at most two AST edits, limited beam and checker budget',
     'Proposal scores do not certify results; all successful candidates are independently finite-checked',
     'Public tasks and public model: evaluation is NOT blind or source-independent']};
 if(initial.equivalent_within_bound){result.status='ALREADY_AGREES_WITHIN_BOUND';return result;}
 if(result.checks_used>=request.checker_budget){result.status='CHECKER_BUDGET_EXHAUSTED';return result;}
 let frontier=[{formula:start,edits:[],rank_sum:0}],seeded=randomGen(request.seed);
 const visited=new Set([JSON.stringify(start)]);
 let truncated=false;
 for(let depth=1;depth<=request.max_edits&&frontier.length;depth++){
  const next=[];
  for(const state of frontier){
   const actions=listRepairMoves(task.id,state.formula,request.move_cap);
   // The move generator itself may already be truncated by move_cap.
   if(actions.length===request.move_cap)truncated=true;
   const ranked=actions.map((move,index)=>({move,index,
    learned_score:dot(model.weights,repairFeatures(task,state.formula,move)),
    random_score:seeded()}));
   if(request.mode==='learned')ranked.sort((a,b)=>b.learned_score-a.learned_score||a.index-b.index);
   if(request.mode==='seeded_random')ranked.sort((a,b)=>a.random_score-b.random_score||a.index-b.index);
   for(const item of ranked){
    const move=item.move,key=JSON.stringify(move.formula);
    if(visited.has(key))continue;
    if(result.checks_used>=request.checker_budget){
     result.search_pruned=true;result.status='CHECKER_BUDGET_EXHAUSTED';return result;
    }
    visited.add(key);result.visited_formulas++;
    const trail=[...state.edits,{operation:move.operation,path:clone(move.path),
      before:clone(move.before),after:clone(move.after)}];
    const check=finiteRepairCheck(task.id,move.formula);result.checks_used++;
    const attempt={depth,formula:clone(move.formula),edits:trail,
      finite_check:check,proposal_score:item.learned_score};
    result.attempts.push(attempt);
    if(check.equivalent_within_bound){
     result.status='FINITE_REPAIR_FOUND';result.verified_repair={candidate:clone(move.formula),
       edit_count:depth,edits:trail,finite_check:check};
     return result;
    }
    if(depth<request.max_edits)next.push({formula:move.formula,edits:trail,
      rank_sum:state.rank_sum+item.learned_score});
   }
  }
  // Frontier pruning uses only feature scores or deterministic order, not future labels.
  if(next.length>request.beam_width){
   result.search_pruned=true;
   if(request.mode==='learned')next.sort((a,b)=>b.rank_sum-a.rank_sum||JSON.stringify(a.formula).localeCompare(JSON.stringify(b.formula)));
   frontier=next.slice(0,request.beam_width);
  }else frontier=next;
 }
 result.complete_in_bounded_grammar=!result.search_pruned&&!truncated;
 result.status=result.complete_in_bounded_grammar?'NO_REPAIR_IN_FULLY_EXPLORED_BOUNDED_GRAMMAR':'SEARCH_LIMIT_REACHED';
 return result;
}
/** Exact deterministic replay; a forged verdict, altered ranking or partial log is rejected. */
export function replayMultiStepRepair(model,claimed){
 if(!claimed||claimed.format!=='pcs-learned-semantic-multistep-result-v1')throw Error('INVALID_REPLAY_REPORT');
 const check=searchMultiStepRepair(model,claimed.request);
 if(!same(check,claimed))throw Error('MULTISTEP_RECORD_TAMPERED_OR_STALE');
 return {format:'pcs-learned-multistep-replay-v1',result:'EXACT_FINITE_REPLAY_MATCH',
   checker_calls:check.checks_used,kernel_checked:false,pcs_authority:false};
}

/** AST distance is an untrusted *heuristic*, not semantic equivalence. */
export function sourceTreeDistance(a,b){
 if(JSON.stringify(a)===JSON.stringify(b))return 0;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return 5;
 let loss=a.op===b.op?0:1;
 if(['pred','rel','eq'].includes(a.op)&&a.op===b.op){
  for(const key of ['name','x','y'])if(a[key]!==b[key])loss++;
  return loss;
 }
 if(a.op!==b.op&&(!a.f||!b.f)&&(!a.a||!b.a))return loss+3;
 if(a.x!==b.x&&(a.x!==undefined||b.x!==undefined))loss++;
 if(a.f&&b.f)return loss+sourceTreeDistance(a.f,b.f);
 if(a.a&&b.a)return loss+sourceTreeDistance(a.a,b.a)+sourceTreeDistance(a.b,b.b);
 return loss+3;
}

/** Best-first alternative. Counts ONLY actual full finite-checker calls; tracks unverified proposals separately. */
export function searchBestFirstRepair(model,request){
 const task=validate(request,model);
 const allowed=['learned','original','seeded_random','source_guided','hybrid'];
 if(!allowed.includes(request.mode))throw Error('UNKNOWN_BEST_FIRST_STRATEGY');
 const start=clone(request.candidate),initial=finiteRepairCheck(task.id,start);
 const report={format:'pcs-semantic-bestfirst-repair-v1',request:clone(request),
  strategy:request.mode,initial_check:initial,checks_used:1,generated_proposals:0,
  visited_formulas:1,attempts:[],status:'NOT_STARTED',verified_repair:null,
  search_complete:false,search_pruned:false,kernel_checked:false,pcs_authority:false,
  limitations:['Finite enumerated models only, no Lean proof',
    'Source-guided scoring can inspect the selected structured target; not a scientific generalization claim',
    'Ranking never counts as verification; every accepted repair must pass the full finite checker']};
 if(initial.equivalent_within_bound){report.status='ALREADY_AGREES_WITHIN_BOUND';return report;}
 if(report.checks_used>=request.checker_budget){report.status='CHECKER_BUDGET_EXHAUSTED';return report;}
 const rand=randomGen(request.seed),seen=new Map([[JSON.stringify(start),0]]);
 const frontier=[];let serial=0,source=request.mode==='source_guided'||request.mode==='hybrid';
 const addMoves=(state)=>{
  let moves=listRepairMoves(task.id,state.formula,request.move_cap);
  if(moves.length===request.move_cap)report.search_pruned=true;
  for(let i=0;i<moves.length;i++){
   const move=moves[i],key=JSON.stringify(move.formula),depth=state.edits.length+1;
   const prior=seen.get(key);
   if(prior!==undefined&&prior<=depth)continue;
   seen.set(key,depth);report.visited_formulas++;
   const v=dot(model.weights,repairFeatures(task,state.formula,move));
   const distance=source?sourceTreeDistance(task.source,move.formula):0;
   const priority=request.mode==='learned'?v:request.mode==='seeded_random'?rand():
     request.mode==='original'?0:request.mode==='source_guided'?-distance:
     -distance*10+v;
   report.generated_proposals++;
   frontier.push({formula:move.formula,
    edits:[...state.edits,{operation:move.operation,path:clone(move.path),before:clone(move.before),after:clone(move.after)}],
    score:priority,order:serial++});
  }
 };
 addMoves({formula:start,edits:[]});
 while(frontier.length){
  if(report.checks_used>=request.checker_budget){report.status='CHECKER_BUDGET_EXHAUSTED';return report;}
  frontier.sort((a,b)=>b.score-a.score||a.order-b.order);
  // Beam applies to *pending candidates*, and thus can discard potentially useful plans.
  if(frontier.length>request.beam_width){report.search_pruned=true;frontier.length=request.beam_width;}
  const next=frontier.shift();
  const finite=finiteRepairCheck(task.id,next.formula);report.checks_used++;
  report.attempts.push({depth:next.edits.length,formula:clone(next.formula),steps:next.edits,
    finite_check:finite,proposal_priority:next.score});
  if(finite.equivalent_within_bound){
   report.status='FINITE_REPAIR_FOUND';report.verified_repair={candidate:clone(next.formula),
    edit_count:next.edits.length,edits:next.edits,finite_check:finite};return report;
  }
  if(next.edits.length<request.max_edits)addMoves(next);
 }
 report.search_complete=!report.search_pruned;
 report.status=report.search_complete?'NO_REPAIR_IN_EXPLORED_BOUNDED_GRAMMAR':'SEARCH_LIMIT_REACHED';
 return report;
}
export function replayBestFirstRepair(model,claimed){
 if(!claimed||claimed.format!=='pcs-semantic-bestfirst-repair-v1')throw Error('INVALID_BESTFIRST_RECORD');
 if(!same(claimed,searchBestFirstRepair(model,claimed.request)))throw Error('BESTFIRST_RECORD_TAMPERED_OR_STALE');
 return {format:'pcs-semantic-bestfirst-replay-v1',result:'EXACT_FINITE_REPLAY_MATCH',
  checked:claimed.checks_used,kernel_checked:false};
}
