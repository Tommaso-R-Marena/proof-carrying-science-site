import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const run=(...args)=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/train_semantic_repair_policy.mjs',import.meta.url)),...args],{encoding:'utf8',timeout:45000});
test('CLI real train/verify/evaluate/propose/recheck exact-source workflow',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pcs-model-foundry-'));
 try{
  const model=join(dir,'model.json'),evalFile=join(dir,'eval.json'),proposal=join(dir,'proposal.json'),receipt=join(dir,'receipt.json');
  assert.equal(run('train',model).status,0);
  assert.equal(run('verify',model).status,0);
  assert.equal(run('evaluate',model,evalFile).status,0);
  const evalReport=JSON.parse(readFileSync(evalFile,'utf8'));
  assert.equal(evalReport.authority,'NONE_FINITELY_REPLAYED_RESULTS_ONLY');
  assert.equal(evalReport.results.learned.solved,9);
  assert.equal(run('propose',model,'implication-reversal-1',proposal).status,0);
  assert.equal(run('recheck',model,proposal,receipt).status,0);
  assert.equal(JSON.parse(readFileSync(receipt)).result,'EXACT_FINITE_REPLAY_MATCH');
  assert.notEqual(run('evaluate',model,evalFile).status,0,'output overwrite rejected');
  const bad=JSON.parse(readFileSync(proposal));bad.status='BOUNDED_REPAIR_FOUND_BUT_FORGED';
  writeFileSync(proposal,JSON.stringify(bad));
  const r=run('recheck',model,proposal,join(dir,'bad.json'));
  assert.equal(r.status,2);assert.match(r.stderr,/TAMPERED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
