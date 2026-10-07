import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 TASKS,CORE_SOURCE_COMMIT,PROOFLAB_VERSION,findTask,proofPlan,repairPuzzle,
 scopePuzzle,nextReady,evaluateSession,taskDeck
} from "../public/prooflab-core.mjs";
const text=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const goodActions=id=>{
 const stage=[],placed=[];
 while(nextReady(id,placed).length){const n=nextReady(id,placed)[0];stage.push({kind:"place",node:n.id});placed.push(n.id);}
 stage.push({kind:"repair",choice:repairPuzzle(id).missing_source});
 stage.push({kind:"scope",choice:"scoped",confidence:3});
 return stage;
};
test("exactly 46 source-backed public tasks with no evaluation-module leakage",()=>{
 assert.equal(TASKS.length,46);
 assert.equal(taskDeck("train").length,32);
 assert.equal(taskDeck("challenge").length,14);
 assert.equal(new Set(TASKS.map(x=>x.id)).size,46);
 assert.ok(TASKS.every(r=>!["PKPDCheck","Workflow"].includes(r.module)));
 assert.ok(TASKS.every(r=>r.source.revision===CORE_SOURCE_COMMIT));
 assert.ok(TASKS.every(r=>/^([a-f0-9]{40})$/.test(r.source.blob_sha)));
 assert.ok(TASKS.every(r=>r.statement.startsWith("theorem ")&&!r.statement.includes(":=")));
 assert.ok(TASKS.every(r=>r.status==="source_declared_kernel_not_attested"));
});
test("all educational proof plans form finite acyclic paths grounded in actual statements",()=>{
 let variations=new Set(),refLinks=0;
 for(const task of TASKS){
  const plan=proofPlan(task.id),all=new Set(plan.nodes.map(n=>n.id));
  assert.equal(plan.task.statement,findTask(task.id).statement);
  assert.ok(plan.nodes.length>=8&&plan.nodes.length<=12);
  for(const n of plan.nodes){assert.ok(n.needs.every(id=>all.has(id)));assert.ok(!n.needs.includes(n.id));}
  const placed=[];
  while(placed.length<plan.nodes.length){
   const ready=nextReady(task.id,placed);
   assert.ok(ready.length>0,"Cycle in "+task.id);
   placed.push(ready[0].id);
  }
  assert.equal(new Set(placed).size,plan.nodes.length);
  variations.add(plan.nodes.map(x=>x.id).join("/"));
  refLinks+=task.syntactic_reference_mentions.length;
 }
 assert.ok(variations.size>=2,"Strategies must vary with the actual theorem shape");
 assert.ok(refLinks>0,"Sourced identifier mentions must be present");
});
test("every authentic source-backed goal supports missing-edge repair and scoped criticism",()=>{
 for(const task of TASKS){
  const p=repairPuzzle(task.id),s=scopePuzzle(task.id),graph=proofPlan(task.id);
  assert.ok(graph.nodes.some(x=>x.id===p.target));
  assert.ok(p.choices.length>=3);
  assert.equal(new Set(p.choices.map(x=>x.id)).size,p.choices.length);
  assert.ok(p.choices.some(x=>x.id===p.missing_source));
  assert.ok(!p.visible_edges.some(e=>e.to===p.target&&e.from===p.missing_source));
  assert.ok(s.choices.some(x=>x.id==="scoped"));
  assert.ok(s.choices.filter(x=>x.id==="scoped").length===1);
  assert.match(s.explanation,/\S/);
 }
});
test("all 46 complete educational histories replay independently and never mint Lean proof claims",()=>{
 for(const t of TASKS){
  const attempt={version:PROOFLAB_VERSION,task_id:t.id,actions:goodActions(t.id)};
  const graded=evaluateSession(attempt);
  assert.equal(graded.game_scaffold_passed,true);
  assert.equal(graded.complete,true);
  assert.equal(graded.repair.correct,true);
  assert.equal(graded.interpretation.correct,true);
  assert.equal(graded.invalid_moves,0);
  assert.equal(graded.hints,0);
  assert.equal(graded.kernel_proof_verified,false);
  assert.equal(graded.score,100);
  assert.equal(graded.source_revision,undefined);
  assert.deepEqual(graded,evaluateSession(attempt));
 }
});
test("negative moves, undo and hints remain replayable and penalize unsupported strategies",()=>{
 const t=TASKS[0],plan=proofPlan(t.id),repair=repairPuzzle(t.id);
 const actions=[
  {kind:"place",node:"report"},
  {kind:"hint"},
  {kind:"place",node:"read"},
  {kind:"place",node:"scope"},
  {kind:"undo"},
  {kind:"repair",choice:repair.choices.find(x=>x.id!==repair.missing_source).id},
  {kind:"scope",choice:scopePuzzle(t.id).choices.find(x=>x.id!=="scoped").id,confidence:3}
 ];
 const result=evaluateSession({version:PROOFLAB_VERSION,task_id:t.id,actions});
 assert.equal(result.invalid_moves,1);
 assert.equal(result.hints,1);
 assert.equal(result.placed.length,1);
 assert.equal(result.repair.correct,false);
 assert.equal(result.interpretation.correct,false);
 assert.ok(result.score<100);
 assert.ok(result.attempted_actions.some(x=>x.kind==="place"&&!x.accepted));
});
test("malformed, fabricated and overly long workshop donations fail closed",()=>{
 const t=TASKS[0],good={version:PROOFLAB_VERSION,task_id:t.id,actions:goodActions(t.id)};
 for(const payload of [
  {...good,claimed_score:1000},
  {...good,task_id:"PKPDCheck/pkpdContractRun_sound"},
  {...good,version:"pcs-prooflab-evil"},
  {...good,actions:[{kind:"place",node:"impossible"}]},
  {...good,actions:[{kind:"scope",choice:"scoped",confidence:5},...good.actions]},
  {...good,actions:[{kind:"place",node:"read",trusted:true},...good.actions]},
  {...good,actions:[{kind:"kernelApproved"},{kind:"repair",choice:"read"},{kind:"scope",choice:"scoped",confidence:3}]},
  {...good,actions:Array(81).fill({kind:"hint"})}
 ]){
  assert.throws(()=>evaluateSession(payload));
 }
});
test("public HTML binds all client controls and makes opt-in privacy explicit",()=>{
 const html=text("public/prooflab.html"),js=text("public/prooflab.js"),style=text("public/prooflab.css");
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const m of js.matchAll(/\$\("([^"]+)"\)/g))assert.ok(ids.includes(m[1]),"Missing "+m[1]);
 assert.match(js,/if\(!\$\("labAdult"\)\.checked\|\|!\$\("labConsent"\)\.checked\)/);
 assert.match(js,/evaluateSession\(payload\(\)\)/);
 assert.match(js,/api\/arena\/prooflab\/donate/);
 assert.match(html,/not actual Lean terms/i);
 assert.match(html,/15.*withheld evaluation declarations/);
 assert.match(style,/@media\(max-width:650px\)/);
});
