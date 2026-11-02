import test from 'node:test';import assert from 'node:assert/strict';
import {beginPilot,readPilot,recordPilotEvent,answerPilot,finishPilot,pilotSummary,validatePilot,erasePilot,PILOT_TASKS} from '../public/proof-workbench-pilot.mjs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('optional study needs separate adult/participation consent and never establishes human identity',()=>{
 const s=storage();assert.throws(()=>beginPilot(s));assert.equal(readPilot(s),null);const r=beginPilot(s,{adult:true,consent:true,kind:'automated',experience:'none',now:1000});assert.equal(r.human_origin_verified,false);assert.throws(()=>beginPilot(s,{adult:true,consent:true}));
 recordPilotEvent(s,'recorded-result-opened','reuse',1500);for(const task of PILOT_TASKS)answerPilot(s,task.id,task.answer,2000);finishPilot(s,'completed');const summary=pilotSummary(readPilot(s));assert.equal(summary.correct,5);assert.equal(summary.human_identities_verified,0);assert.equal(summary.fresh_result_received,false);erasePilot(s);assert.equal(readPilot(s),null);
});
test('study rejects invented identities, duplicate answers, raw/private fields and malformed events',()=>{
 const s=storage();const r=beginPilot(s,{adult:true,consent:true});answerPilot(s,'meaning',0);assert.throws(()=>answerPilot(s,'meaning',0));
 for(const mutate of [x=>x.human_origin_verified=true,x=>x.email='private@example.test',x=>x.events=[{event:'claim-chosen',case_id:'private context',elapsed_ms:1}],x=>x.answers=[{task:'meaning',choice:true,elapsed_ms:1}],x=>x.events=[{event:'report-exported',case_id:null,elapsed_ms:86400001}]]){const x=structuredClone(r);mutate(x);assert.throws(()=>validatePilot(x));}
 assert.throws(()=>beginPilot(null,{adult:true,consent:true}),/storage/);
});
