// Exact, bounded world-edit search. This is not a Lean/PCS authority.
import {initialWorld,validateWorld,countermodelMission,countermodelVerdict,replayCountermodelSession} from './countermodel-core.mjs';
import {legalSearchActions,actionKey} from './countermodel-search-policy.mjs';
import {SEARCH_RULESET_SHA256,EVALUATION_MISSIONS} from './countermodel-learning.mjs';
import {verifyRuleset} from './world-builder-core.mjs';
import {exact,strictParse,shaText} from './omega-core.mjs';

export const ROUTE_FORMAT='pcs-finite-search-route-v1';
const COST='one per world edit; tests and clues excluded';
const cache=new Map(),tick=()=>new Promise(r=>setTimeout(r,0));
function mission(id){const m=countermodelMission(id);if(!m)throw Error('Unknown mission');return m;}
function width(kind,n){return kind==='unary'?2*n:n*n;}
function offset(kind,n){let k=0;for(let i=1;i<n;i++)k+=2**width(kind,i);return k;}
export function worldIndex(id,w){
 const m=mission(id);validateWorld(w);let bits=0;
 if(m.kind==='unary'){
  if(w.R.some(row=>row.some(Boolean)))throw Error('Unused relation must be false');
  for(let i=0;i<w.n;i++){if(w.P[i])bits+=2**(2*i);if(w.Q[i])bits+=2**(2*i+1);}
 }else{
  if(w.P.some(Boolean)||w.Q.some(Boolean))throw Error('Unused predicates must be false');
  for(let i=0;i<w.n;i++)for(let j=0;j<w.n;j++)if(w.R[i][j])bits+=2**(i*w.n+j);
 }
 return offset(m.kind,w.n)+bits;
}
export function worldFromIndex(id,index){
 const m=mission(id),count=offset(m.kind,4);
 if(!Number.isInteger(index)||index<0||index>=count)throw Error('World index outside the finite space');
 let n=1;while(n<3&&index>=offset(m.kind,n+1))n++;
 const bits=index-offset(m.kind,n),w=initialWorld(n);
 if(m.kind==='unary')for(let i=0;i<n;i++){w.P[i]=Boolean(bits&(1<<(2*i)));w.Q[i]=Boolean(bits&(1<<(2*i+1)));}
 else for(let i=0;i<n;i++)for(let j=0;j<n;j++)w.R[i][j]=Boolean(bits&(1<<(i*n+j)));
 return w;
}
export function editWorld(id,world,action){
 worldIndex(id,world);
 exact(action,action?.type==='toggle'?['type','p','i']:action?.type==='toggle_relation'?['type','i','j']:['type']);
 if(action.type==='check'||!legalSearchActions(id,world).some(x=>actionKey(x.action)===actionKey(action)))throw Error('Not a legal world edit');
 let w=structuredClone(world);
 if(action.type==='add'){const old=w;w=initialWorld(old.n+1);for(let i=0;i<old.n;i++){w.P[i]=old.P[i];w.Q[i]=old.Q[i];for(let j=0;j<old.n;j++)w.R[i][j]=old.R[i][j];}}
 else if(action.type==='remove')w={n:w.n-1,P:w.P.slice(0,-1),Q:w.Q.slice(0,-1),R:w.R.slice(0,-1).map(r=>r.slice(0,-1))};
 else if(action.type==='toggle')w[action.p][action.i]=!w[action.p][action.i];
 else w.R[action.i][action.j]=!w.R[action.i][action.j];
 return w;
}
async function graph(id){
 if(cache.has(id))return cache.get(id);
 const promise=(async()=>{
  const count=offset(mission(id).kind,4),edges=[],goals=[];
  for(let i=0;i<count;i++){
   const w=worldFromIndex(id,i);goals.push(countermodelVerdict(id,w).counterexample);
   edges.push(legalSearchActions(id,w).filter(x=>x.action.type!=='check').map(x=>({action:structuredClone(x.action),to:worldIndex(id,editWorld(id,w,x.action))})));
   if(i%40===39)await tick();
  }
  const graph_sha256=await shaText(JSON.stringify({mission_id:id,ruleset_sha256:SEARCH_RULESET_SHA256,edges,goals}));
  return {count,edges,goals,graph_sha256};
 })();cache.set(id,promise);try{return await promise;}catch(e){cache.delete(id);throw e;}
}
async function distances(g){
 const reverse=Array.from({length:g.count},()=>[]),d=Array(g.count).fill(-1),queue=[];
 g.edges.forEach((edges,i)=>edges.forEach(e=>reverse[e.to].push(i)));
 g.goals.forEach((goal,i)=>{if(goal){d[i]=0;queue.push(i);}});
 for(let i=0;i<queue.length;i++)for(const prev of reverse[queue[i]])if(d[prev]<0){d[prev]=d[queue[i]]+1;queue.push(prev);}
 if(d.some(n=>n<0))throw Error('The registered game has an unreachable goal');
 return d;
}
export async function routeCertificate(id,start){
 await verifyRuleset();const g=await graph(id),d=await distances(g);let i=worldIndex(id,start);const actions=[];
 while(d[i]){const edge=g.edges[i].find(e=>d[e.to]===d[i]-1);if(!edge)throw Error('Distance certificate construction failed');actions.push(structuredClone(edge.action));i=edge.to;}
 const c={format:ROUTE_FORMAT,mission_id:id,ruleset_sha256:SEARCH_RULESET_SHA256,graph_sha256:g.graph_sha256,
  cost_model:COST,state_count:g.count,start_world:structuredClone(start),potentials:d,actions,
  goal_world:worldFromIndex(id,i),minimum_edits:actions.length,lean_kernel_checked:false,pcs_authoritative:false};
 await verifyRouteCertificate(c);return c;
}
export async function verifyRouteCertificate(c){
 await verifyRuleset();
 exact(c,['format','mission_id','ruleset_sha256','graph_sha256','cost_model','state_count','start_world','potentials','actions','goal_world','minimum_edits','lean_kernel_checked','pcs_authoritative']);
 if(c.format!==ROUTE_FORMAT||c.ruleset_sha256!==SEARCH_RULESET_SHA256||c.cost_model!==COST||c.lean_kernel_checked!==false||c.pcs_authoritative!==false)throw Error('Invalid route identity or authority');
 const g=await graph(c.mission_id),d=c.potentials;
 if(c.state_count!==g.count||c.graph_sha256!==g.graph_sha256||!Array.isArray(d)||d.length!==g.count||d.some(n=>!Number.isInteger(n)||n<0||n>=g.count))throw Error('Invalid complete state potential');
 // No shortest-path search is used in this verifier. These local conditions
 // establish both a lower bound and a decreasing path from every state.
 for(let i=0;i<g.count;i++){
  if((d[i]===0)!==g.goals[i])throw Error('Goal/potential mismatch');
  if(g.edges[i].some(e=>d[i]>d[e.to]+1))throw Error('Potential permits an omitted shortcut');
  if(d[i]>0&&!g.edges[i].some(e=>d[e.to]===d[i]-1))throw Error('No descending witness for a state');
 }
 const start=worldIndex(c.mission_id,c.start_world);
 if(!Number.isInteger(c.minimum_edits)||c.minimum_edits!==d[start]||!Array.isArray(c.actions)||c.actions.length!==c.minimum_edits)throw Error('Route does not meet the lower bound');
 let w=c.start_world;for(const a of c.actions)w=editWorld(c.mission_id,w,a);
 if(worldIndex(c.mission_id,w)!==worldIndex(c.mission_id,c.goal_world)||!countermodelVerdict(c.mission_id,w).counterexample)throw Error('Route does not end in the stated counterexample');
 return {minimum_edits:c.minimum_edits,states_checked:g.count,edges_checked:g.edges.reduce((n,e)=>n+e.length,0),kernel_checked:false,pcs_authoritative:false};
}
export const readRoute=raw=>strictParse(raw,32768);
export async function analyzeSearchQuality(session){
 await verifyRuleset();const r=replayCountermodelSession(session),g=await graph(session.mission_id),d=await distances(g);let observed=null;
 const rows=r.steps.map(step=>{
  const before=d[worldIndex(session.mission_id,step.state_before)],after=d[worldIndex(session.mission_id,step.world)],cost=['check','hint'].includes(step.action.type)?0:1;
  const row={index:step.index,input:{world:step.state_before,previous_check:structuredClone(observed),assistance_seen:step.assisted_before_action},action:step.action,
   derived_labels:{remaining_edits_before:before,remaining_edits_after:after,edit_cost:cost,edit_regret:cost+after-before,counterexample:step.counterexample,response_seen:step.received_checker_response}};
  if(step.received_checker_response)observed={world:step.world,source_true:step.source_true,proposal_true:step.proposal_true};
  return row;
 });
 const initial=d[worldIndex(session.mission_id,initialWorld())],remaining=d[worldIndex(session.mission_id,r.final_world)];
 return {format:'pcs-search-quality-analysis-v1',mission_id:session.mission_id,graph_sha256:g.graph_sha256,
  split:r.hints?'assisted_excluded':EVALUATION_MISSIONS.includes(session.mission_id)?'evaluation':'training',
  final_checked_counterexample:r.final_verified,ever_checked_counterexample:r.solved,checks:r.checks,hints:r.hints,edits:r.edits,
  initial_edit_lower_bound:initial,final_remaining_edits:remaining,edit_surplus:r.edits+remaining-initial,rows,
  interpretation:'Fully informed minimum world edits, not optimal human learning or total search cost',kernel_checked:false,pcs_authoritative:false};
}
