import test from "node:test";
import assert from "node:assert/strict";
import {evaluateResearchSession,SAFETY_LAB_VERSION} from "../public/safety-forge-core.mjs";
import {prepareSafetyForgeDataset,SAFETY_FORGE_DATASET} from "../scripts/prepare_safety_forge_dataset.mjs";

const makeEntry=(seed)=>({
  replay:evaluateResearchSession({
    scenario_seed:seed,scenario_version:SAFETY_LAB_VERSION,
    attack_trials:[{actions:["shortcut"],assisted:false},{actions:["safe_route","deploy"],assisted:false}],
    repair_trials:[{guards:["risk"],feedback_exposed:false},{guards:["joint_review","redact","risk"],feedback_exposed:false}]
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
  assert.equal(prepared.stats.verified_counterexamples,1); // Second attempted deployment is correctly blocked
  assert.equal(prepared.stats.verified_repairs,1);
  const first=prepared.episodes[0].attack_episodes[0].steps[0];
  assert.equal(first.reward,5);
  assert.equal(first.violations[0],"RISK_BUDGET_EXCEEDED");
  assert.ok(first.available_actions.includes("shortcut"));
  assert.equal(prepared.episodes[0].attack_episodes[1].steps[1].blocked,true);
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

test("exports whether the player saw an oracle hint or checker feedback before choosing",()=>{
  const x=makeEntry(197);
  x.replay.attacks[0].assisted="unverifiable_claim";
  assert.throws(()=>prepareSafetyForgeDataset(dataset([x])),/Invalid attack trial/);
  // A Boolean assistance flag can be replayed, but its historical truth is self-reported.
  const replay=evaluateResearchSession({
    scenario_seed:197,scenario_version:SAFETY_LAB_VERSION,
    attack_trials:[{actions:["shortcut"],assisted:true},{actions:["safe_route","deploy"],assisted:false}],
    repair_trials:[{guards:["risk"],feedback_exposed:false},{guards:["joint_review","redact","risk"],feedback_exposed:true}]
  });
  const out=prepareSafetyForgeDataset(dataset([{replay,collected_day:"2026-10-06"}]));
  assert.equal(out.episodes[0].attack_episodes[0].assisted_by_hint_or_oracle,true);
  assert.equal(out.episodes[0].repair_episodes[1].feedback_exposed_before_proposal,true);
});

test("derived repair comparisons prefer checker-rewarded policies, without inventing human votes",()=>{
  const out=prepareSafetyForgeDataset(dataset([makeEntry(197)]));
  assert.equal(out.stats.verifier_derived_repair_preference_pairs,1);
  const [pair]=out.episodes[0].repair_preference_pairs;
  assert.ok(pair.preferred_reward>pair.dispreferred_reward);
  assert.ok(pair.reward_gap>0);
  assert.equal(pair.source,"derived_pairwise_order_from_independently_replayed_bounded_verdicts");
  assert.equal(pair.independent_human_preference,false);
  assert.deepEqual(pair.preferred_guards,["joint_review","redact","risk"]);
  assert.deepEqual(pair.dispreferred_guards,["risk"]);
  assert.equal(pair.hint_or_checker_feedback_prior,false);
});
test("assisted shield trials remain marked when deriving preference supervision",()=>{
  const input=makeEntry(197);
  input.replay=evaluateResearchSession({
    scenario_seed:197,scenario_version:SAFETY_LAB_VERSION,
    attack_trials:[{actions:["shortcut"],assisted:false}],
    repair_trials:[{guards:["risk"],feedback_exposed:false},{guards:["joint_review","redact","risk"],feedback_exposed:true}]
  });
  const out=prepareSafetyForgeDataset(dataset([input]));
  assert.equal(out.episodes[0].repair_preference_pairs[0].hint_or_checker_feedback_prior,true);
});
