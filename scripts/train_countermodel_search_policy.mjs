// Actual fitting on replay-checked adult opt-in exports. No invented human data.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {prepareCountermodelDataset,COUNTERMODEL_RULESET_SHA256} from './prepare_countermodel_dataset.mjs';
import {SEARCH_ACTIONS,SEARCH_DIMENSION,SEARCH_POLICY_FORMAT,actionKey,searchFeatures,legalSearchActions,rankSearchActions} from '../public/countermodel-search-policy.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const TRAINER_SHA=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const FEATURE_SHA=createHash('sha256').update(readFileSync(fileURLToPath(new URL('../public/countermodel-search-policy.mjs',import.meta.url)))).digest('hex');
function examples(dataset,split){
 return dataset.episodes.filter(e=>e.split===split&&!e.assisted_by_hint).flatMap(e=>e.steps.map(step=>{
  const index=SEARCH_ACTIONS.findIndex(a=>actionKey(a)===actionKey(step.action));
  if(index<0)throw Error('Unsupported training action');
  return {case_id:e.case_id,world:step.state.world,feedback:step.state.checker_feedback_exposed,index,
   features:searchFeatures(e.case_id,step.state.world,step.state.checker_feedback_exposed),
   legal:legalSearchActions(e.case_id,step.state.world).map(a=>a.index)};
 }));
}
export function trainCountermodelSearchPolicy(ownerExport){
 // Split/hints/rewards/verdicts are recomputed, never accepted from a prepared file.
 const dataset=prepareCountermodelDataset(ownerExport),rows=examples(dataset,'training');
 if(!rows.length)throw Error('No unassisted training-family trajectories; refusing to invent training data');
 const weights=SEARCH_ACTIONS.map(()=>Array(SEARCH_DIMENSION).fill(0)),counts=SEARCH_ACTIONS.map(()=>0);
 for(const row of rows)counts[row.index]++;
 for(let epoch=0;epoch<48;epoch++)for(const row of rows){
  const logits=row.legal.map(i=>weights[i].reduce((sum,w,j)=>sum+w*row.features[j],0));
  const max=Math.max(...logits),exp=logits.map(x=>Math.exp(x-max)),total=exp.reduce((a,b)=>a+b,0);
  const lr=.08/(1+epoch*.08);
  row.legal.forEach((i,k)=>{const error=(i===row.index?1:0)-exp[k]/total;
   weights[i]=weights[i].map((w,j)=>w+lr*(error*row.features[j]-.001*w));});
 }
 const artifact={format:SEARCH_POLICY_FORMAT,authority:'NONE_UNTRUSTED_BEHAVIOR_CLONING',
  method:'deterministic_masked_softmax_behavior_cloning',ruleset_sha256:COUNTERMODEL_RULESET_SHA256,
  provenance:{trainer_sha256:TRAINER_SHA,features_sha256:FEATURE_SHA,training_rows_sha256:sha(rows),
   data_origin:'supplied owner export; consent and human authenticity cannot be authenticated offline',
   evaluation_examples_used_for_training:0,hint_assisted_episodes_used_for_training:0},
  training:{epochs:48,examples:rows.length,episodes:dataset.episodes.filter(e=>e.split==='training'&&!e.assisted_by_hint).length,
   task_ids:[...new Set(rows.map(r=>r.case_id))].sort(),action_counts:counts},
  weights:weights.map(w=>w.map(x=>Math.round(x*1e8)/1e8)),
  limitations:['Learns observed choices, not optimal moves or formal proofs','Tiny public mission pool; no external generalization claim',
   'Hints excluded; scripts can still simulate participants','No automatic deployment or authority promotion']};
 return {...artifact,model_digest_sha256:sha(artifact)};
}
export function evaluateCountermodelSearchPolicy(model,ownerExport){
 const dataset=prepareCountermodelDataset(ownerExport),rows=examples(dataset,'evaluation');
 if(model.ruleset_sha256!==COUNTERMODEL_RULESET_SHA256)throw Error('Model ruleset mismatch');
 const correct=rows.filter(r=>rankSearchActions(model,r.case_id,r.world,r.feedback)[0].index===r.index).length;
 const majority=rows.filter(r=>[...r.legal].sort((a,b)=>model.training.action_counts[b]-model.training.action_counts[a]||a-b)[0]===r.index).length;
 return {metric:'held_out_demonstrated_action_top1_agreement',examples:rows.length,
  model_correct:correct,model_accuracy:rows.length?correct/rows.length:null,
  training_action_prior_correct:majority,uniform_random_expected_correct:rows.reduce((sum,r)=>sum+1/r.legal.length,0),
  evaluation_task_ids:[...new Set(rows.map(r=>r.case_id))].sort(),
  authority:'NONE',interpretation:'Agreement with replayed participant choices, not solution rate, safety, or proof quality',
  limitations:['Evaluation families are excluded from fitting but public and small','No evaluation evidence when examples=0']};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [input,output,report]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/train_countermodel_search_policy.mjs owner-export.json model.json [evaluation.json]');
 const doc=JSON.parse(readFileSync(input,'utf8')),model=trainCountermodelSearchPolicy(doc);
 writeFileSync(output,JSON.stringify(model,null,2)+'\n');
 const evaluation=evaluateCountermodelSearchPolicy(model,doc);
 if(report)writeFileSync(report,JSON.stringify(evaluation,null,2)+'\n');
 console.log(JSON.stringify({training:model.training,evaluation,model_digest_sha256:model.model_digest_sha256}));
}
