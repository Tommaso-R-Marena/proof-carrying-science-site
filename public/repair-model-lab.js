import {GAUNTLET_TASKS,getGauntletTask} from './semantic-gauntlet-core.mjs';
import {listRepairMoves,finiteRepairCheck} from './semantic-repair-core.mjs';
import {rankRepairMoves,POLICY_DIM} from './semantic-repair-policy.mjs';
const $=x=>document.getElementById(x);
let model=null,chosen=null,lastResult=null;
const AST={not:'¬',forall:'∀',exists:'∃',imp:'→',and:'∧',or:'∨'};
function show(f){
 switch(f.op){
  case 'pred':return f.name+'('+f.x+')';
  case 'rel':return f.name+'('+f.x+', '+f.y+')';
  case 'eq':return f.x+' = '+f.y;
  case 'not':return '¬('+show(f.f)+')';
  case 'and':case 'or':case 'imp':return '('+show(f.a)+' '+AST[f.op]+' '+show(f.b)+')';
  case 'forall':case 'exists':return AST[f.op]+f.x+'. '+show(f.f);
  default:return '[unsupported]';
 }
}
function makeOption(task){const o=document.createElement('option');o.value=task.id;o.textContent=task.family.replaceAll('-',' ')+' #'+task.id.split('-').at(-1);return o;}
function pick(){
 chosen=getGauntletTask($('pmCase').value);lastResult=null;
 $('pmAttempts').replaceChildren();$('pmExport').disabled=true;
 if(!chosen){$('pmStatus').textContent='Select a task.';return;}
 $('pmTitle').textContent=chosen.family.replaceAll('-',' ')+' · '+chosen.skill;
 $('pmSource').textContent=show(chosen.source);$('pmCandidate').textContent=show(chosen.candidate);
 $('pmStatus').textContent='Model loaded. Select a strategy to test up to five edits against finite worlds.';
}
function filter(){const s=$('pmSplit').value,select=$('pmCase'),previous=select.value;select.replaceChildren();
 for(const t of GAUNTLET_TASKS)if(s==='all'||t.split===s)select.append(makeOption(t));
 if([...select.options].some(x=>x.value===previous))select.value=previous;pick();}
function run(kind){
 if(!model||!chosen)return;
 $('pmAttempts').replaceChildren();const task=chosen;
 try{
  const initial=finiteRepairCheck(task.id,task.candidate);
  if(initial.equivalent_within_bound){$('pmStatus').textContent='The original candidate already agrees with the source in every enumerated model. No repair needed.';return;}
  const ordered=kind==='learned'?rankRepairMoves(model,task,task.candidate,listRepairMoves,{limit:160}):listRepairMoves(task.id,task.candidate,160);
  const results=[];let success=null;
  for(const move of ordered.slice(0,5)){
   const outcome=finiteRepairCheck(task.id,move.formula);
   results.push({edit:move.operation,path:move.path,model_score:kind==='learned'?move.learned_score:null,
    checked_models:outcome.checked_models,finite_agreement:outcome.equivalent_within_bound,
    proposal:structuredClone(move.formula)});
   const li=document.createElement('li');
   const name=document.createElement('span');name.textContent=move.operation.replaceAll('_',' ')+' → '+show(move.formula);
   const state=document.createElement('strong');state.textContent=outcome.equivalent_within_bound?'FINITE CHECK PASS':'COUNTERMODEL FOUND';
   state.className=outcome.equivalent_within_bound?'pm-good':'pm-bad';
   li.append(name,state);$('pmAttempts').append(li);
   if(outcome.equivalent_within_bound){success=move;break;}
  }
  $('pmStatus').textContent=(success?'Bounded repair found':'No repair found within five proposals')+
   ' · '+results.length+' finite checker calls · '+(kind==='learned'?'learned edit order':'original deterministic edit order')+'.';
  lastResult={format:'pcs-repair-model-local-session-v1',task_id:task.id,task_split:task.split,
   model_digest:model.model_digest_sha256,ranking_kind:kind,
   checked_proposals:results,bounded_repair_found:Boolean(success),
   scope:'BROWSER_COMPUTED_FINITE_WORLDS_ONLY',lean_kernel_checked:false,
   pcs_scientific_authority:false,human_data_donated:false};$('pmExport').disabled=false;
 }catch(err){$('pmStatus').textContent='Experiment rejected: '+String(err?.message||err);}
}
$('pmSplit').addEventListener('change',filter);$('pmCase').addEventListener('change',pick);
$('pmRun').addEventListener('click',()=>run('learned'));
$('pmOriginal').addEventListener('click',()=>run('original'));
$('pmExport').addEventListener('click',()=>{
 if(!lastResult)return;
 const content=JSON.stringify(lastResult,null,2)+'\n';const u=URL.createObjectURL(new Blob([content],{type:'application/json'}));
 const a=document.createElement('a');a.href=u;a.download='pcs-learned-repair-local-session.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
});
(async()=>{
 try{
  const r=await fetch('./repair-policy-model-v1.json',{cache:'no-store'});if(!r.ok)throw Error('Model unavailable');
  const raw=await r.json();if(raw.format!=='pcs-learned-semantic-repair-policy-v1'||raw.weights?.length!==POLICY_DIM||
   raw.provenance?.evaluation_labels_used_for_training!==false||raw.training?.training_task_ids?.some(id=>getGauntletTask(id)?.split!=='training'))
   throw Error('Model provenance is invalid');
  model=raw;filter();$('pmRun').disabled=false;$('pmOriginal').disabled=false;
 }catch(err){$('pmStatus').textContent='Model could not be loaded. No candidate has been verified.';}
})();
