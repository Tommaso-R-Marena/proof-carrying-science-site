// Compile actual game downloads; replay choices with independent PCS Python.
import {spawnSync} from 'node:child_process';import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';
const args=process.argv.slice(2),core=resolve(args[args.indexOf('--core')+1]||''),input=args[args.indexOf('--input')+1];
if(!args.includes('--core')||!args.includes('--input')||!input)throw Error('Usage: node scripts/verify_learning_downloads.mjs --core /path/to/pcs --input browser-learning-results.json');
const directory=mkdtempSync(join(tmpdir(),'pcs-learning-proofs-')),results=[];
for(const width of [1440,375]){
 for(const kind of ['trace','trace-assisted']){
  const file=resolve(input+`.${kind}-${width}.json`),raw=readFileSync(file);
  const code="import json,sys\nfrom pcs.countermodel_v1 import check_countermodel_session_file\nr=check_countermodel_session_file(sys.argv[1])\nprint(json.dumps(r))\nsys.exit(0 if r['final_verified'] else 1)\n";
  const run=spawnSync(process.env.PCS_PYTHON||'python',['-c',code,file],{cwd:core,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  if(run.error||run.status!==0)throw Error('Actual notebook failed independent PCS replay: '+(run.error?.message||run.stderr));
  const replay=JSON.parse(run.stdout);if(!replay.final_verified||replay.pcs_authoritative!==false||replay.lean_kernel_checked!==false||
   (kind==='trace-assisted'?replay.hints!==1:replay.hints!==0))throw Error('Actual notebook assistance/verdict mismatch');
  results.push({kind,viewport:width,download_sha256:createHash('sha256').update(raw).digest('hex'),independent_replay:true,hints:replay.hints});
 }
 const raw=readFileSync(input+`.witness-${width}.lean`,'utf8'),positive=join(directory,`Positive${width}.lean`),negative=join(directory,`Negative${width}.lean`);
 if(!raw.includes('theorem exhibited_meaning_difference : ¬ (')||!raw.includes('  decide'))throw Error('Actual game proof template absent');
 writeFileSync(positive,raw+'\n#print axioms PCSArenaCountermodel.exhibited_meaning_difference\n');
 writeFileSync(negative,raw.replace('theorem exhibited_meaning_difference : ¬ (','theorem exhibited_meaning_difference : ('));
 const lean=process.env.PCS_LEAN||'lean';
 const good=spawnSync(lean,[positive],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
 if(good.error||good.status!==0||!good.stdout.includes('depends on axioms: [propext]'))throw Error('Downloaded concrete Lean witness failed actual kernel/axiom audit: '+(good.error?.message||good.stderr||good.stdout));
 const bad=spawnSync(lean,[negative],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
 if(bad.error||bad.status===0||!bad.stdout.includes('decide'))throw Error('False equivalence negative control was not genuinely rejected');
 results.push({kind:'concrete_lean_witness',viewport:width,download_sha256:createHash('sha256').update(raw).digest('hex'),
  kernel_compiled:true,axioms:['propext'],false_equivalence_rejected:true});
}
console.log(JSON.stringify({format:'pcs-countermodel-learning-actual-download-validation-v1',scope:'Actual finite game downloads; no scientific authority',results},null,2));
