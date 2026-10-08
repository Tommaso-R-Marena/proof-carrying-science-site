// PCS Semantic Gauntlet v1: exact, independently replayed BOUNDED finite semantics.
// No Lean execution, unbounded theorem proving, or claims of human provenance.
export const GAUNTLET_VERSION='pcs-semantic-gauntlet-v1';
export const MAX_FINITE_DOMAIN=3;
const pred=(name,x='x')=>({op:'pred',name,x});
const rel=(name='R',x='x',y='y')=>({op:'rel',name,x,y});
const eq=(x='x',y='y')=>({op:'eq',x,y});
const neg=f=>({op:'not',f});
const and=(a,b)=>({op:'and',a,b});
const or=(a,b)=>({op:'or',a,b});
const imp=(a,b)=>({op:'imp',a,b});
const all=(x,f)=>({op:'forall',x,f});
const any=(x,f)=>({op:'exists',x,f});
const FAMILIES=Object.freeze([
 {id:'universal-existential',split:'evaluation',skill:'quantifier shift',build:(p,q,r)=>[all('x',pred(p)),any('x',pred(p))]},
 {id:'existential-universal',split:'training',skill:'quantifier strength',build:(p,q,r)=>[any('x',pred(p)),all('x',pred(p))]},
 {id:'negation-drop',split:'training',skill:'polarity',build:(p,q,r)=>[all('x',imp(pred(p),neg(pred(q)))),all('x',imp(pred(p),pred(q)))]},
 {id:'implication-reversal',split:'evaluation',skill:'implication direction',build:(p,q,r)=>[all('x',imp(pred(p),pred(q))),all('x',imp(pred(q),pred(p)))]},
 {id:'conjunction-disjunction',split:'training',skill:'logical connectives',build:(p,q,r)=>[any('x',and(pred(p),pred(q))),any('x',or(pred(p),pred(q)))]},
 {id:'negated-and-or',split:'training',skill:'negation scope',build:(p,q,r)=>[neg(any('x',and(pred(p),pred(q)))),neg(any('x',or(pred(p),pred(q)))]},
 {id:'de-morgan-quantifiers',split:'evaluation',skill:'equivalence under negation',build:(p,q,r)=>[neg(all('x',pred(p))),any('x',neg(pred(p)))]},
 {id:'double-negation',split:'training',skill:'double negation',build:(p,q,r)=>[all('x',neg(neg(pred(p)))),all('x',pred(p))]},
 {id:'alpha-renaming',split:'training',skill:'binder identity',build:(p,q,r)=>[all('x',pred(p,'x')),all('y',pred(p,'y'))]},
 {id:'conjunction-commutation',split:'training',skill:'commutative conjunction',build:(p,q,r)=>[any('x',and(pred(p),pred(q))),any('x',and(pred(q),pred(p))]},
 {id:'disjunction-commutation',split:'evaluation',skill:'commutative disjunction',build:(p,q,r)=>[all('x',or(pred(p),pred(q))),all('x',or(pred(q),pred(p))]},
 {id:'relational-quantifier-scope',split:'evaluation',skill:'relational scope',build:(p,q,r)=>[all('x',any('y',rel(r))),any('y',all('x',rel(r)))]},
 {id:'diagonal-variable-capture',split:'evaluation',skill:'variable capture',build:(p,q,r)=>[all('x',any('y',rel(r))),all('x',rel(r,'x','x'))]},
 {id:'relation-reversal',split:'training',skill:'relation argument order',build:(p,q,r)=>[all('x',any('y',rel(r))),all('x',any('y',rel(r,'y','x')))]},
 {id:'assumption-loss',split:'evaluation',skill:'assumption erasure',build:(p,q,r)=>[imp(all('x',pred(p)),all('x',pred(q))),all('x',pred(q))]},
 {id:'equality-quantifier-order',split:'evaluation',skill:'equality and scope',build:(p,q,r)=>[all('x',any('y',eq())),any('x',all('y',eq()))]},
 {id:'self-equality-negated',split:'training',skill:'equality polarity',build:(p,q,r)=>[all('x',eq('x','x')),all('x',neg(eq('x','x')))]},
 {id:'forall-distributes-and',split:'training',skill:'distribution laws',build:(p,q,r)=>[all('x',and(pred(p),pred(q))),and(all('x',pred(p)),all('x',pred(q)))]},
 {id:'exists-distributes-or',split:'evaluation',skill:'distribution laws',build:(p,q,r)=>[any('x',or(pred(p),pred(q))),or(any('x',pred(p)),any('x',pred(q)))]},
 {id:'implication-as-disjunction',split:'training',skill:'implication equivalence',build:(p,q,r)=>[all('x',imp(pred(p),pred(q))),all('x',or(neg(pred(p)),pred(q)))]}
]);
const NAMES=['P','Q','S','T'];
export const GAUNTLET_FAMILY_COUNT=FAMILIES.length;
export const GAUNTLET_VARIANTS_PER_FAMILY=3;
export function formulaSymbols(f,unary=new Set(),binary=new Set(),bound=new Set()){
 if(!f||typeof f!=='object'||Array.isArray(f))throw Error('Malformed formula');
 switch(f.op){
 case 'pred':if(!bound.has(f.x))throw Error('Unbound unary variable');unary.add(f.name);break;
 case 'rel':if(!bound.has(f.x)||!bound.has(f.y))throw Error('Unbound relation variable');binary.add(f.name);break;
 case 'eq':if(!bound.has(f.x)||!bound.has(f.y))throw Error('Unbound equality variable');break;
 case 'not':formulaSymbols(f.f,unary,binary,bound);break;
 case 'and':case 'or':case 'imp':formulaSymbols(f.a,unary,binary,bound);formulaSymbols(f.b,unary,binary,bound);break;
 case 'forall':case 'exists':formulaSymbols(f.f,unary,binary,new Set([...bound,f.x]));break;
 default:throw Error('Unsupported semantic operation');
 }
 return {unary:[...unary].sort(),binary:[...binary].sort()};
}
export function makeGauntletTasks(){
 const tasks=[];
 for(const family of FAMILIES){
  for(let variant=0;variant<GAUNTLET_VARIANTS_PER_FAMILY;variant++){
   const p=NAMES[(variant+1)%NAMES.length],q=NAMES[(variant+3)%NAMES.length],r=variant%2?'U':'R';
   const [source,candidate]=family.build(p,q,r);
   const both={op:'and',a:source,b:candidate};
   const symbols=formulaSymbols(both);
   tasks.push({id:family.id+'-'+(variant+1),family:family.id,split:family.split,
    skill:family.skill,version:GAUNTLET_VERSION,bound:symbols.binary.length?2:MAX_FINITE_DOMAIN,
    symbols,source,candidate});
  }
 }
 return tasks;
}
function deepFreeze(value){
 if(value&&typeof value==='object'){
  for(const child of Object.values(value))deepFreeze(child);
  Object.freeze(value);
 }
 return value;
}
export const GAUNTLET_TASKS=deepFreeze(makeGauntletTasks());
const byId=new Map(GAUNTLET_TASKS.map(t=>[t.id,t]));
export function getGauntletTask(id){return byId.get(id)||null;}
function keysMatch(value,fields){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');}
export function validateGauntletWorld(task,world){
 if(!task||task.version!==GAUNTLET_VERSION)throw Error('Unknown benchmark task');
 if(!keysMatch(world,['n','unary','binary'])||!Number.isInteger(world.n)||world.n<1||world.n>task.bound)
  throw Error('Invalid bounded world');
 if(!keysMatch(world.unary,task.symbols.unary)||!keysMatch(world.binary,task.symbols.binary))
  throw Error('World signature mismatch');
 for(const name of task.symbols.unary){let values=world.unary[name];if(!Array.isArray(values)||values.length!==world.n||values.some(x=>typeof x!=='boolean'))throw Error('Invalid unary interpretation');}
 for(const name of task.symbols.binary){let rows=world.binary[name];if(!Array.isArray(rows)||rows.length!==world.n||rows.some(r=>!Array.isArray(r)||r.length!==world.n||r.some(x=>typeof x!=='boolean')))throw Error('Invalid binary interpretation');}
 return world;
}
function meaning(f,w,vars){
 switch(f.op){
 case 'pred':return w.unary[f.name][vars[f.x]];
 case 'rel':return w.binary[f.name][vars[f.x]][vars[f.y]];
 case 'eq':return vars[f.x]===vars[f.y];
 case 'not':return !meaning(f.f,w,vars);
 case 'and':return meaning(f.a,w,vars)&&meaning(f.b,w,vars);
 case 'or':return meaning(f.a,w,vars)||meaning(f.b,w,vars);
 case 'imp':return !meaning(f.a,w,vars)||meaning(f.b,w,vars);
 case 'forall':{for(let i=0;i<w.n;i++)if(!meaning(f.f,w,{...vars,[f.x]:i}))return false;return true;}
 case 'exists':{for(let i=0;i<w.n;i++)if(meaning(f.f,w,{...vars,[f.x]:i}))return true;return false;}
 default:throw Error('Unsupported operation');
 }
}
export function gauntletVerdict(task,world){
 validateGauntletWorld(task,world);
 const source=meaning(task.source,world,{}),candidate=meaning(task.candidate,world,{});
 return {source,candidate,countermodel:source!==candidate};
}
function bitCount(x){let n=0;while(x){n+=x&1;x>>>=1;}return n;}
export function worldFromBits(task,n,mask){
 const unary={},binary={};let bit=0;
 for(const name of task.symbols.unary){unary[name]=Array.from({length:n},()=>Boolean(mask&(1<<bit++)));}
 for(const name of task.symbols.binary){binary[name]=Array.from({length:n},()=>Array.from({length:n},()=>Boolean(mask&(1<<bit++))));}
 return {n,unary,binary};
}
// Exhaustive within task.bound: not a decision procedure for unrestricted first-order equivalence.
export function finiteOracle(task){
 if(!task||task.version!==GAUNTLET_VERSION)throw Error('Unknown task');
 let checked=0;
 for(let n=1;n<=task.bound;n++){
  const bits=task.symbols.unary.length*n+task.symbols.binary.length*n*n;
  if(bits>15)throw Error('Finite model enumeration cap exceeded');
  const max=2**bits;
  for(let ones=0;ones<=bits;ones++)for(let mask=0;mask<max;mask++){
   if(bitCount(mask)!==ones)continue;
   const w=worldFromBits(task,n,mask);checked++;
   const verdict=gauntletVerdict(task,w);
   if(verdict.countermodel)return {equivalent_within_bound:false,minimum_domain:n,
      witness:w,checked_models:checked,witness_verdict:verdict};
  }
 }
 return {equivalent_within_bound:true,minimum_domain:null,witness:null,checked_models:checked};
}
export function validateGauntletPrediction(task,prediction){
 if(!keysMatch(prediction,['id','decision','world']))throw Error('Prediction must have exact id, decision and world keys');
 if(prediction.id!==task.id)throw Error('Predicted task ID mismatch');
 if(!['ABSTAIN','EQUIVALENT_WITHIN_BOUND','COUNTERMODEL'].includes(prediction.decision))throw Error('Unsupported prediction');
 if(prediction.decision!=='COUNTERMODEL'&&prediction.world!==null)throw Error('Unexpected witness');
 if(prediction.decision==='COUNTERMODEL')validateGauntletWorld(task,prediction.world);
 return prediction;
}
export function scoreGauntletPrediction(task,prediction,oracle=finiteOracle(task)){
 validateGauntletPrediction(task,prediction);
 const isWitness=prediction.decision==='COUNTERMODEL';
 const verified=isWitness?gauntletVerdict(task,prediction.world).countermodel:false;
 const correct=prediction.decision==='EQUIVALENT_WITHIN_BOUND'?oracle.equivalent_within_bound:
  isWitness?!oracle.equivalent_within_bound&&verified:false;
 return {id:task.id,split:task.split,family:task.family,skill:task.skill,
  attempted:prediction.decision!=='ABSTAIN',correct,
  witness_verified:verified,minimal_witness:isWitness&&verified&&prediction.world.n===oracle.minimum_domain,
  false_equivalence:prediction.decision==='EQUIVALENT_WITHIN_BOUND'&&!oracle.equivalent_within_bound,
  predicted:prediction.decision,ground_truth:oracle.equivalent_within_bound?'EQUIVALENT_WITHIN_BOUND':'COUNTERMODEL',
  minimum_domain:oracle.minimum_domain};
}