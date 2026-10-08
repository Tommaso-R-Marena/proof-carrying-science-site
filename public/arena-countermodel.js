import {COUNTERMODEL_VERSION,COUNTERMODEL_MISSIONS,publicCountermodelMissions,initialWorld,countermodelVerdict,replayCountermodelSession,findMinimalCountermodel,exportLeanCountermodel} from './countermodel-core.mjs';
const $=id=>document.getElementById(id);
let current=COUNTERMODEL_MISSIONS[0],history=[],world=initialWorld(),checked=null,localBest={};
try{localBest=JSON.parse(localStorage.getItem('pcs-countermodel-best-v1')||'{}')||{};}catch{}
function renderMissions(){const dest=$('cmMissions');dest.replaceChildren();for(const m of publicCountermodelMissions()){
 const b=document.createElement('button');b.type='button';b.className='cm-mission';b.setAttribute('aria-pressed',String(current.id===m.id));
 const title=document.createElement('strong');title.textContent=(localBest[m.id]?'★ ':'')+m.name;
 const sub=document.createElement('small');sub.textContent=`Level ${m.tier} · ${m.skill}`;b.append(title,sub);b.addEventListener('click',()=>choose(m.id));dest.append(b);}}
function message(text,cls=''){const el=$('cmFeedback');el.className='cm-feedback '+cls;el.textContent=text;}
function scoreNow(){try{return replayCountermodelSession({version:COUNTERMODEL_VERSION,mission_id:current.id,actions:history});}catch{return null;}}
function draw(){const v=countermodelVerdict(current.id,world);$('cmTier').textContent=`LEVEL ${current.tier} · ${current.skill.toUpperCase()}`;
 $('cmTitle').textContent=current.name;$('cmStory').textContent=current.story;$('cmLeft').textContent=current.left;$('cmRight').textContent=current.right;
 for(const [id,key] of [['cmLeftResult','left'],['cmRightResult','right']]){const e=$(id);e.textContent=checked?`${v[key]?'TRUE':'FALSE'} in your world`:'Not checked';e.className='cm-truth '+(checked?(v[key]?'true':'false'):'');}
 $('cmWorldCount').textContent=`${world.n} agent${world.n===1?'':'s'} · ${current.kind==='relation'?'Toggle the R(x,y) relation for each pair.':'Toggle which facts P and Q hold for each agent.'}`;
 $('cmAdd').disabled=world.n>=3;$('cmRemove').disabled=world.n<=1;
 const dst=$('cmWorld');dst.replaceChildren();
 if(current.kind==='unary'){
  for(let i=0;i<world.n;i++){const c=document.createElement('div');c.className='cm-agent';const h=document.createElement('h3');h.textContent=`Agent ${i+1}`;c.append(h);const actions=document.createElement('div');actions.className='cm-toggles';for(const p of ['P','Q']){const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(world[p][i]));b.textContent=`${world[p][i]?'●':'○'} ${p}(Agent ${i+1})`;b.addEventListener('click',()=>move({type:'toggle',p,i}));actions.append(b);}c.append(actions);dst.append(c);}
 }else{const c=document.createElement('div');c.className='cm-rel';const t=document.createElement('table');const header=document.createElement('tr');header.append(document.createElement('th'));for(let j=0;j<world.n;j++){const th=document.createElement('th');th.textContent=`To ${j+1}`;header.append(th);}t.append(header);for(let i=0;i<world.n;i++){const tr=document.createElement('tr');const th=document.createElement('th');th.textContent=`From ${i+1}`;tr.append(th);for(let j=0;j<world.n;j++){const td=document.createElement('td');const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(world.R[i][j]));b.textContent=world.R[i][j]?'● Yes':'○ No';b.setAttribute('aria-label',`R Agent ${i+1} to Agent ${j+1}`);b.addEventListener('click',()=>move({type:'toggle_relation',i,j}));td.append(b);tr.append(td);}t.append(tr);}c.append(t);dst.append(c);}
 $('cmChecks').textContent=history.filter(a=>a.type==='check').length;$('cmEdits').textContent=history.filter(a=>!['check','hint'].includes(a.type)).length;$('cmHints').textContent=history.filter(a=>a.type==='hint').length;$('cmScore').textContent=localBest[current.id]||'—';
 $('cmDonate').disabled=!(Boolean(checked?.final_verified)&&$('cmAdult').checked&&$('cmConsent').checked);$('cmLeanExport').disabled=!Boolean(checked?.final_verified);
}
function choose(id){const m=COUNTERMODEL_MISSIONS.find(x=>x.id===id);if(!m)return;current=m;history=[];world=initialWorld();checked=null;message('Build a world where the statements disagree, then run the checker.');renderMissions();draw();}
function move(action){if(history.length>=120){message('This notebook is full. Restart for a fresh trajectory.','miss');return;}
 const proposed=[...history,action];try{
  // Replay state updates are deterministic; keep a direct local mirror for fast UI updates.
  if(action.type==='add'){const w=initialWorld(world.n+1);w.P=world.P.concat(false);w.Q=world.Q.concat(false);for(let i=0;i<world.n;i++)for(let j=0;j<world.n;j++)w.R[i][j]=world.R[i][j];world=w;}
  else if(action.type==='remove')world={n:world.n-1,P:world.P.slice(0,-1),Q:world.Q.slice(0,-1),R:world.R.slice(0,-1).map(row=>row.slice(0,-1))};
  else if(action.type==='toggle')world[action.p][action.i]=!world[action.p][action.i];
  else if(action.type==='toggle_relation')world.R[action.i][action.j]=!world.R[action.i][action.j];
  history=proposed;checked=null;draw();
 }catch{message('That move is outside the supported finite game.','miss');}}
