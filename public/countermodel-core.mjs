// PCS Countermodel Lab v1. Exact finite first-order MODEL CHECKING, not Lean elaboration.
// Deliberately bounded: an openly specified deterministic checker over Fin(n) valuations.
export const COUNTERMODEL_VERSION='pcs-countermodel-lab-v1';
export const MAX_ENTITIES=3, MAX_MOVES=120;
const atom=(p,x='x')=>({op:'pred',p,x});
const rel=(x='x',y='y')=>({op:'rel',x,y});
const all=(x,f)=>({op:'forall',x,f});
const any=(x,f)=>({op:'exists',x,f});
const not=f=>({op:'not',f});
const and=(a,b)=>({op:'and',a,b});
const or=(a,b)=>({op:'or',a,b});
const imp=(a,b)=>({op:'imp',a,b});
const tasks=[
 {id:'quantifier-switch',name:'The One-Example Trap',tier:1,kind:'unary',skill:'universal vs existential',
  story:'A proposal quietly changed “every” to “at least one.” Find a tiny world where the meanings disagree.',
  left:'∀ x : Agent, P x → Q x',right:'∃ x : Agent, P x → Q x',
  a:all('x',imp(atom('P'),atom('Q'))),b:any('x',imp(atom('P'),atom('Q')))},
 {id:'negation-drop',name:'The Vanishing NOT',tier:1,kind:'unary',skill:'polarity and negation',
  story:'A safety condition lost its negation. Configure agents to demonstrate why this matters.',
  left:'∀ x : Agent, P x → ¬ Q x',right:'∀ x : Agent, P x → Q x',
  a:all('x',imp(atom('P'),not(atom('Q')))),b:all('x',imp(atom('P'),atom('Q')))},
 {id:'implication-flip',name:'Cause & Consequence',tier:2,kind:'unary',skill:'implication direction',
  story:'“P implies Q” got reversed. An intuitive reading can miss the difference.',
  left:'∀ x : Agent, P x → Q x',right:'∀ x : Agent, Q x → P x',
  a:all('x',imp(atom('P'),atom('Q'))),b:all('x',imp(atom('Q'),atom('P')))},
 {id:'connective-swap',name:'The AND/OR Saboteur',tier:2,kind:'unary',skill:'conjunction vs disjunction',
  story:'A translation weakened a joint requirement into an alternative. Show a counterexample.',
  left:'∃ x : Agent, P x ∧ Q x',right:'∃ x : Agent, P x ∨ Q x',
  a:any('x',and(atom('P'),atom('Q'))),b:any('x',or(atom('P'),atom('Q')))},
 {id:'assumption-loss',name:'The Missing Premise',tier:2,kind:'unary',skill:'hypothesis preservation',
  story:'An implication was mistaken for an unconditional guarantee.',
  left:'∀ x : Agent, P x → Q x',right:'∀ x : Agent, Q x',
  a:all('x',imp(atom('P'),atom('Q'))),b:all('x',atom('Q'))},
 {id:'quantifier-scope',name:'One Witness for Everyone?',tier:3,kind:'relation',skill:'quantifier scope',
  story:'“Everyone has someone” is not “There is one person for everyone.” Build the smallest countermodel.',
  left:'∀ x : Agent, ∃ y : Agent, R x y',right:'∃ y : Agent, ∀ x : Agent, R x y',
  a:all('x',any('y',rel())),b:any('y',all('x',rel()))},
 {id:'variable-capture',name:'The Shadow Variable',tier:3,kind:'relation',skill:'variable capture / binding',
  story:'The proposed translation accidentally replaces “some y” with the current x.',
  left:'∀ x : Agent, ∃ y : Agent, R x y',right:'∀ x : Agent, R x x',
  a:all('x',any('y',rel())),b:all('x',rel('x','x'))},
];
export const COUNTERMODEL_MISSIONS=Object.freeze(tasks.map(x=>Object.freeze(x)));
export function publicCountermodelMissions(){return tasks.map(({id,name,tier,kind,skill,story,left,right})=>({id,name,tier,kind,skill,story,left,right,version:COUNTERMODEL_VERSION,authority:'FINITE_MODEL_ONLY'}));}
export function countermodelMission(id){return tasks.find(x=>x.id===id)||null;}
const bool=x=>typeof x==='boolean';
export function initialWorld(n=1){if(!Number.isInteger(n)||n<1||n>MAX_ENTITIES)throw Error('Invalid finite domain size');return {n,P:Array(n).fill(false),Q:Array(n).fill(false),R:Array.from({length:n},()=>Array(n).fill(false))};}
export function validateWorld(w){
 if(!w||typeof w!=='object'||Array.isArray(w)||Object.keys(w).sort().join(',')!=='P,Q,R,n')throw Error('Invalid world fields');
 if(!Number.isInteger(w.n)||w.n<1||w.n>MAX_ENTITIES)throw Error('Finite domain must contain 1–3 entities');
 if(!Array.isArray(w.P)||!Array.isArray(w.Q)||!Array.isArray(w.R)||w.P.length!==w.n||w.Q.length!==w.n||w.R.length!==w.n||!w.P.every(bool)||!w.Q.every(bool)||!w.R.every(row=>Array.isArray(row)&&row.length===w.n&&row.every(bool)))throw Error('Malformed predicate interpretation');
 return w;
}
function interpret(node,w,env={},depth=0){
 if(depth>20)throw Error('Formula nesting exceeds supported fragment');
 switch(node.op){
 case 'pred':{const i=env[node.x];if(!Number.isInteger(i)||i<0||i>=w.n||!['P','Q'].includes(node.p))throw Error('Unbound predicate');return w[node.p][i];}
 case 'rel':{const i=env[node.x],j=env[node.y];if(!Number.isInteger(i)||!Number.isInteger(j)||i<0||j<0||i>=w.n||j>=w.n)throw Error('Unbound relation');return w.R[i][j];}
 case 'not':return !interpret(node.f,w,env,depth+1);
 case 'and':return interpret(node.a,w,env,depth+1)&&interpret(node.b,w,env,depth+1);
 case 'or':return interpret(node.a,w,env,depth+1)||interpret(node.b,w,env,depth+1);
 case 'imp':return !interpret(node.a,w,env,depth+1)||interpret(node.b,w,env,depth+1);
 case 'forall':for(let i=0;i<w.n;i++){if(!interpret(node.f,w,{...env,[node.x]:i},depth+1))return false;}return true;
 case 'exists':for(let i=0;i<w.n;i++){if(interpret(node.f,w,{...env,[node.x]:i},depth+1))return true;}return false;
 default:throw Error('Unsupported AST node');
 }
}
export function countermodelVerdict(id,w){const m=countermodelMission(id);if(!m)throw Error('Unknown mission');validateWorld(w);const left=interpret(m.a,w),right=interpret(m.b,w);return {left,right,counterexample:left!==right};}
function worldForMask(n,mask,kind){const w=initialWorld(n);let bit=0;for(let i=0;i<n;i++)for(const p of ['P','Q']){w[p][i]=Boolean(mask & (1<<bit++));}if(kind==='relation')for(let i=0;i<n;i++)for(let j=0;j<n;j++)w.R[i][j]=Boolean(mask & (1<<bit++));return w;}
export function findMinimalCountermodel(id){const m=countermodelMission(id);if(!m)throw Error('Unknown mission');for(let n=1;n<=MAX_ENTITIES;n++){const bits=2*n+(m.kind==='relation'?n*n:0);for(let mask=0;mask<2**bits;mask++){const w=worldForMask(n,mask,m.kind);if(countermodelVerdict(id,w).counterexample)return {n,w,enumerated:true};}}return null;}
// The server replays every action. Scores, checker verdicts and trajectory labels are not client-supplied.
export function replayCountermodelSession(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='actions,mission_id,version')throw Error('Unexpected session fields');
 if(input.version!==COUNTERMODEL_VERSION)throw Error('Unsupported game version');
 const m=countermodelMission(input.mission_id);if(!m)throw Error('Unknown mission');
 if(!Array.isArray(input.actions)||input.actions.length<1||input.actions.length>MAX_MOVES)throw Error('Invalid action trajectory length');
 let w=initialWorld(),checks=0,hints=0,firstSuccess=null,feedbackSeen=false;const steps=[];let edits=0;
 for(let k=0;k<input.actions.length;k++){
  const a=input.actions[k];if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.type!=='string')throw Error('Invalid move');
  const stateBefore=structuredClone(w),feedbackBefore=feedbackSeen,hintsBefore=hints;
  const keys=Object.keys(a).sort().join(',');const before=countermodelVerdict(m.id,w);
  let reward=0,kind='edit';
  if(a.type==='add'&&keys==='type'){if(w.n>=MAX_ENTITIES)throw Error('Maximum agents reached');const old=w;w=initialWorld(old.n+1);w.P=old.P.concat(false);w.Q=old.Q.concat(false);for(let i=0;i<old.n;i++)for(let j=0;j<old.n;j++)w.R[i][j]=old.R[i][j];edits++;}
  else if(a.type==='remove'&&keys==='type'){if(w.n<=1)throw Error('At least one agent required');w={n:w.n-1,P:w.P.slice(0,-1),Q:w.Q.slice(0,-1),R:w.R.slice(0,-1).map(r=>r.slice(0,-1))};edits++;}
  else if(a.type==='toggle'&&keys==='i,p,type'&&m.kind==='unary'){
   if(!['P','Q'].includes(a.p)||!Number.isInteger(a.i)||a.i<0||a.i>=w.n)throw Error('Invalid unary toggle');w[a.p][a.i]=!w[a.p][a.i];edits++;
  }else if(a.type==='toggle_relation'&&keys==='i,j,type'&&m.kind==='relation'){
   if(!Number.isInteger(a.i)||!Number.isInteger(a.j)||a.i<0||a.j<0||a.i>=w.n||a.j>=w.n)throw Error('Invalid relation toggle');w.R[a.i][a.j]=!w.R[a.i][a.j];edits++;
  }else if(a.type==='hint'&&keys==='type'){if(hints>=3)throw Error('Maximum hints reached');hints++;feedbackSeen=true;kind='hint';}
  else if(a.type==='check'&&keys==='type'){
    checks++;kind='check';const verdict=countermodelVerdict(m.id,w);
    reward=verdict.counterexample?(firstSuccess===null?10:-2):-1;
    if(verdict.counterexample&&firstSuccess===null)firstSuccess=k;
    feedbackSeen=true;
  }else throw Error('Unknown or unavailable action');
  const after=countermodelVerdict(m.id,w);
  steps.push({index:k,action:{...a},state_before:stateBefore,world:structuredClone(w),domain_size:w.n,source_true:after.left,proposal_true:after.right,
   counterexample:after.counterexample,checker_feedback_before_action:feedbackBefore,checker_feedback_exposed:feedbackSeen,
   received_checker_response:kind==='check',assisted_before_action:hintsBefore>0,assisted:hints>0,reward});
 }
 if(checks<1)throw Error('At least one independent check is required');
 const v=countermodelVerdict(m.id,w),solved=firstSuccess!==null;
 const minimum=findMinimalCountermodel(m.id)?.n??null;
 const lastCheck=[...steps].reverse().find(x=>x.received_checker_response);
 const finalVerified=Boolean(lastCheck?.counterexample)&&lastCheck.index===steps.length-1;
 const score=finalVerified?Math.max(1,120-20*(w.n-minimum)-2*hints-Math.max(0,checks-1)*2-Math.floor(edits/5)):0;
 return {format:'pcs-countermodel-verified-finite-session-v1',version:COUNTERMODEL_VERSION,mission_id:m.id,
  checker:'EXHAUSTIVE_FINITE_FOL_MODEL',lean_kernel_checked:false,pcs_authoritative:false,
  scope:'finite nonempty domains of cardinality 1–3 with explicit Boolean interpretations',
  final_world:structuredClone(w),final_verdict:v,minimum_domain_size:minimum,
  steps,checks,hints,edits,solved,final_verified:finalVerified,score,
  training_use:'replay-checked finite-model search choices only; model suggestions and human independence unverified'};
}

