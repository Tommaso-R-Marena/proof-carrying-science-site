import test from "node:test";
import assert from "node:assert/strict";
import {PUZZLES,PUZZLE_BY_ID,PUZZLE_VERSION,gradeOrder} from "../public/proof-order-core.mjs";
function goodOrder(p) {
  const done=new Set(),order=[];
  for(let i=0;i<p.nodes.length;i++){
    const next=p.nodes.find(n=>!done.has(n.id)&&n.needs.every(id=>done.has(id)));
    assert.ok(next,"puzzle topological order must exist");
    order.push(next.id);done.add(next.id);
  }
  return order;
}
test("all educational puzzles have valid gold orders and positive constraints",()=>{
  assert.equal(PUZZLES.length,8);
  for(const p of PUZZLES){
    assert.equal(PUZZLE_BY_ID.get(p.id),p);
    assert.ok(p.nodes.length>=4 && p.nodes.length<=12);
    const score=gradeOrder(p.id,goodOrder(p));
    assert.equal(score.valid,true,p.id);
    assert.equal(score.score,100);
    assert.equal(score.puzzle_version,PUZZLE_VERSION);
    assert.match(score.meaning,/not a Lean 4 proof/);
  }
});
test("independent steps permit more than one legitimate ordering",()=>{
  const p=PUZZLE_BY_ID.get("bridge");
  const a=["plan","parts","banks","build","cross"];
  const b=["banks","plan","parts","build","cross"];
  assert.equal(gradeOrder(p.id,a).valid,true);
  assert.equal(gradeOrder(p.id,b).valid,true);
});
test("broken prerequisite receives precise invalid edge and partial credit",()=>{
  const p=PUZZLE_BY_ID.get("lean");
  const result=gradeOrder(p.id,["derive_c","derive_b","rule_bc","rule_ab","premise_a"]);
  assert.equal(result.valid,false);
  assert.ok(result.mistakes.length>0);
  assert.ok(result.score<100);
  assert.ok(result.mistakes.some(x=>x.after==="derive_c"));
});
test("unknown tag, duplicated/missing or injected step fails closed",()=>{
  const p=PUZZLE_BY_ID.get("bridge"),correct=goodOrder(p);
  assert.throws(()=>gradeOrder("fake",correct),/Unknown puzzle/);
  assert.throws(()=>gradeOrder(p.id,[...correct.slice(0,-1),"evil"]),/Unknown step/);
  assert.throws(()=>gradeOrder(p.id,[...correct.slice(0,-1),correct[0]]),/exactly once/);
  assert.throws(()=>gradeOrder(p.id,correct.slice(1)),/exactly once/);
});
test("reject nonnumeric, boolean, negative, or excessive hints",()=>{
  const p=PUZZLE_BY_ID.get("cookie"),correct=goodOrder(p);
  for(const hints of [true,false,-1,1.2,21,"0",null]){
    assert.throws(()=>gradeOrder(p.id,correct,hints),/Invalid hint/);
  }
});
test("hint usage only subtracts capped local score; never changes a graph's validity",()=>{
  const p=PUZZLE_BY_ID.get("archive"),correct=goodOrder(p);
  assert.equal(gradeOrder(p.id,correct,3).valid,true);
  assert.equal(gradeOrder(p.id,correct,3).score,88);
  assert.ok(gradeOrder(p.id,correct,20).score>=0);
});
test("all puzzles expose explicit reasoning rather than silent labels",()=>{
  for(const p of PUZZLES){
    assert.ok(p.title.length>=5 && p.story.length>=25 && p.goal.length>=8);
    for(const n of p.nodes){
      assert.ok(n.label.length>=10);
      assert.ok(n.why.length>=10);
      assert.ok(Array.isArray(n.needs));
    }
  }
});
test("game grading is deterministic across repeat submissions",()=>{
  for(const p of PUZZLES){
    const order=goodOrder(p);
    assert.deepEqual(gradeOrder(p.id,order,0),gradeOrder(p.id,order,0));
  }
});
