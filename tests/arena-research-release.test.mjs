import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArenaRelease} from '../scripts/assemble_arena_research_release.mjs';

test('reject unsupported and identity-bearing exports',()=>{
 assert.throws(()=>buildArenaRelease({}),/At least one/);
 assert.throws(()=>buildArenaRelease({unknown:{}}),/Unknown/);
 assert.throws(()=>buildArenaRelease({proof_quest:{format:'pcs-proof-order-optin-research-dataset-v1',
  examples:[{email:'private@example.org'}]}),/personal identifiers|recomputed|Unknown|Unexpected/);
});
test('empty explicitly consented owner export results never invented participants',()=>{
 const a=buildArenaRelease({countermodel:{format:'pcs-countermodel-adult-optin-dataset-v1',entries:[]},
   proof_quest:{format:'pcs-proof-order-optin-research-dataset-v1',examples:[]}});
 assert.equal(a.manifest.authority,'NONE');
 assert.equal(a.manifest.artifacts.length,2);
 assert.ok(a.manifest.artifacts.every(x=>x.records===0));
 assert.ok(a.manifest.artifacts.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)));
 for(const item of a.manifest.artifacts){
  const exact=JSON.stringify(a.datasets[item.game],null,2)+'\n';
  assert.equal(createHash('sha256').update(exact).digest('hex'),item.sha256);
 }
 assert.equal(a.manifest.privacy_status,'AUTOMATED_SCREENING_ONLY_MANUAL_PRIVACY_REVIEW_REQUIRED');
 assert.equal(JSON.stringify(a.datasets).includes('user_id'),false);
 assert.deepEqual(a.manifest,buildArenaRelease({countermodel:{format:'pcs-countermodel-adult-optin-dataset-v1',entries:[]},
   proof_quest:{format:'pcs-proof-order-optin-research-dataset-v1',examples:[]}}).manifest);
});
