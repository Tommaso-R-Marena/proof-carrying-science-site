// Actual workerd SQLite. No provider calls or production quota changes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {admitLeanProof,LeanAdmissionError} from '../src/lean-admission.js';
const NOW=1760000000000;
async function fixture(fn){
 const mf=new Miniflare(convertV4MiniflareOptions({telemetry:{enabled:false},workers:[{name:'atomic-admission-db',compatibilityDate:'2026-09-28',modules:true,script:'export default {fetch(){return new Response("fixture");}}',d1Databases:{COMMONS_DB:'atomic-admission-db'}}]}));
 try{
  const db=await mf.getD1Database('COMMONS_DB');await db.exec('CREATE TABLE rate_limits(key TEXT PRIMARY KEY,window_start TEXT NOT NULL,count INTEGER NOT NULL)');
  const env={COMMONS_DB:db,RATE_LIMIT_SALT:'test-only-atomic-admission-salt'};
  const key=async(scope,ip)=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${env.RATE_LIMIT_SALT}:${scope}:${ip}`))).toString('base64url');
  const globalKey=await key('public-lean-global','PCS_PUBLIC_LEAN_GLOBAL');
  const seed=async(k,count,time=NOW)=>db.prepare('INSERT OR REPLACE INTO rate_limits(key,window_start,count) VALUES(?,?,?)').bind(k,new Date(time).toISOString(),count).run();
  const snapshot=async()=> (await db.prepare('SELECT key,window_start,count FROM rate_limits ORDER BY key').all()).results;
  await fn({env,db,key,globalKey,seed,snapshot});
 }finally{await mf.dispose();}
}
test('empty quota creates both keys and the final available slots change atomically',async()=>fixture(async({env,key,globalKey,seed,snapshot})=>{
 const ip='192.0.2.1',ipKey=await key('public-lean-submit',ip);
 assert.equal((await admitLeanProof(env,ip,{now:NOW})).admitted,true);assert.deepEqual((await snapshot()).map(r=>r.count),[1,1]);
 await seed(ipKey,1);await seed(globalKey,11);
 await admitLeanProof(env,ip,{now:NOW});const rows=await snapshot();assert.equal(rows.find(r=>r.key===ipKey).count,2);assert.equal(rows.find(r=>r.key===globalKey).count,12);
 const before=await snapshot();await assert.rejects(admitLeanProof(env,ip,{now:NOW}),error=>error instanceof LeanAdmissionError&&error.status===429);assert.deepEqual(await snapshot(),before);
}));
test('exhausted global or client quota never charges, creates, or resets the other counter',async()=>fixture(async({env,key,globalKey,seed,snapshot})=>{
 const ip='192.0.2.2',ipKey=await key('public-lean-submit',ip);
 await seed(globalKey,12);let before=await snapshot();await assert.rejects(admitLeanProof(env,ip,{now:NOW}),/Too many/);assert.deepEqual(await snapshot(),before);
 await seed(ipKey,1,NOW-86400001);before=await snapshot();await assert.rejects(admitLeanProof(env,ip,{now:NOW}),/Too many/);assert.deepEqual(await snapshot(),before);
 await seed(globalKey,5);await seed(ipKey,2);before=await snapshot();await assert.rejects(admitLeanProof(env,ip,{now:NOW}),/Too many/);assert.deepEqual(await snapshot(),before);
}));
test('sixty concurrent distinct clients admit exactly twelve without partial client charges',async()=>fixture(async({env,globalKey,snapshot})=>{
 const results=await Promise.allSettled(Array.from({length:60},(_,i)=>admitLeanProof(env,'198.51.100.'+i,{now:NOW})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,12);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===429).length,48);
 const rows=await snapshot();assert.equal(rows.length,13);assert.equal(rows.find(r=>r.key===globalKey).count,12);assert.ok(rows.filter(r=>r.key!==globalKey).every(r=>r.count===1));
}));
test('twenty concurrent same-client admissions consume exactly two global and client slots',async()=>fixture(async({env,key,globalKey,snapshot})=>{
 const ip='203.0.113.1',ipKey=await key('public-lean-submit',ip);
 const results=await Promise.allSettled(Array.from({length:20},()=>admitLeanProof(env,ip,{now:NOW})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2);const rows=await snapshot();assert.equal(rows.length,2);assert.equal(rows.find(r=>r.key===globalKey).count,2);assert.equal(rows.find(r=>r.key===ipKey).count,2);
}));
test('window reset preserves the existing strict cutoff and resets both only upon admission',async()=>fixture(async({env,key,globalKey,seed,snapshot})=>{
 const ip='203.0.113.2',ipKey=await key('public-lean-submit',ip);
 await seed(ipKey,2,NOW-86400000);await seed(globalKey,12,NOW-86400000);const atCutoff=await snapshot();
 await assert.rejects(admitLeanProof(env,ip,{now:NOW}),/Too many/);assert.deepEqual(await snapshot(),atCutoff);
 await admitLeanProof(env,ip,{now:NOW+1});const rows=await snapshot();assert.ok(rows.every(r=>r.count===1&&r.window_start===new Date(NOW+1).toISOString()));
}));
test('admission SQL failure never falls back to separate or speculative quota changes',async()=>{
 let calls=0;
 const env={RATE_LIMIT_SALT:'test-only-error-salt',COMMONS_DB:{prepare(){calls++;return {bind(){return {all:async()=>{throw Error('fixture SQLite failure');}};}};}}};
 await assert.rejects(admitLeanProof(env,'fixture-client',{now:NOW}),/SQLite failure/);assert.equal(calls,1);
});
test('a malformed existing counter fails closed without charging the other key',async()=>fixture(async({env,key,globalKey,seed,snapshot})=>{
 const ip='203.0.113.3',ipKey=await key('public-lean-submit',ip);
 for(const badKey of [ipKey,globalKey]){
  await seed(ipKey,0);await seed(globalKey,0);await seed(badKey,-1);
  const before=await snapshot();await assert.rejects(admitLeanProof(env,ip,{now:NOW}),/Too many/);assert.deepEqual(await snapshot(),before);
 }
}));
