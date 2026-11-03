// Beginner view of the existing PCS ranker and finite evaluator. No new model,
// learned weights, proof authority or prewritten positive verdict is introduced.
import {verifiedRepairModel,REPAIR_MODEL_DIGEST} from './repair-model-integrity.mjs';
import {getGauntletTask} from './semantic-gauntlet-core.mjs';
import {listRepairMoves,finiteRepairCheck} from './semantic-repair-core.mjs';
import {rankRepairMoves} from './semantic-repair-policy.mjs';
import {canonical} from './file-check-core.mjs';
export const CASES=Object.freeze([
 Object.freeze({id:'implication-reversal-1',title:'Keep a permission rule intact',why:'An assistant rewrites a rule about using tools. Does the rewrite still require permission?',words:Object.freeze(['use a tool','have permission'])}),
 Object.freeze({id:'universal-existential-1',title:'Does everyone need a key?',why:'A rule says every character has a key. A rewrite only says someone has one. Can the model repair the change?',words:Object.freeze(['have a key','can open the door'])})
]);
export function caseFor(id){const c=CASES.find(c=>c.id===id);if(!c)throw Error('Choose one of the supported examples.');return c;}
export function describeFormula(id,formula){
 const c=caseFor(id),task=getGauntletTask(id);
 function words(f){switch(f.op){
  case 'pred':{const i=task.symbols.unary.indexOf(f.name);if(i<0||f.x!=='x')throw Error('Unsupported beginner wording');return 'they '+c.words[i];}
  case 'forall':return 'For every character, '+words(f.f);
  case 'exists':return 'For at least one character, '+words(f.f);
  case 'imp':return 'if ('+words(f.a)+'), then ('+words(f.b)+')';
  case 'and':return '('+words(f.a)+') and ('+words(f.b)+')';
  case 'or':return '('+words(f.a)+') or ('+words(f.b)+')';
  case 'not':return 'it is false that ('+words(f.f)+')';
  default:throw Error('Unsupported beginner wording');
 }}return words(formula)+'.';
}
export async function runModelExample(input,id,kind='learned'){
 caseFor(id);if(!['learned','original'].includes(kind))throw Error('Unknown proposal strategy.');
 const model=await verifiedRepairModel(input),task=getGauntletTask(id);
 const initial=finiteRepairCheck(id,task.candidate);
 const moves=kind==='learned'?rankRepairMoves(model,task,task.candidate,listRepairMoves,{limit:160}):listRepairMoves(id,task.candidate,160);
 const attempts=[];for(const move of moves.slice(0,5)){
  const checked=finiteRepairCheck(id,move.formula);
  attempts.push({operation:move.operation,path:move.path,proposal:structuredClone(move.formula),model_score:kind==='learned'?move.learned_score:null,checked});
  if(checked.equivalent_within_bound)break;
 }
 return {format:'pcs-model-walkthrough-replay-v1',task_id:id,task_version:task.version,domain_bound:task.bound,strategy:kind,proposal_budget:5,model_digest:REPAIR_MODEL_DIGEST,source:structuredClone(task.source),original:structuredClone(task.candidate),initial,attempts,repair_found:attempts.some(a=>a.checked.equivalent_within_bound),scope:'EXHAUSTIVE_REGISTERED_FINITE_WORLDS_ONLY',lean_kernel_executed:false,pcs_authority:false};
}
export async function replayModelExample(bytes,input){
 if(!(bytes instanceof Uint8Array)||bytes.length>65536)throw Error('Choose a replay file up to 64 KiB.');
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('This is not a valid UTF-8 JSON replay.');}
 if(value?.format!=='pcs-model-walkthrough-replay-v1'||value.proposal_budget!==5||value.model_digest!==REPAIR_MODEL_DIGEST)throw Error('Unsupported model replay.');
 const expected=await runModelExample(input,value.task_id,value.strategy);
 if(canonical(value)!==canonical(expected))throw Error('The recorded proposals or results disagree with a fresh run.');
 return expected;
}
