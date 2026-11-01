// Independently check recorded *real local* public-job executions. This is not
// fresh neural inference, hosted provenance attestation or a held-out benchmark.
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {parseResultLog} from '../src/lean-research.js';
const root=new URL('../docs/evidence/model-wiring-v1/public-families/',import.meta.url);
const version=spawnSync('lean',['--version'],{encoding:'utf8'});
assert.equal(version.status,0,'An actual Lean executable is required');
assert.match(version.stdout,/Lean \(version 4\.28\.0,/);
const scratch=mkdtempSync(join(tmpdir(),'pcs-website-family-replay-'));
const rows=[];
try{
 for(const family of ['checked-reuse-v2','induction-abstraction-v2','verified-memory-v1','prospective-hybrid-v2']){
  const binding=JSON.parse(readFileSync(new URL(family+'-binding.json',root)));
  const evidence=await parseResultLog(readFileSync(new URL(family+'.log',root),'utf8'),binding);
  const outcomes=[];
  for(const role of ['result','previous','baseline','strong_baseline']){
   const r=evidence[role];if(!r)continue;
   const row={role,status:r.status,model:r.model??null,checkpoint_sha256:r.checkpoint_sha256??null,
    expansions:r.search?.expansions??null,winning_component:r.search?.winning_component||r.search?.portfolio?.selected_stage||null,
    independent_lean_replay:false,axioms:null};
   if(r.status==='verified'){
    const receipt=r.search.receipt;
    const source='import Std\nimport Lean\n\n'+(receipt.library_declarations||'')+
     '\ntheorem pcs_website_model_result : '+receipt.statement+' := by\n'+receipt.proof+'\n#print axioms pcs_website_model_result\n';
    const file=join(scratch,'Proof.lean');writeFileSync(file,source);
    const run=spawnSync('lean',[file],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
    assert.equal(run.status,0,family+'/'+role+' failed independent Lean replay: '+run.stdout+' '+run.stderr);
    const audit=run.stdout.match(/^'pcs_website_model_result' depends on axioms: \[(.*?)\]/m);
    const axioms=audit?audit[1].split(',').map(s=>s.trim()).filter(Boolean):
     run.stdout.includes("'pcs_website_model_result' does not depend on any axioms")?[]:null;
    assert.deepEqual(axioms?.sort(),[...receipt.kernel.axioms].sort(),'Exact independently observed axiom set');
    Object.assign(row,{independent_lean_replay:true,axioms});
   }
   outcomes.push(row);
  }
  rows.push({family,source:binding.core_sha,outcomes});
 }
 console.log(JSON.stringify({format:'pcs-recorded-website-family-replay-v1',fresh_inference:false,
  hosted_authorization_exercised:false,held_out_benchmark:false,pcs_authority:false,rows}));
}finally{rmSync(scratch,{recursive:true,force:true});}
