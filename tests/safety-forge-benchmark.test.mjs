import test from "node:test";
import assert from "node:assert/strict";
import {SAFETY_LAB_VERSION,evaluateResearchSession} from "../public/safety-forge-core.mjs";
import {prepareSafetyForgeDataset} from "../scripts/prepare_safety_forge_dataset.mjs";
import {benchmarkSafetyForgePolicy} from "../scripts/benchmark_safety_forge.mjs";
function entry(seed){
  return {replay:evaluateResearchSession({
    scenario_seed:seed,scenario_version:SAFETY_LAB_VERSION,
    attack_trials:[{actions:["shortcut"],assisted:false},{actions:["safe_route","deploy"],assisted:false}],
    repair_trials:[{guards:["risk"],feedback_exposed:false},{guards:["joint_review","risk","redact"],feedback_exposed:false}]
  }),collected_day:"2026-10-06"};
}
const dataset=seeds=>prepareSafetyForgeDataset({format:"pcs-safety-forge-optin-dataset-v1",entries:seeds.map(entry)});
test("refuses generalization claims from no or insufficient human examples",()=>{
  const none=benchmarkSafetyForgePolicy(dataset([]));
  assert.equal(none.ready,false);
  assert.match(none.reason,/Insufficient/);
  const partial=benchmarkSafetyForgePolicy(dataset([1,2,7]));
  assert.equal(partial.ready,false);
  assert.match(partial.interpretation,/No machine-learning generalization/);
});
test("runs reproducible held-out policy benchmark with actual finite checking",()=>{
  const data=dataset([1,2,3,4,5,7,14,21]);
  const result=benchmarkSafetyForgePolicy(data);
  assert.equal(result.ready,true);
  assert.equal(result.train_sessions,5);
  assert.equal(result.evaluation_sessions,3);
  assert.equal(result.trained_repair_examples,5);
  assert.equal(result.learned.pass_rate,1);
  assert.equal(result.hand_baseline.pass_rate,1);
  assert.equal(result.original.pass_rate,0);
  assert.ok(result.examples.every(e=>e.learned.regret>=0));
  assert.ok(result.examples.every(e=>e.oracle_minimum_cost<=e.hand_baseline.cost));
  assert.ok(result.not_claimed.includes("reinforcement learning training"));
});
test("rejects split leakage, tampered training rewards and wrong input type",()=>{
  const prepared=dataset([1,2,3,4,5,7,14,21]);
  assert.throws(()=>benchmarkSafetyForgePolicy({format:"wrong",episodes:[]}),/Prepare a deidentified/);
  const leak=structuredClone(prepared);
  leak.episodes[0].split="evaluation";
  leak.episodes.push({...structuredClone(leak.episodes[0]),split:"training"});
  assert.throws(()=>benchmarkSafetyForgePolicy(leak),/seed leakage/);
  const forged=structuredClone(prepared);
  forged.episodes[0].repair_episodes[1].guard_cost=0;
  assert.throws(()=>benchmarkSafetyForgePolicy(forged),/verification mismatch/);
});
test("each report includes only synthetic, seed-held-out test details",()=>{
  const a=benchmarkSafetyForgePolicy(dataset([1,2,3,4,5,7,14,21]));
  const b=benchmarkSafetyForgePolicy(dataset([1,2,3,4,5,7,14,21]));
  assert.deepEqual(a,b);
  const output=JSON.stringify(a);
  assert.doesNotMatch(output,/user_id|created_at|private@example.com|2026-10-06/);
});
