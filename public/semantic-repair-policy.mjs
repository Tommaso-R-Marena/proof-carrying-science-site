// Browser-safe untrusted feature extractor shared by real model training and inference.
// Never queries a truth oracle, classifier output alone never grants authority.
export const POLICY_DIM=384;
function hashFeature(str){let h=2166136261;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);return h>>>0;}
function ops(formula,out={}){
 out[formula.op]=(out[formula.op]||0)+1;
 switch(formula.op){
  case 'not':case 'forall':case 'exists':ops(formula.f,out);break;
  case 'and':case 'or':case 'imp':ops(formula.a,out);ops(formula.b,out);break;
 }
 return out;
}
const OPCODES=['forall','exists','not','and','or','imp','pred','rel','eq'];
function names(formula,out=[]){
 if(formula.op==='pred'||formula.op==='rel')out.push(formula.name);
 else if(formula.f)names(formula.f,out);
 else if(formula.a){names(formula.a,out);names(formula.b,out);}
 return out;
}
function bagFeatures(task,current,move){
 const first=ops(task.source),before=ops(current),after=ops(move.formula);
 const features=['bias','edit:'+move.operation,'before:'+move.before.op,'after:'+move.after.op,
  'edit-before:'+move.operation+':'+move.before.op,'src-root:'+task.source.op,
  'candidate-root:'+current.op,'path-depth:'+Math.min(5,move.path.length),
  'path-last:'+(move.path.at(-1)||'root'),
  'edit-root:'+move.operation+':'+current.op,
  'root-after:'+move.formula.op,
  'target-same-text:'+(JSON.stringify(move.formula)===JSON.stringify(task.source)),
  'source-pred-count:'+names(task.source).length,
  'candidate-pred-count:'+names(current).length];
 const parent=move.path.slice(0,-1).reduce((o,k)=>o[k],current);
 features.push('parent:'+parent.op);
 for(const op of OPCODES){
  const dist0=(before[op]||0)-(first[op]||0),dist1=(after[op]||0)-(first[op]||0);
  const clamp=n=>Math.max(-3,Math.min(3,n));
  features.push('src-cand-delta:'+op+':'+clamp(dist0));
  features.push('post-src-delta:'+op+':'+clamp(dist1));
  features.push('delta-improved:'+op+':'+Math.sign(Math.abs(dist0)-Math.abs(dist1)));
 }
 return features;
}
/** Features are derived only from the prompt and candidate edit, never checker labels. */
export function repairFeatures(task,current,move){
 const entries=new Map();
 for(const token of bagFeatures(task,current,move)){
  const k=hashFeature(token)%POLICY_DIM;
  entries.set(k,(entries.get(k)||0)+1);
 }
 const norm=Math.sqrt([...entries.values()].reduce((a,b)=>a+b*b,0))||1;
 return [...entries].sort((a,b)=>a[0]-b[0]).map(([index,value])=>[index,value/norm]);
}
export function dot(weights,vec){let s=0;for(const [idx,val] of vec)s+=weights[idx]*val;return s;}
export function diffVec(a,b){let map=new Map();for(const [i,v] of a)map.set(i,(map.get(i)||0)+v);
 for(const [i,v] of b)map.set(i,(map.get(i)||0)-v);
 return [...map].filter(([,v])=>v!==0);
}

/** A numerical ranker proposes edits before any checker call. ALL scores are untrusted. */
export function rankRepairMoves(model,task,current,listRepairMoves,{limit=160}={}){
 if(!model||!Array.isArray(model.weights)||model.weights.length!==POLICY_DIM||
    model.weights.some(x=>typeof x!=='number'||!Number.isFinite(x)))throw Error('Invalid untrusted model weights');
 const moves=listRepairMoves(task.id,current,limit);
 return moves.map((move,index)=>({...move,original_index:index,
   learned_score:dot(model.weights,repairFeatures(task,current,move))}))
   .sort((a,b)=>b.learned_score-a.learned_score||a.original_index-b.original_index);
}
