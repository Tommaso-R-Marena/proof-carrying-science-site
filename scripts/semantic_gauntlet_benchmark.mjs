// PCS Gauntlet benchmark runner. No external packages, network, Lean or production DB.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GAUNTLET_VERSION,GAUNTLET_TASKS,finiteOracle,scoreGauntletPrediction} from '../public/semantic-gauntlet-core.mjs';
export const BENCHMARK_FORMAT='pcs-semantic-gauntlet-benchmark-v1';
const sha256=x=>createHash('sha256').update(x).digest('hex');
export const TASKS_SHA256=sha256(JSON.stringify(GAUNTLET_TASKS));
const validate=condition=>{if(!condition)throw Error('Malformed or inconsistent benchmark input');};
export function publicGauntletTaskSet(){
 return {format:'pcs-semantic-gauntlet-tasks-v1',engine:GAUNTLET_VERSION,task_set_sha256:TASKS_SHA256,
  benchmark_visibility:'PUBLIC_NOT_BLIND',
  split_policy:'disjoint operator-template families; variant substitutions within each family; not independent research generalization',
  scorer_scope:'enumerated first-order finite models only, no Lean kernel, arbitrary English intent, or external-world claims',
  tasks:structuredClone(GAUNTLET_TASKS)};
}
export function parsePredictionLines(text){
 if(typeof text!=='string'||text.length>500000)throw Error('Prediction file too large');
 const lines=text.trim().split(/\r?\n/).filter(Boolean);
 if(lines.length!==GAUNTLET_TASKS.length)throw Error('Require exactly one JSONL prediction for every task');
 const predictions=[],seen=new Set();
 for(const line of lines){
  if(line.length>15000)throw Error('Oversized prediction');
  const parsed=JSON.parse(line);
  if(!parsed||typeof parsed.id!=='string'||seen.has(parsed.id))throw Error('Duplicate/malformed prediction ID');
  seen.add(parsed.id);predictions.push(parsed);
 }
 const accepted=new Set(GAUNTLET_TASKS.map(t=>t.id));
 if(predictions.some(p=>!accepted.has(p.id)))throw Error('Unrecognized prediction ID');
 return predictions;
}
function metrics(rows){
 const attempted=rows.filter(x=>x.attempted),correct=attempted.filter(x=>x.correct);
 const witnessAttempts=attempted.filter(x=>x.predicted==='COUNTERMODEL');
 const witnessed=witnessAttempts.filter(x=>x.witness_verified);
 return {cases:rows.length,attempted:attempted.length,correct:correct.length,
  coverage:rows.length?attempted.length/rows.length:null,
  accuracy_on_attempted:attempted.length?correct.length/attempted.length:null,
  accuracy_over_all:rows.length?correct.length/rows.length:null,
  false_equivalence_claims:rows.filter(x=>x.false_equivalence).length,
  countermodel_claims:witnessAttempts.length,verified_countermodels:witnessed.length,
  countermodel_soundness_rate:witnessAttempts.length?witnessed.length/witnessAttempts.length:null,
  minimum_domain_rate:witnessed.length?witnessed.filter(x=>x.minimal_witness).length/witnessed.length:null};
}
export function scoreGauntletSubmission(predictions,taskSet=publicGauntletTaskSet()){
 validate(taskSet&&taskSet.format==='pcs-semantic-gauntlet-tasks-v1'&&taskSet.engine===GAUNTLET_VERSION&&
  taskSet.task_set_sha256===TASKS_SHA256&&JSON.stringify(taskSet.tasks)===JSON.stringify(GAUNTLET_TASKS));
 validate(Array.isArray(predictions)&&predictions.length===GAUNTLET_TASKS.length);
 const map=new Map();for(const p of predictions){
  validate(p&&typeof p.id==='string'&&!map.has(p.id));map.set(p.id,p);
 }
 const rows=GAUNTLET_TASKS.map(t=>{
  validate(map.has(t.id));return scoreGauntletPrediction(t,map.get(t.id));
 });
 const groups={};for(const t of GAUNTLET_TASKS){if(!groups[t.family])groups[t.family]={split:t.split,rows:[]};}
 for(const r of rows)groups[r.family].rows.push(r);
 return {format:BENCHMARK_FORMAT,task_set_sha256:TASKS_SHA256,engine:GAUNTLET_VERSION,
  executable_checker:'PCS Semantic Gauntlet bounded JavaScript first-order finite model enumerator',
  independent_lean_kernel:false,independently_held_out:false,
  human_training_data:false,benchmark_visibility:'PUBLIC_NOT_BLIND',
  interpretation:'Accuracy only within enumerated models. A finite non-counterexample is not a general logic proof.',
  overall:metrics(rows),training:metrics(rows.filter(x=>x.split==='training')),
  evaluation:metrics(rows.filter(x=>x.split==='evaluation')),
  by_family:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{split:v.split,...metrics(v.rows)}])),
  rows};
}
export function generateBaseline(kind){
 if(!['abstain','all_equivalent','syntactic_identity','finite_oracle'].includes(kind))throw Error('Unknown baseline');
 return GAUNTLET_TASKS.map(t=>{
  const equivalent=kind==='all_equivalent'||(kind==='syntactic_identity'&&JSON.stringify(t.source)===JSON.stringify(t.candidate));
  if(kind==='finite_oracle'){
   const o=finiteOracle(t);
   return {id:t.id,decision:o.equivalent_within_bound?'EQUIVALENT_WITHIN_BOUND':'COUNTERMODEL',world:o.witness};
  }
  return {id:t.id,decision:kind!=='abstain'&&equivalent?'EQUIVALENT_WITHIN_BOUND':'ABSTAIN',world:null};
 });
}
export function benchmarkBaselines(){
 return {format:'pcs-semantic-gauntlet-baselines-v1',task_set_sha256:TASKS_SHA256,
  note:'Finite oracle is the label-generating ceiling, NOT an independent learned baseline.',
  baselines:Object.fromEntries(['abstain','all_equivalent','syntactic_identity','finite_oracle'].map(k=>{
   const r=scoreGauntletSubmission(generateBaseline(k));return [k,{overall:r.overall,evaluation:r.evaluation}];
  }))};
}
function writeNew(path,value){
 mkdirSync(dirname(path),{recursive:true});
 writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [mode,...args]=process.argv.slice(2);
 try{
  if(mode==='generate'&&args.length===1){writeNew(args[0],publicGauntletTaskSet());}
  else if(mode==='baselines'&&args.length===1){writeNew(args[0],benchmarkBaselines());}
  else if(mode==='prediction-template'&&args.length===1){writeNew(args[0],generateBaseline('abstain'));}
  else if(mode==='evaluate'&&args.length===3){
   const [taskFile,predictionFile,outputFile]=args;
   const tasks=JSON.parse(readFileSync(taskFile,'utf8'));
   const raw=readFileSync(predictionFile,'utf8');
   const predictions=predictionFile.endsWith('.jsonl')?parsePredictionLines(raw):JSON.parse(raw);
   writeNew(outputFile,scoreGauntletSubmission(predictions,tasks));
  }else throw Error('Usage: generate OUT.json | prediction-template OUT.json | baselines OUT.json | evaluate TASKS.json PREDICTIONS.{json,jsonl} OUT.json');
  console.log('PCS_GAUNTLET_BOUNDED_BENCHMARK_OK: '+(mode||''));
 }catch(e){console.error('PCS_GAUNTLET_REJECTED: '+e.message);process.exitCode=2;}
}