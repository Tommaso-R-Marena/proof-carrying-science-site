import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PendingLeanJob} from '../public/lean-job-client.mjs';
const body={statement:'For all propositions P, P implies P.',interpretation:null,license:'CC0-1.0',public_consent:true};
function storage(){const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
test('a tab reload preserves the same consented body and idempotency key',()=>{
 const s=storage(),first=new PendingLeanJob(s),a=first.begin(body,123);
 assert.equal(new PendingLeanJob(s).begin(body,456).key,a.key);
 assert.throws(()=>first.begin({...body,interpretation:1}),/different request/);
});
test('only validated acknowledgements bind a ticket and forgetting removes it',()=>{
 const j=new PendingLeanJob(storage());j.begin(body);
 assert.throws(()=>j.bind({ticket:'bad',request_id:'not-id',core_sha:'bad'}),/Invalid/);
 j.bind({ticket:'test-only-ticket',request_id:'a'.repeat(32),core_sha:'b'.repeat(40)});
 assert.equal(j.read().request.request_id,'a'.repeat(32));j.clear();assert.equal(j.read(),null);
});
test('unavailable storage is disclosed while current-tab retry remains coherent',()=>{
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
 const j=new PendingLeanJob(denied),a=j.begin(body);assert.equal(j.persistent,false);assert.equal(j.begin(body).key,a.key);
});
