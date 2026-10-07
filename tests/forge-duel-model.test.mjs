import test from "node:test";
import assert from "node:assert/strict";
import {scenarioForSeed} from "../public/safety-forge-core.mjs";
import {DUEL_VERSION,duelFor,evaluateDuelSession} from "../public/forge-duel-core.mjs";
import {prepareForgeDuelDataset} from "../scripts/prepare_forge_duel_dataset.mjs";
import {fitBaseline,RANKER_FORMAT} from "../scripts/fit_forge_duel_ranker.mjs";
function sample(){
  const seeds=new Map();
  for(let seed=1;seed<=200;seed++){
    const family=scenarioForSeed(seed).id;
    const bucket=seeds.get(family)||[];
    if(bucket.length<5)bucket.push(seed);
    seeds.set(family,bucket);
  }
  assert.equal(seeds.size,4);
  const entries=[];
  for(const familySeeds of seeds.values())for(const seed of familySeeds){
    const ballots=[0,1,2].map(round=>({seed,round,version:DUEL_VERSION,
      choice:duelFor(seed,round).oracle.winner,reason:"risk",confidence:3}));
    entries.push(evaluateDuelSession({session_version:DUEL_VERSION,ballots}));
  }
  return prepareForgeDuelDataset({format:"pcs-forge-duel-optin-research-dataset-v1",entries});
}
test("pairwise baseline trains deterministically and preserves separate held-out-world metrics",()=>{
  const data=sample();
  assert.equal(data.rows.length,60);
  const a=fitBaseline(data,{epochs:25}),b=fitBaseline(data,{epochs:25});
  assert.equal(a.format,RANKER_FORMAT);
  assert.equal(a.training_cases,45);
  assert.equal(a.evaluation_cases,15);
  assert.deepEqual(a.weights,b.weights);
  assert.ok(a.metrics.model_heldout_world_accuracy>=0&&a.metrics.model_heldout_world_accuracy<=1);
  assert.equal(a.metrics.exact_simulator_baseline_accuracy,1);
  assert.equal(a.metrics.human_train_oracle_agreement,1);
  assert.equal(a.metrics.human_heldout_oracle_agreement,1);
  assert.ok(a.weights.some(group=>group.some(value=>value!==0)));
});
test("baseline must not train on evaluation examples or malformed input",()=>{
  const data=sample(),poisoned=structuredClone(data);
  poisoned.rows[0].split="evaluation";
  assert.throws(()=>fitBaseline(poisoned),/holdout/);
  const unsupported=structuredClone(data);
  unsupported.rows[0].world="fake-world";
  assert.throws(()=>fitBaseline(unsupported),/holdout/);
  assert.throws(()=>fitBaseline({format:"fake",rows:[]}),/independently prepared/);
  assert.throws(()=>fitBaseline(data,{epochs:100000}),/bounded/);
  const fakeResult=structuredClone(data);
  const first=fakeResult.rows[0];
  first.oracle_winner=first.oracle_winner==="A"?"B":"A";
  assert.throws(()=>fitBaseline(fakeResult),/independent finite-state oracle/);
  const fakePolicy=structuredClone(data);
  fakePolicy.rows[0].policy_A=["freeze_deploy"];
  assert.throws(()=>fitBaseline(fakePolicy),/independent finite-state oracle/);
  const duplicate=structuredClone(data);
  duplicate.rows.push(structuredClone(duplicate.rows[0]));
  const one=fitBaseline(data,{epochs:4}),two=fitBaseline(duplicate,{epochs:4});
  assert.equal(one.training_cases,two.training_cases);
  assert.deepEqual(one.weights,two.weights);
});
