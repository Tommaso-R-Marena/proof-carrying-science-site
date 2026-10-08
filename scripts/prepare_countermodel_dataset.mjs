// Offline owner-exported, privacy-reduced, deterministic research episodes.
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync} from 'node:fs';
import {replayCountermodelSession,COUNTERMODEL_VERSION,countermodelMission} from '../public/countermodel-core.mjs';
export const COUNTERMODEL_DATASET='pcs-countermodel-trajectory-dataset-v1';
const HELD_OUT=new Set(['quantifier-switch','quantifier-scope','variable-capture']);
export function prepareCountermodelDataset(doc){
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||doc.format!=='pcs-countermodel-adult-optin-dataset-v1'||!Array.isArray(doc.entries)||doc.entries.length>200)throw Error('Invalid owner research export');
 if(Object.keys(doc).some(k=>!['format','entries','next_offset','privacy','limitations','checker'].includes(k)))throw Error('Unexpected export metadata');
 const episodes=[],seen=new Set();
 for(const [index,entry] of doc.entries.entries()){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).sort().join(',')!=='replay,session')throw Error('Unexpected personal identifiers or study fields');
  const input=entry.session;
  if(!input||input.version!==COUNTERMODEL_VERSION||!countermodelMission(input.mission_id))throw Error('Unsupported task/version');
  const verified=replayCountermodelSession(input);
  if(JSON.stringify(verified)!==JSON.stringify(entry.replay))throw Error('Recomputed finite checker replay mismatch');
  if(!verified.final_verified)throw Error('Failed sessions cannot be exported as solved countermodels');
  const key=JSON.stringify(input);
  if(seen.has(key))continue;
  seen.add(key);
  const mission=countermodelMission(input.mission_id);
  episodes.push({case_id:input.mission_id,version:COUNTERMODEL_VERSION,split:HELD_OUT.has(input.mission_id)?'evaluation':'training',
   semantic_skill:mission.skill,semantic_input:{sort:'Agent',original_ast:mission.a,proposed_ast:mission.b,
     original_lean:mission.left,proposed_lean:mission.right,signature:{P:'Agent -> Prop',Q:'Agent -> Prop',R:'Agent -> Agent -> Prop'}},
   authority:'FINITE_MODEL_CHECKER_ONLY',source_proof_validity:'NOT_EVALUATED',
   first_counterexample_at_step:verified.steps.find(x=>x.received_checker_response&&x.counterexample)?.index??null,
   minimum_domain_size:verified.minimum_domain_size,final_domain_size:verified.final_world.n,
   score:verified.score,assisted_by_hint:verified.hints>0,checks:verified.checks,
   steps:verified.steps.map(x=>({state:{world:x.world,checker_feedback_exposed:x.checker_feedback_exposed,
     hint_used_before_action:x.assisted},action:x.action,reward:x.reward,
     checker_labels:{source_true:x.source_true,proposal_true:x.proposal_true,counterexample:x.counterexample,
       label_exposed_to_player:x.received_checker_response},received_checker_response:x.received_checker_response}))});
 }
 return {format:COUNTERMODEL_DATASET,authority:'NONE',data_origin:'consented game choices with deterministic finite-model server replay',
  labels:'recomputed bounded first-order semantics; NOT Lean tactic trajectories',privacy:'no user IDs, emails, IPs, timestamps or notes',
  train_eval_policy:'Held-out mission IDs and quantifier/binding families; avoid prompt/template overlap before claiming generalization',
  stats:{episodes:episodes.length,training:episodes.filter(e=>e.split==='training').length,evaluation:episodes.filter(e=>e.split==='evaluation').length,
   assisted:episodes.filter(e=>e.assisted_by_hint).length},episodes};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/prepare_countermodel_dataset.mjs owner-export.json sanitized-dataset.json');
 writeFileSync(output,JSON.stringify(prepareCountermodelDataset(JSON.parse(readFileSync(input,'utf8'))),null,2)+'\n');
}
