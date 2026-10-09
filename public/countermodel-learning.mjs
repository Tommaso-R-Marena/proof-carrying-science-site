// Actual deterministic fitting, shared by the game and offline owner-export CLI.
// Inputs are typed choices; labels and assistance are always replayed.
import {replayCountermodelSession,COUNTERMODEL_MISSIONS} from './countermodel-core.mjs';
import {SEARCH_ACTIONS,SEARCH_DIMENSION,SEARCH_POLICY_FORMAT,actionKey,searchFeatures,legalSearchActions,rankSearchActions} from './countermodel-search-policy.mjs';
import {exact,shaText,strictParse} from './omega-core.mjs';
export const SEARCH_RULESET_SHA256='d3b02eb4eb39976fd3179a44ef1b6bffd17a8f4a271b1bd7cddb97eb71276df2';
export const EVALUATION_MISSIONS=Object.freeze(['quantifier-switch','quantifier-scope','variable-capture']);
export function normalizeSearchSession(input){
 const replay=replayCountermodelSession(input);
 const session={version:input.version,mission_id:input.mission_id,actions:replay.steps.map(s=>{
  const a=s.action;return a.type==='toggle'?{type:a.type,p:a.p,i:a.i}:a.type==='toggle_relation'?{type:a.type,i:a.i,j:a.j}:{type:a.type};
 })};
 return {session,replay};
}
function eligibleSessions(sessions){
 if(!Array.isArray(sessions)||sessions.length>200)throw Error('At most 200 bounded search notebooks');
 const seen=new Set(),entries=[];
 for(const input of sessions){const entry=normalizeSearchSession(input),key=JSON.stringify(entry.session);
  if(!entry.replay.final_verified)throw Error('Finish the notebook with a checked counterexample');
  if(seen.has(key))continue;seen.add(key);entries.push(entry);
 }
 return entries;
}
export function searchSessionRows(sessions,split){
 if(!['training','evaluation'].includes(split))throw Error('Unknown learning partition');
 return eligibleSessions(sessions).filter(({session,replay})=>!replay.hints&&
  (EVALUATION_MISSIONS.includes(session.mission_id)?'evaluation':'training')===split).flatMap(({session,replay})=>replay.steps.map(step=>{
   const index=SEARCH_ACTIONS.findIndex(a=>actionKey(a)===actionKey(step.action));
   if(index<0)throw Error('Unsupported training action');
   return {case_id:session.mission_id,world:step.state_before,feedback:step.checker_feedback_before_action,index,
    features:searchFeatures(session.mission_id,step.state_before,step.checker_feedback_before_action),
    legal:legalSearchActions(session.mission_id,step.state_before).map(a=>a.index)};
 }));
}
export function fitSearchSessions(sessions){
 const entries=eligibleSessions(sessions),rows=searchSessionRows(sessions,'training');
 if(!rows.length)throw Error('No unassisted training-family trajectories; refusing to invent training data');
 const weights=SEARCH_ACTIONS.map(()=>Array(SEARCH_DIMENSION).fill(0)),counts=SEARCH_ACTIONS.map(()=>0);
 for(const row of rows)counts[row.index]++;
 for(let epoch=0;epoch<48;epoch++)for(const row of rows){
  const logits=row.legal.map(i=>weights[i].reduce((sum,w,j)=>sum+w*row.features[j],0));
  const max=Math.max(...logits),exp=logits.map(x=>Math.exp(x-max)),total=exp.reduce((a,b)=>a+b,0),lr=.08/(1+epoch*.08);
  row.legal.forEach((i,k)=>{const error=(i===row.index?1:0)-exp[k]/total;
   weights[i]=weights[i].map((w,j)=>w+lr*(error*row.features[j]-.001*w));});
 }
 return {rows,weights:weights.map(w=>w.map(x=>Math.round(x*1e8)/1e8)),training:{epochs:48,examples:rows.length,
  episodes:entries.filter(({session,replay})=>!replay.hints&&!EVALUATION_MISSIONS.includes(session.mission_id)).length,
  task_ids:[...new Set(rows.map(r=>r.case_id))].sort(),action_counts:counts}};
}
export function searchModelEnvelope(fitted,provenance){
 return {format:SEARCH_POLICY_FORMAT,authority:'NONE_UNTRUSTED_BEHAVIOR_CLONING',
  method:'deterministic_masked_softmax_behavior_cloning',ruleset_sha256:SEARCH_RULESET_SHA256,
  provenance,training:fitted.training,weights:fitted.weights,
  limitations:['Learns observed choices, not optimal moves or formal proofs','Tiny public mission pool; no external generalization claim',
   'Hints excluded; scripts can still simulate participants','No automatic deployment or authority promotion']};
}
export function evaluateSearchSessions(model,sessions){
 const rows=searchSessionRows(sessions,'evaluation');
 if(model.ruleset_sha256!==SEARCH_RULESET_SHA256)throw Error('Model ruleset mismatch');
 const counts=model.training?.action_counts;
 if(!Array.isArray(counts)||counts.length!==SEARCH_ACTIONS.length||counts.some(x=>!Number.isSafeInteger(x)||x<0||x>24000))throw Error('Invalid training action prior');
 const correct=rows.filter(r=>rankSearchActions(model,r.case_id,r.world,r.feedback)[0].index===r.index).length;
 const majority=rows.filter(r=>[...r.legal].sort((a,b)=>counts[b]-counts[a]||a-b)[0]===r.index).length;
 return {metric:'held_out_demonstrated_action_top1_agreement',examples:rows.length,
  model_correct:correct,model_accuracy:rows.length?correct/rows.length:null,
  training_action_prior_correct:majority,uniform_random_expected_correct:rows.reduce((sum,r)=>sum+1/r.legal.length,0),
  evaluation_task_ids:[...new Set(rows.map(r=>r.case_id))].sort(),authority:'NONE',
  interpretation:'Agreement with replayed participant choices, not solution rate, safety, or proof quality',
  limitations:['Evaluation families are excluded from fitting but public and small','No evaluation evidence when examples=0']};
}
export async function fitLocalSearchModel(sessions,{trainer_sha256,fitter_sha256,features_sha256}){
 if(await shaText(JSON.stringify(COUNTERMODEL_MISSIONS.map(({id,kind,left,right,a,b})=>({id,kind,left,right,a,b}))))!==SEARCH_RULESET_SHA256)throw Error('Game ruleset mismatch');
 for(const hash of [trainer_sha256,fitter_sha256,features_sha256])if(!/^[0-9a-f]{64}$/.test(hash))throw Error('Missing actual implementation digest');
 const fitted=fitSearchSessions(sessions),artifact=searchModelEnvelope(fitted,{trainer_sha256,fitter_sha256,features_sha256,
  training_rows_sha256:await shaText(JSON.stringify(fitted.rows)),data_origin:'private local player notebooks; account provenance and research consent not asserted',
  evaluation_examples_used_for_training:0,hint_assisted_episodes_used_for_training:0});
 return {...artifact,model_digest_sha256:await shaText(JSON.stringify(artifact))};
}
export async function validateSearchModelJSON(raw,{featuresSHA256}={}){
 if(await shaText(JSON.stringify(COUNTERMODEL_MISSIONS.map(({id,kind,left,right,a,b})=>({id,kind,left,right,a,b}))))!==SEARCH_RULESET_SHA256)throw Error('Game ruleset mismatch');
 const m=strictParse(raw,65536);
 exact(m,['format','authority','method','ruleset_sha256','provenance','training','weights','limitations','model_digest_sha256']);
 if(m.format!==SEARCH_POLICY_FORMAT||m.authority!=='NONE_UNTRUSTED_BEHAVIOR_CLONING'||m.method!=='deterministic_masked_softmax_behavior_cloning'||m.ruleset_sha256!==SEARCH_RULESET_SHA256)throw Error('Unsupported untrusted search model');
 const p=m.provenance;exact(p,['trainer_sha256',...(p&&Object.hasOwn(p,'fitter_sha256')?['fitter_sha256']:[]),'features_sha256','training_rows_sha256','data_origin','evaluation_examples_used_for_training','hint_assisted_episodes_used_for_training']);
 for(const key of ['trainer_sha256','features_sha256','training_rows_sha256',...(Object.hasOwn(p,'fitter_sha256')?['fitter_sha256']:[])])if(typeof p[key]!=='string'||!/^[0-9a-f]{64}$/.test(p[key]))throw Error('Invalid model provenance digest');
 if(!featuresSHA256||p.features_sha256!==featuresSHA256)throw Error('Model feature implementation mismatch');
 if(p.evaluation_examples_used_for_training!==0||p.hint_assisted_episodes_used_for_training!==0||typeof p.data_origin!=='string'||p.data_origin.length>256)throw Error('Invalid model fitting provenance');
 const t=exact(m.training,['epochs','examples','episodes','task_ids','action_counts']);
 if(t.epochs!==48||!Number.isSafeInteger(t.examples)||t.examples<1||t.examples>24000||!Number.isSafeInteger(t.episodes)||t.episodes<1||t.episodes>200||t.episodes>t.examples)throw Error('Invalid training counts');
 const ids=COUNTERMODEL_MISSIONS.filter(m=>!EVALUATION_MISSIONS.includes(m.id)).map(m=>m.id);
 // Compare with the actual registered training IDs, not client-provided splits.
 if(!Array.isArray(t.task_ids)||!t.task_ids.length||t.task_ids.length>4||new Set(t.task_ids).size!==t.task_ids.length||t.task_ids.some(id=>!ids.includes(id)))throw Error('Training family firewall mismatch');
 if(!Array.isArray(t.action_counts)||t.action_counts.length!==SEARCH_ACTIONS.length||t.action_counts.some(x=>!Number.isSafeInteger(x)||x<0)||t.action_counts.reduce((a,b)=>a+b,0)!==t.examples)throw Error('Invalid training action counts');
 if(!Array.isArray(m.weights)||m.weights.length!==SEARCH_ACTIONS.length||m.weights.some(row=>!Array.isArray(row)||row.length!==SEARCH_DIMENSION||row.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>100)))throw Error('Invalid bounded model weights');
 if(!Array.isArray(m.limitations)||m.limitations.length>8||m.limitations.some(s=>typeof s!=='string'||s.length>256))throw Error('Invalid model scope');
 const {model_digest_sha256,...body}=m;
 if(typeof model_digest_sha256!=='string'||model_digest_sha256!==await shaText(JSON.stringify(body)))throw Error('Model integrity digest mismatch');
 return m;
}
