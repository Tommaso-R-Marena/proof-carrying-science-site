import {GAUNTLET_TASKS,getGauntletTask} from './semantic-gauntlet-core.mjs';
import {REPAIR_VERSION,listRepairMoves,finiteRepairCheck,repairRequestForTask,analyzeSemanticRepair} from './semantic-repair-core.mjs';
const el=id=>document.getElementById(id);
let task=GAUNTLET_TASKS.find(x=>x.split==='training'),candidate,undo=[],history=[],checks=0,solved=new Set(),lastReport=null;
const show=(id,value)=>{el(id).textContent=String(value);};
const symbols={forall:'∀',exists:'∃',and:'∧',or:'∨',imp:'→',not:'¬'};
function display(f){switch(f.op){
 case 'pred':return f.name+'('+f.x+')';case 'rel':return f.name+'('+f.x+','+f.y+')';
 case 'eq':return f.x+' = '+f.y;case 'not':return '¬('+display(f.f)+')';
 case 'and':case 'or':case 'imp':return '('+display(f.a)+' '+symbols[f.op]+' '+display(f.b)+')';
 case 'forall':case 'exists':return symbols[f.op]+f.x+'. '+display(f.f);
 default:return 'Unsupported formula';
}}
function verdict(message,kind=''){show('srVerdict',message);el('srVerdict').dataset.state=kind;}
function record(action,detail){history.push({task_id:task.id,action,...detail});}
function setTask(id){const selected=getGauntletTask(id);if(!selected)return;
 task=selected;candidate=structuredClone(task.candidate);undo=[];history=[];checks=0;lastReport=null;
 show('srSkill',task.skill.toUpperCase()+' · '+task.split+' · finite ≤ '+task.bound+' agents');
 show('srTitle',task.family.replaceAll('-',' ').replace(/^./,c=>c.toUpperCase()));
 show('srDescription','The source claim is fixed. Repair the proposed translation using verified, grounded edits.');
 show('srSource',display(task.source));el('srTask').value=task.id;
 el('srWitnessPanel').hidden=true;el('srSuggestions').replaceChildren();show('srSearchMeta','No search yet');
 verdict('Your first move is yours. Choose an edit, or check the original proposal.');render();}
function render(){show('srCandidate',display(candidate));show('srEdits',undo.length);show('srChecks',checks);show('srSolved',solved.size);
 el('srUndo').disabled=undo.length===0;
 const moves=listRepairMoves(task.id,candidate,80);const panel=el('srMoves');panel.replaceChildren();
 for(const move of moves.slice(0,18)){
  const b=document.createElement('button');b.type='button';b.textContent=move.operation.replaceAll('_',' ')+' · '+display(move.after);
  b.setAttribute('aria-label','Apply '+move.operation.replaceAll('_',' ')+' to '+display(move.before));
  b.addEventListener('click',()=>apply(move.formula,move.operation));panel.append(b);
 }
 if(moves.length>18){const note=document.createElement('p');note.textContent='Showing 18 of '+moves.length+' typed available edits.';panel.append(note);}
}
function apply(next,label){undo.push(structuredClone(candidate));candidate=structuredClone(next);lastReport=null;
 record('edit',{operation:label,candidate:structuredClone(candidate),feedback_previously_seen:checks>0});
 el('srWitnessPanel').hidden=true;el('srSuggestions').replaceChildren();show('srSearchMeta','Search invalidated by edit');
 verdict('Candidate edited. Run the finite checker to test the new meaning.');render();}
