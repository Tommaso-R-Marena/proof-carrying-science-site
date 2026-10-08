import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Arena surface has an accessible honest checker scope and exportable local notebook',()=>{
 const html=load('public/semantic-multistep-lab.html');
 const js=load('public/semantic-multistep-lab.js');
 const css=load('public/semantic-multistep-lab.css');
 for(const id of ['msTask','msMode','msBudget','msBeam','msRun','msSave','msStatus','msRepair','msAttempts'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/never itself a proof/i);assert.match(html,/source itself is available/i);
 assert.match(html,/aria-live="polite"/);
 assert.match(js,/replayBestFirstRepair/);assert.match(js,/URL.createObjectURL/);
 assert.match(js,/textContent/);assert.doesNotMatch(js,/innerHTML\s*=/);
 assert.match(js,/pcs-browser-untrusted-multistep-research-record-v1/);
 assert.match(css,/@media\(max-width:780px\)/);
});
test('public two-step challenges are exact source-derived and not leaked participant data',()=>{
 const data=JSON.parse(load('public/multistep-challenges-v1.json'));
 assert.equal(data.examples.length,18);
 assert.equal(data.all_public,true);assert.equal(data.blind_evaluation,false);
 assert.ok(data.examples.every(x=>x.split==='evaluation'));
 assert.ok(data.examples.every(x=>/^[0-9a-f]{64}$/.test(x.candidate_sha256)));
 assert.doesNotMatch(JSON.stringify(data),/user_id|private@example.com|personal_email|human_traces/);
});
