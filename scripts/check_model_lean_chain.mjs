// Regenerate the model proposal and exact proof meaning from receiver-owned code.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateModelChain,validateLocalModelChain} from '../public/model-lean-bridge.mjs';
const root=new URL('../',import.meta.url);
const load=name=>JSON.parse(fs.readFileSync(new URL(name,root),'utf8'));
export async function check(value){
 const local=value?.format==='pcs-model-local-lean-chain-v1';
 const checked=local?await validateLocalModelChain(value,load('public/repair-policy-model-v1.json')):await validateModelChain(value,load('public/proof-workbench-catalog.json'),load('public/repair-policy-model-v1.json'));
 return {format:'pcs-model-lean-reproduction-v1',handoff_sha256:checked.handoff.handoff_sha256,
  model_digest:checked.handoff.model_replay.model_digest,proposal_sha256:checked.handoff.proposal_sha256,
  goal_sha256:checked.handoff.entry.goal_sha256,source_revision:local?checked.core_revision:checked.report.source_revision,
  mathematical_scope:'UNARY_PREDICATES_ON_NAT',finite_check_is_separate:true,
  physical_neural_execution_independently_attested:false,pcs_authority:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const raw=fs.readFileSync(process.argv[2]);if(raw.length>12*1024*1024)throw Error('Model evidence exceeds bound');
 console.log(JSON.stringify(await check(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)))));
}
