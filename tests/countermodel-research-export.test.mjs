import test from 'node:test';import assert from 'node:assert/strict';
import {collectCountermodelExport} from '../public/countermodel-research-export.mjs';
import {COUNTERMODEL_VERSION,replayCountermodelSession} from '../public/countermodel-core.mjs';
const session={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions:[{type:'toggle',p:'P',i:0},{type:'check'}]};
const entry={session,replay:replayCountermodelSession(session)};
const page=(n,next)=>({format:'pcs-countermodel-adult-optin-dataset-v1',entries:Array(n).fill(entry),next_offset:next,privacy:'no account identifiers'});
test('collects and replays complete bounded pages; pagination metadata excluded from export',async()=>{
 const seen=[];const out=await collectCountermodelExport(async offset=>{seen.push(offset);return offset===0?page(20,20):page(1,null);});
 assert.deepEqual(seen,[0,20]);assert.equal(out.entries.length,21);assert.equal(out.next_offset,undefined);
});
test('fails on forged scores, personal identifiers, incomplete and nonmonotonic pagination',async()=>{
 for(const corrupt of [p=>p.entries[0]={...entry,email:'private'},p=>{p.entries[0].replay.score=999;},p=>p.next_offset=0,p=>p.next_offset=40]){
  const p=structuredClone(page(20,20));corrupt(p);await assert.rejects(collectCountermodelExport(async()=>p));
 }
 await assert.rejects(collectCountermodelExport(async()=>page(1,20)),/pagination/);
 await assert.rejects(collectCountermodelExport(async offset=>page(20,offset+20),{maxEntries:20}),/bounded preparation/);
});
