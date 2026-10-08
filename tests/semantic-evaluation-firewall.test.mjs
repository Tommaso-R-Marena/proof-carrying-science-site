import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {GAUNTLET_TASKS,finiteOracle,gauntletVerdict} from '../public/semantic-gauntlet-core.mjs';
import {TASKS_SHA256} from '../scripts/semantic_gauntlet_benchmark.mjs';
import {PACK,FIREWALL_VERSION,TRANSFORMS,buildEvaluationPack,validateSubmission,
 evaluatePredictions,baselinePredictions,compareReports,strictParseJson} from '../scripts/semantic_evaluation_firewall.mjs';
const copy=structuredClone;
const flip=(p)=>{p[0].decision='UNKNOWN';return p;};
const oracle=()=>evaluatePredictions(baselinePredictions('finite_oracle'));
const simple=()=>evaluatePredictions(baselinePredictions('everything_equivalent'));

test('source-derived benchmark has exact 240 cases / 20 families, pinned source digest and immutable source',()=>{
 assert.equal(PACK.format,FIREWALL_VERSION);assert.equal(PACK.cases.length,240);
 assert.equal(PACK.base_task_set_sha256,TASKS_SHA256);
 assert.deepEqual(PACK,buildEvaluationPack());
 assert.match(PACK.pack_sha256,/^[a-f0-9]{64}$/);
 assert.match(PACK.firewall_source_sha256,/^[a-f0-9]{64}$/);
 assert.match(PACK.finite_engine_source_sha256,/^[a-f0-9]{64}$/);
 assert.equal(Object.isFrozen(PACK.cases[0].source),true);
 assert.throws(()=>{PACK.cases[0].source.op='wrong';},TypeError);
 const ids=PACK.cases.map(x=>x.id);assert.equal(new Set(ids).size,ids.length);
 assert.equal(new Set(PACK.cases.map(x=>x.origin_id)).size,60);
 assert.deepEqual([...new Set(PACK.cases.map(x=>x.transform))].sort(),[...TRANSFORMS].sort());
 assert.equal(PACK.cases.filter(x=>x.origin_split==='evaluation').length,108);
 assert.equal(PACK.visibility,'PUBLIC_SOURCE_DERIVED_NOT_BLIND');
});
test('every transformation preserves bounded truth in independent exhaustive search',()=>{
 for(const origin of GAUNTLET_TASKS){
  const base=finiteOracle(origin);
  for(const t of PACK.cases.filter(c=>c.origin_id===origin.id)){
   const transformed=finiteOracle(t);
   assert.equal(transformed.equivalent_within_bound,base.equivalent_within_bound,origin.id+':'+t.transform);
   assert.equal(transformed.minimum_domain,base.minimum_domain,origin.id+':'+t.transform);
   if(transformed.witness){assert.equal(gauntletVerdict(t,transformed.witness).countermodel,true);}
  }
 }
});
test('oracle is ceiling, simple all-equivalent baseline is not a learned model',()=>{
 const r=oracle(),s=simple();
 assert.equal(r.overall.cases,240);assert.equal(r.overall.accuracy_all,1);
 assert.equal(r.evaluation.cases,108);assert.equal(r.evaluation.accuracy_all,1);
 assert.equal(s.evaluation.accuracy_all,1/3);
 assert.ok(s.evaluation.false_equivalence_claims>0);
 assert.equal(r.authority,'BOUNDED_FINITE_MODEL_REPLAY_ONLY');
 assert.equal(r.firewall_source_sha256,PACK.firewall_source_sha256);
 assert.equal(r.finite_engine_source_sha256,PACK.finite_engine_source_sha256);
 assert.equal(r.lean_kernel_checked,false);assert.equal(r.blind_evaluation,false);
 assert.equal(r.invariance.consistency_rate,1);
});
test('abstention yields zero correct, null accuracy on attempted and no confidence',()=>{
 const r=evaluatePredictions(baselinePredictions('abstain'));
 assert.equal(r.evaluation.correct,0);assert.equal(r.evaluation.attempted,0);
 assert.equal(r.overall.accuracy_answered,null);assert.equal(r.overall.brier_score,null);
 assert.equal(r.invariance.fully_answered_origins,0);
});
test('confidence calibration is bounded and computed from checker correctness',()=>{
 const a=simple();assert.equal(a.evaluation.confidence_samples,108);
 assert.ok(a.evaluation.brier_score>0);assert.ok(a.evaluation.expected_calibration_error>=0);
 const o=oracle();assert.equal(o.overall.brier_score,0);
 assert.equal(o.overall.expected_calibration_error,0);
});
test('metamorphic inconsistency of a model is detected without conflating it with formal validity',()=>{
 const rows=baselinePredictions('finite_oracle');
 const idx=PACK.cases.findIndex(t=>t.transform==='alpha_rename' && finiteOracle(t).equivalent_within_bound);
 assert.ok(idx>=0);
 rows[idx]={id:rows[idx].id,decision:'ABSTAIN',world:null};
 const a=evaluatePredictions(rows);
 assert.ok(a.invariance.fully_answered_origins<60);
 assert.ok(a.overall.correct<240);
});
for(const [name,fn] of [
 ['unknown decision',a=>{a[0].decision='EQUIVALENT_FOREVER';}],
 ['wrong id',a=>{a[0].id='bad';}],
 ['duplicate id',a=>{a[1].id=a[0].id;}],
 ['unknown field',a=>{a[0].model_confidence=0.5;}],
 ['string confidence',a=>{a[0].confidence='0.8';}],
 ['NaN confidence',a=>{a[0].confidence=NaN;}],
 ['negative confidence',a=>{a[0].confidence=-0.1;}],
 ['high confidence',a=>{a[0].confidence=1.1;}],
 ['abstention claims confidence',a=>{a[0].decision='ABSTAIN';a[0].world=null;a[0].confidence=0.2;}],
 ['invalid witness',a=>{const t=PACK.cases[0];a[0]={id:t.id,decision:'COUNTERMODEL',world:{n:5,unary:{},binary:{}}};}],
]){
 test('fail closed on '+name,()=>{const preds=copy(baselinePredictions('everything_equivalent'));fn(preds);assert.throws(()=>evaluatePredictions(preds));});
}
test('one changed AST or metadata field invalidates entire evaluation pack',()=>{
 const changes=[
 x=>{x.cases[0].source.op='exists';},
 x=>{x.cases[0].origin_split='training';},
 x=>{x.pack_sha256='0'.repeat(64);},
 x=>{x.cases.pop();},
 x=>{x.visibility='SECRET_AND_BLIND';}
 ];
 for(const alter of changes){const p=copy(PACK);alter(p);assert.throws(()=>evaluatePredictions(baselinePredictions('abstain'),p),/commitment/);}
});
test('report comparison independently replays raw predictions; no forged score survives',()=>{
 const o=oracle(),s=simple();
 const comp=compareReports(o,s,{iterations:200,seed:13});
 assert.equal(comp.paired_mean_accuracy_difference,2/3);
 assert.equal(comp.evaluation_families,9);
 assert.ok(comp.bootstrap_95_percent_interval[0]<=comp.paired_mean_accuracy_difference);
 assert.ok(comp.bootstrap_95_percent_interval[1]>=comp.paired_mean_accuracy_difference);
 assert.deepEqual(comp,compareReports(o,s,{iterations:200,seed:13}));
 for(const field of ['correct','false_equivalence_claims']){
  const x=copy(s);x.evaluation[field]=9999;
  assert.throws(()=>compareReports(o,x),/tampered/);
 }
 const x=copy(s);x.rows[0].correct=true;
 assert.throws(()=>compareReports(o,x),/tampered/);
 const y=copy(s);y.predictions[0].decision='ABSTAIN';y.predictions[0].world=null;delete y.predictions[0].confidence;
 assert.throws(()=>compareReports(o,y),/tampered/);
});
test('one abstaining prediction is not scored as an unverified logical equivalence',()=>{
 const p=baselinePredictions('finite_oracle');
 p[0]={id:p[0].id,decision:'ABSTAIN',world:null};
 const report=evaluatePredictions(p);
 assert.equal(report.rows[0].correct,false);
 assert.equal(report.rows[0].attempted,false);
});
const exe=fileURLToPath(new URL('../scripts/semantic_evaluation_firewall.mjs',import.meta.url));
const spawn=(...args)=>spawnSync(process.execPath,[exe,...args],{encoding:'utf8',timeout:50000});
test('CLI reproducibility: pack, baseline, evaluate and paired comparison against exact bytes',()=>{
 const d=mkdtempSync(join(tmpdir(),'pcs-firewall-'));
 try{
  const pack=join(d,'pack.json'),base=join(d,'base.json'),r=join(d,'report.json'),r2=join(d,'report2.json'),comp=join(d,'comparison.json');
  assert.equal(spawn('pack',pack).status,0);
  assert.equal(spawn('baseline','everything_equivalent',base).status,0);
  assert.equal(spawn('evaluate',pack,base,r).status,0);
  const report=JSON.parse(readFileSync(r));assert.equal(report.evaluation.cases,108);
  const p=JSON.parse(readFileSync(base));p[0].confidence=-10;
  writeFileSync(join(d,'bad.json'),JSON.stringify(p));
  assert.equal(spawn('evaluate',pack,join(d,'bad.json'),r2).status,2);
  assert.equal(spawn('evaluate',pack,base,r2).status,0);
  assert.equal(spawn('compare',r,r2,comp).status,0);
  assert.equal(JSON.parse(readFileSync(comp)).paired_mean_accuracy_difference,0);
  assert.equal(spawn('pack',pack).status,2,'do not overwrite output');
 }finally{rmSync(d,{recursive:true,force:true});}
});