// Export a concrete Lean 4 proof obligation, never a forged success certificate.
// The generated source must be compiled and kernel-checked on an independent Lean host.
function leanFormula(node){
 switch(node.op){
 case 'pred':return `${node.p} ${node.x}`;
 case 'rel':return `R ${node.x} ${node.y}`;
 case 'not':return `(¬ ${leanFormula(node.f)})`;
 case 'and':return `(${leanFormula(node.a)} ∧ ${leanFormula(node.b)})`;
 case 'or':return `(${leanFormula(node.a)} ∨ ${leanFormula(node.b)})`;
 case 'imp':return `(${leanFormula(node.a)} → ${leanFormula(node.b)})`;
 case 'forall':return `(∀ ${node.x} : Agent, ${leanFormula(node.f)})`;
 case 'exists':return `(∃ ${node.x} : Agent, ${leanFormula(node.f)})`;
 default:throw Error('Unsupported Lean formula');
 }
}
export function exportLeanCountermodel(missionId,world){
 const mission=countermodelMission(missionId);if(!mission)throw Error('Unknown mission');validateWorld(world);
 const result=countermodelVerdict(missionId,world);if(!result.counterexample)throw Error('Only actual checked countermodels can be exported');
 const disjunction=(terms)=>terms.length?terms.map(t=>`(${t})`).join(' ∨ '):'False';
 const pred=(p)=>`abbrev ${p} (x : Agent) : Prop := ${disjunction(world[p].flatMap((v,i)=>v?[`x = (${i} : Agent)`]:[]))}`;
 const r=[];for(let i=0;i<world.n;i++)for(let j=0;j<world.n;j++)if(world.R[i][j])r.push(`(x = (${i} : Agent) ∧ y = (${j} : Agent))`);
 const text=[
  '-- PCS Arena Countermodel Lab · deterministic generated Lean source',
  '-- Run: lean thisfile.lean   (using PCS pinned leanprover/lean4:v4.28.0)',
  '-- This is not a signed PCS authority receipt, nor a proof about a real deployed agent.',
  'import Std',
  'namespace PCSArenaCountermodel',
  `abbrev Agent := Fin ${world.n}`,
  pred('P'),pred('Q'),`abbrev R (x y : Agent) : Prop := ${disjunction(r)}`,
  `theorem exhibited_meaning_difference : ¬ (${leanFormula(mission.a)} ↔ ${leanFormula(mission.b)}) := by`,
  '  decide',
  'end PCSArenaCountermodel',''
 ].join('\n');
 return {file_name:`PCS_Countermodel_${mission.id.replace(/[^a-z0-9-]/g,'_')}.lean`,
  lean_source:text,verified_finite_model:true,lean_kernel_checked:false,pcs_authoritative:false};
}
