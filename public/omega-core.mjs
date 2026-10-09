// Independent browser implementation of the bounded Omega Boolean protocol.
// Models rank actions. Only exhaustive replay accepts candidate interpretations.
export const OPS=['atom','true','false','not','and','or','implies'];
const OPERATIONS=['insert_not','remove_not','swap','replace_and','replace_or','replace_implies'];
const clone=x=>structuredClone(x);
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function exact(x,keys){const actual=x&&Object.keys(x).sort(),expected=[...keys].sort();if(!x||Object.getPrototypeOf(x)!==Object.prototype||actual.length!==expected.length||actual.some((k,i)=>k!==expected[i]))throw Error('Unexpected protocol fields');return x;}
export function integer(x,low,high){if(!Number.isInteger(x)||x<low||x>high)throw Error(`Expected an integer in [${low},${high}]`);return x;}
function validString(s){if(typeof s!=='string')throw Error('Expected text');for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const d=s.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))throw Error('Unpaired Unicode surrogate');c=0x10000+((c-0xd800)<<10)+(d-0xdc00);}else if(c>=0xdc00&&c<=0xdfff)throw Error('Unpaired Unicode surrogate');if(c>=0xfdd0&&c<=0xfdef||(c&0xffff)===0xfffe||(c&0xffff)===0xffff)throw Error('Unicode noncharacter');}return s;}
export function canonical(x){
 if(x===null||typeof x==='boolean')return JSON.stringify(x);
 if(typeof x==='number'){if(!Number.isFinite(x))throw Error('Non-finite number');return JSON.stringify(x);}
 if(typeof x==='string')return JSON.stringify(validString(x));
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(x&&Object.getPrototypeOf(x)===Object.prototype)return '{'+Object.keys(x).sort().map(k=>canonical(k)+':'+canonical(x[k])).join(',')+'}';
 throw Error('Unsupported canonical value');
}
export async function shaText(raw){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const digest=x=>shaText(canonical(x));

// JSON.parse alone silently accepts duplicate keys. This bounded parser rejects
// them, deep inputs, non-finite numbers and prototype-property ambiguity.
export function strictParse(raw,limit=65536){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>limit)throw Error('Input exceeds byte budget');
 let pos=0,nodes=0;const ws=()=>{while(/[\t\r\n ]/.test(raw[pos]||'X'))pos++;};
 function string(){const start=pos++;while(pos<raw.length){if(raw[pos]==='"'){pos++;return validString(JSON.parse(raw.slice(start,pos)));}if(raw[pos]==='\\')pos++;pos++;}throw Error('Unterminated string');}
 function value(depth=0){
  if(depth>64||++nodes>30000)throw Error('JSON complexity bound exceeded');ws();const c=raw[pos];
  if(c==='"')return string();
  if(c==='{'||c==='['){const object=c==='{',out=object?{}:[],keys=new Set();pos++;ws();if(raw[pos]===(object?'}':']')){pos++;return out;}
   for(;;){ws();let key;if(object){if(raw[pos]!=='"')throw Error('Expected object key');key=string();if(keys.has(key))throw Error('Duplicate JSON key');keys.add(key);if(['__proto__','constructor','prototype'].includes(key))throw Error('Reserved object key');ws();if(raw[pos++]!==':')throw Error('Expected colon');}
    const item=value(depth+1);if(object)out[key]=item;else out.push(item);ws();const end=raw[pos++];if(end===(object?'}':']'))return out;if(end!==',')throw Error('Expected comma');}
  }
  const literal=/^(true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(pos));
  if(!literal)throw Error('Invalid JSON value');pos+=literal[0].length;const out=JSON.parse(literal[0]);if(typeof out==='number'&&!Number.isFinite(out))throw Error('Non-finite number');return out;
 }
 const result=value();ws();if(pos!==raw.length)throw Error('Trailing JSON data');return result;
}

