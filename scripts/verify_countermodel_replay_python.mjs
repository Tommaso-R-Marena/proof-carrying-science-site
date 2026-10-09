// Independent full-trajectory parity: generated test choices, never research data.
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';
import {COUNTERMODEL_VERSION,COUNTERMODEL_MISSIONS,replayCountermodelSession,findMinimalCountermodel} from '../public/countermodel-core.mjs';
import {legalSearchActions} from '../public/countermodel-search-policy.mjs';
const pos=process.argv.indexOf('--core'),core=pos>=0?resolve(process.argv[pos+1]||''):null;
if(!core)throw Error('Usage: node scripts/verify_countermodel_replay_python.mjs --core /path/to/pcs');
let seed=20261009;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
const cases=[],bad=[];
function add(m,actions){const input={version:COUNTERMODEL_VERSION,mission_id:m.id,actions};cases.push({input,expected:replayCountermodelSession(input)});}
for(const m of COUNTERMODEL_MISSIONS){
 const witness=findMinimalCountermodel(m.id).w,winning=[];
 for(let n=1;n<witness.n;n++)winning.push({type:'add'});
 if(m.kind==='unary'){for(const p of ['P','Q'])for(let i=0;i<witness.n;i++)if(witness[p][i])winning.push({type:'toggle',p,i});}
 else for(let i=0;i<witness.n;i++)for(let j=0;j<witness.n;j++)if(witness.R[i][j])winning.push({type:'toggle_relation',i,j});
 add(m,[...winning,{type:'check'},{type:'check'}]);
 add(m,[...winning,{type:'check'},{type:'hint'}]);
 add(m,[{type:'hint'},...winning,{type:'check'}]);
 add(m,Array.from({length:120},()=>({type:'check'})));
 for(let sample=0;sample<32;sample++){
  const input={version:COUNTERMODEL_VERSION,mission_id:m.id,actions:[{type:'check'}]};
  for(let step=0;step<14;step++){
   const replay=replayCountermodelSession(input),legal=legalSearchActions(m.id,replay.final_world).map(x=>x.action);
   if(replay.hints<3&&random()%7===0)legal.push({type:'hint'});
   input.actions.push(structuredClone(legal[random()%legal.length]));
  }
  input.actions.push({type:'check'});add(m,input.actions);
 }
}
const base=cases[0].input;
bad.push({...base,score:999},{...base,email:'fixture@example.invalid'},{...base,actions:[{type:'check',counterexample:true}]},
 {...base,actions:[{type:'remove'},{type:'check'}]},{...base,actions:[{type:'toggle',p:'P',i:true},{type:'check'}]},
 {...base,actions:[{type:'hint'},{type:'hint'},{type:'hint'},{type:'hint'},{type:'check'}]},
 {...base,actions:[]},{...base,actions:Array(121).fill({type:'check'})},{...base,mission_id:'unregistered'});
for(const input of bad)assert.throws(()=>replayCountermodelSession(input));
const source=`import json,sys\nfrom pcs.countermodel_v1 import replay_countermodel_session\nd=json.load(sys.stdin)\nout={'valid':[replay_countermodel_session(x['input']) for x in d['cases']],'rejected':[]}\nfor x in d['bad']:\n try: replay_countermodel_session(x)\n except ValueError: out['rejected'].append(True)\n else: out['rejected'].append(False)\njson.dump(out,sys.stdout)\n`;
const run=spawnSync(process.env.PCS_PYTHON||'python',['-c',source],{cwd:core,input:JSON.stringify({cases,bad}),encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});
if(run.error||run.status!==0)throw Error('Independent trajectory replay failed: '+(run.error?.message||run.stderr));
const result=JSON.parse(run.stdout);assert.equal(result.valid.length,cases.length);assert.ok(result.rejected.every(Boolean));assert.equal(result.rejected.length,bad.length);
const fields=['version','mission_id','final_world','final_verdict','minimum_domain_size','steps','checks','hints','edits','solved','final_verified','score'];
for(const [i,actual]of result.valid.entries()){
 assert.equal(actual.lean_kernel_checked,false);assert.equal(actual.pcs_authoritative,false);
 for(const field of fields)assert.deepEqual(actual[field],cases[i].expected[field],`Replay mismatch: case ${i}, ${field}`);
}
console.log(JSON.stringify({format:'pcs-countermodel-independent-trajectory-parity-v1',data_origin:'generated validation choices; no real participant data',
 sessions:cases.length,steps:cases.reduce((n,c)=>n+c.input.actions.length,0),malformed_sessions_rejected:bad.length,
 missions:COUNTERMODEL_MISSIONS.length,assisted_sessions:cases.filter(c=>c.expected.hints).length,
 unfinished_sessions:cases.filter(c=>!c.expected.final_verified).length,seed:20261009,disagreements:0,authority:'NONE'},null,2));
