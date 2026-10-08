// PCS Semantic Repair Lab v1. BOUNDED finite-model research only, not Lean or logical equivalence proof.
// Every proposed edit is replayable and every finite outcome is checked by the Gauntlet evaluator.
import {GAUNTLET_VERSION, getGauntletTask, worldFromBits, gauntletVerdict, formulaSymbols} from './semantic-gauntlet-core.mjs';
export const REPAIR_VERSION='pcs-semantic-repair-lab-v1';
export const DEFAULT_CANDIDATE_BUDGET=240;
export const MAX_CANDIDATE_BUDGET=600;
export const MAX_REPAIR_DEPTH=2;
const clone=x=>structuredClone(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join('|')===[...keys].sort().join('|');
const unaryVars=['x','y','z'];
const kids={not:['f'],and:['a','b'],or:['a','b'],imp:['a','b'],forall:['f'],exists:['f']};

/** Validate a typed, closed formula and its grounding, WITHOUT trusting a proposer. */
export function validateRepairFormula(task,formula){
 if(!task||task.version!==GAUNTLET_VERSION)throw Error('Unknown benchmark task');
 let nodes=0;
 function visit(f,bound,depth){
  if(!f||typeof f!=='object'||Array.isArray(f)||depth>14||++nodes>40)throw Error('Formula too deep or large');
  switch(f.op){
   case 'pred':
    if(!exact(f,['op','name','x'])||!task.symbols.unary.includes(f.name)||!bound.has(f.x))throw Error('Invalid grounded unary atom');break;
   case 'rel':
    if(!exact(f,['op','name','x','y'])||!task.symbols.binary.includes(f.name)||!bound.has(f.x)||!bound.has(f.y))throw Error('Invalid grounded relation');break;
   case 'eq':
    if(!exact(f,['op','x','y'])||!bound.has(f.x)||!bound.has(f.y))throw Error('Invalid grounded equality');break;
   case 'not':
    if(!exact(f,['op','f']))throw Error('Malformed negation');visit(f.f,bound,depth+1);break;
   case 'and':case 'or':case 'imp':
    if(!exact(f,['op','a','b']))throw Error('Malformed connective');visit(f.a,bound,depth+1);visit(f.b,bound,depth+1);break;
   case 'forall':case 'exists':
    if(!exact(f,['op','x','f'])||!unaryVars.includes(f.x)||bound.has(f.x))throw Error('Malformed or shadowing binder');
    visit(f.f,new Set([...bound,f.x]),depth+1);break;
   default:throw Error('Unsupported formula operation');
  }
 }
 visit(formula,new Set(),0);
 // Double-check interpreted closure against the existing Gauntlet signature rules.
 formulaSymbols(formula);
 return nodes;
}

function enumerateNodes(formula){
 const found=[];
 function rec(node,path,bound){
  found.push({node,path,bound});
  for(const key of kids[node.op]||[]){
   if(!node[key]||typeof node[key]!=='object')continue;
   rec(node[key],[...path,key],(node.op==='forall'||node.op==='exists')?new Set([...bound,node.x]):bound);
  }
 }
 rec(formula,[],new Set());return found;
}
function replacing(tree,path,newValue){
 const result=clone(tree);let ptr=result;
 if(!path.length)return clone(newValue);
 for(const k of path.slice(0,-1))ptr=ptr[k];ptr[path.at(-1)]=clone(newValue);
 return result;
}
function replaceNode(node,mut){return {...clone(node),...mut};}
/** Generate one-step human-editable mutations from a registered formula; no oracle calls. */
export function listRepairMoves(taskId,candidate,limit=80){
 const task=getGauntletTask(taskId);if(!task)throw Error('Unknown task ID');
 validateRepairFormula(task,candidate);
 if(!Number.isInteger(limit)||limit<1||limit>600)throw Error('Invalid move cap');
 const result=[],seen=new Set();
 function emit(node,path,operation,target){
  const formula=replacing(candidate,path,target),key=JSON.stringify(formula);
  if(seen.has(key)||same(formula,candidate))return;
  try{validateRepairFormula(task,formula);}catch{return;}
  seen.add(key);
  result.push({operation,path:[...path],before:clone(node),after:clone(target),formula});
 }
 for(const {node,path,bound} of enumerateNodes(candidate)){
  if(node.op==='forall'||node.op==='exists')emit(node,path,'flip_quantifier',replaceNode(node,{op:node.op==='forall'?'exists':'forall'}));
  if(['and','or','imp'].includes(node.op)){
   for(const op of ['and','or','imp'])if(op!==node.op)emit(node,path,'replace_connective',replaceNode(node,{op}));
   emit(node,path,'exchange_operands',replaceNode(node,{a:node.b,b:node.a}));
  }
  if(node.op==='not')emit(node,path,'remove_negation',node.f);
  else emit(node,path,'insert_negation',{op:'not',f:clone(node)});
  if(node.op==='pred'){
   for(const name of task.symbols.unary)if(name!==node.name)emit(node,path,'reground_predicate',replaceNode(node,{name}));
   for(const v of bound)if(v!==node.x)emit(node,path,'change_atom_variable',replaceNode(node,{x:v}));
  }
  if(node.op==='rel'){
   emit(node,path,'reverse_relation',replaceNode(node,{x:node.y,y:node.x}));
   for(const v of bound){if(v!==node.x)emit(node,path,'change_relation_variable',replaceNode(node,{x:v}));
    if(v!==node.y)emit(node,path,'change_relation_variable',replaceNode(node,{y:v}));}
  }
  if(node.op==='eq'){
   emit(node,path,'reverse_equality',replaceNode(node,{x:node.y,y:node.x}));
   for(const v of bound){if(v!==node.x)emit(node,path,'change_equality_variable',replaceNode(node,{x:v}));
    if(v!==node.y)emit(node,path,'change_equality_variable',replaceNode(node,{y:v}));}
  }
 }
 return result.slice(0,limit);
}

function ones(mask){let n=0;while(mask){n+=mask&1;mask>>>=1;}return n;}
const WORLD_CACHE=new Map();
function allWorlds(task){
 if(WORLD_CACHE.has(task.id))return WORLD_CACHE.get(task.id);
 const records=[];
 for(let n=1;n<=task.bound;n++){
  const bits=task.symbols.unary.length*n+task.symbols.binary.length*n*n;
  if(bits>15)throw Error('Finite search cap exceeded');
  for(let weight=0;weight<=bits;weight++)for(let mask=0;mask<2**bits;mask++){
   if(ones(mask)===weight)records.push(worldFromBits(task,n,mask));
  }
 }
 // Bounded public puzzles only: no dynamic user-supplied formula families.
 WORLD_CACHE.set(task.id,records);return records;
}
/** Verifiable minimal-domain witness or exhaustive agreement within a declared bound. */
export function finiteRepairCheck(taskId,candidate){
 const task=getGauntletTask(taskId);if(!task)throw Error('Unknown task ID');
 validateRepairFormula(task,candidate);
 const changed={...task,candidate};let count=0;
 for(const world of allWorlds(task)){
  count++;const outcome=gauntletVerdict(changed,world);
  if(outcome.countermodel)return {equivalent_within_bound:false,checked_models:count,
   minimum_countermodel_domain:world.n,countermodel:clone(world),source_truth:outcome.source,candidate_truth:outcome.candidate};
 }
 return {equivalent_within_bound:true,checked_models:count,minimum_countermodel_domain:null,
   countermodel:null,source_truth:null,candidate_truth:null};
}

export function repairRequestForTask(taskId,options={}){
 const task=getGauntletTask(taskId);if(!task)throw Error('Unknown task ID');
 const {max_edits=2,max_candidates=DEFAULT_CANDIDATE_BUDGET,candidate=task.candidate}=options;
 return {format:REPAIR_VERSION,task_id:taskId,max_edits,max_candidates,candidate:clone(candidate)};
}

export function analyzeSemanticRepair(request){
 if(!exact(request,['format','task_id','candidate','max_edits','max_candidates'])||request.format!==REPAIR_VERSION)
  throw Error('Invalid repair request contract');
 const task=getGauntletTask(request.task_id);if(!task)throw Error('Unregistered repair task');
 if(!Number.isInteger(request.max_edits)||request.max_edits<0||request.max_edits>MAX_REPAIR_DEPTH||
    !Number.isInteger(request.max_candidates)||request.max_candidates<1||request.max_candidates>MAX_CANDIDATE_BUDGET)
   throw Error('Invalid bounded search budget');
 validateRepairFormula(task,request.candidate);
 const original=clone(request.candidate),initial=finiteRepairCheck(task.id,original);
 const evidence={format:'pcs-semantic-repair-result-v1',task_id:task.id,task_version:GAUNTLET_VERSION,
  checker:'PCS_GAUNTLET_FINITE_FIRST_ORDER_ENUMERATOR',scope:'ALL_SUPPORTED_FINITE_MODELS_WITHIN_TASK_BOUND',
  bound:task.bound,finite_worlds_per_candidate:allWorlds(task).length,
  kernel_checked:false,pcs_authority:false,unbounded_equivalence_proved:false,
  input_candidate:original,initial_check:initial,max_edits:request.max_edits,
  max_candidates:request.max_candidates,examined_candidates:0,
  search_exhaustive_within_edit_limit:false,search_status:'NOT_STARTED',
  minimum_edits_found:null,repairs:[],limitations:[
    'Agreement over enumerated finite models is NOT universal first-order equivalence.',
    'Mutation grammar is incomplete; exhausted search is not proof that no repair exists.',
    'All labels are bounded JS-checker labels, not Lean/kernel certificates.',
    'No human natural-language intent or real-world facts have been verified.']};
 if(initial.equivalent_within_bound){evidence.search_status='ALREADY_AGREES_WITHIN_BOUND';evidence.search_exhaustive_within_edit_limit=true;return evidence;}
 const visited=new Set([JSON.stringify(original)]);
 let queue=[{formula:original,edits:[]}],exhausted=false;
 // Breadth-first search: selected minimal number of primitive AST edits if fully explored.
 for(let level=1;level<=request.max_edits;level++){
  const next=[];
  for(const current of queue){
   const moves=listRepairMoves(task.id,current.formula,600);
   for(const move of moves){
    const key=JSON.stringify(move.formula);if(visited.has(key))continue;
    visited.add(key);
    if(evidence.examined_candidates>=request.max_candidates){exhausted=true;break;}
    evidence.examined_candidates++;
    const trail=[...current.edits,{operation:move.operation,path:move.path,before:move.before,after:move.after}];
    const checked=finiteRepairCheck(task.id,move.formula);
    if(checked.equivalent_within_bound){
      evidence.repairs.push({edit_count:level,steps:trail,candidate:move.formula,
       check:checked,verification:'EXHAUSTIVE_FINITE_AGREEMENT_ONLY'});
    }else if(level<request.max_edits){next.push({formula:move.formula,edits:trail});}
   }
   if(exhausted)break;
  }
  if(exhausted||evidence.repairs.length)break;
  queue=next;
  if(!queue.length)break;
 }
 // Early successful termination does not prove the full two-step search space was enumerated.
 evidence.search_exhaustive_within_edit_limit=!exhausted&&!evidence.repairs.length;
 evidence.search_status=evidence.repairs.length?'BOUNDED_REPAIR_FOUND':exhausted?'CANDIDATE_BUDGET_EXHAUSTED':'NO_REPAIR_IN_ENUMERATED_EDITS';
 if(evidence.repairs.length){
  evidence.minimum_edits_found=evidence.repairs[0].edit_count;
  evidence.repairs.sort((a,b)=>a.edit_count-b.edit_count||JSON.stringify(a.candidate).localeCompare(JSON.stringify(b.candidate)));
  evidence.repairs=evidence.repairs.slice(0,5);
 }
 return evidence;
}

/** Offline recheck of saved output (requires exact input). Completely ignores the output's claimed authority. */
export function recheckSemanticRepair(request,claimed){
 const expected=analyzeSemanticRepair(request);
 if(!same(expected,claimed))throw Error('REPAIR_REPORT_TAMPERED_OR_STALE');
 return {format:'pcs-semantic-repair-recheck-v1',result:'REPLAY_MATCHED',task_id:expected.task_id,
  finite_only:true,kernel_checked:false,independent_proof:false};
}
