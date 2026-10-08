import {getGauntletTask} from './semantic-gauntlet-core.mjs';
import {makeMultiStepRequest,searchBestFirstRepair,replayBestFirstRepair} from './semantic-multistep-core.mjs';
const $=id=>document.getElementById(id);
const expected='pcs-multistep-repair-challenges-v1';
let model=null,pack=null,last=null;
const show=(id,value)=>{$(id).textContent=value;};
function choose(){
 const task=getGauntletTask($('msTask').value);
 const example=pack.examples.find(x=>x.id===task?.id);
 if(!task||!example)return;
 show('msDescription',task.skill+' · Two deliberate formula edits; real minimal finite countermodel included.');
 show('msSource',JSON.stringify(task.source,null,2));
 show('msCandidate',JSON.stringify(example.mutated_candidate,null,2));
 show('msRepair','Not checked');show('msChecks','—');show('msProposals','—');show('msEdits','—');
 show('msStatus','Prepared to execute bounded repair search.');
 $('msAttempts').replaceChildren();$('msSave').disabled=true;last=null;
}
async function initialize(){
 try{
  const [m,c]=await Promise.all([fetch('repair-policy-model-v1.json'),fetch('multistep-challenges-v1.json')]);
  if(!m.ok||!c.ok)throw Error('Missing versioned research assets');
  model=await m.json();pack=await c.json();
  if(model.format!=='pcs-learned-semantic-repair-policy-v1'||
     model.authority!=='NONE_UNTRUSTED_PROPOSALS_ONLY'||!Array.isArray(model.weights)||model.weights.length!==384||
     model.weights.some(x=>!Number.isFinite(x))||pack.format!==expected||
     !Array.isArray(pack.examples)||pack.examples.length!==18||pack.examples.some(x=>x.split!=='evaluation'))
   throw Error('Version or shape mismatch; cannot proceed');
  for(const e of pack.examples){
   const t=getGauntletTask(e.id);if(!t||t.family!==e.family||t.split!=='evaluation')
    throw Error('Task semantic family changed');
   const opt=document.createElement('option');opt.value=e.id;opt.textContent=e.family+' · '+e.id.split('-').at(-1);
   $('msTask').append(opt);
  }
  $('msTask').addEventListener('change',choose);
  choose();$('msRun').disabled=false;
 }catch(e){show('msStatus','Experiment unavailable: '+e.message);$('msRun').disabled=true;}
}
$('msRun').disabled=true;
$('msRun').addEventListener('click',async()=>{
 if(!model||!pack)return;
 $('msRun').disabled=true;show('msStatus','Evaluating proposed edits with finite-model checker…');
 await new Promise(resolve=>requestAnimationFrame(resolve));
 try{
  const e=pack.examples.find(x=>x.id===$('msTask').value);
  const request=makeMultiStepRequest(e.id,{candidate:e.mutated_candidate,mode:$('msMode').value,
    checker_budget:Number($('msBudget').value),beam_width:Number($('msBeam').value),move_cap:120,max_edits:2,seed:23});
  const result=searchBestFirstRepair(model,request);
  if(replayBestFirstRepair(model,result).result!=='EXACT_FINITE_REPLAY_MATCH')throw Error('Replay failed');
  last={format:'pcs-browser-untrusted-multistep-research-record-v1',model_digest_sha256:model.model_digest_sha256,
    note:'Local browser artifact; independently recheck with exact model and source before research use.',result};
  show('msStatus',result.status==='FINITE_REPAIR_FOUND'?'Finite repair independently checked. No Lean proof or universal semantic guarantee.':
    'No accepted repair within this bounded search: '+result.status);
  show('msChecks',String(result.checks_used));show('msProposals',String(result.generated_proposals));
  show('msEdits',result.verified_repair?String(result.verified_repair.edit_count):'—');
  show('msRepair',result.verified_repair?JSON.stringify(result.verified_repair.candidate,null,2):'Unresolved within chosen bounds');
  const log=$('msAttempts');log.replaceChildren();
  for(const attempt of result.attempts.slice(0,25)){
   const li=document.createElement('li');li.textContent='Depth '+attempt.depth+' — '+
    (attempt.finite_check.equivalent_within_bound?'finite agreement':'countermodel found')+'; '+
    attempt.steps.map(x=>x.operation).join(' → ');log.append(li);
  }
  if(result.attempts.length>25){const li=document.createElement('li');li.textContent=(result.attempts.length-25)+' more attempts in local export';log.append(li);}
  $('msSave').disabled=false;
 }catch(e){show('msStatus','Fail closed: '+e.message);last=null;$('msSave').disabled=true;}
 finally{$('msRun').disabled=false;}
});
$('msSave').addEventListener('click',()=>{
 if(!last)return;
 const blob=new Blob([JSON.stringify(last,null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;
 a.download='pcs-multistep-local-research.json';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
initialize();
