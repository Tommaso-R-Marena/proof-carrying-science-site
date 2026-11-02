import {tabJobStore,executionSummary} from './lean-job-client.mjs';
import {validateCatalog,recognize,publicPayload,makeReport,validateReport,selectedObservation,proofSource,shareHtml} from './proof-workbench-core.mjs';
import {recordPilotEvent,readPilot,pilotStorage} from './proof-workbench-pilot.mjs';
const $=id=>document.getElementById(id),pending=tabJobStore();
const PATHS=new Set(['proof-workbench-catalog.json','proof-workbench-example.json','/api/lean-research/status','/api/lean-research/submit','/api/lean-research/result','/api/lean-research/cancel']);
let catalog=null,entry=null,report=null,busy=false,ready=false;
const event=name=>{try{recordPilotEvent(sessionStorage,name,entry?.id||null);}catch{}};
function notice(message){$('wbQueue').textContent=message;}
async function api(path,payload=null,key=null){
 if(!PATHS.has(path))throw Error('Unreviewed workbench network route');
 const headers=payload?{'Content-Type':'application/json'}:{};if(key)headers['Idempotency-Key']=key;
 const response=await fetch(path,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(30000),...(payload?{method:'POST',headers,body:JSON.stringify(payload)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.message||'The proof service could not complete this operation.');return data;
}
function step(number){for(let i=1;i<=4;i++)if(i===number)$('wbStep'+i).setAttribute('aria-current','step');else $('wbStep'+i).removeAttribute('aria-current');}
function controls(){
 const saved=pending.read(),meaning=Boolean(entry&&$('wbMeaningConsent').checked);
 $('wbRun').disabled=busy||!ready||!meaning||!$('wbPublishConsent').checked||Boolean(saved);
 $('wbResume').disabled=busy||!meaning||!saved;
 $('wbCancel').disabled=!saved?.request?.ticket;
 $('wbForget').disabled=busy||!saved;
 for(const id of ['wbClaim','wbStrategy','wbRecognize','wbOffset','wbLeft','wbRight','wbExample','wbImport','wbMeaningConsent','wbPublishConsent'])$(id).disabled=busy||!catalog;
 for(const button of $('wbCases').querySelectorAll('button'))button.disabled=busy;
 $('wbSave').disabled=!report||busy;$('wbEvidence').disabled=!report||busy;$('wbLean').disabled=!report||busy||!proofSource(report);
 if(!pending.persistent)$('wbRecovery').textContent='Tab storage is unavailable. Keep this page open: reloading will lose recovery metadata. A saved request never proves a claim.';
}
function choose(selected){
 if(busy)return;entry=selected;report=null;$('wbMeaningConsent').checked=false;$('wbPublishConsent').checked=false;
 $('wbClaim').value=selected?.statement||$('wbClaim').value;$('wbMeaning').textContent=selected?.meaning||'This text is outside the supported workbench forms. No mathematical input has been sent.';
 $('wbFormal').textContent=selected?.lean||'No recognized mathematical statement.';
 if(selected)$('wbStrategy').value=selected.recommended_family;
 $('wbRecognition').textContent=selected?'Recognized. Review the exact mathematical statement below.':'Use a supplied form or open the advanced lab for broader supported language.';
 $('wbOutcome').textContent='No result for the current question.';$('wbOutcome').removeAttribute('data-state');$('wbAttribution').textContent='';$('wbIdentity').textContent='No execution identity.';$('wbAxioms').textContent='No proof assumptions reported.';$('wbRaw').textContent='No current evidence.';
 for(const button of $('wbCases').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.case===selected?.id));
 step(selected?2:1);controls();if(selected)event('claim-chosen');
}
function showReport(value,{imported=false}={}){
 report=value;const selected=selectedObservation(value.evidence),recorded=imported||value.execution_mode==='recorded_example';
 const intro=recorded?'Recorded report. Sender-reported outcome: '+value.outcome+'. No new model or Lean job has run in this page. ':'';
 const descriptions={proved:'A proof was checked for the exact mathematical statement.',refuted:'Lean checked a counterexample and a proof that the statement is false.',unresolved:'The available search did not establish this statement or its negation.'};
 $('wbOutcome').textContent=recorded?intro:intro+descriptions[value.outcome];$('wbOutcome').dataset.state=recorded?'recorded':value.outcome;
 const names={result:'selected strategy',strong_baseline:'ordinary Lean tactic comparison',previous:'previous-policy or same-memory comparison',baseline:'symbolic comparison'};
 const winner=selected.observation?.search?.winning_component||selected.observation?.search?.portfolio?.selected_stage;
 const labels={ordinary_Std:'ordinary Lean tactics',memory_structural:'symbolic search with checked memory',frozen_neural:'the frozen learned policy',learned_reuse:'the learned reuse policy',symbolic_fallback:'the symbolic fallback'};
 const method=selected.outcome==='refuted'?'the Lean-checked counterexample checker':labels[winner]||names[selected.role]||'no successful method';
 $('wbAttribution').textContent=selected.role?(recorded?'The report credits ':'The successful method was ')+method+'.':'No verified mathematical result was returned.';
 $('wbIdentity').textContent=executionSummary(value.evidence);$('wbAxioms').textContent=selected.receipt?'Kernel-reported logical axioms: '+JSON.stringify(selected.receipt.kernel.axioms)+'. These are separate from assumptions about your real-world application.':'There is no accepted proof or refutation to audit.';
 $('wbRaw').textContent=JSON.stringify(value,null,2);
 if(value.run_url){$('wbJob').href=value.run_url;$('wbJob').hidden=false;}
 step(4);controls();event(recorded?'recorded-result-opened':'fresh-result-received');
}
function save(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function execute(resume=false){
 if(busy||!entry||!$('wbMeaningConsent').checked)return;
 if(!resume&&(!ready||!$('wbPublishConsent').checked))return;
 const saved=pending.read(),body=resume&&saved?JSON.parse(saved.body_json):publicPayload(entry,$('wbStrategy').value);
 if(body.proof_actions!==undefined){notice('Recover this exact human proof path in the advanced Lean lab. No new request was submitted.');return;}
 const target=recognize(body.statement,catalog);
 if(!target){notice('This saved request needs the advanced lab to recover its broader mathematical form.');return;}
 if(resume&&(target.id!==entry.id||(body.model_family||'checked-reuse-v2')!==$('wbStrategy').value)){
  choose(target);$('wbStrategy').value=body.model_family||'checked-reuse-v2';
  notice('Restored the exact saved question and strategy. Review this meaning, confirm it, then Resume. No new request was sent.');return;
 }
 if(saved?.request&&saved.request.core_sha!==catalog.core_revision){notice('This request uses an older translator. Preserve its metadata and recover it in the advanced Lean lab.');return;}
 busy=true;report=null;controls();step(3);$('wbPublishConsent').checked=false;
 try{
  const state=pending.begin(body);let request=state.request;
  if(!request){notice('Submitting the exact public mathematical claim. If confirmation is interrupted, retry the same saved request.');request=await api('/api/lean-research/submit',body,state.key);pending.bind(request);event('public-request-submitted');}
  else notice('Resuming the existing signed request. No new workflow is being submitted.');
  controls();
  for(let attempt=0;attempt<100;attempt++){
   await new Promise(resolve=>setTimeout(resolve,10000));
   const result=await api('/api/lean-research/result',{ticket:request.ticket});
   if(result.run_url){$('wbJob').href=result.run_url;$('wbJob').hidden=false;}
   if(result.status==='completed'){
    const value=await makeReport(catalog,target,{...request,model_family:body.model_family},result.evidence,{runUrl:result.run_url||null});
    pending.clear();showReport(value);notice('The actual job returned evidence matching the mathematical meaning you reviewed.');break;
   }
   if(['failed','cancelled','expired','resource_exhaustion','resource_exhausted'].includes(result.status)){pending.clear();event('request-ended-without-result');throw Error('The provider confirmed '+result.status+'. No proof result is assumed.');}
   notice(result.status==='running'?'The real proof job is running. You can leave this tab and resume while the ticket remains valid.':'Waiting for the real public job: '+result.status+'.');
   if(attempt===99)throw Error('The checking window ended. Preserve the saved request and inspect its actual job; no success is inferred.');
  }
 }catch(error){notice('Unresolved: '+error.message+' If a request is saved, use Resume rather than creating a new request.');event('service-interrupted');}
 finally{busy=false;controls();}
}
$('wbRecognize').addEventListener('click',()=>choose(recognize($('wbClaim').value,catalog)));
$('wbClaim').addEventListener('input',()=>{if(busy)return;entry=null;report=null;$('wbMeaningConsent').checked=false;$('wbPublishConsent').checked=false;$('wbFormal').textContent='Edited text has not been recognized or checked.';$('wbOutcome').textContent='The question changed; earlier results do not apply.';step(1);controls();});
$('wbMeaningConsent').addEventListener('change',()=>{if($('wbMeaningConsent').checked)event('meaning-confirmed');controls();});
$('wbPublishConsent').addEventListener('change',controls);
$('wbStrategy').addEventListener('change',()=>{$('wbPublishConsent').checked=false;controls();});
$('wbOffset').addEventListener('click',()=>choose(catalog.entries.find(e=>e.id==='offset-'+$('wbLeft').value+'-'+$('wbRight').value)));
$('wbRun').addEventListener('click',()=>execute());$('wbResume').addEventListener('click',()=>execute(true));
$('wbCancel').addEventListener('click',async()=>{const saved=pending.read();if(!saved?.request?.ticket)return;try{const result=await api('/api/lean-research/cancel',{ticket:saved.request.ticket});notice(result.status==='cancellation_requested'?'Cancellation requested. Continue checking until the provider confirms it.':'Provider cancellation status: '+result.status+'.');event('cancellation-requested');}catch(error){notice('Cancellation unconfirmed: '+error.message);}controls();});
$('wbForget').addEventListener('click',()=>{pending.clear();notice('Saved tab metadata removed. A running provider job has not been cancelled.');controls();});
$('wbSave').addEventListener('click',async()=>{if(report){save('pcs-proof-result.html',await shareHtml(report),'text/html');event('report-exported');}});
$('wbEvidence').addEventListener('click',()=>{if(report){save('pcs-proof-result.json',JSON.stringify(report,null,2)+'\n','application/json');event('evidence-exported');}});
$('wbLean').addEventListener('click',()=>{if(report&&proofSource(report)){save('pcs-proof-result.lean',proofSource(report),'text/plain');event('proof-exported');}});
$('wbReplay').addEventListener('toggle',()=>{if($('wbReplay').open)event('replay-instructions-opened');});
$('wbExample').addEventListener('click',async()=>{if(busy)return;try{const example=await validateReport(await api('proof-workbench-example.json'),catalog);choose(catalog.entries.find(e=>e.id===example.entry_id));showReport(example);notice('This is a recorded real-model result. No new public request was submitted.');}catch(error){notice('Recorded example unavailable: '+error.message);}});
$('wbImport').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>12*1024*1024)throw Error('Evidence file exceeds the size limit.');const value=await validateReport(JSON.parse(await file.text()),catalog);choose(catalog.entries.find(e=>e.id===value.entry_id));showReport(value,{imported:true});notice('Opened a recorded report locally. Independent replay has not run here.');}catch(error){report=null;$('wbOutcome').textContent='Report rejected: '+error.message;controls();}});
controls();
try{
 catalog=await validateCatalog(await api('proof-workbench-catalog.json'));
 for(const e of catalog.entries.filter(e=>!e.id.startsWith('offset-'))){const button=document.createElement('button');button.type='button';button.dataset.case=e.id;button.textContent=e.title;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>choose(e));$('wbCases').append(button);}
 for(const id of ['wbLeft','wbRight'])for(let n=0;n<=8;n++){const option=document.createElement('option');option.value=n;option.textContent=n;$(id).append(option);}
 const saved=pending.read();choose(saved?recognize(JSON.parse(saved.body_json).statement,catalog):catalog.entries[0]);
 if(saved)$('wbStrategy').value=JSON.parse(saved.body_json).model_family||'checked-reuse-v2';
 if(saved)notice('A previously consented mathematical request is saved. Review its meaning, then Resume. Reading an acknowledged ticket submits no new workflow.');
 const status=await api('/api/lean-research/status');ready=status.status==='configured'&&status.readiness==='ready'&&status.core_sha===catalog.core_revision&&status.pcs_authority===false;
 $('wbService').textContent=ready?'The approved proof service is ready. No new proof has been requested.':'Fresh proof requests are unavailable or the preview/source versions differ. Recorded examples and local replay remain usable.';
 const study=readPilot(pilotStorage());if(study)$('wbStudyStatus').textContent='Your optional study is active in this tab. Export or erase it on the study page.';
}catch(error){$('wbService').textContent='Setup incomplete: '+error.message+'. No claim has been proved.';ready=false;}
controls();