// Independent second evaluator: distinct from production interpreter and oracle,
// using built-in array every/some and an explicit recursive scoped environment.
function truthIndependent(f,w,bindings={}){
 switch(f.op){
  case 'pred':return w.unary[f.name][bindings[f.x]];
  case 'rel':return w.binary[f.name][bindings[f.x]][bindings[f.y]];
  case 'eq':return bindings[f.x]===bindings[f.y];
  case 'not':return truthIndependent(f.f,w,bindings)===false;
  case 'and':return [f.a,f.b].every(x=>truthIndependent(x,w,bindings));
  case 'or':return [f.a,f.b].some(x=>truthIndependent(x,w,bindings));
  case 'imp':return !truthIndependent(f.a,w,bindings)||truthIndependent(f.b,w,bindings);
  case 'forall':return Array.from({length:w.n},(_,i)=>i).every(i=>truthIndependent(f.f,w,{...bindings,[f.x]:i}));
  case 'exists':return Array.from({length:w.n},(_,i)=>i).some(i=>truthIndependent(f.f,w,{...bindings,[f.x]:i}));
  default:throw Error('Unsupported independent evaluator expression');
 }
}
function independentlyWorld(t,n,mask){
 let bit=0;const unary={},binary={};
 for(const key of t.symbols.unary)unary[key]=Array.from({length:n},()=>Boolean(mask&2**(bit++)));
 for(const key of t.symbols.binary)binary[key]=Array.from({length:n},()=>Array.from({length:n},()=>Boolean(mask&2**(bit++))));
 return {n,unary,binary};
}
test('independent semantic interpreter agrees on EVERY finite world for all 240 transformed tasks',()=>{
 let checked=0;
 for(const t of PACK.cases){
  for(let n=1;n<=t.bound;n++){
   const bits=t.symbols.unary.length*n+t.symbols.binary.length*n*n;
   assert.ok(bits<=12);
   for(let mask=0;mask<2**bits;mask++){
    const w=independentlyWorld(t,n,mask);
    const left=truthIndependent(t.source,w),right=truthIndependent(t.candidate,w);
    assert.deepEqual(gauntletVerdict(t,w),{source:left,candidate:right,countermodel:left!==right},t.id+' n='+n+' mask='+mask);
    checked++;
   }
  }
 }
 assert.ok(checked>1200);
});
test('JSON scanner rejects duplicate keys (including escaped equivalents) and dangerous keys',()=>{
 for(const input of ['{\"x\":1,\"x\":2}', '{\"x\":1,\"\\u0078\":2}', '{\"nested\":{\"b\":1,\"b\":2}}', '{\"__proto__\":1}', '{\"a\":{\"constructor\":0}}']){
  assert.throws(()=>strictParseJson(input),/Duplicate|Reserved/);
 }
 assert.deepEqual(strictParseJson('{\"a\":1,\"nested\":[{\"b\":true},null]}'),{a:1,nested:[{b:true},null]});
});
