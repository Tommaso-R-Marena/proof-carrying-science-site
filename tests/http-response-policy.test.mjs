import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');

// Execute the exact isolated response helper source, avoiding an imported
// Worker module with side-effectful research and API dependencies.
const start=worker.indexOf('function json(data, status = 200, extraHeaders = {}) {');
const end=worker.indexOf('\nfunction nowIso()',start);
assert(start>=0&&end>start,'Worker JSON helper must remain unambiguous');
const handler=new Function('Response',worker.slice(start,end)+'\nreturn json;')(Response);

test('generated API JSON is no-store and protected against MIME sniffing/referrer leakage',async()=>{
  const reply=handler({ok:true,status:'ready'});
  assert.equal(reply.status,200);
  assert.equal(reply.headers.get('content-type'),'application/json; charset=utf-8');
  assert.equal(reply.headers.get('cache-control'),'no-store');
  assert.equal(reply.headers.get('x-content-type-options'),'nosniff');
  assert.equal(reply.headers.get('referrer-policy'),'no-referrer');
  assert.deepEqual(await reply.json(),{ok:true,status:'ready'});
});

test('API errors retain the security headers and do not use browser caching',async()=>{
  const r=handler({ok:false,error:'not_found'},404);
  assert.equal(r.status,404);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});

test('static policy retains the preexisting default security and protected account privacy',()=>{
  assert.match(headers,/Content-Security-Policy: default-src 'self'/);
  assert.match(headers,/X-Frame-Options: DENY/);
  assert.match(headers,/X-Content-Type-Options: nosniff/);
  assert.match(headers,/\/admin\.html\s+Cache-Control: no-store/);
  assert.match(headers,/\/account\.html\s+Cache-Control: no-store/);
});

test('only CSS and SVG receive new positive browser TTLs',()=>{
  assert.match(headers,/\/\*\.css\s+Cache-Control: public, max-age=60, stale-while-revalidate=120/);
  assert.match(headers,/\/\*\.svg\s+Cache-Control: public, max-age=300, stale-while-revalidate=600/);
  assert.doesNotMatch(headers,/\/\*\.(?:js|mjs|json|html|lean|pcs\.zip)\s+Cache-Control: public, max-age=[1-9]/);
});
