// Independent Python/browser differential gate against an exact checked-out core.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {check,actions,features,search,verifyEpisode,validateModel,canonical} from '../public/omega-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const core=process.argv.includes('--core')?path.resolve(process.argv[process.argv.indexOf('--core')+1]):path.resolve(root,'../proof-carrying-science');
const models=Object.fromEntries(['bag','graph','bandit'].map(n=>[n,JSON.parse(fs.readFileSync(path.join(root,`public/omega/${n}-v1.json`),'utf8'))]));
for(const m of Object.values(models))await validateModel(m);
const corpus=JSON.parse(fs.readFileSync(path.join(core,'research/omega-v1/corpus.json'),'utf8'));
const source=`
import json,sys
from pcs.experimental.omega.logic import check,actions
from pcs.experimental.omega.learning import features
from pcs.experimental.omega.search import search,verify_episode
data=json.load(sys.stdin)
out=[]
for i,r in enumerate(data['records']):
 t=r['task']; aa=actions(t['candidate'],t['variables'])
 row={'receipt':check(t),'actions':aa,'features':{mode:[features(t,a,mode) for a in aa[:3]] for mode in ('bag','graph')}}
 if i%8==0:
  row['episodes']={}
  for name in ('bfs','structural','bag','graph','bandit'):
   e=search(t,strategy=name if name in ('bfs','structural') else 'learned',model=data['models'].get(name),checks=8,seed=20261009)
   verify_episode(e); row['episodes'][name]=e
 out.append(row)
print(json.dumps(out,allow_nan=False))
`;
const r=spawnSync(process.env.PCS_PYTHON||'python3',['-c',source],{cwd:core,input:JSON.stringify({records:corpus.records,models}),encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024,env:{...process.env,PYTHONPATH:core}});
if(r.status!==0)throw Error('Independent Python gate failed: '+r.stderr.slice(0,1000));const expected=JSON.parse(r.stdout);let episodes=0,vectors=0;
for(const [i,record] of corpus.records.entries()){
 const t=record.task,reference=expected[i],aa=actions(t.candidate,t.variables);assert.equal(canonical(await check(t)),canonical(reference.receipt));assert.equal(canonical(aa),canonical(reference.actions));
 for(const mode of ['bag','graph'])for(const [j,a]of aa.slice(0,3).entries()){const actual=features(t,a,mode),want=reference.features[mode][j];assert.equal(actual.length,want.length);for(let k=0;k<actual.length;k++)assert.ok(Math.abs(actual[k]-want[k])<1e-12,`Feature mismatch ${i}/${mode}/${j}/${k}`);vectors++;}
 if(reference.episodes)for(const [name,e]of Object.entries(reference.episodes)){await verifyEpisode(e);const learned=['bag','graph','bandit'].includes(name),actual=await search(t,{strategy:learned?'learned':name,model:learned?models[name]:null,checks:8});assert.equal(canonical(actual),canonical(e),`Trajectory mismatch ${i}/${name}`);episodes++;}
}
console.log(JSON.stringify({format:'pcs-omega-python-browser-parity-v1',tasks:corpus.records.length,feature_vectors:vectors,exact_episodes:episodes,pcs_authority:false}));
