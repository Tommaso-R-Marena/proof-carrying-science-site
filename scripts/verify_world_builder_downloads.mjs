// Compile the actual browser-downloaded bytes, with an exact executable pin.
import {readFileSync,writeFileSync,mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MISSIONS,verifyRuleset} from '../public/world-builder-core.mjs';
import {exportLeanCountermodel,COUNTERMODEL_VERSION} from '../public/countermodel-core.mjs';
import {strictParse,exact} from '../public/omega-core.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const input=process.argv[2];if(!input)throw Error('Provide the browser evidence directory');
await verifyRuleset();
const which=spawnSync('which',[process.env.PCS_LEAN_BIN||'lean'],{encoding:'utf8'});if(which.status!==0)throw Error('Actual Lean is required');
const lean=realpathSync(which.stdout.trim());
if(sha(readFileSync(lean))!=='3e0d0d3d801675359f2d4cf9815bfdb417b20b92fdd9d48b3b14c95bbae28bbf')throw Error('Unexpected Lean executable');
const temp=mkdtempSync(join(tmpdir(),'pcs-world-proof-')),results=[];
try{
 for(const id of MISSIONS){
  const witness=strictParse(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(join(input,id+'.witness.json'))),4096);
  exact(witness,['format','version','mission_id','world']);
  if(witness.format!=='pcs-countermodel-witness-v1'||witness.version!==COUNTERMODEL_VERSION||witness.mission_id!==id)throw Error('Witness version mismatch');
  const proof=readFileSync(join(input,id+'.lean'),'utf8');
  if(proof!==exportLeanCountermodel(id,witness.world).lean_source)throw Error('Downloaded proof and checked world differ');
  const file=join(temp,id+'.lean');writeFileSync(file,proof+'\n#print axioms PCSArenaCountermodel.exhibited_meaning_difference\n');
  const r=spawnSync(lean,['-j1','-M2048',file],{encoding:'utf8',timeout:60000});if(r.error||r.status!==0)throw Error('Actual Lean rejected '+id+': '+(r.error?.message||r.stdout+r.stderr));
  const m=/'PCSArenaCountermodel.exhibited_meaning_difference' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)/.exec(r.stdout);if(!m)throw Error('Missing theorem axiom audit');
  const axioms=(m[1]||'').split(',').map(x=>x.trim()).filter(Boolean);if(axioms.some(x=>!['propext','Classical.choice','Quot.sound'].includes(x)))throw Error('Unexpected theorem assumptions');
  results.push({mission_id:id,proof_sha256:sha(proof),kernel_checked:true,axioms});
 }
 const file=join(temp,'False.lean');writeFileSync(file,'import Std\ntheorem false_control : (0 : Nat) = 1 := by decide\n');
 const r=spawnSync(lean,['-j1','-M2048',file],{encoding:'utf8',timeout:60000});
 if(r.error||r.status===0||!r.stdout.includes('is false'))throw Error('False proof control was not rejected');
 console.log(JSON.stringify({format:'pcs-world-builder-download-lean-v1',results,false_control_rejected:true,production_authority:false},null,2));
}finally{rmSync(temp,{recursive:true,force:true});}
