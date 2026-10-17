import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {rational,validateView,inspectCase} from '../public/calibration-core.mjs';
const base=new URL('../public/calibration-v1/',import.meta.url);
const read=n=>fs.readFileSync(new URL(n,base));
const view=JSON.parse(read('view.json'));
test('retained public assets match their complete byte inventory and qualified archive',()=>{
  const manifest=JSON.parse(read('SHA256.json'));
  assert.equal(manifest.format,'pcs-calibration-public-assets-v1');
  assert.deepEqual(fs.readdirSync(base).sort(),[...Object.keys(manifest.files),'SHA256.json'].sort());
  for(const[n,h]of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(read(n)).digest('hex'),h,n);
  assert.equal(manifest.files['protected-ci-calibration.zip'],'4b53e9a38d283da4e60577b031ceb9ebfd5b6b844308b0956696eb80aa965924');
  const ui=fs.readFileSync(new URL('../public/calibration-lab.mjs',import.meta.url),'utf8');
  assert.ok(ui.includes(manifest.files['view.json']));
});
test('all 22 cases and exact pooled scores reproduce with no authority promotion',()=>{
  assert.equal(validateView(structuredClone(view)).cases.length,22);
  for(const c of view.cases)for(const degree of [1,2,3]){
    const r=inspectCase(c,degree,7);
    assert.equal(r.joint_model_budget_excluded,true);assert.equal(r.kernel_executed,false);
    assert.equal(r.scientific_acceptance,false);assert.equal(r.pcs_authority,false);
    assert.equal(r.observations.length,14);assert.equal(r.predictions.length,8);
  }
  const r=inspectCase(view.cases[0],3,7);
  assert.equal(r.least_squares_radius,'893/2240');assert.equal(r.minimax_radius,'611/1600');
});
test('zero and intermediate error scenarios retain exact sharp radii',()=>{
  const r=inspectCase(view.cases[0],1,7,'0');
  assert.equal(r.minimax_radius,'0');assert.equal(r.least_squares_radius,'0');
  assert.equal(inspectCase(view.cases[0],1,7,'1/1000').minimax_radius,'13/6000');
});
test('altered coefficients, SSE, duals, gains, splits and query grids reject',()=>{
  for(const mutate of [
    c=>{c.models[0].coefficients[0]='0';},c=>{c.models[0].sse='0';},
    c=>{c.models[0].queries[0].gain='0';},c=>{c.models[0].queries[0].dual[0]='0';},
    c=>{c.models[0].queries[0].minimax.gain='0';},c=>{c.models[0].queries[0].minimax.dual[0]='0';},
    c=>{c.models[0].data[0][1]='0';},c=>{c.models[0].query_x[0]='7';},
    c=>{c.models[0].queries[0].minimax.weights.pop();},c=>{c.models[0].degree=2;},
  ]){const c=structuredClone(view.cases[0]);mutate(c);assert.throws(()=>inspectCase(c));}
});
test('empirical or kernel relabeling, hidden duplicate curves and pooled-score substitution reject',()=>{
  for(const mutate of [
    v=>{v.scientific_acceptance=true;},v=>{v.pcs_authority=true;},
    v=>{v.recorded_result_not_live_verification=false;},v=>{v.distinct_response_curves=22;},
    v=>{v.minimax_pooled_heldout_sse['3']='0';},v=>{v.cases.reverse();},
  ]){const v=structuredClone(view);mutate(v);assert.throws(()=>validateView(v));}
});
test('unsupported selections and noncanonical bounded rationals fail closed',()=>{
  for(const bad of ['NaN','1/0','01','-0','2/4','0/2','1/1','1e9','1\n','1'.repeat(161),true,1])assert.throws(()=>rational(bad));
  for(const [degree,query,epsilon]of [[4,0,'0'],[3,8,'0'],[3,.5,'0'],[3,0,'-1'],[3,0,'1']])assert.throws(()=>inspectCase(view.cases[0],degree,query,epsilon));
});
