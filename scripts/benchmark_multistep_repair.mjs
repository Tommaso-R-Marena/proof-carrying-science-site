// Source-derived two-edit benchmark with fixed challenges from PUBLIC evaluation families.
// This is an authored stress test, NOT a blind benchmark or evidence of AI alignment.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GAUNTLET_TASKS,GAUNTLET_VERSION} from '../public/semantic-gauntlet-core.mjs';
import {listRepairMoves,finiteRepairCheck,REPAIR_VERSION} from '../public/semantic-repair-core.mjs';
import {makeMultiStepRequest,searchMultiStepRepair,searchBestFirstRepair,MULTISTEP_VERSION,replayMultiStepRepair,replayBestFirstRepair} from '../public/semantic-multistep-core.mjs';
import {validateRepairModel} from './train_semantic_repair_policy.mjs';
import {strictParseJson} from './semantic_evaluation_firewall.mjs';
export const MULTISTEP_BENCH_FORMAT='pcs-multistep-semantic-repair-benchmark-v1';
const digest=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x);
const clone=x=>structuredClone(x);
const RECIPES=Object.freeze([
 ['implication-reversal','flip_quantifier',[], 'replace_connective',['f']],
 ['disjunction-commutation','flip_quantifier',[], 'replace_connective',['f']],
 ['relational-quantifier-scope','flip_quantifier',[], 'flip_quantifier',['f']],
 ['diagonal-variable-capture','flip_quantifier',[], 'flip_quantifier',['f']],
 ['assumption-loss','replace_connective',[], 'flip_quantifier',['a']],
 ['exists-distributes-or','flip_quantifier',[], 'replace_connective',['f']],
]);
function selectMove(task,formula,operation,path){
 const found=listRepairMoves(task.id,formula,240).find(m=>m.operation===operation&&canonical(m.path)===canonical(path));
 if(!found)throw Error('SOURCE_MUTATION_GRAMMAR_DRIFT: '+task.id+' '+operation);
 return found;
}
/** Fixed deterministic two-step perturbations; no labels enter model training or ranking. */
export function buildTwoStepChallenges(){
 const examples=[];
 for(const [family,op1,path1,op2,path2] of RECIPES){
  for(const task of GAUNTLET_TASKS.filter(t=>t.family===family)){
   if(task.split!=='evaluation')throw Error('TRAINING_ORIGIN_LEAKAGE');
   const m1=selectMove(task,task.source,op1,path1);
   const m2=selectMove(task,m1.formula,op2,path2);
   const candidate=clone(m2.formula);
   const fail=finiteRepairCheck(task.id,candidate);
   if(fail.equivalent_within_bound)throw Error('CHALLENGE_NOT_AN_ERROR');
   const neighbors=listRepairMoves(task.id,candidate,240);
   if(neighbors.some(m=>finiteRepairCheck(task.id,m.formula).equivalent_within_bound))
    throw Error('CHALLENGE_TRIVIALLY_ONE_STEP: '+task.id);
   const fingerprint=digest(canonical({id:task.id,candidate}));
   examples.push({id:task.id,family:task.family,split:task.split,
    semantic_skill:task.skill,source_version:GAUNTLET_VERSION,
    mutated_candidate:candidate,candidate_sha256:fingerprint,
    initial_finite_countermodel:fail.countermodel,
    generated_using:'TWO_VERIFIABLE_TYPED_AST_EDITS_FROM_SOURCE',
    exact_two_step_source_path:[{operation:m1.operation,path:m1.path},{operation:m2.operation,path:m2.path}],
    assurance:'FINITE_ENUMERATION_ONLY'});
  }
 }
 return {format:'pcs-multistep-repair-challenges-v1',source_version:GAUNTLET_VERSION,
  repair_version:REPAIR_VERSION,all_public:true,blind_evaluation:false,
  training_labels_used:false,evaluation_family_count:RECIPES.length,
  examples};
}
const metric=cases=>({tasks:cases.length,solved:cases.filter(x=>x.success).length,
 checker_calls:cases.reduce((a,x)=>a+x.checks,0),
 success_rate:cases.length?cases.filter(x=>x.success).length/cases.length:null,
 mean_calls:cases.length?Number((cases.reduce((a,x)=>a+x.checks,0)/cases.length).toFixed(4)):null});