$('cmCheck').addEventListener('click',()=>{if(history.length>=120){message('Notebook full—restart to check a new experiment.','miss');return;}const v=countermodelVerdict(current.id,world);history.push({type:'check'});checked=scoreNow();if(!checked){message('The finite checker rejected this attempt.','miss');return;}if(v.counterexample){const min=findMinimalCountermodel(current.id);const value=checked.score;if(value>(localBest[current.id]||0)){localBest[current.id]=value;try{localStorage.setItem('pcs-countermodel-best-v1',JSON.stringify(localBest));}catch{}}message(`Counterexample found! Original is ${v.left}, proposal is ${v.right}. Minimum domain size is ${min.n}; your score is ${value}. ${world.n===min.n?'You found a smallest possible world.':'Try removing agents to improve your solution.'}`,'win');}else message('Not yet: both statements have the same truth value here. Change the world and test again.','miss');draw();renderMissions();});
$('cmHint').addEventListener('click',()=>{if(history.length>=120||history.filter(a=>a.type==='hint').length>=3){message('Hint budget used. Try experimenting.','miss');return;}history.push({type:'hint'});let msg='Try asking what changes between the two sentences. Which one requires more?';if(current.kind==='relation')msg='Try two agents. A relation can hold for each agent with a different partner, without one universal partner.';if(history.filter(a=>a.type==='hint').length===2)msg=`Hint: the smallest possible countermodel needs ${findMinimalCountermodel(current.id).n} agent(s).`;message(msg);draw();});
$('cmLeanExport').addEventListener('click',()=>{
 if(!checked?.final_verified)return;
 try{const artifact=exportLeanCountermodel(current.id,world);
  const objectUrl=URL.createObjectURL(new Blob([artifact.lean_source],{type:'text/plain'}));
  const link=document.createElement('a');link.href=objectUrl;link.download=artifact.file_name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  message('Lean source exported. Run it with the pinned Lean 4.28 toolchain; no kernel verdict was claimed here.');
 }catch(e){message('Lean export unavailable: '+e.message,'miss');}
});
$('cmRestart').addEventListener('click',()=>choose(current.id));$('cmAdd').addEventListener('click',()=>move({type:'add'}));$('cmRemove').addEventListener('click',()=>move({type:'remove'}));
for(const id of ['cmAdult','cmConsent'])$(id).addEventListener('change',draw);
async function request(path,payload){const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});let data={};try{data=await response.json();}catch{}if(!response.ok)throw Error(data.message||data.error||'Request failed');return data;}
$('cmDonate').addEventListener('click',async()=>{const out=$('cmDonateStatus');if(!checked?.final_verified||!$('cmAdult').checked||!$('cmConsent').checked)return;const btn=$('cmDonate');btn.disabled=true;out.textContent='Replaying on the PCS server…';try{const data=await request('/api/arena/countermodel/donate',{adult_confirmation:true,consent_training:true,session:{version:COUNTERMODEL_VERSION,mission_id:current.id,actions:history}});out.textContent=data.recorded?'Verified research session donated. Thank you.':'This exact session was already recorded.';}catch(e){out.textContent=`Not uploaded: ${e.message}. You can keep playing privately.`;}draw();});
$('cmErase').addEventListener('click',async()=>{if(!window.confirm('Delete all your stored Countermodel Lab sessions from PCS active storage? This cannot recall previous offline exports.'))return;const out=$('cmDonateStatus');try{const data=await request('/api/arena/countermodel/erase',{});out.textContent=`Deleted ${data.deleted} stored sessions from the active PCS database.`;}catch(e){out.textContent=`Deletion request failed: ${e.message}`;}});
choose(COUNTERMODEL_MISSIONS[(Math.floor(Date.now()/86400000)%COUNTERMODEL_MISSIONS.length)].id);
