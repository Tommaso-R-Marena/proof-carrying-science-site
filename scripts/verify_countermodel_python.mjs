// Cross-implementation differential checking against the public PCS Python core.
import {spawnSync} from 'node:child_process';import {resolve} from 'node:path';
import {COUNTERMODEL_MISSIONS,COUNTERMODEL_VERSION,initialWorld,countermodelVerdict} from '../public/countermodel-core.mjs';
const pos=process.argv.indexOf('--core'),core=pos>=0?resolve(process.argv[pos+1]||''):null;
if(!core)throw Error('Usage: node scripts/verify_countermodel_python.mjs --core /path/to/pcs');
const cases=[];
function add(m,w){cases.push({input:{format:'pcs-countermodel-witness-v1',version:COUNTERMODEL_VERSION,mission_id:m.id,world:w},expected:countermodelVerdict(m.id,w)});}
for(const m of COUNTERMODEL_MISSIONS){
 for(let n=1;n<=2;n++){
  const bits=2*n+(m.kind==='relation'?n*n:0);
  for(let mask=0;mask<2**bits;mask++){
   const w=initialWorld(n);let bit=0;
   for(let i=0;i<n;i++)for(const p of ['P','Q'])w[p][i]=Boolean(mask&(1<<bit++));
   if(m.kind==='relation')for(let i=0;i<n;i++)for(let j=0;j<n;j++)w.R[i][j]=Boolean(mask&(1<<bit++));
   add(m,w);
  }
 }
 let seed=20261008;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>=0x80000000;};
 for(let i=0;i<200;i++){const w=initialWorld(3);for(const p of ['P','Q'])w[p]=w[p].map(random);w.R=w.R.map(row=>row.map(random));add(m,w);}
}
const python=`import json,sys\nfrom pcs.countermodel_v1 import check_countermodel_witness\nrows=json.load(sys.stdin)\nout=[check_countermodel_witness(row['input']) for row in rows]\njson.dump(out,sys.stdout)\n`;
const result=spawnSync(process.env.PCS_PYTHON||'python',['-c',python],{cwd:core,input:JSON.stringify(cases),encoding:'utf8',timeout:120000,maxBuffer:12*1024*1024});
if(result.error||result.status!==0)throw Error('Independent Python check failed: '+(result.error?.message||result.stderr));
const rows=JSON.parse(result.stdout);if(rows.length!==cases.length)throw Error('Missing independent results');
for(const [i,row] of rows.entries()){
 const want=cases[i].expected;
 if(row.source_true!==want.left||row.proposal_true!==want.right||row.counterexample!==want.counterexample||row.pcs_authoritative!==false||row.lean_kernel_checked!==false)throw Error('Cross-language semantic disagreement at case '+i);
}
console.log(JSON.stringify({format:'pcs-countermodel-cross-language-check-v1',cases:cases.length,missions:COUNTERMODEL_MISSIONS.length,
 coverage:'exhaustive 1–2-agent worlds plus 200 seeded 3-agent worlds per mission',seed:20261008,disagreements:0,authority:'NONE'},null,2));
