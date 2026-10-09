import {countermodelMission,validateWorld} from './countermodel-core.mjs';
export const SEARCH_POLICY_FORMAT='pcs-countermodel-behavior-policy-v1';
export const SEARCH_ACTIONS=Object.freeze([{type:'add'},{type:'remove'},{type:'check'},
 ...['P','Q'].flatMap(p=>Array.from({length:3},(_,i)=>({type:'toggle',p,i}))),
 ...Array.from({length:9},(_,k)=>({type:'toggle_relation',i:Math.floor(k/3),j:k%3}))]);
export const SEARCH_DIMENSION=27;
export const actionKey=a=>JSON.stringify(a.type==='toggle'?{type:a.type,p:a.p,i:a.i}:a.type==='toggle_relation'?{type:a.type,i:a.i,j:a.j}:{type:a.type});
function operatorCounts(ast){
 const counts={forall:0,exists:0,not:0,imp:0};
 function visit(n){if(Object.hasOwn(counts,n.op))counts[n.op]++;for(const key of ['a','b','f'])if(n[key])visit(n[key]);}visit(ast);return counts;
}
// Only facts available BEFORE a move. No outcome, reward, target labels or hints.
export function searchFeatures(missionId,world,feedbackExposed){
 const mission=countermodelMission(missionId);if(!mission)throw Error('Unknown search mission');validateWorld(world);
 const a=operatorCounts(mission.a),b=operatorCounts(mission.b);
 return [1,world.n/3,mission.kind==='relation'?1:0,...['forall','exists','not','imp'].flatMap(op=>[a[op]/3,b[op]/3]),
  ...['P','Q'].flatMap(p=>Array.from({length:3},(_,i)=>world[p][i]?1:0)),
  ...Array.from({length:9},(_,k)=>world.R[Math.floor(k/3)]?.[k%3]?1:0),feedbackExposed?1:0];
}
export function legalSearchActions(missionId,world){
 const m=countermodelMission(missionId);if(!m)throw Error('Unknown mission');validateWorld(world);
 return SEARCH_ACTIONS.map((action,index)=>({action,index})).filter(({action:a})=>
  a.type==='check'||a.type==='add'&&world.n<3||a.type==='remove'&&world.n>1||
  a.type==='toggle'&&m.kind==='unary'&&a.i<world.n||
  a.type==='toggle_relation'&&m.kind==='relation'&&a.i<world.n&&a.j<world.n);
}
export function rankSearchActions(model,missionId,world,feedbackExposed=false){
 if(model?.format!==SEARCH_POLICY_FORMAT||model.authority!=='NONE_UNTRUSTED_BEHAVIOR_CLONING'||
  !Array.isArray(model.weights)||model.weights.length!==SEARCH_ACTIONS.length||
  model.weights.some(w=>!Array.isArray(w)||w.length!==SEARCH_DIMENSION||w.some(x=>!Number.isFinite(x))))throw Error('Invalid untrusted search model');
 const features=searchFeatures(missionId,world,feedbackExposed);
 return legalSearchActions(missionId,world).map(({action,index})=>({action,index,
  score:model.weights[index].reduce((sum,w,j)=>sum+w*features[j],0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
}