function variables(names){if(!Array.isArray(names)||names.length<1||names.length>4||names.some(n=>typeof n!=='string'||!/^[A-Z][A-Z0-9_]{0,15}$/.test(n))||new Set(names).size!==names.length||canonical(names)!==canonical([...names].sort()))throw Error('Declare 1–4 distinct sorted Boolean symbols');}
export function validateFormula(f,names){
 variables(names);let count=0;
 function visit(n,depth){if(++count>63||depth>8)throw Error('Formula complexity bound exceeded');if(!n||!OPS.includes(n.op))throw Error('Unsupported Boolean construct');
  const op=n.op;exact(n,op==='atom'?['op','symbol','args']:op==='not'?['op','body']:['and','or','implies'].includes(op)?['op','left','right']:['op']);
  if(op==='atom'&&(!names.includes(n.symbol)||!Array.isArray(n.args)||n.args.length))throw Error('Unresolved symbol, arity or non-Boolean unit');
  if(op==='not')visit(n.body,depth+1);else if(['and','or','implies'].includes(op)){visit(n.left,depth+1);visit(n.right,depth+1);}
 }visit(f,0);return count;
}
export function validateTask(t){exact(t,['variables','source','candidate']);validateFormula(t.source,t.variables);validateFormula(t.candidate,t.variables);return t;}
function evaluate(f,a){switch(f.op){case 'atom':return a[f.symbol];case 'true':return true;case 'false':return false;case 'not':return !evaluate(f.body,a);case 'and':return evaluate(f.left,a)&&evaluate(f.right,a);case 'or':return evaluate(f.left,a)||evaluate(f.right,a);case 'implies':return !evaluate(f.left,a)||evaluate(f.right,a);default:throw Error('Unsupported operator');}}
export async function check(t){
 validateTask(t);const rows=[];let witness=null;
 for(let i=0;i<2**t.variables.length;i++){const assignment=Object.fromEntries(t.variables.map((n,j)=>[n,Boolean(i&(1<<(t.variables.length-1-j)))]));const a=evaluate(t.source,assignment),b=evaluate(t.candidate,assignment);rows.push([a,b]);if(a!==b&&!witness)witness={assignment,source_true:a,candidate_true:b};}
 return {format:'pcs-omega-check-v1',checker:'pcs-omega-exhaustive-bool/1',task_sha256:await digest(t),source_sha256:await digest(t.source),candidate_sha256:await digest(t.candidate),assignments_checked:rows.length,truth_pairs:rows,equivalent:!witness,counterexample:witness,scope:'All valuations of the explicitly declared Boolean symbols',pcs_authority:false,lean_kernel_checked:false};
}
export function walk(f,path=[]){const out=[[path,f]];if(f.op==='not')out.push(...walk(f.body,[...path,'body']));else if(['and','or','implies'].includes(f.op))for(const side of ['left','right'])out.push(...walk(f[side],[...path,side]));return out;}
export const actionId=a=>a.operation+'@'+a.path.join('/');
export function applyAction(f,a,names){
 validateFormula(f,names);exact(a,['kind','path','operation']);if(a.kind!=='REPAIR_CANDIDATE'||!Array.isArray(a.path)||a.path.length>8||a.path.some(p=>!['body','left','right'].includes(p))||!OPERATIONS.includes(a.operation))throw Error('Invalid repair action');
 let result=clone(f),n=result,parent,side;for(side of a.path){parent=n;if(!Object.hasOwn(n,side))throw Error('Repair path absent');n=n[side];}
 let replacement;if(a.operation==='insert_not')replacement={op:'not',body:clone(n)};
 else if(a.operation==='remove_not'&&n.op==='not')replacement=clone(n.body);
 else if(a.operation==='swap'&&['and','or','implies'].includes(n.op))replacement={op:n.op,left:clone(n.right),right:clone(n.left)};
 else if(a.operation.startsWith('replace_')&&['and','or','implies'].includes(n.op))replacement={...clone(n),op:a.operation.slice(8)};
 else throw Error('Inapplicable repair');if(parent)parent[side]=replacement;else result=replacement;validateFormula(result,names);return result;
}
export function actions(f,names){validateFormula(f,names);const out=[],seen=new Set([canonical(f)]);
 for(const [path,n] of walk(f)){const options=['insert_not'];if(n.op==='not')options.push('remove_not');if(['and','or','implies'].includes(n.op))options.push('swap','replace_and','replace_or','replace_implies');
  for(const operation of options){const a={kind:'REPAIR_CANDIDATE',path,operation};let next;try{next=applyAction(f,a,names);}catch{continue;}const key=canonical(next);if(seen.has(key))continue;seen.add(key);out.push(a);if(out.length===128)return out;}
 }return out;
}
function onehot(op){return OPS.map(x=>Number(x===op));}
function histogram(f){const out=OPS.map(()=>0);for(const [,n] of walk(f))out[OPS.indexOf(n.op)]+=1/63;return out;}
function graphEncoding(f){const nodes=walk(f),keys=nodes.map(([p])=>p.join('/')),neighbors=nodes.map(([p],i)=>nodes.map(([q],j)=>j).filter(j=>j!==i&&((nodes[j][0].length&&nodes[j][0].slice(0,-1).join('/')===p.join('/'))||(p.length&&p.slice(0,-1).join('/')===nodes[j][0].join('/')))));
 let level=nodes.map(([,n])=>onehot(n.op));const layers=[level];for(let step=0;step<2;step++){level=level.map((_,i)=>OPS.map((__,k)=>[i,...neighbors[i]].reduce((s,j)=>s+layers.at(-1)[j][k],0)/(1+neighbors[i].length)));layers.push(level);}return new Map(keys.map((key,i)=>[key,layers.flatMap(l=>l[i])]));
}
export function features(t,a,mode){
 validateTask(t);if(!['bag','graph'].includes(mode))throw Error('Unknown feature mode');const after=histogram(applyAction(t.candidate,a,t.variables)),cand=histogram(t.candidate),src=histogram(t.source);const nodes=new Map(walk(t.candidate).map(([p,n])=>[p.join('/'),n])),sourceNodes=new Map(walk(t.source).map(([p,n])=>[p.join('/'),n])),key=a.path.join('/'),node=nodes.get(key);
 const out=[1,...src,...cand,...after.map((x,i)=>x-cand[i]),...onehot(node.op),...OPERATIONS.map(o=>Number(a.operation===o)),a.path.length/8,t.variables.length/4,after.reduce((s,x)=>s+x,0)-cand.reduce((s,x)=>s+x,0)];
 if(mode==='graph')out.push(...graphEncoding(t.candidate).get(key),...(graphEncoding(t.source).get(key)||Array(21).fill(0)),...(a.path.length?onehot(nodes.get(a.path.slice(0,-1).join('/')).op):Array(7).fill(0)),...['left','right','body'].map(side=>Number(a.path.length>0&&a.path.at(-1)===side)),Number(sourceNodes.has(key)&&canonical(sourceNodes.get(key))===canonical(node)));
 return out;
}
export async function validateModel(m){
 exact(m,['format','feature_mode','feature_version','dimension','weights','training','authority','model_sha256']);const size=m.feature_mode==='graph'?91:38;
 if(m.format!=='pcs-omega-ranker-v1'||!['bag','graph'].includes(m.feature_mode)||m.feature_version!=='omega-preaction-features/1'||m.dimension!==size||m.authority!=='NONE'||!Array.isArray(m.weights)||m.weights.length!==size||m.weights.some(w=>typeof w!=='number'||!Number.isFinite(w)||Math.abs(w)>1000))throw Error('Invalid untrusted checkpoint');
 const meta=exact(m.training,['algorithm','seed','epochs','examples','task_ids','families','task_digests','source_digest','corpus_sha256']);if(!['weighted-logistic-SGD','one-step-contextual-bandit-REINFORCE'].includes(meta.algorithm))throw Error('Unknown training algorithm');integer(meta.seed,0,2**32-1);integer(meta.epochs,1,20000);integer(meta.examples,1,131072);
 for(const field of ['task_ids','families','task_digests'])if(!Array.isArray(meta[field])||meta[field].length<1||meta[field].length>1024||meta[field].some(v=>typeof v!=='string'||v.length<1||v.length>128)||new Set(meta[field]).size!==meta[field].length)throw Error('Invalid checkpoint metadata');
 if(meta.task_ids.length!==meta.task_digests.length||[...meta.task_digests,meta.source_digest,meta.corpus_sha256].some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)))throw Error('Invalid training binding');const {model_sha256,...core}=m;if(model_sha256!==await digest(core))throw Error('Checkpoint digest mismatch');return m;
}
export function rank(t,list,m){return list.map(a=>({action:a,score:features(t,a,m.feature_mode).reduce((s,x,i)=>s+x*m.weights[i],0)})).sort((a,b)=>b.score-a.score||compare(actionId(a.action),actionId(b.action)));}
export function distance(a,b){if(canonical(a)===canonical(b))return 0;if(a.op!==b.op)return 1+['body','left','right'].filter(k=>k in a||k in b).reduce((s,k)=>s+distance(a[k]||{op:'false'},b[k]||{op:'false'}),0);if(a.op==='atom')return Number(a.symbol!==b.symbol);return ['body','left','right'].filter(k=>k in a).reduce((s,k)=>s+distance(a[k],b[k]),0);}
export async function search(t,{strategy='structural',model=null,checks=8,depth=3,seed=20261009}={}){
 validateTask(t);integer(checks,1,128);integer(depth,1,4);integer(seed,0,2**32-1);if(!['bfs','structural','learned'].includes(strategy))throw Error('Unsupported browser strategy');if(strategy==='learned'){if(!model)throw Error('Checkpoint required');await validateModel(model);}
 const initial=await check(t),attempts=[],queue=[[clone(t.candidate),0]],seen=new Set([canonical(t.candidate)]);let solution=initial.equivalent?{candidate:clone(t.candidate),receipt:initial}:null,used=1;
 while(queue.length&&used<checks&&!solution){const [formula,level]=queue.shift();if(level>=depth)continue;const current={...t,candidate:formula};let list=actions(formula,t.variables);if(strategy==='structural')list.sort((a,b)=>distance(t.source,applyAction(formula,a,t.variables))-distance(t.source,applyAction(formula,b,t.variables))||compare(actionId(a),actionId(b)));else if(strategy==='learned')list=rank(current,list,model).map(x=>x.action);
  for(const action of list){const candidate=applyAction(formula,action,t.variables),key=canonical(candidate);if(seen.has(key))continue;seen.add(key);const receipt=await check({...t,candidate});used++;attempts.push({parent_sha256:await digest(formula),action,candidate,depth:level+1,receipt});if(receipt.equivalent){solution={candidate,receipt};break;}queue.push([candidate,level+1]);if(used===checks)break;}
 }
 const result={format:'pcs-omega-search-v1',original_task:clone(t),original_task_sha256:await digest(t),strategy,model_sha256:model?model.model_sha256:null,seed,budget:{checks,depth},initial_receipt:initial,attempts,checks_used:used,status:solution?'BOOLEAN_VERIFIED':'BUDGET_OR_SEARCH_EXHAUSTED',solution,pcs_authority:false,lean_kernel_checked:false};return {...result,episode_sha256:await digest(result)};
}
export async function verifyEpisode(e){
 exact(e,['format','original_task','original_task_sha256','strategy','model_sha256','seed','budget','initial_receipt','attempts','checks_used','status','solution','pcs_authority','lean_kernel_checked','episode_sha256']);if(e.format!=='pcs-omega-search-v1'||e.pcs_authority!==false||e.lean_kernel_checked!==false||!['bfs','random','structural','learned'].includes(e.strategy))throw Error('Invalid episode authority');integer(e.seed,0,2**32-1);integer(e.checks_used,1,128);if(e.model_sha256!==null&&(typeof e.model_sha256!=='string'||!/^[0-9a-f]{64}$/.test(e.model_sha256)))throw Error('Invalid checkpoint binding');if(e.strategy==='learned'&&!e.model_sha256)throw Error('Missing learned checkpoint');
 const t=validateTask(e.original_task);if(e.original_task_sha256!==await digest(t))throw Error('Goal changed');exact(e.budget,['checks','depth']);integer(e.budget.checks,1,128);integer(e.budget.depth,1,4);const initial=await check(t);if(canonical(initial)!==canonical(e.initial_receipt))throw Error('Forged initial receipt');if(!Array.isArray(e.attempts)||e.attempts.length>=e.budget.checks||e.checks_used!==e.attempts.length+1)throw Error('Budget drift');
 const states=new Map([[await digest(t.candidate),[t.candidate,0]]]);let solution=initial.equivalent?{candidate:t.candidate,receipt:initial}:null;
 for(const row of e.attempts){exact(row,['parent_sha256','action','candidate','depth','receipt']);integer(row.depth,1,e.budget.depth);if(solution||!states.has(row.parent_sha256))throw Error('Bad transition parent or terminated episode');const [parent,level]=states.get(row.parent_sha256),candidate=applyAction(parent,row.action,t.variables),key=await digest(candidate);if(canonical(candidate)!==canonical(row.candidate)||states.has(key)||row.depth!==level+1)throw Error('Forged repair');const receipt=await check({...t,candidate});if(canonical(receipt)!==canonical(row.receipt))throw Error('Forged checker feedback');states.set(key,[candidate,level+1]);if(receipt.equivalent)solution={candidate,receipt};}
 if(canonical(solution)!==canonical(e.solution)||e.status!==(solution?'BOOLEAN_VERIFIED':'BUDGET_OR_SEARCH_EXHAUSTED'))throw Error('False solution');const {episode_sha256,...core}=e;if(episode_sha256!==await digest(core))throw Error('Episode commitment mismatch');return true;
}
export function validateProject(p){
 exact(p,['format','source','claims']);if(p.format!=='pcs-omega-project-v1')throw Error('Unsupported project version');exact(p.source,['name','revision','license','text']);for(const k of Object.keys(p.source)){const v=p.source[k];validString(v);if(!v.trim()||v.length>(k==='text'?24000:512))throw Error('Invalid source text');}if(!Array.isArray(p.claims)||p.claims.length<1||p.claims.length>16)throw Error('Declare 1–16 claims');const ids=new Set();
 for(const c of p.claims){exact(c,['id','statement','source_lines','task','scope','assumptions','depends_on']);if(typeof c.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(c.id)||ids.has(c.id))throw Error('Invalid claim ID');ids.add(c.id);for(const s of [c.statement,c.scope]){validString(s);if(!s.trim()||s.length>2000)throw Error('Invalid claim text');}const lines=p.source.text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);if(lines.at(-1)==='')lines.pop();if(!Array.isArray(c.source_lines)||c.source_lines.length!==2)throw Error('Source range required');const [a,b]=c.source_lines;integer(a,1,lines.length);integer(b,a,lines.length);if(!lines.slice(a-1,b).join('\n').includes(c.statement))throw Error('Claim absent from cited source');validateTask(c.task);if(!Array.isArray(c.assumptions)||c.assumptions.length>16||c.assumptions.some(s=>typeof s!=='string'||!s.trim()||s.length>2000))throw Error('Invalid assumptions');if(!Array.isArray(c.depends_on)||c.depends_on.length>16||c.depends_on.some(s=>typeof s!=='string')||new Set(c.depends_on).size!==c.depends_on.length)throw Error('Invalid dependencies');}
 const seen=new Set(),active=new Set(),lookup=new Map(p.claims.map(c=>[c.id,c]));function visit(id){if(!lookup.has(id)||active.has(id))throw Error('Dangling or cyclic dependency');if(seen.has(id))return;active.add(id);for(const d of lookup.get(id).depends_on)visit(d);active.delete(id);seen.add(id);}for(const id of ids)visit(id);return p;
}
export function leanSource(t){validateTask(t);const names=new Map(t.variables.map((n,i)=>[n,'p'+i]));function term(n){if(n.op==='atom')return names.get(n.symbol);if(n.op==='true'||n.op==='false')return n.op;if(n.op==='not')return `(!${term(n.body)})`;const a=term(n.left),b=term(n.right);return n.op==='and'?`(${a} && ${b})`:n.op==='or'?`(${a} || ${b})`:`(!${a} || ${b})`;}
 // The caller adds the exact task digest asynchronously before download.
 return `-- Experimental Boolean interpretation; scientific intent remains unproved.\n-- task_sha256=TASK_DIGEST\ntheorem omega_equivalence (${[...names.values()].join(' ')} : Bool) :\n    ${term(t.source)} = ${term(t.candidate)} := by\n  ${[...names.values()].map(n=>'cases '+n).join(' <;> ')} <;> decide\n#print axioms omega_equivalence\n`;
}
