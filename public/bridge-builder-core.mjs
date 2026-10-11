import catalog from './bridge-builder-catalog.mjs';
export const VERSION='pcs-bridge-builder-v1';
export const CATALOG=catalog;
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys.sort().join(',');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function mission(id){const m=catalog.missions.find(x=>x.id===id);if(!m)throw Error('Unknown bridge mission');return m;}
export function createSession(id){mission(id);return {format:'pcs-bridge-session-v1',version:VERSION,catalog_sha256:catalog.content_sha256,mission_id:id,events:[]};}
export function replay(session){
 if(!exact(session,['format','version','catalog_sha256','mission_id','events'])||session.format!=='pcs-bridge-session-v1'||session.version!==VERSION||session.catalog_sha256!==catalog.content_sha256||!Array.isArray(session.events)||session.events.length>120)throw Error('Unsupported or changed bridge session');
 const m=mission(session.mission_id);let current=m.start,stack=[current],last=-1,hints=0,invalid=0;const transitions=[];
 for(const [index,event] of session.events.entries()){
  if(!exact(event,['kind','node','edge','sequence'])||!['choose','undo','hint'].includes(event.kind)||!Number.isSafeInteger(event.sequence)||event.sequence!==index||event.node!==current)throw Error('Invalid event or reordered history');
  last=event.sequence;
  if(event.kind==='undo'){if(event.edge!==null||stack.length<2)throw Error('Invalid undo');stack.pop();current=stack.at(-1);continue;}
  if(event.kind==='hint'){if(event.edge!==null||!m.nodes[current].state.goals.length)throw Error('Invalid hint');hints++;continue;}
  if(!Number.isSafeInteger(event.edge)||event.edge<0||event.edge>=m.nodes[current].edges.length)throw Error('Invalid proof choice');
  const edge=m.nodes[current].edges[event.edge];
  transitions.push({state_sha256:m.nodes[current].state_sha256,action:edge.action,status:edge.status,hint_exposed:hints>0,node:current});
  if(edge.status==='invalid'){invalid++;continue;}
  if(!edge.next||!m.nodes[edge.next])throw Error('Missing checked transition');
  current=edge.next;stack.push(current);
 }
 const node=m.nodes[current],completed=node.receipt_index!==undefined;
 return {format:'pcs-bridge-replay-v1',mission_id:m.id,catalog_sha256:catalog.content_sha256,goal_sha256:m.goal_sha256,
  current_node:current,stack,completed,hints,invalid_attempts:invalid,transitions,proof_actions:node.path,
  receipt:completed?m.receipts[node.receipt_index]:null,
  label_boundary:'Replay of archived real Lean transitions; fresh kernel replay is required before training intake.',
  automatic_training_authorization:false,pcs_authority:false};
}
export function label(action,node,premise=null){
 const local=node.state.goals[0]?.locals.find(x=>x.name===action.argument);
 const text=premise||local?.type||action.argument;
 const labels={intro:['Open the assumption','Bring the next assumption onto your board.'],constructor:['Split the delivery','Build one bridge for each part of the goal.'],assumption:['Match a fact','Ask Lean whether an existing fact directly closes this goal.'],rfl:['Check identical sides','Close an equality if both sides compute to the same expression.'],rewrite:['Use the equality',text||'Replace equal expressions.'],rewrite_back:['Reverse the equality',text||'Replace equal expressions in the other direction.'],apply:['Follow this rule',text||'Work backward from the destination.'],exact:['Deliver this fact',text||'Supply a fact with exactly the required type.'],induct_list:['Build an induction bridge','Prove the step for a shorter train, then the empty train.'],induct_nat:['Build a counting bridge','Prove the successor step and the zero case.'],normalize:['Unpack the definitions','Reduce append, length or arithmetic using a controlled set of verified identities.'],simp:['Simplify arithmetic','Use the controlled arithmetic identities.']};
 return labels[action.kind]||[action.kind,String(text||'')];
}
