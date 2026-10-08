import {GAUNTLET_VERSION,GAUNTLET_TASKS,gauntletVerdict,finiteOracle} from './semantic-gauntlet-core.mjs';
const el=id=>document.getElementById(id);
let current=GAUNTLET_TASKS[0],world,history=[],correct=0,attempted=0,lastOutcome=null;
const makeWorld=(n=1)=>({n,unary:Object.fromEntries(current.symbols.unary.map(x=>[x,Array(n).fill(false)])),
 binary:Object.fromEntries(current.symbols.binary.map(x=>[x,Array.from({length:n},()=>Array(n).fill(false))]))});
const text=(id,value)=>{el(id).textContent=String(value);};
function formula(f){switch(f.op){case 'pred':return f.name+' '+f.x;case 'rel':return f.name+' '+f.x+' '+f.y;
 case 'eq':return f.x+' = '+f.y;case 'not':return '¬('+formula(f.f)+')';
 case 'and':return '('+formula(f.a)+' ∧ '+formula(f.b)+')';
 case 'or':return '('+formula(f.a)+' ∨ '+formula(f.b)+')';
 case 'imp':return '('+formula(f.a)+' → '+formula(f.b)+')';
 case 'forall':return '∀ '+f.x+', '+formula(f.f);
 case 'exists':return '∃ '+f.x+', '+formula(f.f);default:return 'unsupported';}}
function status(message,outcome=''){text('sgStatus',message);el('sgStatus').dataset.outcome=outcome;}
function log(action,details={}){history.push({id:current.id,action,...details});}
function addToggle(container,label,value,onClick){const b=document.createElement('button');b.type='button';b.className='sg-toggle';
 b.setAttribute('aria-pressed',value?'true':'false');b.textContent=label+': '+(value?'●':'○');b.addEventListener('click',onClick);container.append(b);}
function renderWorld(){const container=el('sgWorld');container.replaceChildren();
 for(const name of current.symbols.unary){const panel=document.createElement('div');panel.className='sg-predicate';
  const h=document.createElement('strong');h.textContent='Predicate '+name+'(agent)';panel.append(h);
  const group=document.createElement('div');group.className='sg-toggle-group';
  for(let i=0;i<world.n;i++)addToggle(group,'Agent '+(i+1),world.unary[name][i],()=>{world.unary[name][i]=!world.unary[name][i];log('toggle',{name,agent:i});lastOutcome=null;renderWorld();});
  panel.append(group);container.append(panel);}
 for(const name of current.symbols.binary){const panel=document.createElement('div');panel.className='sg-predicate';
  const h=document.createElement('strong');h.textContent='Relation '+name+'(from, to)';panel.append(h);
  for(let i=0;i<world.n;i++){const group=document.createElement('div');group.className='sg-toggle-group';
   for(let j=0;j<world.n;j++){const from=i,to=j;
    addToggle(group,(from+1)+' → '+(to+1),world.binary[name][from][to],()=>{world.binary[name][from][to]=!world.binary[name][from][to];log('toggle_relation',{name,from,to});lastOutcome=null;renderWorld();});}
   panel.append(group);}
  container.append(panel);}
 const minus=el('sgMinus'),plus=el('sgPlus');minus.disabled=world.n===1;plus.disabled=world.n===current.bound;
}
function renderSelect(){const f=el('sgFilter').value,sel=el('sgTask');sel.replaceChildren();
 const showing=GAUNTLET_TASKS.filter(t=>f==='all'||t.split===f);
 for(const t of showing){const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.family.replaceAll('-',' ')+' · '+t.id.split('-').at(-1);sel.append(opt);}
 if(!showing.includes(current))current=showing[0];sel.value=current.id;setTask(current.id);
}
function setTask(id){current=GAUNTLET_TASKS.find(x=>x.id===id);world=makeWorld();lastOutcome=null;
 text('sgFamily',current.split==='evaluation'?'Public evaluation family':'Practice family');text('sgBound','1–'+current.bound+' agents');
 text('sgHeading',current.skill[0].toUpperCase()+current.skill.slice(1));text('sgOriginal',formula(current.source));
 text('sgCandidate',formula(current.candidate));el('sgTask').value=current.id;
 status('Construct a world, then ask whether it distinguishes the two formulas.');renderWorld();}
