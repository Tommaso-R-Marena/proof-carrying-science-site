import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReviewGate,REQUIRED} from '../scripts/verify_website_review_gate.mjs';
const sha='a'.repeat(40);
const fixture=()=>({head_sha:sha,check_runs:REQUIRED.map(name=>({name,head_sha:sha,status:'completed',conclusion:'success'}))});
test('three authentic-looking completed checks satisfy offline evidence structure',()=>{
 assert.equal(verifyReviewGate(fixture(),sha).policy_met,true);
});
for(const state of ['skipped','neutral','failure','cancelled','timed_out',null]){
 test('fail closed on '+String(state),()=>{
  const f=fixture();f.check_runs[1].conclusion=state;
  assert.throws(()=>verifyReviewGate(f,sha),/not a completed PASS/);
 });
}
test('missing, duplicate, in-progress and wrong revision all reject',()=>{
 let f=fixture();f.check_runs.pop();assert.throws(()=>verifyReviewGate(f,sha),/missing/);
 f=fixture();f.check_runs.push(f.check_runs[0]);assert.throws(()=>verifyReviewGate(f,sha),/ambiguous/);
 f=fixture();f.check_runs[0].status='queued';assert.throws(()=>verifyReviewGate(f,sha),/not a completed PASS/);
 assert.throws(()=>verifyReviewGate(fixture(),'b'.repeat(40)),/different exact commit/);
});
