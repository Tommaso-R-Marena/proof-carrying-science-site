import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parseMeasurements,filteredPoints,exploratoryFit,checkRecordedCase,checkNegativeCases} from '../public/scientific-workflow-v2-core.mjs';

const base=new URL('../public/reasoning/scientific-workflow-v2/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,base));
const dataset=parseMeasurements(read('penguins.csv').toString());
const receipt=JSON.parse(read('recorded-receipt.json'));
const manifest=JSON.parse(read('SHA256.json'));

test('exact real dataset and every public artifact match preserved digests',()=>{
  for(const [name,sha] of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(read(name)).digest('hex'),sha,name);
  assert.equal(dataset.total,344);assert.equal(dataset.points.length,342);assert.deepEqual(dataset.excluded,[4,272]);
  assert.equal(manifest.files['penguins.csv'],'f204db2c753b0937caac3cb35258562c14f073e4bbc76be24b4c51ce22767a93');
  assert.equal(checkRecordedCase(receipt,dataset,manifest.files['penguins.csv']),true);
  const browser=JSON.parse(read('browser-validation.json'));
  for(const [name,sha] of Object.entries(browser.source_sha256)){
    const actual=fs.readFileSync(new URL(name.startsWith('scripts/')?'../'+name:'../public/'+name,import.meta.url));
    assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),sha,'Executed browser source '+name);
  }
});
test('real species subsets account for every complete observation',()=>{
  assert.equal(filteredPoints(dataset.points,'Adelie').length,151);
  assert.equal(filteredPoints(dataset.points,'Chinstrap').length,68);
  assert.equal(filteredPoints(dataset.points,'Gentoo').length,123);
  assert.throws(()=>filteredPoints(dataset.points,'unknown'));
});
test('browser estimates actually calculate the finite observations without authority',()=>{
  const fit=exploratoryFit(dataset.points);
  assert.ok(Math.abs(fit.slope-1145743050/23059877)<1e-10);
  assert.ok(Math.abs(fit.intercept/1000-(-5332210403/922395080))<1e-10);
  assert.equal(fit.verified,false);assert.ok(fit.r2>0&&fit.r2<1);
  assert.notEqual(exploratoryFit(filteredPoints(dataset.points,'Adelie')).slope,fit.slope);
  assert.equal(exploratoryFit([{flipper:1,mass:2},{flipper:1,mass:3}]),null);
});
test('recorded authority cannot silently become browser or scientific verification',()=>{
  for(const update of [{scientific_acceptance:true},{independent_human_review:true},{kernel_refinement_of_numerical_adapter:true},
    {recorded_result_not_live_verification:false},{bounded_contract_satisfied:false}]){
    assert.throws(()=>checkRecordedCase({...receipt,...update},dataset,manifest.files['penguins.csv']));
  }
  assert.throws(()=>checkRecordedCase(receipt,dataset,'0'.repeat(64)));
  const modified=structuredClone(receipt);modified.claims[0].decision='FALSIFIED_OR_CHECK_FAILED';
  assert.throws(()=>checkRecordedCase(modified,dataset,manifest.files['penguins.csv']));
});
test('actual archived negative controls preserve failure despite valid signatures',()=>{
  const controls=JSON.parse(read('recorded-negative-controls.json'));
  assert.equal(checkNegativeCases(controls),true);
  assert.throws(()=>checkNegativeCases({}));
  const fabricated=structuredClone(controls);fabricated['falsified-dimension'].claims[0].decision='COMPUTATIONALLY_SUPPORTED';
  assert.throws(()=>checkNegativeCases(fabricated));
  for(const control of Object.values(controls)){
    assert.equal(control.pcs_package_valid,true);assert.equal(control.bounded_contract_satisfied,false);
    assert.equal(control.recorded_result_not_live_verification,true);assert.equal(control.scientific_acceptance,false);
  }
  assert.equal(controls['wrong-slope'].independent_replay_consistent,true);
  assert.equal(controls['signed-false-report'].independent_replay_consistent,false);
  assert.equal(controls['falsified-dimension'].claims.find(c=>c.claim_id==='C_slope_dimensions').decision,'FALSIFIED_OR_CHECK_FAILED');
});
test('malformed browser input fails instead of silently dropping invalid rows',()=>{
  const original=read('penguins.csv').toString();
  assert.throws(()=>parseMeasurements(original.replace(',181,3750,',',nan,3750,')));
  assert.throws(()=>parseMeasurements(original.replace(',181,3750,',',-181,3750,')));
  assert.throws(()=>parseMeasurements(original.replace('body_mass_g','flipper_length_mm')));
});
test('published text/source contains no private keys, temporary paths, or data donation mechanism',()=>{
  for(const name of Object.keys(manifest.files).filter(name=>!name.endsWith('.zip'))){
    const raw=read(name).toString();assert.doesNotMatch(raw,/-----BEGIN (?:ENCRYPTED )?PRIVATE KEY-----/);assert.doesNotMatch(raw,/\/tmp\/|\/workspace\//);
  }
  const code=fs.readFileSync(new URL('../public/scientific-workflow-v2.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/localStorage|sessionStorage|document\.cookie|\/api\/|method:\s*['"]POST/);
});
