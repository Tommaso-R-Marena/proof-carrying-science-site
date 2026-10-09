// Exhaustive comparison with the compiled, proved PCS finite evaluator.
// Compiled output is runtime evidence; it does not confer kernel/PCS authority on the website.
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {COUNTERMODEL_MISSIONS,initialWorld,countermodelVerdict} from '../public/countermodel-core.mjs';
import {COUNTERMODEL_RULESET_SHA256} from './prepare_countermodel_dataset.mjs';

const index=process.argv.indexOf('--core');
if(index<0||!process.argv[index+1])throw Error('Usage: node scripts/verify_countermodel_formal.mjs --core /path/to/pcs');
const pin='d3b02eb4eb39976fd3179a44ef1b6bffd17a8f4a271b1bd7cddb97eb71276df2';
if(COUNTERMODEL_RULESET_SHA256!==pin||COUNTERMODEL_MISSIONS.length!==7)throw Error('Game mission ruleset drift');
const core=resolve(process.argv[index+1]);
const result=spawnSync(join(core,'formal/.lake/build/bin/pcs-countermodel-replay'),['--exhaustive'],
 {encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});
if(result.error||result.status!==0)throw Error('Compiled Lean evaluator failed: '+(result.error?.message||result.stderr));
if(!result.stdout.endsWith('\n'))throw Error('Truncated compiled Lean results');
const records=result.stdout.slice(0,-1).split('\n');let cases=0;
for(const mission of COUNTERMODEL_MISSIONS){
 for(let n=1;n<=3;n++){
  for(let mask=0;mask<2**(2*n+n*n);mask++){
   const world=initialWorld(n);
   for(let i=0;i<n;i++){
    world.P[i]=Boolean(mask&(1<<(2*i)));world.Q[i]=Boolean(mask&(1<<(2*i+1)));
    for(let j=0;j<n;j++)world.R[i][j]=Boolean(mask&(1<<(2*n+n*i+j)));
   }
   const verdict=countermodelVerdict(mission.id,world);
   const expected=[mission.id,n,mask,Number(verdict.left),Number(verdict.right)].join('\t');
   if(records[cases]!==expected)throw Error('Lean/JavaScript disagreement or missing record: '+expected+' / '+records[cases]);
   cases++;
  }
 }
}
if(cases!==231224||records.length!==cases)throw Error('Incomplete or extra compiled Lean results');
console.log(JSON.stringify({format:'pcs-countermodel-lean-javascript-exhaustive-v1',ruleset_sha256:pin,
 missions:7,worlds:cases,coverage:'Every P/Q/R interpretation on nonempty domains 1–3',
 disagreements:0,runtime_refinement_proved:false,pcs_authoritative:false},null,2));
