// PCS Semantic Evaluation Firewall v1.
// A public, source-derived robustness benchmark; NOT blind and NOT Lean/kernel assurance.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GAUNTLET_TASKS,GAUNTLET_VERSION,finiteOracle,scoreGauntletPrediction,
        formulaSymbols,gauntletVerdict} from '../public/semantic-gauntlet-core.mjs';
import {TASKS_SHA256} from './semantic_gauntlet_benchmark.mjs';

export const FIREWALL_VERSION='pcs-semantic-evaluation-firewall-v1';
export const TRANSFORMS=Object.freeze(['identity','rename_symbols','alpha_rename','swap_sides']);
const hash = x=>createHash('sha256').update(x).digest('hex');
export const FIREWALL_SOURCE_SHA256=hash(readFileSync(fileURLToPath(import.meta.url)));
export const FINITE_ENGINE_SOURCE_SHA256=hash(readFileSync(fileURLToPath(new URL('../public/semantic-gauntlet-core.mjs',import.meta.url))));
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const check=(v,msg)=>{if(!v)throw Error(msg);};
const stable=x=>JSON.stringify(x); // deterministic generated-object source matching
function canonicalJson(x){
 if(x===null || typeof x==='string' || typeof x==='boolean')return JSON.stringify(x);
 if(typeof x==='number'){
  check(Number.isFinite(x),'Nonfinite number in digest input');return JSON.stringify(x);
 }
 if(Array.isArray(x))return '['+x.map(canonicalJson).join(',')+']';
 check(x && typeof x==='object' && Object.getPrototypeOf(x)===Object.prototype,'Unexpected data in digest');
 return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(x[k])).join(',')+'}';
}

