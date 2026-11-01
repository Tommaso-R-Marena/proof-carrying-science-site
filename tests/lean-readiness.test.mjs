import test from 'node:test';
import assert from 'node:assert/strict';
import {leanReadiness} from '../src/lean-readiness.js';
import {CORE_SHA} from '../src/lean-research.js';

test('configuration alone cannot enable a stale or disabled public model executor',async()=>{
  for(const fault of ['revision','workflow','redirect','exception']){
    const transport=async url=>{
      if(fault==='exception')throw Error('private diagnostic');
      if(fault==='redirect')return new Response(null,{status:302});
      const data=url.endsWith('/git/ref/heads/main')?{object:{sha:fault==='revision'?'0'.repeat(40):CORE_SHA}}:
        url.endsWith('.yml')?{state:'disabled_manually',path:'.github/workflows/pcs-lean-public.yml'}:
        {private:false,full_name:'Tommaso-R-Marena/proof-carrying-science',default_branch:'main'};
      return Response.json(data);
    };
    const r=await leanReadiness({PCS_LEAN_GITHUB_TOKEN:'fixture'},{transport,now:100000});
    assert.equal(r.status,'unavailable');assert.equal(r.pcs_authority,false);
    assert.doesNotMatch(JSON.stringify(r),/private diagnostic|fixture/);
  }
});

test('parallel readiness observations coalesce, expire, and isolate credentials',async()=>{
  let calls=0, sha=CORE_SHA;
  const transport=async url=>{calls++;return Response.json(url.endsWith('/git/ref/heads/main')?{object:{sha}}:url.endsWith('.yml')?
    {state:'active',path:'.github/workflows/pcs-lean-public.yml'}:
    {private:false,full_name:'Tommaso-R-Marena/proof-carrying-science',default_branch:'main'});};
  const env={PCS_LEAN_GITHUB_TOKEN:'fixture'};
  const results=await Promise.all(Array.from({length:16},()=>leanReadiness(env,{transport,now:100000})));
  assert.ok(results.every(r=>r.readiness==='ready'));assert.equal(calls,3);
  sha='0'.repeat(40);
  assert.equal((await leanReadiness(env,{transport,now:129999})).readiness,'ready');assert.equal(calls,3);
  assert.equal((await leanReadiness(env,{transport,now:130000})).status,'unavailable');assert.equal(calls,5);
  assert.equal((await leanReadiness({PCS_LEAN_GITHUB_TOKEN:'other'},{transport,now:100000})).status,'unavailable');assert.equal(calls,7);
  assert.equal((await leanReadiness({},{transport})).reason,'not_configured');assert.equal(calls,7);
});
