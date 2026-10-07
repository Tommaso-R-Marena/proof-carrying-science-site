import test from "node:test";
import assert from "node:assert/strict";
import {allProofLabCases,PROOFLAB_VERSION,availablePlanMoves,proofLabDecisionSet,evaluateProofLabSession}
 from "../public/prooflab-core.mjs";
import {PROOFLAB_SOURCE_COMMIT} from "../public/prooflab-source-data.mjs";
import {PROOFLAB_LEARNING_FORMAT,prepareProofLabDataset}
 from "../scripts/prepare_prooflab_dataset.mjs";
const cases=allProofLabCases();
function session(c,withBad=false){
 let done=[],actions=[];
 if(withBad){
  const blocked=proofLabDecisionSet(c.id,done,0).find(id=>!availablePlanMoves(c.id,done).includes(id));
  actions.push({node:blocked,reason:"intuition",confidence:2,assisted:false});
 }
 while(done.length<c.nodes.length){
  const feasible=new Set(availablePlanMoves(c.id,done));
  const next=proofLabDecisionSet(c.id,done,actions.length).find(id=>feasible.has(id));
  actions.push({node:next,reason:"dependency",confidence:2,assisted:false});done.push(next);
 }
 return evaluateProofLabSession({case_id:c.id,version:PROOFLAB_VERSION,actions,hints_used:0,
  threat:c.threats[0],threat_confidence:1});
}
function exported(entries){return{format:"pcs-prooflab-optin-source-grounded-dataset-v2",
 source_commit:PROOFLAB_SOURCE_COMMIT,entries};}
test("owner export preparation independently replays all 22 genuine-source training missions",()=>{
 const dataset=prepareProofLabDataset(exported(cases.map(c=>session(c,true))));
 assert.equal(dataset.format,PROOFLAB_LEARNING_FORMAT);
 assert.equal(dataset.case_count,22);
 assert.equal(dataset.private_holdout_counts.validation,8);
 assert.equal(dataset.private_holdout_counts.evaluation,10);
 assert.equal(dataset.quality.blocked_actions,22);
 assert.equal(dataset.rows.length,dataset.sample_count);
 assert.ok(dataset.rows.every(r=>r.split==="training"&&r.source_commit===PROOFLAB_SOURCE_COMMIT));
 assert.ok(dataset.rows.every(r=>!Object.hasOwn(r,"email")&&!Object.hasOwn(r,"user_id")));
});
test("controlled candidate sets preserve listwise human choices and all feasible alternatives",()=>{
 const c=cases[0],data=prepareProofLabDataset(exported([session(c)]));
 assert.ok(data.rows.every(row=>row.choice_set.includes(row.selected_action)));
 assert.ok(data.rows.every(row=>Array.isArray(row.feasible_actions_in_set)));
 const branching=data.rows.find(row=>row.completed_before.includes("scope")&&
   row.feasible_actions_in_set.includes("artifact")&&row.feasible_actions_in_set.includes("premises"));
 assert.ok(branching,"expected a real two-way feasible decision after scope");
 assert.equal(branching.selected_feasible,true);
 assert.ok(Number.isInteger(branching.selected_position));
 assert.equal(branching.assisted_by_explicit_hint,false);
 assert.match(data.training_contract.label,/Controlled listwise/);
});
test("tampered checker labels and hidden benchmark examples fail closed",()=>{
 let input=exported([session(cases[0])]);
 input.entries[0].graph_replay.accepted=0;
 assert.throws(()=>prepareProofLabDataset(input),/disagrees/);
 input=exported([session(cases[0])]);input.entries[0].split="evaluation";
 assert.throws(()=>prepareProofLabDataset(input),/disagrees|leaked/);
 input=exported([session(cases[0])]);input.entries[0].actions[0].confidence=12;
 assert.throws(()=>prepareProofLabDataset(input),/replay rejected/);
});
test("identity data, invalid format or forged source revision never trains",()=>{
 const x=exported([session(cases[0])]);x.email="private@no.example";
 assert.throws(()=>prepareProofLabDataset(x),/personal identifiers/);
 const y=exported([session(cases[0])]);y.source_commit="fake";
 assert.throws(()=>prepareProofLabDataset(y),/source-pinned/);
 const z=exported([session(cases[0])]);z.entries[0].account_id="unexpected";
 assert.throws(()=>prepareProofLabDataset(z),/Invalid full verified/);
});
test("repeated human submissions are marked, not silently elevated to independent evidence",()=>{
 const data=prepareProofLabDataset(exported([session(cases[0]),session(cases[0])]));
 assert.equal(data.case_count,1);
 assert.equal(data.quality.duplicate_human_trajectories,1);
 assert.ok(data.rows.length>cases[0].nodes.length);
 assert.match(data.training_contract.duplicate_policy,/duplicated trajectory/);
});
