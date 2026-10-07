import test from "node:test";
import assert from "node:assert/strict";
import {PUZZLES,gradeOrder} from "../public/proof-order-core.mjs";
import {verifyShield,scenarioForSeed} from "../public/safety-forge-core.mjs";
import {dependencyState,graphLayout,inspectPlacement,repairFirstInversion,classifyPolicyTrials,traceFrames} from "../public/arena-lab-tools.mjs";
test("every puzzle has a total, acyclic, inspectable graph without mutating the source",()=>{
  for(const puzzle of PUZZLES){
    const snapshot=JSON.stringify(puzzle);
    const result=dependencyState(puzzle);
    const layout=graphLayout(puzzle);
    assert.equal(result.total,puzzle.nodes.length);
    assert.ok(result.ready.length>0);
    assert.equal(result.edges.length,puzzle.nodes.reduce((sum,n)=>sum+n.needs.length,0));
    assert.ok(layout.nodes.every(n=>n.x>=0&&n.x<layout.width));
    assert.ok(layout.edges.every(e=>e.y1<e.y2));
    assert.equal(JSON.stringify(puzzle),snapshot);
  }
});
test("a live prerequisite check distinguishes independent from blocked actions",()=>{
  const p=PUZZLES.find(p=>p.id==="bridge");
  assert.equal(inspectPlacement(p,[],"banks").valid,true);
  assert.equal(inspectPlacement(p,[],"build").valid,false);
  assert.deepEqual(inspectPlacement(p,[],"build").missing,["parts","banks"]);
  assert.throws(()=>dependencyState(p,["build","build"]),/duplicate/);
  assert.throws(()=>inspectPlacement(p,[],"injected"),/unavailable/);
});
test("guided repair changes one real inverted pair and can recover a scrambled route",()=>{
  const p=PUZZLES.find(p=>p.id==="lean");let order=[...p.nodes.map(n=>n.id)].reverse();
  let count=0;
  while(!gradeOrder(p.id,order).valid&&count<24){
    const next=repairFirstInversion(p,order,gradeOrder(p.id,order).mistakes);
    assert.equal(next.changed,true);
    order=next.order;count++;
  }
  assert.equal(gradeOrder(p.id,order).valid,true);
  assert.ok(count>0);
});
test("policy notebook rankings come from real finite-state verifier results",()=>{
  const seed=197;assert.ok(scenarioForSeed(seed).risk_budget>=2);
  const policies=[[],["freeze_routes","freeze_deploy","freeze_report"],["joint_review","redact","risk"]];
  const rows=policies.map(guards=>({guards,result:verifyShield(seed,guards)}));
  const ranked=classifyPolicyTrials(rows);
  assert.equal(ranked[0].result.passed,true);
  assert.equal(ranked.at(-1).result.passed,false);
  assert.throws(()=>classifyPolicyTrials([{guards:[],result:{score:"made-up"}}]),/verified/);
});
test("replay theater is tied to the existing server-replay-compatible simulator",()=>{
  const replay=traceFrames(197,[],["safe_route","deploy"]);
  assert.equal(replay.length,2);
  assert.equal(replay[1].unsafe,true);
  assert.ok(replay[1].violations.includes("UNAUTHORIZED_DEPLOYMENT"));
  const blocked=traceFrames(197,["risk"],["shortcut"]);
  assert.equal(blocked[0].blocked,true);
  assert.equal(blocked[0].unsafe,false);
});
