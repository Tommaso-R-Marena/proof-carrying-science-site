// Real Lean kernel execution, explicit axiom audit, and rejecting false control.
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const lean=process.env.PCS_LEAN_BIN||'lean';
const version=spawnSync(lean,['--version'],{encoding:'utf8',timeout:10000});
if(version.status!==0||!/^Lean \(version 4\.28\.0(?:,|\))/.test(version.stdout))throw Error('Lean 4.28.0 is required');
const file='research/search-quality-v1/DistanceCertificate.lean',source=readFileSync(file);
if(/\b(sorry|admit|axiom|unsafe)\b/.test(source.toString().replace(/#print axioms/g,'')))throw Error('Unreviewed formal trust escape');
const result=spawnSync(lean,['-j1','-M2048',file],{encoding:'utf8',timeout:120000});
if(result.status!==0||/declaration uses|sorry|error:/.test(result.stdout+result.stderr))throw Error('Lean proof build failed: '+result.stdout+result.stderr);
const theorems=['potential_lower_bound','descending_witness','exact_edit_distance'];
const audits=theorems.map(name=>{
 const line=result.stdout.split('\n').find(s=>s.startsWith("'PCS.SearchCertificate."+name+"'"));
 if(!line||line!==`'PCS.SearchCertificate.${name}' depends on axioms: [propext, Quot.sound]`)throw Error('Unexpected or missing axiom audit for '+name);
 return {name:'PCS.SearchCertificate.'+name,axioms:['propext','Quot.sound']};
});
const temp=mkdtempSync(join(tmpdir(),'pcs-distance-lean-'));
try{
 const falseFile=join(temp,'FalseControl.lean');writeFileSync(falseFile,'import Std\nexample : (1 : Nat) = 2 := by omega\n');
 const control=spawnSync(lean,['-j1','-M2048',falseFile],{encoding:'utf8',timeout:60000});
 if(control.status===0||!control.stdout.includes('error:'))throw Error('False control did not fail in Lean');
}finally{rmSync(temp,{recursive:true,force:true});}
console.log(JSON.stringify({format:'pcs-search-distance-lean-audit-v1',toolchain:version.stdout.trim(),source_sha256:createHash('sha256').update(source).digest('hex'),theorems:audits,false_control_rejected:true,scope:'Abstract potential-distance criterion only; no concrete JS/Python correspondence theorem or PCS authority'}));
