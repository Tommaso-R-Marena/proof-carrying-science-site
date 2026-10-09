// Generates *real Lean 4 source* for all finite witnesses and optionally invokes Lean.
// No success marker is emitted if Lean is unavailable or any theorem fails.
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {COUNTERMODEL_MISSIONS,findMinimalCountermodel,exportLeanCountermodel} from '../public/countermodel-core.mjs';
const emitOnly=process.argv.includes('--emit-only');
const leanBinary=process.env.PCS_LEAN_BIN||'lean';
if(!emitOnly){
 const version=spawnSync(leanBinary,['--version'],{encoding:'utf8',timeout:15000,maxBuffer:2048});
 const text=version.stdout||'';
 if(version.error||version.status!==0||!/Lean \(version 4\.28\.0(?:,|\))/.test(text)){
  console.error('LEAN_TOOLCHAIN_NOT_VERIFIED: expected pinned Lean 4.28.0, got '+(version.error?.message||text.trim()||'unavailable'));
  process.exit(2);
 }
}
const work=mkdtempSync(join(tmpdir(),'pcs-countermodel-lean-'));
let failures=0;
try{
 for(const mission of COUNTERMODEL_MISSIONS){
  const artifact=exportLeanCountermodel(mission.id,findMinimalCountermodel(mission.id).w);
  const path=join(work,artifact.file_name);
  writeFileSync(path,artifact.lean_source,'utf8');
  if(emitOnly){console.log('GENERATED_NO_KERNEL_VERDICT',path);continue;}
  const result=spawnSync(leanBinary,[path],{encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});
  if(result.error||result.status!==0){failures++;console.error('LEAN_REJECTED',mission.id,result.error?.message||result.stdout||result.stderr||String(result.status));}
  else console.log('LEAN_KERNEL_VERIFIED',mission.id);
 }
}finally{if(!emitOnly)rmSync(work,{recursive:true,force:true});}
if(!emitOnly&&failures)process.exitCode=1;
if(emitOnly)console.log('All files require a separate pinned Lean kernel run; NO PASS was asserted.');
