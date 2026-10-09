import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync as read} from 'node:fs';
const script=fileURLToPath(new URL('../scripts/benchmark_multistep_repair.mjs',import.meta.url));
const model=fileURLToPath(new URL('../public/repair-policy-model-v1.json',import.meta.url));
const invoke=(...a)=>spawnSync(process.execPath,[script,...a],{encoding:'utf8',timeout:60000});
test('CLI creates source-verified public challenges and replays an exact benchmark report',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pcs-multi-'));
 try{
  const challenges=join(dir,'challenges.json'),report=join(dir,'result.json');
  let r=invoke('challenges',model,challenges);assert.equal(r.status,0,r.stderr);
  let pack=JSON.parse(readFileSync(challenges));assert.equal(pack.examples.length,18);
  r=invoke('evaluate',model,report);assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(readFileSync(report)).metrics.learned.solved,18);
  r=invoke('verify',model,report);assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/"replay":"MATCHED"/);
  let altered=JSON.parse(readFileSync(report));altered.metrics.original.checker_calls=0;
  writeFileSync(report,JSON.stringify(altered));
  r=invoke('verify',model,report);assert.equal(r.status,2);
  assert.match(r.stderr,/FORGERY/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('duplicate JSON keys, forged models and refusing output overwrite all fail closed',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pcs-multi-'));
 try{
  const bad=join(dir,'bad.json'),out=join(dir,'out.json');
  writeFileSync(bad,'{"format":"fake","format":"fake"}');
  let r=invoke('evaluate',bad,out);assert.equal(r.status,2);
  assert.match(r.stderr,/duplicate/i);
  const poisoned=JSON.parse(read(model));poisoned.weights[0]++;
  writeFileSync(bad,JSON.stringify(poisoned));
  r=invoke('evaluate',bad,out);assert.equal(r.status,2);
  assert.match(r.stderr,/MODEL_INTEGRITY/);
  writeFileSync(out,'already here');
  r=invoke('challenges',model,out);assert.equal(r.status,2);
  assert.equal(readFileSync(out,'utf8'),'already here');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
