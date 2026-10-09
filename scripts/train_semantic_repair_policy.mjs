// PCS Model Foundry v1: an ACTUALLY FITTED, untrusted ranker for bounded semantic repairs.
// Checker-generated labels on training-family tasks only. Not a proof, Lean, or a human dataset.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GAUNTLET_TASKS, GAUNTLET_VERSION} from '../public/semantic-gauntlet-core.mjs';
import {REPAIR_VERSION,listRepairMoves,finiteRepairCheck} from '../public/semantic-repair-core.mjs';
import {POLICY_DIM,repairFeatures,dot,diffVec,rankRepairMoves as browserRankMoves} from '../public/semantic-repair-policy.mjs';

export const MODEL_FORMAT='pcs-learned-semantic-repair-policy-v1';
export const TRAINING_MOVE_LIMIT=160;
export const POLICY_SEED=730221;
export const TRAIN_EPOCHS=48;
const sha = s=>createHash('sha256').update(typeof s==='string'||Buffer.isBuffer(s)?s:JSON.stringify(s)).digest('hex');
export const GAUNTLET_SOURCE_SHA256=sha(readFileSync(fileURLToPath(new URL('../public/semantic-gauntlet-core.mjs',import.meta.url))));
export const REPAIR_SOURCE_SHA256=sha(readFileSync(fileURLToPath(new URL('../public/semantic-repair-core.mjs',import.meta.url))));
export const TRAINER_SOURCE_SHA256=sha(readFileSync(fileURLToPath(import.meta.url)));
export const POLICY_FEATURES_SHA256=sha(readFileSync(fileURLToPath(new URL('../public/semantic-repair-policy.mjs',import.meta.url))));
function rng(seed){let s=seed>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32);}
/** Never generate supervised labels from evaluation-family tasks. */
export function generateTrainingExamples(){
 const rows=[],stats=[];
 for(const task of GAUNTLET_TASKS){
  if(task.split!=='training')continue;
  const initial=finiteRepairCheck(task.id,task.candidate);
  if(initial.equivalent_within_bound)continue;
  const moves=listRepairMoves(task.id,task.candidate,TRAINING_MOVE_LIMIT);
  const examples=moves.map((move,index)=>({task_id:task.id,index,operation:move.operation,
   positive:finiteRepairCheck(task.id,move.formula).equivalent_within_bound,
   vector:repairFeatures(task,task.candidate,move)}));
  stats.push({task_id:task.id,total:examples.length,positive:examples.filter(x=>x.positive).length});
  rows.push(...examples);
 }
 return {rows,stats};
}
export function trainRepairModel(){
 const {rows,stats}=generateTrainingExamples(),grouped=new Map();
 for(const row of rows){if(!grouped.has(row.task_id))grouped.set(row.task_id,[]);grouped.get(row.task_id).push(row);}
 const pairs=[],random=rng(POLICY_SEED);
 for(const [taskId,examples] of grouped){
  const pos=examples.filter(x=>x.positive),neg=examples.filter(x=>!x.positive);
  for(const p of pos){
   // Deterministic balanced ranking pairs: 16 negatives per positive.
   for(let i=0;i<16&&neg.length;i++){
    const other=neg[Math.floor(random()*neg.length)];
    pairs.push({task_id:taskId,p:p.vector,n:other.vector});
   }
  }
 }
 if(!pairs.length)throw Error('NO_VERIFIED_TRAINING_REPAIRS');
 const w=Float64Array.from({length:POLICY_DIM},()=>0);
 const shuffled=[...pairs.keys()],shuffle=rng(POLICY_SEED+97);
 for(let epoch=0;epoch<TRAIN_EPOCHS;epoch++){
  for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(shuffle()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const lr=0.14/(1+epoch*0.085);
  for(const key of shuffled){
   const pair=pairs[key],vec=diffVec(pair.p,pair.n);
   const margin=dot(w,vec);const err=1/(1+Math.exp(Math.min(30,margin)));
   // Small L2 shrinkage plus pairwise log-loss gradient.
   for(const [i,v] of vec)w[i]+=lr*(err*v-0.0008*w[i]);
  }
 }
 const trainingIds=[...new Set(rows.map(r=>r.task_id))].sort();
 const learned={format:MODEL_FORMAT,method:'deterministic_pairwise_logistic_ranker',
  authority:'NONE_UNTRUSTED_PROPOSALS_ONLY',
  provenance:{gauntlet_sha256:GAUNTLET_SOURCE_SHA256,repair_engine_sha256:REPAIR_SOURCE_SHA256,
   trainer_sha256:TRAINER_SOURCE_SHA256,policy_features_sha256:POLICY_FEATURES_SHA256,gauntlet_version:GAUNTLET_VERSION,repair_version:REPAIR_VERSION,
   task_origin:'public machine-generated bounded finite-logic problems',
   human_examples:0,evaluation_labels_used_for_training:false},
  training:{seed:POLICY_SEED,epochs:TRAIN_EPOCHS,dimension:POLICY_DIM,move_cap:TRAINING_MOVE_LIMIT,
   training_task_ids:trainingIds,examples:rows.length,positive_examples:rows.filter(r=>r.positive).length,
   ranking_pairs:pairs.length,source_labels_sha256:sha(rows.map(r=>[r.task_id,r.index,r.operation,r.positive])),
   task_counts:stats},
  weights:[...w].map(x=>Math.round(x*1e8)/1e8),
  limitations:['No external or privately held out data','Finite-model labels only; not Lean kernel','No real human gameplay used',
   'A ranked proposal is not a proof: run the checker on the exact candidate']};
 return {...learned,model_digest_sha256:sha(learned)};
}
export function validateRepairModel(model,{retrain=false}={}){
 if(!model||model.format!==MODEL_FORMAT||model.provenance?.gauntlet_sha256!==GAUNTLET_SOURCE_SHA256||
  model.provenance?.repair_engine_sha256!==REPAIR_SOURCE_SHA256||model.provenance?.trainer_sha256!==TRAINER_SOURCE_SHA256||
  model.provenance?.policy_features_sha256!==POLICY_FEATURES_SHA256||
  model.training?.dimension!==POLICY_DIM||!Array.isArray(model.weights)||model.weights.length!==POLICY_DIM||
  !model.weights.every(x=>typeof x==='number'&&Number.isFinite(x))||
  model.model_digest_sha256!==sha(Object.fromEntries(Object.entries(model).filter(([k])=>k!=='model_digest_sha256'))))
  throw Error('MODEL_INTEGRITY_OR_PROVENANCE_FAILURE');
 if(model.training.training_task_ids.some(id=>!GAUNTLET_TASKS.some(t=>t.id===id&&t.split==='training')))
  throw Error('MODEL_TRAINING_FAMILY_LEAKAGE');
 if(retrain&&JSON.stringify(model)!==JSON.stringify(trainRepairModel()))
  throw Error('MODEL_NOT_REPRODUCIBLE_FROM_TRAINING_LABELS');
 return true;
}
export function rankRepairMoves(model,task,current=task.candidate,{limit=600,skip_model_validation=false}={}){
 if(!skip_model_validation)validateRepairModel(model);
 return browserRankMoves(model,task,current,listRepairMoves,{limit});
}
function attempts(task,ordered,budget){let calls=0;
 for(const move of ordered.slice(0,budget)){
  calls++;const check=finiteRepairCheck(task.id,move.formula);
  if(check.equivalent_within_bound)return {success:true,checked:calls,edit:move.operation,
   repaired_formula:move.formula};
 }
 return {success:false,checked:calls,edit:null,repaired_formula:null};
}
export function evaluateRepairModel(model,{split='evaluation',check_budget=5,move_cap=TRAINING_MOVE_LIMIT,random_seed=31}={}){
 validateRepairModel(model);
 if(!['training','evaluation'].includes(split)||!Number.isInteger(check_budget)||check_budget<1||check_budget>30||
  !Number.isInteger(move_cap)||move_cap<1||move_cap>600)throw Error('INVALID_EVALUATION_SETTINGS');
 const cases=[],random=rng(random_seed);
 for(const task of GAUNTLET_TASKS.filter(t=>t.split===split)){
  const initial=finiteRepairCheck(task.id,task.candidate);
  if(initial.equivalent_within_bound)continue;
  const moves=listRepairMoves(task.id,task.candidate,move_cap);
  const learned=rankRepairMoves(model,task,task.candidate,{limit:move_cap,skip_model_validation:true});
  const randomOrder=[...moves];for(let i=randomOrder.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[randomOrder[i],randomOrder[j]]=[randomOrder[j],randomOrder[i]];}
  const modelResult=attempts(task,learned,check_budget),orderResult=attempts(task,moves,check_budget),randomResult=attempts(task,randomOrder,check_budget);
  // Full scan is an ORACLE CEILING, performed only in evaluation and never fed to the model.
  const oracle=attempts(task,moves,moves.length);
  cases.push({task_id:task.id,family:task.family,split,skill:task.skill,eligible_moves:moves.length,
   one_edit_repair_exists:oracle.success,
   learned:{success:modelResult.success,checker_calls:modelResult.checked,chosen_edit:modelResult.edit},
   original_order:{success:orderResult.success,checker_calls:orderResult.checked},
   seeded_random:{success:randomResult.success,checker_calls:randomResult.checked},
   exact_oracle_ceiling:{success:oracle.success,checker_calls:oracle.checked}});
 }
 const metrics=field=>({tasks:cases.length,repairable:cases.filter(x=>x.one_edit_repair_exists).length,
  solved:cases.filter(x=>x[field].success).length,
  success_rate:cases.length?cases.filter(x=>x[field].success).length/cases.length:null,
  success_given_repairable:cases.filter(x=>x.one_edit_repair_exists).length?
   cases.filter(x=>x[field].success&&x.one_edit_repair_exists).length/cases.filter(x=>x.one_edit_repair_exists).length:null,
  total_checker_calls:cases.reduce((a,x)=>a+x[field].checker_calls,0)});
 return {format:'pcs-learned-repair-policy-evaluation-v1',model_digest_sha256:model.model_digest_sha256,
  split,check_budget,move_cap,seed:random_seed,
  authority:'NONE_FINITELY_REPLAYED_RESULTS_ONLY',
  dataset_status:'PUBLIC_SOURCE_DERIVED_HOLDOUT_NOT_BLIND',
  feature_label_leakage:'training uses only training-family checker labels; inference ranks before oracle checking',
  results:{learned:metrics('learned'),original_order:metrics('original_order'),seeded_random:metrics('seeded_random'),
   exact_oracle_ceiling:metrics('exact_oracle_ceiling')},cases};
}
/** Replayed prediction record: the ranker is untrusted; only checker-confirmed success counts. */
export function proposeCheckedRepair(model,taskId,{check_budget=5,move_cap=TRAINING_MOVE_LIMIT}={}){
 validateRepairModel(model);
 const task=GAUNTLET_TASKS.find(t=>t.id===taskId);if(!task)throw Error('UNKNOWN_TASK');
 if(!Number.isInteger(check_budget)||check_budget<1||check_budget>30||
    !Number.isInteger(move_cap)||move_cap<1||move_cap>600)throw Error('INVALID_PROPOSAL_BUDGET');
 const initial=finiteRepairCheck(task.id,task.candidate);
 const ordered=rankRepairMoves(model,task,task.candidate,{limit:move_cap,skip_model_validation:true});
 const records=[];
 if(!initial.equivalent_within_bound){
  for(const item of ordered.slice(0,check_budget)){
   const finite=finiteRepairCheck(task.id,item.formula);
   records.push({operation:item.operation,path:item.path,model_score:item.learned_score,
    formula:item.formula,finite_verdict:finite});
   if(finite.equivalent_within_bound)break;
  }
 }
 const output={format:'pcs-learned-repair-checked-proposal-v1',task_id:task.id,
  task_source_sha256:GAUNTLET_SOURCE_SHA256,model_digest_sha256:model.model_digest_sha256,
  check_budget,move_cap,initial_verdict:initial,attempts:records,
  status:initial.equivalent_within_bound?'ALREADY_AGREES_FINITE':
   records.some(r=>r.finite_verdict.equivalent_within_bound)?'BOUNDED_REPAIR_FOUND':'REPAIR_UNRESOLVED',
  authority:'NONE_FINITE_ORACLE_ONLY',kernel_checked:false,
  limitations:['Only worlds enumerated by PCS finite Gauntlet checker','Not a Lean kernel check',
   'No natural-language interpretation or external-world correspondence proved']};
 return {...output,record_sha256:sha(output)};
}
export function replayCheckedRepair(model,record){
 if(!record||record.format!=='pcs-learned-repair-checked-proposal-v1')throw Error('INVALID_REPLAY_RECORD');
 const exact=proposeCheckedRepair(model,record.task_id,{check_budget:record.check_budget,move_cap:record.move_cap});
 if(JSON.stringify(exact)!==JSON.stringify(record))throw Error('REPAIR_POLICY_REPORT_TAMPERED_OR_STALE');
 return {format:'pcs-learned-repair-replay-v1',result:'EXACT_FINITE_REPLAY_MATCH',
  task_id:record.task_id,record_sha256:exact.record_sha256,kernel_checked:false};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [command,...args]=process.argv.slice(2);
 try{
  if(command==='train'&&args.length===1){writeFileSync(args[0],JSON.stringify(trainRepairModel(),null,2)+'\n',{flag:'wx',mode:0o600});console.log('PCS_LEARNED_REPAIR_TRAINED');}
  else if(command==='verify'&&args.length===1){validateRepairModel(JSON.parse(readFileSync(args[0],'utf8')),{retrain:true});console.log('PCS_REPAIR_MODEL_EXACT_RETRAIN_MATCH');}
  else if(command==='propose'&&args.length===3){const model=JSON.parse(readFileSync(args[0],'utf8'));
   validateRepairModel(model,{retrain:true});const result=proposeCheckedRepair(model,args[1]);
   writeFileSync(args[2],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log('PCS_MODEL_PROPOSAL_FINITE_CHECKED');}
  else if(command==='recheck'&&args.length===3){const model=JSON.parse(readFileSync(args[0],'utf8'));
   validateRepairModel(model,{retrain:true});const record=JSON.parse(readFileSync(args[1],'utf8'));
   const result=replayCheckedRepair(model,record);writeFileSync(args[2],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log('PCS_MODEL_REPLAY_MATCH');}
  else if(command==='evaluate'&&args.length===2){const model=JSON.parse(readFileSync(args[0],'utf8'));
   validateRepairModel(model,{retrain:true});const result=evaluateRepairModel(model);
   writeFileSync(args[1],JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result.results));}
  else throw Error('Usage: train MODEL.json | verify MODEL.json | evaluate MODEL.json EVAL.json | propose MODEL.json TASK_ID PROPOSAL.json | recheck MODEL.json PROPOSAL.json VERDICT.json');
 }catch(err){console.error('PCS_LEARNED_REPAIR_REJECTED: '+err.message);process.exitCode=2;}
}
