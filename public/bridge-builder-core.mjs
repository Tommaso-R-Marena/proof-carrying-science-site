import catalog from './bridge-builder-catalog.mjs';
export const VERSION='pcs-bridge-builder-v1';
export const CATALOG=catalog;
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys.sort().join(',');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function mission(id,selected=catalog){const m=selected.missions.find(x=>x.id===id);if(!m)throw Error('Unknown bridge mission');return m;}
export function createSession(id,selected=catalog){mission(id,selected);return {format:'pcs-bridge-session-v1',version:VERSION,catalog_sha256:selected.content_sha256,mission_id:id,events:[]};}
export function replay(session,selected=catalog){
 if(!exact(session,['format','version','catalog_sha256','mission_id','events'])||session.format!=='pcs-bridge-session-v1'||session.version!==VERSION||session.catalog_sha256!==selected.content_sha256||!Array.isArray(session.events)||session.events.length>120)throw Error('Unsupported or changed bridge session');
 const m=mission(session.mission_id,selected);let current=m.start,stack=[current],last=-1,hints=0,invalid=0;const transitions=[];
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
 return {format:'pcs-bridge-replay-v1',mission_id:m.id,catalog_sha256:selected.content_sha256,goal_sha256:m.goal_sha256,
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

// Practice estimates are from replayed catalog transitions in this tab. They never grant account skills.
export function curriculum(selected,sessions=[]){
 if(!selected||!Array.isArray(selected.missions)||!Array.isArray(sessions)||sessions.length>40)throw Error('Invalid bounded practice history');
 const progress=new Map();
 for(const session of sessions){const r=replay(session,selected);if(!r.completed)continue;
  const score={hint_events:r.hints,invalid_actions:r.invalid_attempts,undo_events:session.events.filter(e=>e.kind==='undo').length};
  const previous=progress.get(r.mission_id);if(!previous||score.hint_events+score.invalid_actions<previous.hint_events+previous.invalid_actions)progress.set(r.mission_id,score);
 }
 const levels=selected.missions.map((m,index)=>{const paths=m.receipts.map(r=>Math.max(0,r.actions.length-m.automatic_setup_actions.length));const actions=Math.min(...paths);const induction=m.receipts.some(r=>r.actions.some(a=>['induct_list','induct_nat'].includes(a.kind)));return {id:m.id,index,minimum_checked_actions:actions,uses_induction:induction,difficulty:induction?'induction':actions>3?'multiple steps':'first bridges',completion:progress.get(m.id)||null};});
 const ordered=[...levels].sort((a,b)=>Number(a.uses_induction)-Number(b.uses_induction)||a.minimum_checked_actions-b.minimum_checked_actions||a.index-b.index);
 const next=ordered.find(m=>!m.completion)||ordered.find(m=>m.completion.hint_events>0)||ordered[0];
 return {format:'pcs-tab-practice-curriculum-v1',missions:levels,recommended_mission_id:next?.id||null,completed_missions:progress.size,reason:ordered.some(m=>!m.completion)?'Try an unfinished crossing, progressing from matching facts to longer proofs and induction.':'Replay a crossing without a hint, or choose any challenge you enjoy.',authority:'Archived Lean-state replay only; no verified account skill or training authorization.',storage:'This tab only; no automatic research collection.'};
}
