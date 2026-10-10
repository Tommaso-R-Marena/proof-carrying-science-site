import {COUNTERMODEL_VERSION,COUNTERMODEL_MISSIONS,publicCountermodelMissions,initialWorld,countermodelVerdict,replayCountermodelSession,findMinimalCountermodel,exportLeanCountermodel} from './countermodel-core.mjs';
import {normalizeSearchSession,fitLocalSearchModel,validateSearchModelJSON,evaluateSearchSessions,EVALUATION_MISSIONS} from './countermodel-learning.mjs';
import {rankSearchActions} from './countermodel-search-policy.mjs';
import {shaText} from './omega-core.mjs';
import {expedition,mastery,dailyMission,explainWorld} from './countermodel-expedition.mjs';
import {plainMission,inverseWorldEdit,renderRelationMap} from './countermodel-visual.mjs';
const $=id=>document.getElementById(id);
let undoStack=[];
let current=COUNTERMODEL_MISSIONS[0],history=[],world=initialWorld(),checked=null,localBest={};
let notebooks=[],coachModel=null,pendingCoach=null,guided=false,learningBusy=false,modelRevision=0,implementationPromise;
const LEARNING_SOURCE_ASSETS=new Set(['arena-countermodel.js','countermodel-learning.mjs','countermodel-search-policy.mjs']);
const completedSessions=[];
function session(){return {version:COUNTERMODEL_VERSION,mission_id:current.id,actions:structuredClone(history)};}
function renderExpedition(){
 const progress=expedition(completedSessions);
 $('cmProgress').textContent=`${progress.completed} / 7 missions discovered · ${progress.mastery} / 21 mastery goals. Progress stays in this tab.`;
 $('cmProgressBar').value=progress.completed;
 $('cmNext').disabled=!progress.next;
 const goals=$('cmGoals');goals.replaceChildren();
 let result=null;try{result=mastery(session());}catch{}
 for(const [key,title] of [['minimal','Smallest possible world'],['independent','No hints or model assistance'],['precise','At most two checker requests, unassisted']]){
  const li=document.createElement('li');li.textContent=(result?.[key]?'✓ ':'○ ')+title;goals.append(li);
 }
 const explanation=$('cmExplanation');explanation.replaceChildren();
 if(!checked||history.at(-1)?.type!=='check'){explanation.append('Request a check to inspect the truth of your current world.');return;}
 const evidence=explainWorld(current.id,world);
 function branch(node){const li=document.createElement('li');li.textContent=`${node.value?'TRUE':'FALSE'} · ${node.label}`;if(node.children.length){const ul=document.createElement('ul');for(const child of node.children)ul.append(branch(child));li.append(ul);}return li;}
 for(const [name,tree] of [['Original meaning',evidence.left],['Proposed translation',evidence.right]]){const h=document.createElement('h3');h.textContent=name;const ul=document.createElement('ul');ul.append(branch(tree));explanation.append(h,ul);}
}
try{localBest=JSON.parse(localStorage.getItem('pcs-countermodel-best-v1')||'{}')||{};}catch{}
function renderMissions(){const dest=$('cmMissions');dest.replaceChildren();for(const m of publicCountermodelMissions()){
 const b=document.createElement('button');b.type='button';b.className='cm-mission';b.setAttribute('aria-pressed',String(current.id===m.id));
 const title=document.createElement('strong');title.textContent=(localBest[m.id]?'★ ':'')+m.name;
 const sub=document.createElement('small');sub.textContent=`Level ${m.tier} · ${m.skill}`;b.append(title,sub);b.addEventListener('click',()=>choose(m.id));dest.append(b);}}
