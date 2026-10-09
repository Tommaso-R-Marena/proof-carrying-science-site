// Independent browser implementation: partial witness screening cannot accept.
import {exact,integer,canonical,digest,validateTask,actions,applyAction,features,distance,actionId,check} from './omega-core.mjs';
const clone=x=>structuredClone(x),compare=(a,b)=>a<b?-1:a>b?1:0;
export function nonlinearFeatures(t,a){const next=applyAction(t.candidate,a,t.variables),before=distance(t.source,t.candidate),after=distance(t.source,next);return [...features(t,a,'graph'),before/63,after/63,(before-after)/63,Number(canonical(next)===canonical(t.source))];}
export function predictNonlinear(xs,m){const hidden=m.input_weights.map((row,j)=>Math.tanh(row.reduce((s,w,i)=>s+w*xs[i],0)+m.hidden_bias[j]));return hidden.reduce((s,h,i)=>s+h*m.output_weights[i],0)+m.output_bias;}
export async function validateNonlinear(m){
 exact(m,['format','dimension','hidden','input_weights','hidden_bias','output_weights','output_bias','training','authority','model_sha256']);
 if(m.format!=='pcs-omega-nonlinear-v2'||m.dimension!==95||m.hidden!==12||m.authority!=='NONE')throw Error('Unsupported nonlinear model');
 const weights=(v,n)=>{if(!Array.isArray(v)||v.length!==n||v.some(w=>typeof w!=='number'||!Number.isFinite(w)||Math.abs(w)>100))throw Error('Invalid nonlinear weights');};
 if(!Array.isArray(m.input_weights)||m.input_weights.length!==12)throw Error('Invalid input layer');for(const row of m.input_weights)weights(row,95);weights(m.hidden_bias,12);weights(m.output_weights,12);weights([m.output_bias],1);
 const meta=exact(m.training,['algorithm','seed','epochs','examples','task_ids','task_digests','families','corpus_sha256','source_digest']);
 if(meta.algorithm!=='syntax-MLP-weighted-logistic-SGD')throw Error('Unsupported nonlinear trainer');integer(meta.seed,0,2**32-1);integer(meta.epochs,1,100);integer(meta.examples,1,131072);
 for(const key of ['task_ids','task_digests','families'])if(!Array.isArray(meta[key])||meta[key].length<1||meta[key].length>1024||meta[key].some(v=>typeof v!=='string'||v.length<1||v.length>128)||new Set(meta[key]).size!==meta[key].length)throw Error('Invalid training bindings');
 if(meta.task_ids.length!==meta.task_digests.length||[...meta.task_digests,meta.corpus_sha256,meta.source_digest].some(v=>typeof v!=='string'||!/^[0-9a-f]{64}$/.test(v)))throw Error('Invalid training digest');
 const {model_sha256,...core}=m;if(model_sha256!==await digest(core))throw Error('Nonlinear checkpoint digest mismatch');return m;
}
function evaluate(f,a){switch(f.op){case 'atom':return a[f.symbol];case 'true':return true;case 'false':return false;case 'not':return !evaluate(f.body,a);case 'and':return evaluate(f.left,a)&&evaluate(f.right,a);case 'or':return evaluate(f.left,a)||evaluate(f.right,a);case 'implies':return !evaluate(f.left,a)||evaluate(f.right,a);default:throw Error('Unsupported operator');}}
export async function adaptiveSearch(input,{model=null,checks=8,depth=3,proposals=128,onProgress=()=>{}}={}){
 const t=clone(validateTask(input));integer(checks,1,128);integer(depth,1,4);integer(proposals,1,1024);
 model=model?clone(model):null;if(model)await validateNonlinear(model);
 const initial=await check(t),witnesses=initial.equivalent?[]:[initial.counterexample.assignment],attempts=[],frontier=[],seen=new Set([canonical(t.candidate)]);
 let used=1,screened=0,solution=initial.equivalent?{candidate:clone(t.candidate),receipt:initial}:null;
 async function expand(formula,level){
  if(level>=depth)return;const current={...t,candidate:formula},parent=await digest(formula);
  for(const action of actions(formula,t.variables)){const candidate=applyAction(formula,action,t.variables),score=model?predictNonlinear(nonlinearFeatures(current,action),model):0;
   frontier.push({priority:distance(t.source,candidate)-score,depth:level+1,id:actionId(action),parent,action,candidate});}
  frontier.sort((a,b)=>a.priority-b.priority||a.depth-b.depth||compare(a.id,b.id)||compare(a.parent,b.parent));
 }
 if(!solution)await expand(t.candidate,0);
 while(frontier.length&&used<checks&&attempts.length<proposals&&!solution){
  const next=frontier.shift(),key=canonical(next.candidate);if(seen.has(key))continue;seen.add(key);
  let failure=null,receipt=null;
  for(const a of witnesses){screened++;if(evaluate(t.source,a)!==evaluate(next.candidate,a)){failure=clone(a);break;}}
  if(!failure){receipt=await check({...t,candidate:next.candidate});used++;if(receipt.equivalent)solution={candidate:next.candidate,receipt};else if(!witnesses.some(a=>canonical(a)===canonical(receipt.counterexample.assignment)))witnesses.push(receipt.counterexample.assignment);}
  attempts.push({parent_sha256:next.parent,action:next.action,candidate:next.candidate,depth:next.depth,rejected_by_witness:failure,receipt});
  if(!solution)await expand(next.candidate,next.depth);
  if(attempts.length%8===0){onProgress({checks:used,proposals:attempts.length,witnesses:witnesses.length});await new Promise(resolve=>setTimeout(resolve,0));}
 }
 const result={format:'pcs-omega-adaptive-episode-v2',original_task:t,model_sha256:model?model.model_sha256:null,budget:{checks,depth,proposals},initial_receipt:initial,attempts,checks_used:used,witness_evaluations:screened,solution,status:solution?'BOOLEAN_VERIFIED':'BUDGET_OR_SEARCH_EXHAUSTED',pcs_authority:false,lean_kernel_checked:false};return {...result,episode_sha256:await digest(result)};
}
export async function replayAdaptive(e){
 exact(e,['format','original_task','model_sha256','budget','initial_receipt','attempts','checks_used','witness_evaluations','solution','status','pcs_authority','lean_kernel_checked','episode_sha256']);
 if(e.format!=='pcs-omega-adaptive-episode-v2'||e.pcs_authority!==false||e.lean_kernel_checked!==false||e.model_sha256!==null&&(typeof e.model_sha256!=='string'||!/^[0-9a-f]{64}$/.test(e.model_sha256)))throw Error('Invalid adaptive authority or checkpoint');
 const t=validateTask(e.original_task),b=exact(e.budget,['checks','depth','proposals']);integer(b.checks,1,128);integer(b.depth,1,4);integer(b.proposals,1,1024);
 const initial=await check(t);if(canonical(initial)!==canonical(e.initial_receipt))throw Error('Forged initial receipt');if(!Array.isArray(e.attempts)||e.attempts.length>b.proposals)throw Error('Proposal budget exceeded');
 const states=new Map([[await digest(t.candidate),[t.candidate,0]]]),witnesses=initial.equivalent?[]:[initial.counterexample.assignment];let used=1,screened=0,solution=initial.equivalent?{candidate:t.candidate,receipt:initial}:null;
 for(const row of e.attempts){
  exact(row,['parent_sha256','action','candidate','depth','rejected_by_witness','receipt']);integer(row.depth,1,b.depth);
  if(solution||used>=b.checks||!states.has(row.parent_sha256))throw Error('Invalid or terminated transition');
  const [parent,level]=states.get(row.parent_sha256),candidate=applyAction(parent,row.action,t.variables),key=await digest(candidate);
  if(canonical(candidate)!==canonical(row.candidate)||states.has(key)||row.depth!==level+1)throw Error('Forged repair');states.set(key,[candidate,level+1]);
  let failure=null;for(const a of witnesses){screened++;if(evaluate(t.source,a)!==evaluate(candidate,a)){failure=a;break;}}
  if(canonical(failure)!==canonical(row.rejected_by_witness))throw Error('Forged partial evaluation');
  if(!failure){const receipt=await check({...t,candidate});used++;if(canonical(receipt)!==canonical(row.receipt))throw Error('Forged full check');if(receipt.equivalent)solution={candidate,receipt};else if(!witnesses.some(a=>canonical(a)===canonical(receipt.counterexample.assignment)))witnesses.push(receipt.counterexample.assignment);}
  else if(row.receipt!==null)throw Error('Witness rejection cannot claim a full check');
 }
 integer(e.checks_used,1,b.checks);integer(e.witness_evaluations,0,16384);
 if(used!==e.checks_used||screened!==e.witness_evaluations||canonical(solution)!==canonical(e.solution)||e.status!==(solution?'BOOLEAN_VERIFIED':'BUDGET_OR_SEARCH_EXHAUSTED'))throw Error('Forged result or work accounting');
 const {episode_sha256,...core}=e;if(episode_sha256!==await digest(core))throw Error('Episode digest mismatch');return true;
}