function guess(decision){const oracle=finiteOracle(current),actual=gauntletVerdict(current,world);
 const isCountermodel=decision==='COUNTERMODEL';const yes=isCountermodel?actual.countermodel:oracle.equivalent_within_bound;
 attempted++;if(yes)correct++;text('sgSolved',attempted);text('sgCorrect',correct);
 const details={type:decision,world:structuredClone(world),result:yes,
   finite_checker_truth:{selected:actual.source,proposed:actual.candidate},hints_revealed:lastOutcome==='hint'};
 log('verification_request',details);lastOutcome=yes?'correct':'incorrect';
 if(yes){status(isCountermodel?
  'Verified countermodel: the original and proposed claims differ in your exact finite world. '+
  (world.n===oracle.minimum_domain?'Your witness uses the minimum domain size.':'A smaller-domain witness also exists.'):
  'Enumerated agreement: all supported worlds up to '+current.bound+' agents agree. This does not prove unrestricted logical equivalence.', 'correct');}
 else status(isCountermodel?
  'This world does not distinguish the meanings. Change the truth assignments and try again.':
  'Incorrect equivalence claim: the checker found a smaller or equal finite world where the meanings differ.', 'incorrect');}
function download(){const data={format:'pcs-semantic-gauntlet-local-practice-v1',version:GAUNTLET_VERSION,
  limitations:['Local self-reported history, not verified human provenance','Finite simulation; not Lean proof'],
  attempted,correct,actions:history};const dataUrl=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
 const anchor=document.createElement('a');anchor.href=dataUrl;anchor.download='pcs-semantic-gauntlet-local.json';
 document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(dataUrl),2000);}
el('sgFilter').addEventListener('change',renderSelect);
el('sgTask').addEventListener('change',()=>setTask(el('sgTask').value));
el('sgPlus').addEventListener('click',()=>{const old=world;world=makeWorld(old.n+1);
 for(const name of current.symbols.unary)world.unary[name].splice(0,old.n,...old.unary[name]);
 for(const name of current.symbols.binary)for(let i=0;i<old.n;i++)for(let j=0;j<old.n;j++)world.binary[name][i][j]=old.binary[name][i][j];
 log('add_agent');renderWorld();});
el('sgMinus').addEventListener('click',()=>{world.n--;for(const a of Object.values(world.unary))a.pop();
 for(const matrix of Object.values(world.binary)){matrix.pop();matrix.forEach(row=>row.pop());}log('remove_agent');renderWorld();});
el('sgCountermodel').addEventListener('click',()=>guess('COUNTERMODEL'));
el('sgEquivalent').addEventListener('click',()=>guess('EQUIVALENT_WITHIN_BOUND'));
el('sgHint').addEventListener('click',()=>{log('hint');const o=finiteOracle(current);lastOutcome='hint';
 status(o.equivalent_within_bound?'No counterexample exists within the supported finite bound. Try the equivalence claim.':
 'A counterexample exists with '+o.minimum_domain+' agent(s). Change predicate or relation assignments.');});
el('sgReset').addEventListener('click',()=>{world=makeWorld();log('reset');renderWorld();status('World reset. Try a different search.');});
el('sgNext').addEventListener('click',()=>{const f=el('sgFilter').value,t=GAUNTLET_TASKS.filter(x=>f==='all'||x.split===f);
 setTask(t[(t.findIndex(x=>x.id===current.id)+1)%t.length].id);});
el('sgExport').addEventListener('click',download);
text('sgFamilies',new Set(GAUNTLET_TASKS.map(t=>t.family)).size);renderSelect();