function renamedSymbols(formula,unary,binary){
 const visit=f=>{
  switch(f.op){
  case 'pred':return {...f,name:unary[f.name]};
  case 'rel':return {...f,name:binary[f.name]};
  case 'eq':return {...f};
  case 'not':return {op:'not',f:visit(f.f)};
  case 'and':case 'or':case 'imp':return {op:f.op,a:visit(f.a),b:visit(f.b)};
  case 'forall':case 'exists':return {op:f.op,x:f.x,f:visit(f.f)};
  default:throw Error('Unsupported AST in symbol renaming');
  }
 };
 return visit(formula);
}
function alphaRenamed(formula){
 let counter=0;
 const visit=(f,env)=>{
  switch(f.op){
  case 'pred':return {...f,x:env[f.x]};
  case 'rel':return {...f,x:env[f.x],y:env[f.y]};
  case 'eq':return {...f,x:env[f.x],y:env[f.y]};
  case 'not':return {op:'not',f:visit(f.f,env)};
  case 'and':case 'or':case 'imp':return {op:f.op,a:visit(f.a,env),b:visit(f.b,env)};
  case 'forall':case 'exists':{
   const name='bound_'+counter++;
   return {op:f.op,x:name,f:visit(f.f,{...env,[f.x]:name})};
  }
  default:throw Error('Unsupported AST in alpha renaming');
  }
 };
 return visit(formula,{});
}
function mapped(task,transform){
 let source=task.source,candidate=task.candidate;
 if(transform==='rename_symbols'){
  const unary=Object.fromEntries(task.symbols.unary.map((x,i)=>[x,'WitnessPredicate_'+i]));
  const binary=Object.fromEntries(task.symbols.binary.map((x,i)=>[x,'WitnessRelation_'+i]));
  source=renamedSymbols(source,unary,binary);candidate=renamedSymbols(candidate,unary,binary);
 }else if(transform==='alpha_rename'){
  source=alphaRenamed(source);candidate=alphaRenamed(candidate);
 }else if(transform==='swap_sides'){
  [source,candidate]=[candidate,source];
 }else if(transform!=='identity')throw Error('Unsupported transform');
 const symbols=formulaSymbols({op:'and',a:source,b:candidate});
 const result={id:hash(task.id+'\0'+transform).slice(0,32),origin_family:task.family,
   origin_split:task.split,origin_id:task.id,transform,version:GAUNTLET_VERSION,
   split:task.split,family:task.family,skill:task.skill,
   bound:task.bound,symbols,source,candidate};
 return result;
}
export function buildEvaluationPack(){
 const cases=GAUNTLET_TASKS.flatMap(task=>TRANSFORMS.map(transform=>mapped(task,transform)));
 const core={format:FIREWALL_VERSION,visibility:'PUBLIC_SOURCE_DERIVED_NOT_BLIND',
    base_task_set_sha256:TASKS_SHA256,firewall_source_sha256:FIREWALL_SOURCE_SHA256,
    finite_engine_source_sha256:FINITE_ENGINE_SOURCE_SHA256,oracle_scope:'bounded finite first-order models (not Lean or unbounded equivalence)',
    transformation_policy:'identity, bijective predicate renaming, capture-free alpha-renaming, source/target swap',
    cases};
 return {...core,pack_sha256:hash(stable(core))};
}
function deepFreeze(x){if(x&&typeof x==='object'){for(const child of Object.values(x))deepFreeze(child);Object.freeze(x);}return x;}
export const PACK=deepFreeze(buildEvaluationPack());
function validatePack(pack){
 check(pack&&typeof pack==='object'&&!Array.isArray(pack),'Missing evaluation pack');
 check(stable(pack)===stable(buildEvaluationPack()),'Evaluation pack source/transform commitment mismatch');
}
function confidence(p){
 if(own(p,'confidence'))check(typeof p.confidence==='number'&&Number.isFinite(p.confidence)&&p.confidence>=0&&p.confidence<=1,'Invalid confidence');
 if(p.decision==='ABSTAIN')check(!own(p,'confidence'),'Abstention cannot declare confidence');
}
export function validateSubmission(predictions,pack=PACK){
 validatePack(pack);
 check(Array.isArray(predictions)&&predictions.length===pack.cases.length,'Exactly one prediction required for each evaluation case');
 const ids=new Set(pack.cases.map(c=>c.id)),seen=new Set();
 for(const prediction of predictions){
  check(prediction&&typeof prediction==='object'&&!Array.isArray(prediction),'Malformed prediction');
  const keys=Object.keys(prediction).sort().join(',');
  check(keys==='decision,id,world'||keys==='confidence,decision,id,world','Unexpected prediction keys');
  check(typeof prediction.id==='string'&&ids.has(prediction.id)&&!seen.has(prediction.id),'Missing, duplicated or unknown prediction ID');
  seen.add(prediction.id);confidence(prediction);
 }
 return predictions;
}
function rate(rows){
 const attempted=rows.filter(r=>r.attempted),correct=rows.filter(r=>r.correct);
 const answeredConf=attempted.filter(r=>r.confidence!==null);
 const brier=answeredConf.length?answeredConf.reduce((sum,r)=>sum+(r.confidence-(r.correct?1:0))**2,0)/answeredConf.length:null;
 const bins=Array.from({length:5},(_,i)=>({bin:i,confidence_sum:0,correct:0,n:0}));
 for(const r of answeredConf){const b=bins[Math.min(4,Math.floor(r.confidence*5))];b.n++;b.confidence_sum+=r.confidence;b.correct+=Number(r.correct);}
 // ECE is an accuracy calibration statistic over announced confidence of being right.
 const actualEce=answeredConf.length?bins.reduce((s,b)=>s+(b.n?(b.n/answeredConf.length)*Math.abs(b.correct/b.n-b.confidence_sum/b.n):0),0):null;
 return {cases:rows.length,attempted:attempted.length,correct:correct.length,
   coverage:rows.length?attempted.length/rows.length:null,
   accuracy_all:rows.length?correct.length/rows.length:null,
   accuracy_answered:attempted.length?attempted.filter(r=>r.correct).length/attempted.length:null,
   false_equivalence_claims:rows.filter(r=>r.false_equivalence).length,
   verified_countermodels:rows.filter(r=>r.witness_verified).length,
   minimum_domain_witnesses:rows.filter(r=>r.minimal_witness).length,
   confidence_samples:answeredConf.length,brier_score:brier,expected_calibration_error:actualEce};
}
function by(rows,k){return Object.fromEntries([...new Set(rows.map(r=>r[k]))].sort().map(x=>[x,rate(rows.filter(r=>r[k]===x))]));}
function pairConsistency(rows){
 const groups=new Map();for(const r of rows){if(!groups.has(r.origin_id))groups.set(r.origin_id,[]);groups.get(r.origin_id).push(r);}
 let fullyAnswered=0,consistent=0,contradiction=0;
 for(const group of groups.values()){
  const responses=group.filter(r=>r.attempted);
  if(responses.length!==TRANSFORMS.length)continue;
  fullyAnswered++;
  if(new Set(responses.map(r=>r.predicted)).size===1)consistent++;else contradiction++;
 }
 return {origins:groups.size,fully_answered_origins:fullyAnswered,
    consistent_origins:consistent,contradictions:contradiction,
    consistency_rate:fullyAnswered?consistent/fullyAnswered:null,
    condition:'same finite equivalence decision under proven-by-construction bijective renaming / alpha renaming / side swap'};
}
export function evaluatePredictions(predictions,pack=PACK){
 validateSubmission(predictions,pack);
 const canonicalPredictions=structuredClone(predictions).sort((a,b)=>a.id.localeCompare(b.id));
 const byId=new Map(canonicalPredictions.map(p=>[p.id,p]));
 const rows=pack.cases.map(t=>{
  const p=byId.get(t.id); const core={...p};delete core.confidence;
  const result=scoreGauntletPrediction(t,core);
  return {...result,origin_id:t.origin_id,origin_family:t.origin_family,transform:t.transform,
    confidence:own(p,'confidence')?p.confidence:null};
 });
 return {format:'pcs-semantic-evaluation-report-v1',pack_sha256:pack.pack_sha256,
   predictions_sha256:hash(canonicalJson(canonicalPredictions)),predictions:canonicalPredictions,
   firewall_source_sha256:FIREWALL_SOURCE_SHA256,finite_engine_source_sha256:FINITE_ENGINE_SOURCE_SHA256,
   authority:'BOUNDED_FINITE_MODEL_REPLAY_ONLY',lean_kernel_checked:false,
   blind_evaluation:false,source_data_type:'public_source_derived_synthetic',
   limitations:['Public evaluation is not blind; formulas and checker are known',
    'No countermodel within a finite bound does not prove logical equivalence',
    'No measured generalization to arbitrary English or Lean kernel proof search',
    'Models can exploit exposed finite-world families; independent held-out external data required'],
   overall:rate(rows),development:rate(rows.filter(x=>x.split==='training')),
   evaluation:rate(rows.filter(x=>x.split==='evaluation')),
   by_family:by(rows,'origin_family'),by_transform:by(rows,'transform'),
   invariance:pairConsistency(rows),rows};
}
export function baselinePredictions(kind){
 check(['abstain','everything_equivalent','finite_oracle'].includes(kind),'Unknown baseline');
 return PACK.cases.map(t=>{
  if(kind==='abstain')return {id:t.id,decision:'ABSTAIN',world:null};
  if(kind==='everything_equivalent')return {id:t.id,decision:'EQUIVALENT_WITHIN_BOUND',world:null,confidence:0.5};
  const v=finiteOracle(t);
  return {id:t.id,decision:v.equivalent_within_bound?'EQUIVALENT_WITHIN_BOUND':'COUNTERMODEL',world:v.witness,confidence:1};
 });
}
function rng(seed){let s=seed>>>0;return ()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32);}
function quantile(sorted,p){const i=(sorted.length-1)*p;const lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);}
function familyScore(report,family){const r=report.rows.filter(x=>x.origin_family===family&&x.split==='evaluation');return r.length?r.filter(x=>x.correct).length/r.length:null;}
export function compareReports(a,b,{iterations=1000,seed=846921}={}){
 check(a&&b&&a.format==='pcs-semantic-evaluation-report-v1'&&b.format===a.format&&a.pack_sha256===b.pack_sha256&&a.pack_sha256===PACK.pack_sha256,'Reports from different benchmark revisions');
 // Never trust claimed scores from an input report; recompute every result from its
 // included raw predictions and compare the entire canonical report byte-for-byte.
 check(Array.isArray(a.predictions)&&Array.isArray(b.predictions),'Reports must include raw predictions for replay');
 check(stable(a)===stable(evaluatePredictions(a.predictions))&&
       stable(b)===stable(evaluatePredictions(b.predictions)),
       'Report was tampered with or checker version drifted');
 check(Number.isInteger(iterations)&&iterations>=100&&iterations<=5000&&Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff,'Invalid bootstrap settings');
 const families=[...new Set(PACK.cases.filter(x=>x.origin_split==='evaluation').map(x=>x.origin_family))].sort();
 check(families.length>=3,'Insufficient held-out families');
 const deltas=families.map(f=>familyScore(a,f)-familyScore(b,f));
 check(deltas.every(Number.isFinite),'Invalid aggregate family scores');
 const avg=arr=>arr.reduce((x,y)=>x+y,0)/arr.length;
 const random=rng(seed),replicates=[];
 for(let i=0;i<iterations;i++){
  const draw=Array.from({length:families.length},()=>deltas[Math.floor(random()*families.length)]);
  replicates.push(avg(draw));
 }
 replicates.sort((x,y)=>x-y);
 return {format:'pcs-evaluation-paired-family-comparison-v1',pack_sha256:a.pack_sha256,
   evaluation_families:families.length,paired_mean_accuracy_difference:avg(deltas),
   bootstrap_95_percent_interval:[quantile(replicates,0.025),quantile(replicates,0.975)],
   bootstrap_iterations:iterations,seed,comparison:'first minus second',
   warning:'Descriptive bootstrap over publicly exposed, deterministic formula families; not a statistical generalization claim.'};
}
const writeExclusive=(path,obj)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(obj,null,2)+'\n',{flag:'wx',mode:0o600});};
// JSON.parse silently accepts duplicate object keys, which is unsafe for
// independent replay logs. Scan every nested object for duplicate decoded keys.
export function strictParseJson(source){
 check(typeof source==='string'&&source.length<=2_000_000,'Oversized or malformed JSON');
 const parsed=JSON.parse(source);
 let i=0;
 const ws=()=>{while(i<source.length&&/\s/.test(source[i]))i++;};
 const string=()=>{
  const start=i++;let escaped=false;
  while(i<source.length){const c=source[i++];
   if(escaped){escaped=false;continue;}
   if(c==='\\'){escaped=true;continue;}
   if(c==='"')return JSON.parse(source.slice(start,i));
  }
  throw Error('Unterminated JSON string');
 };
 const value=(depth=0)=>{
  check(depth<70,'JSON nesting too deep');ws();const c=source[i];
  if(c==='"'){string();return;}
  if(c==='{'){
   i++;ws();const keys=new Set();if(source[i]==='}'){i++;return;}
   for(;;){ws();check(source[i]==='"','Malformed JSON object');const k=string();
    check(!keys.has(k),'Duplicate JSON object key '+k);keys.add(k);
    check(k!=='__proto__'&&k!=='constructor'&&k!=='prototype','Reserved JSON object key');
    ws();check(source[i++]===':','Missing JSON colon');value(depth+1);ws();
    if(source[i]==='}'){i++;return;}
    check(source[i++ ]===',','Missing JSON comma');
   }
  }
  if(c==='['){i++;ws();if(source[i]===']'){i++;return;}
   for(;;){value(depth+1);ws();if(source[i]===']'){i++;return;}
    check(source[i++ ]===',','Missing array comma');}
  }
  // parse syntactically valid primitive token, JSON.parse has already validated it
  const start=i;while(i<source.length&&!/[\s,\]}]/.test(source[i]))i++;
  check(i>start,'Missing JSON primitive');
 };
 value();ws();check(i===source.length,'Trailing JSON bytes');return parsed;
}
const readJson=path=>{const b=readFileSync(path);check(b.length<=2_000_000,'Oversized file');return strictParseJson(b.toString('utf8'));};
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [mode,...args]=process.argv.slice(2);
 try{
  if(mode==='pack'&&args.length===1)writeExclusive(args[0],PACK);
  else if(mode==='baseline'&&args.length===2)writeExclusive(args[1],baselinePredictions(args[0]));
  else if(mode==='evaluate'&&args.length===3)writeExclusive(args[2],evaluatePredictions(readJson(args[1]),readJson(args[0])));
  else if(mode==='compare'&&args.length===3)writeExclusive(args[2],compareReports(readJson(args[0]),readJson(args[1])));
  else throw Error('Usage: pack OUT | baseline (abstain|everything_equivalent|finite_oracle) OUT | evaluate PACK PREDICTIONS OUT | compare REPORT_A REPORT_B OUT');
  console.log('PCS_SEMANTIC_EVALUATION_FIREWALL_OK');
 }catch(e){console.error('PCS_SEMANTIC_EVALUATION_FIREWALL_REJECTED: '+e.message);process.exitCode=2;}
}
