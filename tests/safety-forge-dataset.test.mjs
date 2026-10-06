import test from "node:test";
import assert from "node:assert/strict";
import {evaluateResearchSession,SAFETY_LAB_VERSION} from "../public/safety-forge-core.mjs";
import {prepareSafetyForgeDataset,SAFETY_FORGE_DATASET} from "../scripts/prepare_safety_forge_dataset.mjs";

const makeEntry=(seed)=>({
  replay:evaluateResearchSession({
    scenario_seed:seed,scenario_version:SAFETY_LAB_VERSION,
    attack_trials:[{actions:["shortcut"]},{actions:["safe_route","deploy"]}],
    repair_trials:[{guards:["risk"]},{guards:["joint_review","redact","risk"]}]
  }),collected_day:"2026-10-06"
});
const dataset=(entries)=>({format:"pcs-safety-forge-optin-dataset-v1",entries});

test("turns human toy choices into explicit model state/action/reward episodes",()=>{
  const prepared=prepareSafetyForgeDataset(dataset([makeEntry(197)]));
  assert.equal(prepared.format,SAFETY_FORGE_DATASET);
  assert.equal(prepared.proof_kernel_verdict,"NOT_EVALUATED");
  assert.equal(prepared.real_lean_tactic_traces,false);
  assert.equal(prepared.stats.attack_trajectories,2);
  assert.equal(prepared.stats.repair_proposals,2);
  assert.equal(prepared.stats.verified_counterexamples,2);
  assert.equal(prepared.stats.verified_repairs,1);
  const first=prepared.episodes[0].attack_episodes[0].steps[0];
  assert.equal(first.reward,5);
  assert.equal(first.violations[0],"RISK_BUDGET_EXCEEDED");
  assert.ok(first.available_actions.includes("shortcut"));
});
test("held-out seed partitions do not put same scenario seed in train and test",()=>{
  const data=prepareSafetyForgeDataset(dataset([makeEntry(7),makeEntry(8),makeEntry(14)]));
  assert.equal(data.stats.train,1);
  assert.equal(data.stats.evaluation,2);
  const bySeed=new Map();
  for(const x of data.episodes){
    if(bySeed.has(x.scenario_seed))assert.equal(bySeed.get(x.scenario_seed),x.split);
    bySeed.set(x.scenario_seed,x.split);
  }
});
test("rejects fake rewards, edited result verdicts and unknown scenario",()=>{
  const altered=makeEntry(197);altered.replay.repairs[0].passed=true;
  assert.throws(()=>prepareSafetyForgeDataset(dataset([altered])),/Replay mismatch/);
  const injected=makeEntry(197);injected.replay.lean_proven=true;
  assert.throws(()=>prepareSafetyForgeDataset(dataset([injected])),/Replay mismatch/);
  const unsupported=makeEntry(197);unsupported.replay.scenario_version="unsupported";
  assert.throws(()=>prepareSafetyForgeDataset(dataset([unsupported])),/Unknown scenario version/);
});
test("rejects account identifiers, extra columns and unknown sources",()=>{
  const invalid=makeEntry(197);invalid.email="private@example.com";
  assert.throws(()=>prepareSafetyForgeDataset(dataset([invalid])),/personal identifiers/);
  assert.throws(()=>prepareSafetyForgeDataset({format:"random",entries:[]}),/Owner-exported/);
  assert.deepEqual(prepareSafetyForgeDataset(dataset([])).episodes,[]);
});
test("derived training data contains no submit timestamps or person identifiers",()=>{
  const prepared=prepareSafetyForgeDataset(dataset([makeEntry(197)]));
  const e=JSON.stringify(prepared.episodes);
  assert.doesNotMatch(e,/2026-10-06|user_id|private@example.com|collected_day|created_at/);
});
test("same server-exported trial gets exactly reproducible labels on every preparation",()=>{
  const data=dataset([makeEntry(197),makeEntry(198)]);
  assert.deepEqual(prepareSafetyForgeDataset(data),prepareSafetyForgeDataset(data));
});