export function benchmarkMultiStep(model,{checker_budget=55,beam_width=16,move_cap=120,seed=23}={}){
 validateRepairModel(model,{retrain:true});
 const pack=buildTwoStepChallenges();
 const cases=[];
 for(const entry of pack.examples){
  const strategies={};
  for(const mode of ['learned','original','seeded_random','source_guided','hybrid']){
   const request=makeMultiStepRequest(entry.id,{candidate:entry.mutated_candidate,max_edits:2,
    checker_budget,beam_width,move_cap,seed,mode});
   const result=searchBestFirstRepair(model,request);
   const verification=replayBestFirstRepair(model,result);
   if(verification.result!=='EXACT_FINITE_REPLAY_MATCH')throw Error('FAIL_CLOSED_REPLAY');
   strategies[mode]={success:result.status==='FINITE_REPAIR_FOUND',checker_calls:result.checks_used,
    status:result.status,depth:result.verified_repair?.edit_count??null,visited:result.visited_formulas,
    generated_proposals:result.generated_proposals,
    candidate_replay_verified:verification.result==='EXACT_FINITE_REPLAY_MATCH'};
  }
  // Copying the fully known structured source is a trivial oracle baseline in this toy DSL.
  // We must report it rather than mistakenly present the learned ranker as state of the art.
  const copyCheck=finiteRepairCheck(entry.id,GAUNTLET_TASKS.find(t=>t.id===entry.id).source);
  if(!copyCheck.equivalent_within_bound)throw Error('SOURCE_COPY_ORACLE_FAILURE');
  strategies.literal_source_copy={success:true,checker_calls:2,status:'TRIVIAL_SAME_DSL_COPY',
    depth:null,visited:2,generated_proposals:1,candidate_replay_verified:true};
  cases.push({id:entry.id,family:entry.family,split:entry.split,
    candidate_sha256:entry.candidate_sha256,...strategies});
 }
 return {format:MULTISTEP_BENCH_FORMAT,engine:MULTISTEP_VERSION,model_sha256:model.model_digest_sha256,
  scenario_set_sha256:digest(canonical(pack)),
  provenance:'PUBLIC_SYNTHETIC_EVALUATION_FAMILIES_COMPOSED_FROM_SOURCE',
  training_labels_used_for_inference:false,
  interpretation:'The source AST is available; literal source copying is a trivial upper bound, and the benchmark is NOT evidence of English-to-Lean generalization.',
  claims:{kernel_checked:false,blind_evaluation:false,scientific_generalization:false,
    checker:'EXHAUSTIVE_FIRST_ORDER_FINITE_MODELS_UP_TO_EACH_TASK_BOUND'},
  parameters:{checker_budget,beam_width,move_cap,seed,max_edits:2},
  metrics:Object.fromEntries(['learned','original','seeded_random','source_guided','hybrid','literal_source_copy'].map(m=>[m,metric(cases.map(c=>({success:c[m].success,checks:c[m].checker_calls})))])),
  cases};
}
export function recheckBenchmarkReport(model,claimed){
 if(!claimed||claimed.format!==MULTISTEP_BENCH_FORMAT)throw Error('WRONG_BENCHMARK_SCHEMA');
 const expected=benchmarkMultiStep(model,claimed.parameters);
 if(canonical(expected)!==canonical(claimed))throw Error('BENCHMARK_FORGERY_OR_VERSION_DRIFT');
 return {format:'pcs-multistep-benchmark-replay-v1',replay:'MATCHED',
   kernel_checked:false,scenarios:expected.cases.length};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [mode,modelPath,outputPath]=process.argv.slice(2);
 try{
  if(!['evaluate','verify','challenges'].includes(mode)||!modelPath||!outputPath)
   throw Error('Usage: evaluate MODEL.json REPORT.json | verify MODEL.json REPORT.json | challenges MODEL.json TASKS.json');
  const model=strictParseJson(readFileSync(modelPath,'utf8'));
  const result=mode==='evaluate'?benchmarkMultiStep(model):mode==='challenges'?buildTwoStepChallenges():
    recheckBenchmarkReport(model,strictParseJson(readFileSync(outputPath,'utf8')));
  if(mode==='verify')console.log(JSON.stringify(result));
  else writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 }catch(e){console.error('PCS_MULTISTEP_REJECTED: '+String(e.message||e));process.exitCode=2;}
}
