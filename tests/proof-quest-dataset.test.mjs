import test from "node:test";
import assert from "node:assert/strict";
import {PUZZLE_BY_ID,gradeOrder,PUZZLE_VERSION} from "../public/proof-order-core.mjs";
import {prepareDataset,DATASET_FORMAT} from "../scripts/prepare_proof_quest_dataset.mjs";

const orderFor=(id)=>{
  const nodes=PUZZLE_BY_ID.get(id).nodes;const done=new Set(),order=[];
  while(order.length<nodes.length){
    const next=nodes.find(n=>!done.has(n.id)&&n.needs.every(x=>done.has(x)));
    if(!next)throw Error("cyclic test puzzle");
    done.add(next.id);order.push(next.id);
  }
  return order;
};
const row=(id,order=orderFor(id))=>{
  const g=gradeOrder(id,order,0);
  return {puzzle_id:id,puzzle_version:PUZZLE_VERSION,order,hints_used:0,score:g.score,
    constraints_satisfied:g.correct,total_constraints:g.total,valid_order:g.valid,collected_at:"2026-10-06T00:00:00Z"};
};
const sample=(examples)=>({format:"pcs-proof-order-optin-research-dataset-v1",examples});

test("converts valid synthetic steps to explicit state/action/reward sequences",()=>{
  const out=prepareDataset(sample([row("bridge")]));
  assert.equal(out.format,DATASET_FORMAT);assert.equal(out.authority,"NONE");
  assert.equal(out.lean_tactic_trajectory,false);
  assert.equal(out.episodes.length,1);
  assert.equal(out.episodes[0].transitions.length,5);
  assert.equal(out.episodes[0].transitions[0].immediate_reward,1);
  assert.deepEqual(out.episodes[0].transitions[0].state.completed_step_ids,[]);
});
test("invalid human orders remain negative examples, not fake Lean passes",()=>{
  const invalid=[...orderFor("bridge")].reverse();
  const out=prepareDataset(sample([row("bridge",invalid)]));
  assert.equal(out.stats.invalid_orders,1);
  assert.ok(out.episodes[0].transitions.some(x=>x.immediate_reward===-1));
  assert.equal(out.episodes[0].full_order_valid,false);
});
test("separates whole puzzles across training and evaluation",()=>{
  const out=prepareDataset(sample([row("bridge"),row("archive"),row("optimize")]));
  const train=new Set(out.episodes.filter(x=>x.split==="training").map(x=>x.puzzle_id));
  const evaluation=new Set(out.episodes.filter(x=>x.split==="evaluation").map(x=>x.puzzle_id));
  assert.deepEqual([...train].sort(),["bridge"]);
  assert.deepEqual([...evaluation].sort(),["archive","optimize"]);
  assert.equal([...train].filter(x=>evaluation.has(x)).length,0);
});
test("rejects fabricated server scores or malformed step IDs",()=>{
  const bad=row("math");bad.score=999;
  assert.throws(()=>prepareDataset(sample([bad])),/recomputed puzzle grade/);
  const other=row("bridge");other.order[0]="injected";
  assert.throws(()=>prepareDataset(sample([other])),/Unknown step/);
});
test("rejects PII columns and unsupported file formats",()=>{
  assert.throws(()=>prepareDataset({format:"unknown",examples:[]}),/Owner-exported/);
  const bad=row("cookie");bad.user_id="private-id";
  assert.throws(()=>prepareDataset(sample([bad])),/personal identifiers/);
  assert.equal(prepareDataset(sample([])).stats.episodes,0);
});
test("output excludes timestamps, users, IP and emails",()=>{
  const out=prepareDataset(sample([row("cookie")]));
  const serialized=JSON.stringify(out.episodes);
  assert.ok(!serialized.includes("2026-10-06"));
  assert.ok(!serialized.includes("user_id"));
  assert.ok(!serialized.includes("IP address"));
});
