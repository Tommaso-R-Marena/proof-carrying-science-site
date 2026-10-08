// Offline, exact-source PCS semantic repair experiment runner. No user records or Lean proof claims.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GAUNTLET_TASKS,GAUNTLET_VERSION} from '../public/semantic-gauntlet-core.mjs';
import {REPAIR_VERSION,repairRequestForTask,analyzeSemanticRepair,recheckSemanticRepair} from '../public/semantic-repair-core.mjs';
import {strictParseJson} from './semantic_evaluation_firewall.mjs';
export const EXPERIMENT_FORMAT='pcs-semantic-repair-experiment-v1';
const sha=x=>createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x);
export const REPAIR_ENGINE_SHA256=sha(readFileSync(fileURLToPath(new URL('../public/semantic-repair-core.mjs',import.meta.url))));
export const FINITE_ENGINE_SHA256=sha(readFileSync(fileURLToPath(new URL('../public/semantic-gauntlet-core.mjs',import.meta.url))));
const fromFile=path=>{const raw=readFileSync(path);if(raw.length>1_000_000)throw Error('Input too large');return strictParseJson(raw.toString('utf8'));};
const writeOnce=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});};
export function makeRepairExperiment(request){
 const result=analyzeSemanticRepair(request);
 return {format:EXPERIMENT_FORMAT,source:{gauntlet_version:GAUNTLET_VERSION,repair_version:REPAIR_VERSION,
  finite_engine_sha256:FINITE_ENGINE_SHA256,repair_engine_sha256:REPAIR_ENGINE_SHA256},
  request_sha256:sha(canonical(request)),request,result,
  input_origin:'STRUCTURED_USER_OR_MACHINE_PROPOSAL_NOT_AUTHENTICATED',
  verified_scope:'FINITE_MODEL_REPLAY_ONLY',lean_kernel_checked:false,pcs_authority:false};
}
export function verifyRepairExperiment(record){
 if(!record||record.format!==EXPERIMENT_FORMAT||record.source?.finite_engine_sha256!==FINITE_ENGINE_SHA256||
  record.source?.repair_engine_sha256!==REPAIR_ENGINE_SHA256)throw Error('REPAIR_ENGINE_PROVENANCE_MISMATCH');
 const trusted=makeRepairExperiment(record.request);
 if(canonical(record)!==canonical(trusted))throw Error('REPAIR_EXPERIMENT_TAMPERED_OR_STALE');
 recheckSemanticRepair(record.request,record.result);
 return {format:'pcs-semantic-repair-verification-v1',status:'EXACT_SOURCE_REPLAY_MATCH',
  request_sha256:trusted.request_sha256,finite_engine_sha256:FINITE_ENGINE_SHA256,
  repair_engine_sha256:REPAIR_ENGINE_SHA256,kernel_checked:false,
  disclaimer:'Finite-model replay only; no universal equivalence or Lean proof.'};
}
export function sweepRepairBenchmark(options={}){
 const {max_edits=1,max_candidates=180}=options;
 const results=GAUNTLET_TASKS.map(task=>{
  const request=repairRequestForTask(task.id,{max_edits,max_candidates});
  const r=analyzeSemanticRepair(request);
  return {task_id:task.id,family:task.family,split:task.split,skill:task.skill,
   input_countermodel:!r.initial_check.equivalent_within_bound,
   repair_found:r.repairs.length>0,already_agrees:r.search_status==='ALREADY_AGREES_WITHIN_BOUND',
   search_status:r.search_status,exhaustive_within_edit_limit:r.search_exhaustive_within_edit_limit,
   repairs:r.repairs.length,minimum_edits:r.minimum_edits_found,examined_candidates:r.examined_candidates};
 });
 const metrics=rows=>({cases:rows.length,with_countermodels:rows.filter(r=>r.input_countermodel).length,
  repaired_within_budget:rows.filter(r=>r.repair_found).length,already_agree:rows.filter(r=>r.already_agrees).length,
  exhausted_candidate_budget:rows.filter(r=>r.search_status==='CANDIDATE_BUDGET_EXHAUSTED').length,
  unresolved:rows.filter(r=>r.input_countermodel&&!r.repair_found).length});
 return {format:'pcs-semantic-repair-sweep-v1',repair_engine_sha256:REPAIR_ENGINE_SHA256,
  finite_engine_sha256:FINITE_ENGINE_SHA256,max_edits,max_candidates,
  dataset_origin:'PUBLIC_MACHINE_GENERATED_FIXED_PUZZLES',human_trajectories:0,
  lean_kernel_verified:false,universally_equivalent_repairs_proved:false,
  split_policy:'PUBLIC_NOT_BLIND; held-out semantic families only',
  overall:metrics(results),practice:metrics(results.filter(r=>r.split==='training')),
  evaluation:metrics(results.filter(r=>r.split==='evaluation')),results};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [mode,...args]=process.argv.slice(2);
 try{
  if(mode==='request'&&args.length===2)writeOnce(args[1],repairRequestForTask(args[0]));
  else if(mode==='analyze'&&args.length===2)writeOnce(args[1],makeRepairExperiment(fromFile(args[0])));
  else if(mode==='recheck'&&args.length===2)writeOnce(args[1],verifyRepairExperiment(fromFile(args[0])));
  else if(mode==='sweep'&&args.length===1)writeOnce(args[0],sweepRepairBenchmark());
  else throw Error('Usage: request TASK_ID REQUEST.json | analyze REQUEST.json EXPERIMENT.json | recheck EXPERIMENT.json VERIFICATION.json | sweep SUMMARY.json');
  console.log('PCS_SEMANTIC_REPAIR_FINITE_REPLAY_OK');
 }catch(e){console.error('PCS_SEMANTIC_REPAIR_REJECTED: '+String(e?.message||e));process.exitCode=2;}
}
