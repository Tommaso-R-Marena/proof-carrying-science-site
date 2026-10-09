import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
import {canonical,strictParse,check} from '../public/omega-core.mjs';
import {adaptiveSearch,replayAdaptive,validateNonlinear,nonlinearFeatures,predictNonlinear} from '../public/omega-adaptive.mjs';
const at=process.argv.indexOf('--core');if(at<0||!process.argv[at+1])throw Error('--core is required');
const core=path.resolve(process.argv[at+1]),model=await validateNonlinear(strictParse(fs.readFileSync(new URL('../public/omega/nonlinear-v2.json',import.meta.url),'utf8')));
const script=`import json,sys
sys.path.insert(0,sys.argv[1])
from pathlib import Path
from pcs.experimental.omega import adaptive
from pcs.experimental.omega.logic import actions
from pcs.experimental.omega.learning import source_digest
model=json.loads(sys.stdin.read())
assert model['training']['source_digest']==source_digest(), 'Checkpoint does not bind pinned trainer source'
corpus=json.loads((Path(sys.argv[1])/'research/omega-v2/20261009/corpus.json').read_text())
assert model['training']['task_digests']==[r['task_sha256'] for r in corpus['records'] if r['partition']=='train']
records=[r for r in corpus['records'] if r['id'].endswith(('-000','-001'))]
out=[]
for r in records:
 t=r['task']; aa=actions(t['candidate'],t['variables'])[:3]
 out.append({'task':t,'vectors':[adaptive.vector(t,a) for a in aa],
  'predictions':[adaptive.predict(adaptive.vector(t,a),model)[0] for a in aa],
  'episodes':[adaptive.search(t,checks=4,proposals=32,model=m) for m in (None,model)]})
print(json.dumps(out,allow_nan=False))
`;
const result=spawnSync(process.env.PYTHON||'python3',['-c',script,core],{input:JSON.stringify(model),encoding:'utf8',maxBuffer:64*1024*1024});if(result.status!==0)throw Error(result.stderr||'Independent Python failed');
let episodes=0,vectors=0;
for(const row of JSON.parse(result.stdout)){
 const aa=(await import('../public/omega-core.mjs')).actions(row.task.candidate,row.task.variables).slice(0,3);
 for(let i=0;i<aa.length;i++){const xs=nonlinearFeatures(row.task,aa[i]);assert.equal(xs.length,95);for(let j=0;j<xs.length;j++)assert.ok(Math.abs(xs[j]-row.vectors[i][j])<1e-12);assert.ok(Math.abs(predictNonlinear(xs,model)-row.predictions[i])<1e-10);vectors++;}
 for(let i=0;i<2;i++){const actual=await adaptiveSearch(row.task,{checks:4,proposals:32,model:i?model:null});await replayAdaptive(row.episodes[i]);assert.equal(canonical(actual),canonical(row.episodes[i]));if(actual.solution)assert.equal((await check({...row.task,candidate:actual.solution.candidate})).equivalent,true);episodes++;}
}
console.log(JSON.stringify({format:'pcs-adaptive-python-browser-parity-v2',tasks:JSON.parse(result.stdout).length,vectors,exact_episodes:episodes,trained_parameters:1165,pcs_authority:false}));
