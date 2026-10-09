import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLiveChecks} from '../scripts/verify_live_release_checks.mjs';
const sha='a'.repeat(40),repository='Example/PCS';
const ok=()=>({check_runs:['site-check','site-contract','countermodel-lean-kernel'].map(name=>({
 name,head_sha:sha,status:'completed',conclusion:'success'
}))});
const fetcher=data=>async(url,options)=>{assert.match(url,/\/commits\/a{40}\/check-runs/);
 assert.match(options.headers.Authorization,/^Bearer /);return {ok:true,status:200,json:async()=>data};};
test('authenticated successful exact-source checks release policy',async()=>{
 const result=await verifyLiveChecks({repository,sha,token:'fixture-only',request:fetcher(ok())});
 assert.equal(result.source,'GITHUB_AUTHENTICATED_CHECK_RUNS_API');
 assert.equal(result.policy_met,true);
});
for(const verdict of ['skipped','neutral','failure']){
 test('authenticated '+verdict+' never passes',async()=>{
  const source=ok();source.check_runs[1].conclusion=verdict;
  await assert.rejects(verifyLiveChecks({repository,sha,token:'fixture',request:fetcher(source)}),/not a completed PASS/);
 });
}
test('wrong SHA, missing token, API errors and missing results reject',async()=>{
 await assert.rejects(verifyLiveChecks({repository,sha,token:'',request:fetcher(ok())}),/required/);
 const wrong=ok();wrong.check_runs[0].head_sha='b'.repeat(40);
 await assert.rejects(verifyLiveChecks({repository,sha,token:'fixture',request:fetcher(wrong)}),/another commit/);
 await assert.rejects(verifyLiveChecks({repository,sha,token:'fixture',request:async()=>({ok:false,status:403})}),/unavailable/);
 await assert.rejects(verifyLiveChecks({repository,sha,token:'fixture',request:fetcher({check_runs:[]})}),/missing/);
});
