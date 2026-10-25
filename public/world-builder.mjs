import {MISSIONS, newSession, missionFor, addAction, sessionView, collectSession, notebook, readNotebook, verifyRuleset} from './world-builder-core.mjs';
import {plainMission, inverseWorldEdit, renderRelationMap} from './countermodel-visual.mjs';
import {replayCountermodelSession, exportLeanCountermodel, findMinimalCountermodel} from './countermodel-core.mjs';
import {explainWorld,mastery} from './countermodel-expedition.mjs';

import {routeCertificate,editWorld} from './search-route-core.mjs';

const $ = id => document.getElementById(id);
await verifyRuleset(); // Controls stay disabled if the reviewed semantics do not match.
const el = (tag, text, cls) => {const e=document.createElement(tag); if(text!==undefined)e.textContent=text; if(cls)e.className=cls; return e;};
let active = newSession(MISSIONS[0]), saved = [], undo = [], solved = new Set(), busy = false;
let playback = null, frame = 0;
let imported = [], playbackImported = false, fileGeneration = 0, loadingFile = false;
let coach=null,coachFrame=0,coachGeneration=0,coachLoading=false,shareIdentity=null;
const earned = new Map();
const character = i => `Character ${i+1}`;
const plain = text => text.replace(/agent/gi, s => s[0]==='A'?'Character':'character').replace(/relates to/g,'sends a signal to').replace(/relate to/g,'send a signal to').replace(/partners/g,'signal recipients');
function feedback(text, state='') { $('wbFeedback').textContent=text; $('wbFeedback').dataset.state=state; }
function download(name, data, type='application/json') {
 const url=URL.createObjectURL(new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)+'\n'],{type}));
 const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function allSessions() {
 return active.actions.some(a=>a.type==='check') ? collectSession(saved,active) : structuredClone(saved);
}
function archive() {
 try {const next=allSessions();if(next.length>=20)throw Error('Twenty rounds are ready to save. Download the notebook, then clear it before starting another round.');saved=next;return true;} catch(e) {feedback(e.message,'miss');return false;}
}
function resumePlay(){
 coachGeneration++;coachLoading=false;coach=null;$('wbCoachResult').hidden=true;$('wbCoachStatus').textContent='Optional. Try your own ideas first.';
 fileGeneration++;loadingFile=false;
 if(playbackImported){$('wbAdult').checked=false;$('wbConsent').checked=false;}
 playbackImported=false;$('wbReplayPanel').hidden=true;
 if($('wbLoadStatus').dataset.state==='loading'){$('wbLoadStatus').dataset.state='idle';$('wbLoadStatus').textContent='File reading cancelled. Your live round is active.';}
}
function start(id) {
 if(!archive())return;
 resumePlay();
 active=newSession(id);undo=[];$('wbAdult').checked=false;$('wbConsent').checked=false;
 $('wbReplayPanel').hidden=true;$('wbShareStatus').textContent='Optional. No automatic upload.';
 feedback('Make one change, then test whether the rules disagree.');render();
}
function act(action, recordUndo=true) {
 try {
   const before=sessionView(active).world;
   const next=addAction(active,action);
   resumePlay();
   if(recordUndo)undo.push(inverseWorldEdit(action,before));
   active=next;$('wbReplayPanel').hidden=true;
   feedback('Your world changed. Test it to see what both rules say.');render();
 } catch(e) {feedback(e.message,'miss');}
}
function avatar(card, i, world, relation) {
 // Static decorative geometry. No user strings, proof output or files enter HTML.
 const art=document.createElementNS('http://www.w3.org/2000/svg','svg');art.setAttribute('viewBox','0 0 190 120');art.setAttribute('aria-hidden','true');
 art.innerHTML='<ellipse cx="93" cy="109" rx="74" ry="7" fill="#bfd6bc"/><g class="wb-door"><rect x="121" y="19" width="46" height="87" rx="6" fill="#526d64"/><rect x="126" y="24" width="36" height="78" rx="3" fill="#eaf7d5"/><g class="wb-door-leaf"><rect x="126" y="24" width="36" height="78" rx="3" fill="#deab6c"/><circle cx="153" cy="66" r="3" fill="#71522a"/></g></g><g class="wb-avatar"><path d="M51 86 L47 105 M72 86 L77 105" stroke="#305371" stroke-width="9" stroke-linecap="round"/><rect x="38" y="46" width="49" height="43" rx="15" fill="#4e9c93"/><path d="M42 59 L29 77 M83 58 L96 66" stroke="#4e9c93" stroke-width="9" stroke-linecap="round"/><rect x="40" y="11" width="45" height="38" rx="15" fill="#f6d5aa"/><circle cx="53" cy="28" r="3" fill="#26454e"/><circle cx="72" cy="28" r="3" fill="#26454e"/><path d="M57 38 Q63 43 69 38" stroke="#8f6247" stroke-width="2" fill="none"/></g><g class="wb-key-object" fill="none" stroke="#b47b0b" stroke-width="5"><circle cx="102" cy="59" r="8"/><path d="M103 67 L103 90 M103 82 L112 82 M103 89 L110 89"/></g>';
 if(relation){art.querySelectorAll('.wb-door,.wb-key-object').forEach(e=>e.remove());art.setAttribute('viewBox','18 0 95 120');}
 card.dataset.key=world.P[i];card.dataset.door=world.Q[i];card.append(art);
}
function renderWorld(world, relation) {
 const root=$('wbWorld');root.replaceChildren();root.dataset.kind=relation?'relation':'unary';
 for(let i=0;i<world.n;i++) {
   const card=el('div',undefined,'wb-character');card.append(el('h4',character(i)));avatar(card,i,world,relation);
   if(!relation)for(const p of ['P','Q']) {
     const b=el('button');b.type='button';b.dataset.wbFocus=`${p}-${i}`;b.dataset.fact=p;b.dataset.character=i;
     b.setAttribute('aria-pressed',String(world[p][i]));b.setAttribute('aria-label',`${character(i)}: ${p==='P'?'has a key':'opens the door'}, ${world[p][i]?'yes':'no'}`);
     b.append(el('span',p==='P'?'Has a key':'Opens the door'),el('span',world[p][i]?'Yes':'No'));
     b.addEventListener('click',()=>act({type:'toggle',p,i}));card.append(b);
   }
   root.append(card);
 }
 const map=$('wbRelations');map.hidden=!relation;map.replaceChildren();
 if(relation) {
   renderRelationMap(document,map,world,(i,j)=>act({type:'toggle_relation',i,j}));
   labelSignals(map,world.n);
   // Full-size equivalent controls keep every directed edge reachable on touch.
   const group=el('div',undefined,'wb-signal-controls');group.setAttribute('role','group');group.setAttribute('aria-label','Signal switches: sender to recipient');
   for(let i=0;i<world.n;i++)for(let j=0;j<world.n;j++) {
     const b=el('button',`${i+1} → ${j+1} · ${world.R[i][j]?'On':'Off'}`);b.type='button';b.dataset.wbFocus=`R-${i}-${j}`;
     b.setAttribute('aria-label',`${character(i)} sends a signal to ${character(j)}, ${world.R[i][j]?'on':'off'}`);b.setAttribute('aria-pressed',String(world.R[i][j]));
     b.addEventListener('click',()=>act({type:'toggle_relation',i,j}));group.append(b);
   }
   map.append(group);
 }
}
function labelSignals(root,n){
 if(n<3)root.querySelector('svg').setAttribute('viewBox','0 45 360 180');
 root.querySelectorAll('text').forEach(t=>{if(/^Agent \d+$/.test(t.textContent))t.textContent='#'+t.textContent.split(' ')[1];});
 root.querySelectorAll('[aria-label]').forEach(e=>e.setAttribute('aria-label',e.getAttribute('aria-label').replace(/Agent/g,'Character')));
}
function renderExplanation(view) {
 const root=$('wbExplanation');root.replaceChildren();
 if(!view.checked){root.append('Test your current world to see the reasoning. Changes make earlier results stale.');return;}
 const evidence=explainWorld(active.mission_id,view.world);
 const branch=n=>{const li=el('li',`${n.value?'True':'False'} · ${plain(n.label)}`);if(n.children.length){const ul=el('ul');n.children.forEach(c=>ul.append(branch(c)));li.append(ul);}return li;};
 for(const [name,node] of [['Original rule',evidence.left],['Rewrite',evidence.right]]){root.append(el('h4',name));const ul=el('ul');ul.append(branch(node));root.append(ul);}
}
function render() {
 const focus=document.activeElement?.dataset?.wbFocus;
 const edgeFocus=document.activeElement?.dataset?.cmFocus;
 const view=sessionView(active), m=missionFor(active.mission_id), win=Boolean(view.checked?.final_verified), index=MISSIONS.indexOf(m.id);
 $('wbTitle').textContent=m.name;$('wbNumber').textContent=`PUZZLE ${index+1} OF 7`;
 const totalStars=[...earned.values()].reduce((n,g)=>n+['minimal','independent','precise'].filter(k=>g[k]).length,0);
 $('wbProgress').textContent=`${solved.size} of 7 discovered · ${totalStars}/21 stars · this tab only`;
 const path=$('wbPath');path.replaceChildren();
 MISSIONS.forEach((id,i)=>{const b=el('button',String(i+1));b.type='button';b.setAttribute('aria-label',`Puzzle ${i+1}: ${missionFor(id).name}${solved.has(id)?', discovered':''}`);b.setAttribute('aria-pressed',String(id===m.id));b.dataset.solved=solved.has(id);b.dataset.wbFocus=`mission-${i}`;b.addEventListener('click',()=>start(id));path.append(b);});
 const meanings=plainMission(m.id);$('wbLeft').textContent=plain(meanings[0]);$('wbRight').textContent=plain(meanings[1]);
 for(const [id,key] of [['wbLeftResult','left'],['wbRightResult','right']]){const r=$(id);r.textContent=view.checked?`${view.checked.final_verdict[key]?'True':'False'} in this world`:'Not tested';if(view.checked)r.dataset.truth=view.checked.final_verdict[key];else delete r.dataset.truth;}
 $('wbCount').textContent=`${view.world.n} character${view.world.n===1?'':'s'}`;
 $('wbWorldNote').textContent=m.kind==='unary'?'Tap a key or door switch.':'Who sends a signal to whom?';
 $('wbBoardHint').textContent=m.kind==='unary'?'Yes means that fact is true. No means it is false. The picture shows your choices; only “Test” checks the rules.':'Tap an arrow or a signal switch. A loop sends to the same character. Signals are directed; 1 → 2 differs from 2 → 1.';
 renderWorld(view.world,m.kind==='relation');
 $('wbAdd').disabled=view.world.n>=3||active.actions.length>=119;$('wbRemove').disabled=view.world.n<=1||active.actions.length>=119;
 $('wbUndo').disabled=!undo.length||active.actions.length>=119;$('wbCheck').disabled=active.actions.length>=120;
 $('wbHint').disabled=view.hints>=3||active.actions.length>=119;
 $('wbCoachShow').disabled=coachLoading||view.hints>=3||active.actions.length>=119;$('wbRestart').disabled=false;
 $('wbStats').textContent=`${view.edits} moves · ${view.checks} tests · ${view.hints} clues${view.hints?' · assisted round':''}`;
 $('wbWin').hidden=!win;
 $('wbWinDetail').textContent=win?`${view.world.n===view.checked.minimum_domain_size?'A smallest possible world.':'Can you find a smaller world?'} ${view.hints?'Clues were used; this stays marked as assisted.':'No clues used in this round.'}`:'';
 const stars=$('wbStars');stars.replaceChildren();
 if(win){const goals=mastery(active);for(const [key,label]of [['minimal','Smallest world'],['independent','No clues'],['precise','Two tests or fewer, no clues']]){const item=el('span',`${goals[key]?'★':'☆'} ${label}`);item.dataset.earned=goals[key];item.setAttribute('role','listitem');stars.append(item);}}
 $('wbNext').textContent=solved.size===7?'Explore another puzzle →':'Next puzzle →';
 $('wbWitness').disabled=!win||playbackImported;$('wbProof').disabled=!win||playbackImported;
 let records=[];try{records=allSessions();}catch{records=saved;}
 const checkedRounds=records.map(s=>replayCountermodelSession(s));
 const tests=checkedRounds.reduce((n,r)=>n+r.checks,0);
 const failed=checkedRounds.reduce((n,r)=>n+r.steps.filter(s=>s.received_checker_response&&!s.counterexample).length,0);
 $('wbNotebookSummary').textContent=`${records.length} tested rounds · ${tests} tests · ${failed} unsuccessful tests retained. Up to 20 rounds; no identifiers or free-text answers.`;
 $('wbDownload').disabled=!records.length;$('wbReplay').disabled=!view.checks;$('wbClear').disabled=!records.length&&!active.actions.length&&!imported.length&&!loadingFile;
 $('wbFile').disabled=false;$('wbImportedRound').disabled=!imported.length;$('wbViewImported').disabled=!imported.length;
 const prior=$('wbShareRound').value;
 const options=$('wbShareRound');options.replaceChildren();
 for(const [i,s]of records.entries()){const r=checkedRounds[i],o=el('option',`${i+1}. ${missionFor(s.mission_id).name} · ${r.final_verified?'difference tested':'unfinished search'} · ${r.checks} tests${r.hints?' · assisted':''}`);o.value=JSON.stringify(s);options.append(o);}
 if([...options.options].some(o=>o.value===prior))options.value=prior;else options.selectedIndex=options.options.length-1;
 options.disabled=!records.length||playbackImported;
 const selected=selectedRound();
 const identity=selected?JSON.stringify(selected):null;
 if(identity!==shareIdentity){$('wbAdult').checked=false;$('wbConsent').checked=false;shareIdentity=identity;}
 const r=selected?replayCountermodelSession(selected):null;
 $('wbSharePreview').textContent=playbackImported?'Saved-file replay is read-only and cannot be donated. Return to your live round to share your own choices.':r?`Selected own round: ${r.edits} moves, ${r.checks} tests, ${r.hints} clues. ${r.final_verified?'A difference was tested.':'No final difference was tested; failed searches are valuable, too.'} ${r.hints?'Assisted: excluded from unassisted fitting.':'Human independence cannot be authenticated.'}`:'Test a world to enable sharing. Failed searches are welcome.';
 $('wbDonate').disabled=busy||playbackImported||!selected||!$('wbAdult').checked||!$('wbConsent').checked;
 renderExplanation(view);
 if(focus)document.querySelector(`[data-wb-focus="${CSS.escape(focus)}"]`)?.focus({preventScroll:true});
 else if(edgeFocus)document.querySelector(`[data-cm-focus="${CSS.escape(edgeFocus)}"]`)?.focus({preventScroll:true});
 $('wbApp').dataset.ready='true';
}
$('wbCheck').addEventListener('click',()=>{
 try {
   resumePlay();
   active=addAction(active,{type:'check'});const r=sessionView(active).checked;
   if(r.final_verified){solved.add(active.mission_id);const goals=mastery(active),prior=earned.get(active.mission_id)||{};for(const k of ['minimal','independent','precise'])prior[k]||=goals[k];earned.set(active.mission_id,prior);feedback(`Difference found. The original rule is ${r.final_verdict.left?'true':'false'}; the rewrite is ${r.final_verdict.right?'true':'false'}. Your world shows that they mean different things.`,'win');}
   else feedback('The rules agree in this world. That is useful feedback, not a dead end. Change a fact or add a character, then try again.','miss');
   $('wbShareRound').value='';$('wbReplayPanel').hidden=true;render();
 }catch(e){feedback(e.message,'miss');}
});
$('wbAdd').addEventListener('click',()=>act({type:'add'}));$('wbRemove').addEventListener('click',()=>act({type:'remove'}));
$('wbUndo').addEventListener('click',()=>{
 const edits=undo.at(-1);if(!edits)return;
 try{let next=active;for(const a of edits)next=addAction(next,a);resumePlay();active=next;undo.pop();feedback('Move reversed. Your notebook keeps both moves, and all tests and clues. Test the changed world again.');render();}catch(e){feedback(e.message,'miss');}
});
$('wbHint').addEventListener('click',()=>{
 try{active=addAction(active,{type:'hint'});resumePlay();const v=sessionView(active);render();feedback(v.hints===1?'Compare the changed words in the two rules. What does one require that the other does not? This round is now marked as assisted.':v.hints===2?`A smallest possible counterexample for this puzzle uses ${findMinimalCountermodel(active.mission_id).n} character(s). This clue is recorded.`:'Try making one rule true and the other false. Think about a case the stricter rule would reject; then test it. This clue is recorded.');}catch(e){feedback(e.message,'miss');}
});
$('wbRestart').addEventListener('click',()=>start(active.mission_id));
$('wbNext').addEventListener('click',()=>{const next=MISSIONS.find(id=>!solved.has(id))||MISSIONS[(MISSIONS.indexOf(active.mission_id)+1)%MISSIONS.length];start(next);$('wbPuzzle').scrollIntoView({block:'start',behavior:'instant'});});
$('wbWitness').addEventListener('click',()=>{const v=sessionView(active);if(v.checked?.final_verified)download('pcs-countermodel-witness.json',{format:'pcs-countermodel-witness-v1',version:active.version,mission_id:active.mission_id,world:v.world});});
$('wbProof').addEventListener('click',()=>{const v=sessionView(active);if(v.checked?.final_verified){const p=exportLeanCountermodel(active.mission_id,v.world);download(p.file_name,p.lean_source,'text/plain');}});
$('wbDownload').addEventListener('click',()=>{try{download('pcs-world-builder-notebook.json',JSON.stringify(notebook(allSessions()))+'\n');}catch(e){feedback(e.message,'miss');}});
function showPlayback(session,fromFile=false){
 try{const r=replayCountermodelSession(session),list=$('wbTimeline');list.replaceChildren();
 for(const s of r.steps){const a=s.action;let text=a.type==='check'?`Test: original ${s.source_true?'true':'false'}, rewrite ${s.proposal_true?'true':'false'} — ${s.counterexample?'difference found':'rules agree'}.`:a.type==='hint'?'A clue was viewed (assistance recorded).':a.type==='toggle'?`${character(a.i)}: toggled ${a.p==='P'?'has a key':'opens the door'}.`:a.type==='toggle_relation'?`Toggled signal ${a.i+1} → ${a.j+1}.`:a.type==='add'?'Added a character.':'Removed the last character.';list.append(el('li',text));}
 playback=r;playbackImported=fromFile;frame=0;
 $('wbReplayTitle').textContent=(fromFile?'Saved-file round (read-only): ':'Your live round: ')+missionFor(session.mission_id).name;
 renderPlayback();render();$('wbReplayPanel').hidden=false;
 }catch(e){feedback(e.message,'miss');}
}
$('wbReplay').addEventListener('click',()=>{resumePlay();showPlayback(active);});
$('wbReturn').addEventListener('click',()=>{resumePlay();render();});
$('wbViewImported').addEventListener('click',()=>{const i=Number($('wbImportedRound').value);if(Number.isInteger(i)&&imported[i])showPlayback(imported[i],true);});
$('wbFile').addEventListener('change',async()=>{
 const generation=++fileGeneration,file=$('wbFile').files[0];loadingFile=true;imported=[];playbackImported=false;
 $('wbImportedRound').replaceChildren();$('wbReplayPanel').hidden=true;$('wbAdult').checked=false;$('wbConsent').checked=false;
 $('wbLoadStatus').dataset.state='loading';$('wbLoadStatus').textContent='Reading this file locally…';render();
 try{
  if(!file)throw Error('Choose a notebook file.');if(file.size>131072)throw Error('File exceeds 128 KiB.');
  const raw=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
  const n=readNotebook(raw);await verifyRuleset();if(generation!==fileGeneration)return;
  imported=n.sessions;
  imported.forEach((s,i)=>{const o=el('option',`${i+1}. ${missionFor(s.mission_id).name} · ${s.actions.length} moves`);o.value=i;$('wbImportedRound').append(o);});
  $('wbLoadStatus').dataset.state='loaded';$('wbLoadStatus').textContent=`Opened ${imported.length} recorded rounds locally. These are replayable choices, not authenticated human data or Lean receipts.`;
  showPlayback(imported[0],true);
 }catch(e){if(generation===fileGeneration){$('wbLoadStatus').dataset.state='error';$('wbLoadStatus').textContent='File not accepted: '+e.message;}}
 finally{if(generation===fileGeneration){loadingFile=false;render();}}
});
function renderPlayback(){
 if(!playback)return;
 const step=frame?playback.steps[frame-1]:null,world=step?step.world:playback.steps[0].state_before;
 $('wbFrame').textContent=`Move ${frame} of ${playback.steps.length}`;
 $('wbBack').disabled=frame===0;$('wbForward').disabled=frame===playback.steps.length;
 $('wbReplayObservation').textContent=!step?'The starting world. No checker response yet.':step.received_checker_response?`Test requested: original ${step.source_true?'true':'false'}, rewrite ${step.proposal_true?'true':'false'}. ${step.counterexample?'Difference found.':'Rules agree.'}`:step.action.type==='hint'?'A clue was viewed. Assistance stays recorded.':'An edit changed the world. No checker response was requested on this move.';
 const root=$('wbReplayWorld');root.replaceChildren();
 const relation=missionFor(playback.mission_id).kind==='relation';
 root.dataset.kind=relation?'relation':'unary';
 for(let i=0;i<world.n;i++){
  const card=el('div',undefined,'wb-character');card.append(el('h4',character(i)));avatar(card,i,world,relation);
  if(!relation)card.append(el('p',`Key: ${world.P[i]?'yes':'no'} · Door: ${world.Q[i]?'opens':'does not open'}`));
  root.append(card);
 }
 if(relation){const map=el('div',undefined,'wb-relations');renderRelationMap(document,map,world,()=>{});labelSignals(map,world.n);
  map.querySelector('marker').id='wbReplayArrow';map.querySelectorAll('[marker-end]').forEach(e=>e.setAttribute('marker-end','url(#wbReplayArrow)'));
  map.querySelectorAll('[tabindex]').forEach(e=>{e.removeAttribute('tabindex');e.removeAttribute('role');e.removeAttribute('aria-pressed');});
  const svg=map.querySelector('svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Read-only snapshot of the recorded signals');svg.style.pointerEvents='none';
  root.append(map);const signals=[];for(let i=0;i<world.n;i++)for(let j=0;j<world.n;j++)if(world.R[i][j])signals.push(`${i+1} → ${j+1}`);
  root.append(el('p','Recorded signals: '+(signals.join(', ')||'none')));
 }
}
function renderCoach(){
 if(!coach)return;
 let world=coach.start_world;for(const a of coach.actions.slice(0,coachFrame))world=editWorld(coach.mission_id,world,a);
 const root=$('wbCoachWorld');root.replaceChildren();const relation=missionFor(coach.mission_id).kind==='relation';root.dataset.kind=relation?'relation':'unary';
 for(let i=0;i<world.n;i++){const card=el('div',undefined,'wb-character');card.append(el('h4',character(i)));avatar(card,i,world,relation);if(!relation)card.append(el('p',`Key: ${world.P[i]?'yes':'no'} · Door: ${world.Q[i]?'opens':'does not open'}`));root.append(card);}
 if(relation){const signals=[];for(let i=0;i<world.n;i++)for(let j=0;j<world.n;j++)if(world.R[i][j])signals.push(`${i+1} → ${j+1}`);const map=el('div',undefined,'wb-relations');renderRelationMap(document,map,world,()=>{});labelSignals(map,world.n);map.querySelector('marker').id='wbCoachArrow';map.querySelectorAll('[marker-end]').forEach(e=>e.setAttribute('marker-end','url(#wbCoachArrow)'));map.querySelectorAll('[tabindex]').forEach(e=>{e.removeAttribute('tabindex');e.removeAttribute('role');e.removeAttribute('aria-pressed');});map.querySelector('svg').style.pointerEvents='none';root.append(map,el('p','Example signals: '+(signals.join(', ')||'none')));}
 $('wbCoachFrame').textContent=`Example ${coachFrame} of ${coach.actions.length}`;$('wbCoachBack').disabled=!coachFrame;$('wbCoachNext').disabled=coachFrame===coach.actions.length;
 const a=coach.actions[coachFrame-1];$('wbCoachMove').textContent=!a?'Start: your world when you requested this clue.':a.type==='add'?'Example: add a character.':a.type==='remove'?'Example: remove the last character.':a.type==='toggle'?`Example: toggle ${a.p==='P'?'key':'door'} for Character ${a.i+1}.`:`Example: toggle signal ${a.i+1} → ${a.j+1}.`;
 $('wbCoachResult').hidden=false;
}
$('wbCoachShow').addEventListener('click',async()=>{
 if(coachLoading||sessionView(active).hints>=3||active.actions.length>=119)return;
 let generation;
 try{
  resumePlay();active=addAction(active,{type:'hint'});const snapshot=structuredClone(active);generation=++coachGeneration;coachLoading=true;render();$('wbCoachStatus').textContent='Checking all finite worlds. Clue recorded; this round is assisted.';
  const c=await routeCertificate(snapshot.mission_id,sessionView(snapshot).world);if(generation!==coachGeneration)return;
  coach=c;coachFrame=0;coachLoading=false;render();renderCoach();$('wbCoachStatus').textContent=`A shortest example uses ${c.minimum_edits} world edit(s). ${c.state_count} states checked. Your actual moves are unchanged. Test your own world after editing.`;
 }catch(e){if(generation!==coachGeneration)return;coachLoading=false;render();$('wbCoachStatus').textContent='Route unavailable: '+e.message;}
});
$('wbCoachBack').addEventListener('click',()=>{coachFrame=Math.max(0,coachFrame-1);renderCoach();});
$('wbCoachNext').addEventListener('click',()=>{if(coach){coachFrame=Math.min(coach.actions.length,coachFrame+1);renderCoach();}});
$('wbCoachDownload').addEventListener('click',()=>{if(coach)download('pcs-checked-route.json',coach);});
$('wbBack').addEventListener('click',()=>{if(playback){frame=Math.max(0,frame-1);renderPlayback();}});
$('wbForward').addEventListener('click',()=>{if(playback){frame=Math.min(playback.steps.length,frame+1);renderPlayback();}});
$('wbClear').addEventListener('click',()=>{resumePlay();saved=[];imported=[];playback=null;solved.clear();earned.clear();active=newSession(MISSIONS[0]);undo=[];$('wbAdult').checked=false;$('wbConsent').checked=false;$('wbFile').value='';$('wbImportedRound').replaceChildren();$('wbLoadStatus').dataset.state='idle';$('wbLoadStatus').textContent='No saved notebook opened.';feedback('Local notebook cleared. This does not delete previously donated server records; use the full lab’s deletion control for those.');render();});
for(const id of ['wbAdult','wbConsent'])$(id).addEventListener('change',render);
function selectedRound(){
 const value=$('wbShareRound').value;return allSessions().find(s=>JSON.stringify(s)===value)||null;
}
$('wbShareRound').addEventListener('change',()=>{$('wbAdult').checked=false;$('wbConsent').checked=false;render();});
$('wbDonate').addEventListener('click',async()=>{
 const selected=selectedRound();
 if(busy||playbackImported||!selected||!$('wbAdult').checked||!$('wbConsent').checked)return;
 const snapshot=structuredClone(selected),identity=JSON.stringify(snapshot);busy=true;render();$('wbShareStatus').textContent='Sending this snapshot for independent server replay…';
 try{
   const r=await fetch('/api/arena/countermodel/search-donate',{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({adult_confirmation:true,consent_training:true,session:snapshot})});
   const data=await r.json();if(!r.ok)throw Error(r.status===401?'Sign in and verify your PCS email before sharing.':String(data.message||data.error||'Server rejected the snapshot.').slice(0,200));
   if(typeof data.recorded!=='boolean')throw Error('The server returned an unrecognized response.');
   $('wbShareStatus').textContent=(JSON.stringify(selectedRound())===identity?'This round: ':'Earlier round snapshot: ')+(data.recorded?'recorded by the server after finite replay.':'already recorded; no duplicate stored.');
 }catch(e){$('wbShareStatus').textContent=`Sharing did not complete: ${e.message}. Your local notebook is still available.`;}
 finally{busy=false;render();}
});
feedback('Tap “Has a key” or “Opens the door”, then test your world.');render();