function message(text,cls=''){const el=$('cmFeedback');el.className='cm-feedback '+cls;el.textContent=text;}
function scoreNow(){try{return replayCountermodelSession({version:COUNTERMODEL_VERSION,mission_id:current.id,actions:history});}catch{return null;}}
function draw(){const focusKey=document.activeElement?.dataset?.cmFocus;const v=countermodelVerdict(current.id,world);$('cmTier').textContent=`LEVEL ${current.tier} · ${current.skill.toUpperCase()}`;
 $('cmTitle').textContent=current.name;$('cmStory').textContent=current.story;$('cmLeft').textContent=current.left;$('cmRight').textContent=current.right;
 const [leftPlain,rightPlain]=plainMission(current.id);$('cmLeftPlain').textContent=leftPlain;$('cmRightPlain').textContent=rightPlain;
 $('cmUndo').disabled=!undoStack.length;
 for(const [id,key] of [['cmLeftResult','left'],['cmRightResult','right']]){const e=$(id);e.textContent=checked?`${v[key]?'TRUE':'FALSE'} in your world`:'Not checked';e.className='cm-truth '+(checked?(v[key]?'true':'false'):'');}
 $('cmDictionary').textContent=current.kind==='unary'?'In this puzzle, P means “has a key” and Q means “opens the door.” These labels illustrate the formal facts. An IF…THEN rule is only broken when its first fact is on and its second fact is off.':'An arrow from Agent 1 to Agent 2 means R(1,2) is true. Arrows are directed; an agent can also relate to itself.';
 $('cmWorldCount').textContent=`${world.n} agent${world.n===1?'':'s'} · ${current.kind==='relation'?'Toggle the R(x,y) relation for each pair.':'Toggle which facts P and Q hold for each agent.'}`;
 $('cmAdd').disabled=world.n>=3;$('cmRemove').disabled=world.n<=1;
 const dst=$('cmWorld');dst.replaceChildren();
 if(current.kind==='unary'){
  for(let i=0;i<world.n;i++){const c=document.createElement('div');c.className='cm-agent';const h=document.createElement('h3');h.textContent=`Agent ${i+1}`;const avatar=document.createElement('span');avatar.className='cm-avatar';avatar.textContent=String(i+1);avatar.setAttribute('aria-hidden','true');c.append(avatar,h);const actions=document.createElement('div');actions.className='cm-toggles';for(const p of ['P','Q']){const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(world[p][i]));b.textContent=`${p==='P'?'Has a key':'Opens the door'} · ${world[p][i]?'On':'Off'}`;b.setAttribute('aria-label',`Agent ${i+1}: ${p==='P'?'has a key':'opens the door'}, ${world[p][i]?'on':'off'}`);b.dataset.cmFocus=`fact-${p}-${i}`;b.addEventListener('click',()=>move({type:'toggle',p,i}));actions.append(b);}c.append(actions);dst.append(c);}
 }else{const c=document.createElement('div');c.className='cm-rel';const t=document.createElement('table');const header=document.createElement('tr');header.append(document.createElement('th'));for(let j=0;j<world.n;j++){const th=document.createElement('th');th.textContent=`To ${j+1}`;header.append(th);}t.append(header);for(let i=0;i<world.n;i++){const tr=document.createElement('tr');const th=document.createElement('th');th.textContent=`From ${i+1}`;tr.append(th);for(let j=0;j<world.n;j++){const td=document.createElement('td');const b=document.createElement('button');b.type='button';b.setAttribute('aria-pressed',String(world.R[i][j]));b.textContent=world.R[i][j]?'● Yes':'○ No';b.setAttribute('aria-label',`R Agent ${i+1} to Agent ${j+1}`);b.dataset.cmFocus=`matrix-${i}-${j}`;b.addEventListener('click',()=>move({type:'toggle_relation',i,j}));td.append(b);tr.append(td);}t.append(tr);}c.append(t);dst.append(c);}
 $('cmRelationMap').hidden=current.kind!=='relation';
 if(current.kind==='relation')renderRelationMap(document,$('cmRelationMap'),world,(i,j)=>move({type:'toggle_relation',i,j}));
 else $('cmRelationMap').replaceChildren();
 if(focusKey)document.querySelector(`[data-cm-focus="${focusKey}"]`)?.focus({preventScroll:true});
 const traj=$('cmTrajectory');traj.replaceChildren();
 for(const step of history.map((action,index)=>({action,index}))){
  const li=document.createElement('li');li.textContent=(step.index+1)+'. '+step.action.type+
    (step.action.p?' '+step.action.p:'')+
    (Number.isInteger(step.action.i)?' agent '+(step.action.i+1):'')+
    (step.action.type==='check'?' — checker feedback requested':'');
  traj.append(li);
 }
 $('cmChecks').textContent=history.filter(a=>a.type==='check').length;$('cmEdits').textContent=history.filter(a=>!['check','hint'].includes(a.type)).length;$('cmHints').textContent=history.filter(a=>a.type==='hint').length;$('cmScore').textContent=localBest[current.id]||'—';
 $('cmDonate').disabled=!(Boolean(checked?.final_verified)&&checked.edits>=1&&$('cmAdult').checked&&$('cmConsent').checked);$('cmLeanExport').disabled=!Boolean(checked?.final_verified);$('cmWitnessExport').disabled=!Boolean(checked?.final_verified);
 renderLearning();
 renderExpedition();$('cmWinNext').hidden=!checked?.final_verified||!expedition(completedSessions).next;
 if(guided)$('cmGuideStatus').textContent=checked?.final_verified?'You made a real counterexample: P is true and Q is false, so P → Q is false while Q → P is true. Restart before an unassisted attempt.':world.n===1&&world.P[0]&&!world.Q[0]?'Now click “Check my world” and compare both truth values.':'For this walkthrough keep one agent, turn “Has a key” (P) on and leave “Opens the door” (Q) off. P → Q says that if P holds, Q must hold. Your clicks create the witness.';
}
$('cmWitnessExport').addEventListener('click',()=>{
 if(!checked?.final_verified)return;
 const doc={format:'pcs-countermodel-witness-v1',version:COUNTERMODEL_VERSION,mission_id:current.id,world:checked.final_world};
 const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)+'\n'],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='pcs-countermodel-witness.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 message('Downloaded the concrete witness. Check independently with pcs countermodel-check-v1; no PCS authority or Lean verdict is claimed.');
});
$('cmSessionExport').addEventListener('click',()=>{
 const record={format:'pcs-countermodel-local-trace-v1',
  scope:'unverified player-recorded action trace; replay on PCS Worker required',
  version:COUNTERMODEL_VERSION,mission_id:current.id,actions:history};
 const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='pcs-countermodel-'+current.id+'-local.json';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
 message('Downloaded your private search notebook. It is not a PCS scientific or Lean certificate.');
});
function choose(id){const m=COUNTERMODEL_MISSIONS.find(x=>x.id===id);if(!m)return;current=m;history=[];undoStack=[];world=initialWorld();checked=null;pendingCoach=null;guided=false;$('cmGuideStatus').textContent='The walkthrough reveals a solution and is marked as assisted. Restart to make an unassisted search.';message('Build a world where the statements disagree, then run the checker.');renderMissions();draw();}
function move(action,recordUndo=true){if(history.length>=120){message('This notebook is full. Restart for a fresh trajectory.','miss');return;}
 const proposed=[...history,action];pendingCoach=null;try{
  const inverse=recordUndo?inverseWorldEdit(action,world):null;
  // Replay state updates are deterministic; keep a direct local mirror for fast UI updates.
  if(action.type==='add'){const w=initialWorld(world.n+1);w.P=world.P.concat(false);w.Q=world.Q.concat(false);for(let i=0;i<world.n;i++)for(let j=0;j<world.n;j++)w.R[i][j]=world.R[i][j];world=w;}
  else if(action.type==='remove')world={n:world.n-1,P:world.P.slice(0,-1),Q:world.Q.slice(0,-1),R:world.R.slice(0,-1).map(row=>row.slice(0,-1))};
  else if(action.type==='toggle')world[action.p][action.i]=!world[action.p][action.i];
  else if(action.type==='toggle_relation')world.R[action.i][action.j]=!world.R[action.i][action.j];
  history=proposed;if(inverse)undoStack.push(inverse);checked=null;message('World changed. Check again to compare the two meanings.');draw();
 }catch{message('That move is outside the supported finite game.','miss');}}
