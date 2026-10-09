import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GAUNTLET_TASKS} from '../public/semantic-gauntlet-core.mjs';
import {listRepairMoves,finiteRepairCheck} from '../public/semantic-repair-core.mjs';
import {POLICY_DIM,repairFeatures,rankRepairMoves as browserRankMoves} from '../public/semantic-repair-policy.mjs';
import {trainRepairModel,validateRepairModel,generateTrainingExamples,rankRepairMoves,
 evaluateRepairModel,proposeCheckedRepair,replayCheckedRepair} from '../scripts/train_semantic_repair_policy.mjs';
const file=JSON.parse(readFileSync(new URL('../public/repair-policy-model-v1.json',import.meta.url),'utf8'));
const copy=x=>structuredClone(x);

test('real pairwise learner fits deterministic weights from TRAINING FAMILIES ONLY',()=>{
 const learned=trainRepairModel();assert.deepEqual(learned,file);
 assert.equal(learned.weights.length,POLICY_DIM);
 assert.equal(learned.training.positive_examples,24);
 assert.equal(learned.training.examples,138);
 assert.equal(learned.training.ranking_pairs,384);
 assert.equal(learned.provenance.human_examples,0);
 assert.equal(learned.provenance.evaluation_labels_used_for_training,false);
 assert.equal(learned.authority,'NONE_UNTRUSTED_PROPOSALS_ONLY');
 const ids=new Set(learned.training.training_task_ids);
 assert.equal(ids.size,18);
 assert.ok([...ids].every(id=>GAUNTLET_TASKS.find(t=>t.id===id).split==='training'));
 assert.equal(validateRepairModel(file,{retrain:true}),true);
});

test('features, ranking and predictions are consistent in shared browser and Node code',()=>{
 const task=GAUNTLET_TASKS.find(t=>t.id==='implication-reversal-1');
 const moves=listRepairMoves(task.id,task.candidate,160);
 assert.ok(moves.length>5);
 const features=repairFeatures(task,task.candidate,moves[0]);
 assert.ok(features.length>20);
 assert.ok(features.every(([i,v])=>i>=0&&i<POLICY_DIM&&Number.isFinite(v)));
 const fromBrowser=browserRankMoves(file,task,task.candidate,listRepairMoves,{limit:160});
 const fromNode=rankRepairMoves(file,task,task.candidate,{limit:160});
 assert.deepEqual(fromBrowser,fromNode);
 assert.equal(fromNode[0].operation,'exchange_operands');
});

test('model does not get to certify a false repair or arbitrary task',()=>{
 const out=proposeCheckedRepair(file,'implication-reversal-1',{check_budget:1});
 assert.equal(out.status,'BOUNDED_REPAIR_FOUND');
 assert.equal(out.attempts.length,1);
 assert.equal(out.attempts[0].finite_verdict.equivalent_within_bound,true);
 assert.equal(finiteRepairCheck(out.task_id,out.attempts[0].formula).equivalent_within_bound,true);
 assert.equal(out.kernel_checked,false);
 assert.equal(replayCheckedRepair(file,out).result,'EXACT_FINITE_REPLAY_MATCH');
 assert.throws(()=>proposeCheckedRepair(file,'unknown-case'),/UNKNOWN_TASK/);
 assert.throws(()=>proposeCheckedRepair(file,out.task_id,{check_budget:0}),/INVALID_PROPOSAL_BUDGET/);
 const mutant=copy(out);mutant.attempts[0].finite_verdict.equivalent_within_bound=false;
 assert.throws(()=>replayCheckedRepair(file,mutant),/TAMPERED/);
 const fake=copy(out);fake.kernel_checked=true;
 fake.record_sha256=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(fake).filter(([k])=>k!=='record_sha256')))).digest('hex');
 assert.throws(()=>replayCheckedRepair(file,fake),/TAMPERED/);
});

test('poisoned weights rejected even if the attacker updates the public hash',()=>{
 const tampered=copy(file);tampered.weights[0]+=0.01;
 assert.throws(()=>validateRepairModel(tampered),/INTEGRITY/);
 const core=Object.fromEntries(Object.entries(tampered).filter(([k])=>k!=='model_digest_sha256'));
 tampered.model_digest_sha256=createHash('sha256').update(JSON.stringify(core)).digest('hex');
 assert.equal(validateRepairModel(tampered),true,'hash can be recomputed by an attacker');
 assert.throws(()=>validateRepairModel(tampered,{retrain:true}),/NOT_REPRODUCIBLE/);
 tampered.training.training_task_ids.push('implication-reversal-1');
 assert.throws(()=>validateRepairModel(tampered),/INTEGRITY|LEAKAGE/);
});

test('real held-out replay quantifies model against original-order and random baselines',()=>{
 const result=evaluateRepairModel(file,{split:'evaluation',check_budget:5});
 assert.equal(result.results.learned.tasks,18);
 assert.equal(result.results.learned.repairable,9);
 assert.equal(result.results.learned.solved,9);
 assert.equal(result.results.original_order.solved,9);
 assert.equal(result.results.learned.total_checker_calls,48);
 assert.equal(result.results.original_order.total_checker_calls,63);
 assert.equal(result.results.seeded_random.solved,7);
 assert.equal(result.results.exact_oracle_ceiling.solved,9);
 assert.ok(result.cases.every(x=>x.split==='evaluation'));
 assert.ok(result.cases.every(x=>x.learned.success===false||x.one_edit_repair_exists));
 assert.deepEqual(result,evaluateRepairModel(file,{split:'evaluation',check_budget:5}));
 assert.throws(()=>evaluateRepairModel(file,{split:'not_a_split'}),/INVALID/);
});

test('no training examples from public evaluation families, despite visible task definitions',()=>{
 const data=generateTrainingExamples();
 assert.equal(data.rows.length,138);
 const evalIds=new Set(GAUNTLET_TASKS.filter(t=>t.split==='evaluation').map(t=>t.id));
 assert.ok(data.rows.every(r=>!evalIds.has(r.task_id)));
 assert.equal(data.rows.filter(r=>r.positive).length,24);
});
