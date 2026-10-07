import test from "node:test";
import assert from "node:assert/strict";
import {PROOFLAB_VERSION,TASKS,nextReady,repairPuzzle,evaluateSession} from "../public/prooflab-core.mjs";
import {prepareProofLabDataset} from "../scripts/prepare_prooflab_dataset.mjs";
function good(task){
 const ids=[],actions=[];
 while(nextReady(task,ids).length){const id=nextReady(task,ids)[0].id;ids.push(id);actions.push({kind:"place",node:id});}
 actions.push({kind:"repair",choice:repairPuzzle(task).missing_source});
 actions.push({kind:"scope",choice:"scoped",confidence:3});return actions;
}
function dataset(rows){
 return{format:"pcs-prooflab-optin-learning-sessions-v1",
  core_revision:"cff0b67595abd4862ab0c156b157f262b169eca5",records:rows};
}
test("offline exports are independently reproduced from behavioral action traces",()=>{
 const sources=[TASKS.find(x=>x.split==="train"),TASKS.find(x=>x.split==="challenge")];
 const records=sources.map(t=>evaluateSession({version:PROOFLAB_VERSION,task_id:t.id,actions:good(t.id)}));
 const compiled=prepareProofLabDataset(dataset(records));
 assert.equal(compiled.rows.length,2);
 assert.equal(compiled.metrics.donated_sessions,2);
 assert.equal(compiled.metrics.eligible_narrow_training,1);
 assert.equal(compiled.rows.filter(r=>r.split==="public_challenge_only").length,1);
 assert.ok(compiled.rows.every(r=>r.real_lean_proof_verified===false));
 assert.ok(compiled.evaluation_policy.private_modules_absent.includes("PKPDCheck"));
});
test("tampered labels and accidental identity fields are rejected",()=>{
 const task=TASKS[0],record=evaluateSession({version:PROOFLAB_VERSION,task_id:task.id,actions:good(task.id)});
 for(const mutate of [
  row=>{row.score=900;},
  row=>{row.task_source.line+=1;},
  row=>{row.kernel_proof_verified=true;},
  row=>{row.user_id="secret";},
  row=>{row.attempted_actions[0].accepted=false;},
  row=>{row.module="external";},
 ]){
  const copy=structuredClone(record);mutate(copy);
  assert.throws(()=>prepareProofLabDataset(dataset([copy])));
 }
});
test("data split is by source module and never manufactures a Lean pass",()=>{
 const task=TASKS[0];
 const goodRecord=evaluateSession({version:PROOFLAB_VERSION,task_id:task.id,actions:good(task.id)});
 const t=prepareProofLabDataset(dataset([goodRecord,goodRecord]));
 assert.equal(t.metrics.donated_sessions,2);
 assert.equal(t.metrics.distinct_public_theorems,1);
 assert.equal(t.rows[0].split,"train");
 assert.equal(t.rows[1].split,"train");
 assert.ok(t.warnings.some(x=>x.includes("NOT actual kernel")));
});