$('cmCheck').addEventListener('click',()=>{pendingCoach=null;if(history.length>=120){message('Notebook full—restart to check a new experiment.','miss');return;}const v=countermodelVerdict(current.id,world);history.push({type:'check'});checked=scoreNow();if(!checked){message('The finite checker rejected this attempt.','miss');return;}if(v.counterexample){if(completedSessions.length<200)completedSessions.push(session());const min=findMinimalCountermodel(current.id);const value=checked.score;if(value>(localBest[current.id]||0)){localBest[current.id]=value;try{localStorage.setItem('pcs-countermodel-best-v1',JSON.stringify(localBest));}catch{}}message(`Counterexample found! Original is ${v.left}, proposal is ${v.right}. Minimum domain size is ${min.n}; your score is ${value}. ${world.n===min.n?'You found a smallest possible world.':'Try removing agents to improve your solution.'}`,'win');}else message('Not yet: both statements have the same truth value here. Change the world and test again.','miss');draw();renderMissions();});
$('cmHint').addEventListener('click',()=>{pendingCoach=null;if(history.length>=120||history.filter(a=>a.type==='hint').length>=3){message('Hint budget used. Try experimenting.','miss');return;}history.push({type:'hint'});checked=scoreNow();let msg='Try asking what changes between the two sentences. Which one requires more?';if(current.kind==='relation')msg='Try two agents. A relation can hold for each agent with a different partner, without one universal partner.';if(history.filter(a=>a.type==='hint').length===2)msg=`Hint: the smallest possible countermodel needs ${findMinimalCountermodel(current.id).n} agent(s).`;message(msg);draw();});
$('cmLeanExport').addEventListener('click',()=>{
 if(!checked?.final_verified)return;
 try{const artifact=exportLeanCountermodel(current.id,world);
  const objectUrl=URL.createObjectURL(new Blob([artifact.lean_source],{type:'text/plain'}));
  const link=document.createElement('a');link.href=objectUrl;link.download=artifact.file_name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  message('Lean source exported. Run it with the pinned Lean 4.28 toolchain; no kernel verdict was claimed here.');
 }catch(e){message('Lean export unavailable: '+e.message,'miss');}
});
$('cmUndo').addEventListener('click',()=>{
 const inverse=undoStack.at(-1);if(!inverse)return;
 if(history.length+inverse.length>120){message('The notebook is too full to record this undo. Restart for a fresh search.','miss');return;}
 undoStack.pop();for(const action of inverse)move(action,false);
 message('Last move reversed. The notebook keeps the original move and its reversal; hints and checks still count. Check the changed world again.');draw();if($('cmUndo').disabled)$('cmWorld').querySelector('button')?.focus({preventScroll:true});else $('cmUndo').focus({preventScroll:true});
});
$('cmRestart').addEventListener('click',()=>choose(current.id));$('cmAdd').addEventListener('click',()=>move({type:'add'}));$('cmRemove').addEventListener('click',()=>move({type:'remove'}));
for(const id of ['cmAdult','cmConsent'])$(id).addEventListener('change',draw);
async function request(path,payload){if(path !== "/api/arena/countermodel/donate" && path !== "/api/arena/countermodel/erase")throw Error('Unreviewed research endpoint');const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});let data={};try{data=await response.json();}catch{}if(!response.ok)throw Error(data.message||data.error||'Request failed');return data;}
$('cmDonate').addEventListener('click',async()=>{const out=$('cmDonateStatus');if(!checked?.final_verified||checked.edits<1||!$('cmAdult').checked||!$('cmConsent').checked)return;const btn=$('cmDonate');btn.disabled=true;out.textContent='Replaying on the PCS server…';try{const data=await request('/api/arena/countermodel/donate',{adult_confirmation:true,consent_training:true,session:{version:COUNTERMODEL_VERSION,mission_id:current.id,actions:history}});out.textContent=data.recorded?'Verified research session donated. Thank you.':'This exact session was already recorded.';}catch(e){out.textContent=`Not uploaded: ${e.message}. You can keep playing privately.`;}draw();});
$('cmErase').addEventListener('click',async()=>{if(!window.confirm('Delete all your stored Countermodel Lab sessions from PCS active storage? This cannot recall previous offline exports.'))return;const out=$('cmDonateStatus');try{const data=await request('/api/arena/countermodel/erase',{});out.textContent=`Deleted ${data.deleted} stored sessions from the active PCS database.`;}catch(e){out.textContent=`Deletion request failed: ${e.message}`;}});
// The learning collection is memory-only; no telemetry or participant upload.
function renderLearning(){
 const training=notebooks.filter(e=>!e.replay.hints&&!EVALUATION_MISSIONS.includes(e.session.mission_id)).length;
 const evaluation=notebooks.filter(e=>!e.replay.hints&&EVALUATION_MISSIONS.includes(e.session.mission_id)).length;
 const assisted=notebooks.filter(e=>e.replay.hints).length;
 $('cmNotebookCount').textContent=`${notebooks.length} private notebook(s) · ${training} training · ${evaluation} held-out · ${assisted} assisted/excluded. Limit: 20 in this tab.`;
 const list=$('cmNotebookList');list.replaceChildren();
 for(const entry of notebooks){const item=document.createElement('li'),mission=COUNTERMODEL_MISSIONS.find(m=>m.id===entry.session.mission_id);
  item.textContent=`${mission.name}: ${entry.session.actions.length} actual moves · ${entry.replay.hints?'assisted, excluded':EVALUATION_MISSIONS.includes(mission.id)?'held out from fitting':'training'}`;list.append(item);}
 $('cmNotebookSave').disabled=learningBusy||!checked?.final_verified||notebooks.length>=20;
 $('cmTrain').disabled=learningBusy||training===0;
 $('cmNotebookClear').disabled=learningBusy||(!notebooks.length&&!coachModel);
 $('cmModelFile').disabled=learningBusy;
 $('cmModelDownload').disabled=learningBusy||!coachModel;
 $('cmCoach').disabled=learningBusy||!coachModel||history.length>=119||history.filter(a=>a.type==='hint').length>=3;
 $('cmCoachApply').disabled=learningBusy||!pendingCoach||history.length>=120;
}
function localSessions(){return notebooks.map(e=>e.session);}
function evaluateLearningModel(){
 if(!coachModel){$('cmLearningEvaluation').textContent='';return;}
 const report=evaluateSearchSessions(coachModel,localSessions());
 $('cmLearningEvaluation').textContent=report.examples?`Held-out move agreement: ${report.model_correct}/${report.examples}. Training-action prior: ${report.training_action_prior_correct}/${report.examples}; uniform-choice expected count: ${report.uniform_random_expected_correct.toFixed(2)}. These are unassisted choices from held-out missions, not a solution-rate or generalization claim.`:'Not evaluated: save an unassisted held-out mission notebook. No evaluation result is invented.';
}
function downloadLearningModel(){if(!coachModel)return;const url=URL.createObjectURL(new Blob([JSON.stringify(coachModel,null,2)+'\n'],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='pcs-countermodel-search-model.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function learningSourceDigest(path){
 if(!LEARNING_SOURCE_ASSETS.has(path))throw Error('Unreviewed learning source');
 const response=await fetch(path,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Current trainer source unavailable');
 if(Number(response.headers.get('content-length'))>65536)throw Error('Trainer source exceeds byte budget');
 const text=await response.text();if(new TextEncoder().encode(text).length>65536)throw Error('Trainer source exceeds byte budget');return shaText(text);
}
async function implementationDigests(){
 implementationPromise??=Promise.all([...LEARNING_SOURCE_ASSETS].map(learningSourceDigest)).then(([trainer_sha256,fitter_sha256,features_sha256])=>({trainer_sha256,fitter_sha256,features_sha256}));
 try{return await implementationPromise;}catch(error){implementationPromise=undefined;throw error;}
}
$('cmGuideStart').addEventListener('click',()=>{choose('implication-flip');guided=true;history.push({type:'hint'});draw();$('cmWorld').scrollIntoView({block:'center',behavior:'smooth'});});
$('cmNotebookSave').addEventListener('click',()=>{
 if(!checked?.final_verified||notebooks.length>=20)return;
 const entry=normalizeSearchSession({version:COUNTERMODEL_VERSION,mission_id:current.id,actions:history});
 if(notebooks.some(e=>JSON.stringify(e.session)===JSON.stringify(entry.session))){$('cmLearningStatus').textContent='This exact notebook is already in your private collection.';return;}
 notebooks.push(entry);$('cmLearningStatus').textContent=entry.replay.hints?'Saved privately, marked assisted and excluded from fitting and evaluation. Restart to make an unassisted search.':'Saved your actual choices privately. Fit the coach to training missions; held-out missions are used only for evaluation.';
 renderLearning();evaluateLearningModel();
});
$('cmNotebookClear').addEventListener('click',()=>{modelRevision++;notebooks=[];coachModel=null;pendingCoach=null;
 $('cmLearningStatus').textContent='Private learning collection and model cleared from this tab. Downloaded files remain on your device.';
 $('cmCoachStatus').textContent='No coach loaded.';evaluateLearningModel();renderLearning();});
$('cmTrain').addEventListener('click',async()=>{
 if(learningBusy)return;const token=++modelRevision;learningBusy=true;pendingCoach=null;renderLearning();$('cmLearningStatus').textContent='Fitting real coefficients from replayed unassisted choices…';
 try{const hashes=await implementationDigests(),fitted=await fitLocalSearchModel(localSessions(),hashes);
  const validated=await validateSearchModelJSON(JSON.stringify(fitted),{featuresSHA256:hashes.features_sha256});if(token!==modelRevision)return;
  coachModel=validated;$('cmLearningStatus').textContent=`Fitted ${coachModel.weights.flat().length} coefficients over ${coachModel.training.epochs} epochs from ${coachModel.training.examples} choices in ${coachModel.training.episodes} unassisted training notebook(s). Model SHA-256: ${coachModel.model_digest_sha256}.`;
  $('cmCoachStatus').textContent='Your fitted coach is ready. A suggestion records hint assistance; the checker still decides whether it works.';evaluateLearningModel();
 }catch(error){if(token===modelRevision){coachModel=null;$('cmLearningStatus').textContent='No model accepted: '+error.message;evaluateLearningModel();}}
 finally{learningBusy=false;renderLearning();}
});
$('cmModelDownload').addEventListener('click',downloadLearningModel);
$('cmModelFile').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file)return;const token=++modelRevision;coachModel=null;pendingCoach=null;learningBusy=true;renderLearning();
 try{if(file.size>65536)throw Error('Model exceeds the 64 KiB byte budget');const hashes=await implementationDigests();
  const validated=await validateSearchModelJSON(await file.text(),{featuresSHA256:hashes.features_sha256});if(token!==modelRevision)return;
  coachModel=validated;$('cmLearningStatus').textContent=`Loaded a format- and integrity-checked local model with ${validated.training.examples} claimed training choices. Offline provenance assertions are not authenticated. Model SHA-256: ${validated.model_digest_sha256}.`;
  $('cmCoachStatus').textContent='Imported model proposes only legal moves. Every suggestion is marked as assistance and never replaces the checker.';evaluateLearningModel();
 }catch(error){if(token===modelRevision){coachModel=null;$('cmLearningStatus').textContent='Model rejected: '+error.message;evaluateLearningModel();}}
 finally{learningBusy=false;event.target.value='';renderLearning();}
});
function actionDescription(a){return a.type==='toggle'?`toggle ${a.p} for Agent ${a.i+1}`:a.type==='toggle_relation'?`toggle R from Agent ${a.i+1} to Agent ${a.j+1}`:a.type==='add'?'add one agent':a.type==='remove'?'remove the last agent':'request a checker result';}
$('cmCoach').addEventListener('click',()=>{
 if(!coachModel||history.length>=119||history.filter(a=>a.type==='hint').length>=3)return;
 const row=rankSearchActions(coachModel,current.id,world,history.some(a=>['check','hint'].includes(a.type)))[0];
 history.push({type:'hint'});checked=scoreNow();pendingCoach={action:structuredClone(row.action)};
 $('cmCoachStatus').textContent=`Suggested move: ${actionDescription(row.action)}. Ranking score ${row.score.toFixed(4)} is not a probability or a checker verdict. This session is now marked model-assisted.`;
 draw();
});
$('cmCoachApply').addEventListener('click',()=>{if(!pendingCoach)return;const action=pendingCoach.action;pendingCoach=null;if(action.type==='check')$('cmCheck').click();else move(action);});
$('cmWinNext').addEventListener('click',()=>$('cmNext').click());
$('cmNext').addEventListener('click',()=>{const next=expedition(completedSessions).next;if(next){choose(next);$('cmTitle').scrollIntoView({behavior:'smooth',block:'start'});}});
$('cmDaily').addEventListener('click',()=>{const date=new Date().toISOString().slice(0,10);choose(dailyMission(date));$('cmDailyStatus').textContent=`${date} UTC challenge: ${current.name}. Earn all three mastery goals: minimal world, no help, at most two checks.`;$('cmTitle').scrollIntoView({behavior:'smooth',block:'start'});});
const requestedMission=new URLSearchParams(location.search).get('mission');
choose(COUNTERMODEL_MISSIONS.find(m=>m.id===requestedMission)?.id||'implication-flip');