function countermodel(world,check){
 el('srWitnessPanel').hidden=false;
 show('srWitnessSummary',`With ${world.n} agent(s), source is ${check.source_truth?'TRUE':'FALSE'} while proposal is ${check.candidate_truth?'TRUE':'FALSE'}. Minimal supported domain: ${check.minimum_countermodel_domain}.`);
 const panel=el('srWitness');panel.replaceChildren();
 for(const [name,values] of Object.entries(world.unary))for(let i=0;i<values.length;i++){
  const tag=document.createElement('span');tag.textContent=name+'('+String(i+1)+') = '+(values[i]?'true':'false');panel.append(tag);}
 for(const [name,rows] of Object.entries(world.binary))for(let i=0;i<rows.length;i++)for(let j=0;j<rows[i].length;j++){
  const tag=document.createElement('span');tag.textContent=name+'('+String(i+1)+','+String(j+1)+') = '+(rows[i][j]?'true':'false');panel.append(tag);}
}
function check(){const r=finiteRepairCheck(task.id,candidate);checks++;
 record('finite_check',{candidate:structuredClone(candidate),finite_result:r});
 if(r.equivalent_within_bound){solved.add(task.id);el('srWitnessPanel').hidden=true;
 verdict('All '+r.checked_models+' finite worlds in this task bound agree!'+
   ' This is a bounded agreement, NOT a Lean proof or unrestricted equivalence.','good');}
 else{countermodel(r.countermodel,r);verdict('Meaning mismatch! The finite checker found an explicit '+r.minimum_countermodel_domain+'-agent countermodel.','bad');}
 render();}
function search(){const input=repairRequestForTask(task.id,{candidate,max_edits:2,max_candidates:240});
 const report=analyzeSemanticRepair(input);lastReport=report;
 record('bounded_auto_search',{candidate:structuredClone(candidate),search_status:report.search_status,
  examined_candidates:report.examined_candidates,repair_count:report.repairs.length});
 show('srSearchMeta',report.examined_candidates+' candidates checked · '+report.search_status.replaceAll('_',' '));
 const panel=el('srSuggestions');panel.replaceChildren();
 if(!report.repairs.length){const p=document.createElement('p');p.textContent=report.search_status==='ALREADY_AGREES_WITHIN_BOUND'?
   'This translation already agrees within the finite search bound.':
   'No repair found under the declared search grammar/budget. This does not mean a repair is impossible.';panel.append(p);return;}
 for(const r of report.repairs){const btn=document.createElement('button');btn.type='button';
  btn.textContent=r.edit_count+' edit(s): '+display(r.candidate)+' · finite worlds rechecked';
  btn.addEventListener('click',()=>apply(r.candidate,'selected_machine_suggestion'));panel.append(btn);}
}
function exportNotebook(){const doc={format:'pcs-semantic-repair-local-notebook-v1',engine:REPAIR_VERSION,
  task_id:task.id,selected_source_formula:structuredClone(task.source),initial_candidate:structuredClone(task.candidate),
  final_candidate:structuredClone(candidate),local_unverified_actions:history,
  last_repair_suggestion:lastReport,
  privacy:'Local export only; no network donation, no participant identity, no server replay',
  kernel_checked:false,pcs_scientific_authority:false};
 const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)+'\n'],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='pcs-repair-'+task.id+'.json';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);verdict('Private notebook downloaded. Labels require trusted replay before research use.');}
function renderTasks(){const filter=el('srTrack').value,sel=el('srTask');sel.replaceChildren();
 const allowed=GAUNTLET_TASKS.filter(t=>filter==='all'||t.split===filter);
 for(const t of allowed){const opt=document.createElement('option');opt.value=t.id;opt.textContent=t.family.replaceAll('-',' ')+' · '+t.id.split('-').at(-1);sel.append(opt);}
 setTask(allowed.some(t=>t.id===task.id)?task.id:allowed[0].id);}
el('srTrack').addEventListener('change',renderTasks);
el('srTask').addEventListener('change',()=>setTask(el('srTask').value));
el('srCheck').addEventListener('click',check);
el('srSearch').addEventListener('click',search);
el('srUndo').addEventListener('click',()=>{if(!undo.length)return;
 candidate=undo.pop();record('undo',{candidate:structuredClone(candidate)});el('srWitnessPanel').hidden=true;
 el('srSuggestions').replaceChildren();lastReport=null;verdict('Undid the last edit. Verify again for a fresh checker result.');render();});
el('srReset').addEventListener('click',()=>{record('reset');candidate=structuredClone(task.candidate);undo=[];
 lastReport=null;checks=0;el('srWitnessPanel').hidden=true;el('srSuggestions').replaceChildren();verdict('Candidate reset.');render();});
el('srNext').addEventListener('click',()=>{const set=GAUNTLET_TASKS.filter(t=>el('srTrack').value==='all'||t.split===el('srTrack').value);
 setTask(set[(set.findIndex(x=>x.id===task.id)+1)%set.length].id);});
el('srDownload').addEventListener('click',exportNotebook);
renderTasks();
