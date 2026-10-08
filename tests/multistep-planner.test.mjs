import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GAUNTLET_TASKS} from '../public/semantic-gauntlet-core.mjs';
import {finiteRepairCheck,listRepairMoves} from '../public/semantic-repair-core.mjs';
import {MULTISTEP_VERSION,makeMultiStepRequest,searchMultiStepRepair,replayMultiStepRepair,
  searchBestFirstRepair,replayBestFirstRepair,sourceTreeDistance} from '../public/semantic-multistep-core.mjs';
import {buildTwoStepChallenges,benchmarkMultiStep,recheckBenchmarkReport} from '../scripts/benchmark_multistep_repair.mjs';
import {validateRepairModel,trainRepairModel} from '../scripts/train_semantic_repair_policy.mjs';
const model=JSON.parse(readFileSync(new URL('../public/repair-policy-model-v1.json',import.meta.url),'utf8'));
const copy=structuredClone;

test('model is real fixed training-only numerical learner; reproducible without evaluation labels',()=>{
 assert.equal(validateRepairModel(model,{retrain:true}),true);
 assert.deepEqual(trainRepairModel(),model);
 assert.equal(model.provenance.evaluation_labels_used_for_training,false);
 assert.equal(model.training.training_task_ids.length,18);
 assert.ok(model.training.training_task_ids.every(id=>GAUNTLET_TASKS.find(t=>t.id===id)?.split==='training'));
});
test('source-derived two-edit challenge set is deterministic and all 18 are genuine finite mismatches',()=>{
 const a=buildTwoStepChallenges(),b=buildTwoStepChallenges();assert.deepEqual(a,b);
 assert.equal(a.examples.length,18);assert.equal(a.evaluation_family_count,6);
 assert.equal(new Set(a.examples.map(x=>x.family)).size,6);
 assert.ok(a.examples.every(x=>x.split==='evaluation'));
 for(const e of a.examples){
  assert.ok(finiteRepairCheck(e.id,e.mutated_candidate).countermodel);
  assert.equal(e.initial_finite_countermodel.n>=1,true);
  const allMoves=listRepairMoves(e.id,e.mutated_candidate,600);
  assert.ok(allMoves.length<240,'one-step grammar not truncated: '+e.id);
  for(const move of allMoves)
   assert.equal(finiteRepairCheck(e.id,move.formula).equivalent_within_bound,false,
    'not genuinely a two-edit challenge: '+e.id);
 }
});
test('best-first learned, symbolic and nonlearned modes all route through checked candidate worlds',()=>{
 const e=buildTwoStepChallenges().examples[0];
 for(const mode of ['learned','original','seeded_random','source_guided','hybrid']){
  const request=makeMultiStepRequest(e.id,{candidate:e.mutated_candidate,mode,checker_budget:70,beam_width:16,move_cap:120});
  const result=searchBestFirstRepair(model,request);
  assert.equal(result.attempts.length,result.checks_used-1);
  assert.equal(result.kernel_checked,false);assert.equal(result.pcs_authority,false);
  assert.ok(result.generated_proposals>=result.attempts.length);
  if(result.verified_repair){
   assert.equal(result.verified_repair.edit_count,2);
   assert.equal(finiteRepairCheck(e.id,result.verified_repair.candidate).equivalent_within_bound,true);
  }
  assert.equal(replayBestFirstRepair(model,result).result,'EXACT_FINITE_REPLAY_MATCH');
 }
});
test('checker budget, beam and cap are strict; a model cannot fake success',()=>{
 const e=buildTwoStepChallenges().examples[0];
 const r=makeMultiStepRequest(e.id,{candidate:e.mutated_candidate,checker_budget:1});
 const limited=searchBestFirstRepair(model,r);
 assert.equal(limited.status,'CHECKER_BUDGET_EXHAUSTED');
 assert.equal(limited.verified_repair,null);assert.equal(limited.checks_used,1);
 for(const bad of [{checker_budget:0},{beam_width:0},{move_cap:601},{max_edits:3},{mode:'oracle'},
   {seed:-5}]){
  const request=makeMultiStepRequest(e.id,{candidate:e.mutated_candidate,...bad});
  assert.throws(()=>searchBestFirstRepair(model,request),/INVALID_SEARCH_SETTINGS/);
 }
 const real=searchBestFirstRepair(model,makeMultiStepRequest(e.id,{candidate:e.mutated_candidate}));
 const forge=copy(real);forge.status='FORGED_LEAN_SUCCESS';
 assert.throws(()=>replayBestFirstRepair(model,forge),/TAMPERED/);
 const altered=copy(real);altered.checks_used++;
 assert.throws(()=>replayBestFirstRepair(model,altered),/TAMPERED/);
});
test('two-step search does not claim shortest edits or logical equivalence from beam-limited success',()=>{
 const e=buildTwoStepChallenges().examples[2];
 const req=makeMultiStepRequest(e.id,{candidate:e.mutated_candidate,mode:'learned',max_edits:2,checker_budget:70,beam_width:12});
 const r=searchMultiStepRepair(model,req);
 assert.equal(r.kernel_checked,false);assert.equal(r.pcs_authority,false);
 assert.ok(r.status==='FINITE_REPAIR_FOUND'||r.status==='CHECKER_BUDGET_EXHAUSTED'||r.status==='SEARCH_LIMIT_REACHED');
 assert.equal(replayMultiStepRepair(model,r).result,'EXACT_FINITE_REPLAY_MATCH');
 const changed=copy(r);changed.initial_check.equivalent_within_bound=true;
 assert.throws(()=>replayMultiStepRepair(model,changed),/TAMPERED/);
});
test('source distance is a syntactic heuristic only and reflects selected AST',()=>{
 const t=GAUNTLET_TASKS[0];
 assert.equal(sourceTreeDistance(t.source,t.source),0);
 assert.ok(sourceTreeDistance(t.source,t.candidate)>0);
 assert.notEqual(MULTISTEP_VERSION,'');
});
test('full 18-case benchmark compares same budgets and includes honest trivial source-copy ceiling',()=>{
 const report=benchmarkMultiStep(model,{checker_budget:55,beam_width:16,move_cap:120,seed:23});
 assert.equal(report.cases.length,18);
 assert.equal(report.metrics.learned.solved,18);
 assert.equal(report.metrics.original.solved,18);
 assert.equal(report.metrics.seeded_random.solved,15);
 assert.equal(report.metrics.learned.checker_calls,102);
 assert.equal(report.metrics.original.checker_calls,240);
 assert.equal(report.metrics.source_guided.checker_calls,54);
 assert.equal(report.metrics.literal_source_copy.checker_calls,36);
 assert.ok(report.cases.every(c=>c.learned.candidate_replay_verified));
 assert.equal(report.claims.kernel_checked,false);
 assert.equal(report.claims.blind_evaluation,false);
 assert.match(report.interpretation,/literal source copying/);
 assert.equal(recheckBenchmarkReport(model,report).replay,'MATCHED');
 const forged=copy(report);forged.metrics.learned.checker_calls=1;
 assert.throws(()=>recheckBenchmarkReport(model,forged),/FORGERY/);
});
