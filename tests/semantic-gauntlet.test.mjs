import test from 'node:test';
import assert from 'node:assert/strict';
import {GAUNTLET_TASKS,GAUNTLET_FAMILY_COUNT,GAUNTLET_VARIANTS_PER_FAMILY,makeGauntletTasks,
 worldFromBits,validateGauntletWorld,gauntletVerdict,finiteOracle,scoreGauntletPrediction} from '../public/semantic-gauntlet-core.mjs';
import {TASKS_SHA256,publicGauntletTaskSet,scoreGauntletSubmission,generateBaseline,benchmarkBaselines,parsePredictionLines} from '../scripts/semantic_gauntlet_benchmark.mjs';
const clone=x=>structuredClone(x);
const tasks=GAUNTLET_TASKS;
test('task collection is deterministic, bounded and split by semantic family',()=>{
 assert.equal(tasks.length,60);assert.equal(GAUNTLET_FAMILY_COUNT,20);
 assert.equal(GAUNTLET_VARIANTS_PER_FAMILY,3);
 assert.deepEqual(tasks,makeGauntletTasks());
 const uniq=new Set(tasks.map(t=>t.id));assert.equal(uniq.size,tasks.length);
 const train=new Set(tasks.filter(x=>x.split==='training').map(x=>x.family));
 const evaluation=new Set(tasks.filter(x=>x.split==='evaluation').map(x=>x.family));
 assert.ok(train.size>=10&&evaluation.size>=6);
 for(const f of train)assert.equal(evaluation.has(f),false);
 assert.match(TASKS_SHA256,/^[0-9a-f]{64}$/);
 assert.equal(TASKS_SHA256,'c67a6cdf9bfaad68a7a2743a5162f60eaf4f438b6bfce3c9453c166e875fd810',
  'Semantic task definitions changed: review formula semantics and version before accepting results');
});
test('every task is actually enumerated and has a trusted bounded label',()=>{
 let eq=0,non=0;
 for(const t of tasks){
  const r=finiteOracle(t);
  assert.ok(r.checked_models>0,t.id);
  if(r.equivalent_within_bound){eq++;assert.equal(r.witness,null);}
  else{non++;assert.equal(gauntletVerdict(t,r.witness).countermodel,true);
   assert.ok(r.minimum_domain>=1&&r.minimum_domain<=t.bound);}
 }
 assert.ok(eq>=18&&non>=24,'balanced positive and negative cases');
});
test('finite witness checked without trusting model self-reported truth',()=>{
 const t=tasks.find(x=>x.family==='implication-reversal');
 const oracle=finiteOracle(t);
 const p={id:t.id,decision:'COUNTERMODEL',world:oracle.witness};
 let r=scoreGauntletPrediction(t,p);assert.equal(r.witness_verified,true);
 assert.equal(r.minimal_witness,true);
 const forged=clone(p);forged.world.n=3;
 assert.throws(()=>scoreGauntletPrediction(t,forged),/Invalid bounded world|interpretation/);
 const fake=clone(p);fake.world.unary[t.symbols.unary[0]][0]=1;
 assert.throws(()=>scoreGauntletPrediction(t,fake),/Invalid unary interpretation/);
});
test('false equivalence is explicitly tracked, not passed as theorem',()=>{
 const t=tasks.find(x=>x.family==='universal-existential');
 const s=scoreGauntletPrediction(t,{id:t.id,decision:'EQUIVALENT_WITHIN_BOUND',world:null});
 assert.equal(s.correct,false);assert.equal(s.false_equivalence,true);
});
test('abstention explicit and evaluation cases cannot be cherry picked',()=>{
 const v=generateBaseline('abstain');
 const r=scoreGauntletSubmission(v);assert.equal(r.overall.coverage,0);
 assert.equal(r.overall.accuracy_on_attempted,null);
 assert.throws(()=>scoreGauntletSubmission(v.slice(1)),/Malformed/);
 assert.throws(()=>scoreGauntletSubmission([...v.slice(1),v[1]]),/Malformed/);
});
test('finite oracle is the bounded ceiling, naive equivalence is not',()=>{
 const b=benchmarkBaselines();
 assert.equal(b.baselines.finite_oracle.overall.accuracy_over_all,1);
 assert.equal(b.baselines.finite_oracle.overall.countermodel_soundness_rate,1);
 assert.ok(b.baselines.all_equivalent.evaluation.accuracy_over_all<1);
 assert.equal(b.baselines.abstain.overall.coverage,0);
 const r=scoreGauntletSubmission(generateBaseline('finite_oracle'));
 assert.equal(r.evaluation.accuracy_over_all,1);
 assert.equal(r.independent_lean_kernel,false);assert.equal(r.independently_held_out,false);
});
test('task manifest copy is distinct and tampered source rejects',()=>{
 const t=publicGauntletTaskSet();
 assert.equal(t.task_set_sha256,TASKS_SHA256);
 t.tasks[0].bound=99;
 assert.throws(()=>scoreGauntletSubmission(generateBaseline('abstain'),t),/Malformed/);
});
test('JSONL rejects omitted and duplicate or extra task IDs',()=>{
 const jsonl=generateBaseline('abstain').map(JSON.stringify).join('\n')+'\n';
 assert.equal(parsePredictionLines(jsonl).length,tasks.length);
 assert.throws(()=>parsePredictionLines(jsonl.split('\n').slice(0,40).join('\n')),/exactly one/);
 const duplicate=[...generateBaseline('abstain')];duplicate[4]=duplicate[3];
 assert.throws(()=>parsePredictionLines(duplicate.map(JSON.stringify).join('\n')),/Duplicate/);
});
test('reports deterministic, never fabricated human or kernel provenance',()=>{
 const a=scoreGauntletSubmission(generateBaseline('finite_oracle'));
 const b=scoreGauntletSubmission(generateBaseline('finite_oracle'));
 assert.deepEqual(a,b);
 const s=JSON.stringify(a);
 assert.equal(s.includes('email'),false);assert.equal(s.includes('user_id'),false);
 assert.equal(a.human_training_data,false);assert.equal(a.independent_lean_kernel,false);
});
test('malformed worlds, extra fields, wrong symbols and unsupported predictions reject',()=>{
 const t=tasks[0],w=finiteOracle(t).witness;
 const bogus=clone(w);bogus.privileged=true;
 assert.throws(()=>validateGauntletWorld(t,bogus),/Invalid bounded/);
 const wrong=clone(w);wrong.unary.Other=[true];
 assert.throws(()=>validateGauntletWorld(t,wrong),/signature mismatch/);
 assert.throws(()=>scoreGauntletPrediction(t,{id:t.id,decision:'ACCEPTED',world:null}),/Unsupported prediction/);
 assert.throws(()=>scoreGauntletPrediction(t,{id:t.id,decision:'COUNTERMODEL',world:null}),/Invalid bounded/);
});
function independent(f,w,env={}){
 const domain=Array.from({length:w.n},(_,i)=>i);
 switch(f.op){
 case 'pred':return w.unary[f.name].at(env[f.x]);
 case 'rel':return w.binary[f.name][env[f.x]][env[f.y]];
 case 'eq':return Object.is(env[f.x],env[f.y]);
 case 'not':return independent(f.f,w,env)===false;
 case 'and':return [f.a,f.b].map(t=>independent(t,w,env)).every(Boolean);
 case 'or':return [f.a,f.b].map(t=>independent(t,w,env)).some(Boolean);
 case 'imp':return independent(f.a,w,env)===false||independent(f.b,w,env)===true;
 case 'forall':return domain.map(i=>independent(f.f,w,{...env,[f.x]:i})).every(Boolean);
 case 'exists':return domain.map(i=>independent(f.f,w,{...env,[f.x]:i})).some(Boolean);
 default:throw Error('independent oracle unsupported operation');
 }
}
test('independent truth-table interpreter agrees on ALL bounded worlds of all 60 tasks',()=>{
 let cases=0;
 for(const task of tasks)for(let n=1;n<=task.bound;n++){
  const bits=task.symbols.unary.length*n+task.symbols.binary.length*n*n;
  for(let mask=0;mask<2**bits;mask++){
   const w=worldFromBits(task,n,mask),actual=gauntletVerdict(task,w);
   assert.equal(actual.source,independent(task.source,w),task.id+' source');
   assert.equal(actual.candidate,independent(task.candidate,w),task.id+' candidate');
   cases++;
  }
 }
 assert.ok(cases>1000);
});