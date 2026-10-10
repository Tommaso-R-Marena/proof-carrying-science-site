// Actual workerd fetch behavior; provider replies are explicit transport fixtures.
// No external requests, production credentials or real proof jobs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {CORE_SHA} from '../src/lean-research.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const body={statement:'For all propositions U and V, if (U and V) then (U and (U and V)).',interpretation:null,public_consent:true,license:'CC0-1.0'};
const repository={private:false,full_name:'Tommaso-R-Marena/proof-carrying-science'};
const receipt=JSON.parse(readFileSync(new URL('./fixtures/lean-proof-receipt-v1.json',import.meta.url)));
const entry=`import {dispatch,poll} from '../src/lean-research.js';
export default {async fetch(){
 const env={PCS_LEAN_GITHUB_TOKEN:'test-only-edge-token',RATE_LIMIT_SALT:'test-only-edge-salt'};
 try {const queued=await dispatch(env,${JSON.stringify(body)});return Response.json(await poll(env,queued.ticket));}
 catch(error){return Response.json({error:error.message},{status:422});}
}};`;

async function runtime(secondRedirect){
 let requestId;const calls=[];
 const provider=async request=>{
  const url=new URL(request.url);calls.push({url:request.url,authorization:request.headers.get('authorization')});
  const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
  if(url.hostname==='api.github.com'){
   assert.equal(request.headers.get('authorization'),'Bearer test-only-edge-token');
   const path=url.pathname;
   if(path.endsWith('/proof-carrying-science'))return json(repository);
   if(path.endsWith('/commits/main'))return json({sha:CORE_SHA});
   if(path.endsWith('/dispatches')){requestId=(await request.json()).inputs.request_id;return new Response(null,{status:204});}
   if(path.endsWith('/pcs-lean-public.yml/runs'))return json({workflow_runs:[{id:123,display_title:'PCS public Lean '+requestId,head_sha:CORE_SHA,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/pcs-lean-public.yml',repository,status:'completed',conclusion:'success'}]});
   if(path.endsWith('/123/jobs'))return json({jobs:[{id:456,name:'public-lean',conclusion:'success'}]});
   if(path.endsWith('/456/logs'))return new Response(null,{status:302,headers:{location:'https://test.blob.core.windows.net/proof/log'}});
  }
  if(request.url==='https://test.blob.core.windows.net/proof/log'){
   assert.equal(request.headers.get('authorization'),null);
   if(secondRedirect)return new Response(null,{status:302,headers:{location:'https://evil.example/leak'}});
   const record={format:'pcs-public-lean-result-v1',request_id:requestId,core_sha:CORE_SHA,source_sha256:createHash('sha256').update(JSON.stringify(body.statement)).digest('hex'),result:{status:'verified',pcs_authority:false,search:{receipt}},baseline:{status:'unknown',pcs_authority:false}};
   return new Response('PCS_LEAN_RESULT_V1:'+Buffer.from(JSON.stringify(record)).toString('base64')+'\n');
  }
  throw Error('Unexpected outgoing runtime request: '+request.url);
 };
 const mf=new Miniflare(convertV4MiniflareOptions({telemetry:{enabled:false},workers:[{name:'lean-redirect-runtime',compatibilityDate:'2026-09-28',modules:[
  {type:'ESModule',path:resolve(root,'tests/lean-runtime-entry.mjs'),contents:entry},
  {type:'ESModule',path:resolve(root,'src/lean-research.js'),contents:readFileSync(resolve(root,'src/lean-research.js'),'utf8')},
 ],outboundService:provider}]}));
 try {const response=await mf.dispatchFetch('https://runtime.example/test');return {status:response.status,body:await response.json(),calls};}
 finally {await mf.dispose();}
}

test('actual Workers runtime retrieves bound proof logs with supported fetch options',{timeout:30000},async()=>{
 const result=await runtime(false);assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.status,'completed');assert.equal(result.body.pcs_authority,false);assert.equal(result.calls.length,7);
});
test('actual Workers runtime rejects a second redirect without following or leaking credentials',{timeout:30000},async()=>{
 const result=await runtime(true);assert.equal(result.status,422);assert.match(result.body.error,/Checker log download failed/);assert.equal(result.calls.length,7);assert.ok(result.calls.every(c=>!c.url.includes('evil.example')));
});
