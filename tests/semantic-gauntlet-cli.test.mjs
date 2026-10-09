import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GAUNTLET_TASKS} from '../public/semantic-gauntlet-core.mjs';
import {generateBaseline} from '../scripts/semantic_gauntlet_benchmark.mjs';
const script=fileURLToPath(new URL('../scripts/semantic_gauntlet_benchmark.mjs',import.meta.url));
const command=(...args)=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:30000});
test('CLI generates exact task manifest, accepts JSON and JSONL and scores checked witnesses',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pcs-gauntlet-'));
 try{
  const tasks=join(dir,'tasks.json'),pred=join(dir,'pred.json'),results=join(dir,'results.json'),base=join(dir,'base.json');
  assert.equal(command('generate',tasks).status,0);
  assert.equal(command('baselines',base).status,0);
  const manifest=JSON.parse(readFileSync(tasks));assert.equal(manifest.tasks.length,GAUNTLET_TASKS.length);
  assert.equal(manifest.benchmark_visibility,'PUBLIC_NOT_BLIND');
  writeFileSync(pred,JSON.stringify(generateBaseline('finite_oracle')));
  const r=command('evaluate',tasks,pred,results);assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(readFileSync(results));assert.equal(report.overall.accuracy_over_all,1);
  assert.equal(report.independent_lean_kernel,false);
  const jsonl=join(dir,'pred.jsonl');writeFileSync(jsonl,generateBaseline('finite_oracle').map(JSON.stringify).join('\n'));
  const second=join(dir,'second.json');assert.equal(command('evaluate',tasks,jsonl,second).status,0);
  assert.deepEqual(JSON.parse(readFileSync(second)),report);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI rejects forged task source and refuses output overwrite',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pcs-gauntlet-bad-'));
 try{
  const manifest=join(dir,'tasks.json'),out=join(dir,'result.json'),p=join(dir,'pred.json');
  assert.equal(command('generate',manifest).status,0);
  const contents=JSON.parse(readFileSync(manifest));contents.tasks[0].bound=200;
  writeFileSync(manifest,JSON.stringify(contents));writeFileSync(p,JSON.stringify(generateBaseline('abstain')));
  assert.equal(command('evaluate',manifest,p,out).status,2);
  assert.equal(command('baselines',out).status,0);
  assert.equal(command('baselines',out).status,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});