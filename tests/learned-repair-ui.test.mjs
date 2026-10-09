import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('public experience has accessible model controls and explicit finite-only trust boundary',()=>{
 const html=read('public/repair-model-lab.html'),js=read('public/repair-model-lab.js');
 for(const token of ['pmSplit','pmCase','pmRun','pmOriginal','pmExport','pmAttempts','pmStatus']){
  assert.match(html,new RegExp('id="'+token+'"'));assert.match(js,new RegExp(token));
 }
 assert.match(html,/not a secret or independently blind benchmark/);
 assert.match(html,/No account is needed/);
 assert.match(js,/finiteRepairCheck/);
 assert.match(js,/pcs_scientific_authority:false/);
 assert.doesNotMatch(js,/\/api\/|fetch\(\s*['"]\/api/);
 const model=JSON.parse(read('public/repair-policy-model-v1.json'));
 assert.equal(model.provenance.human_examples,0);
 assert.equal(model.provenance.evaluation_labels_used_for_training,false);
});
