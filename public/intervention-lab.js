import {conditionalFromText} from './conditional-core.mjs';
import {TASK,planIntervention,auditInterventionProposal} from './intervention-core.mjs';
const $=id=>document.getElementById(id);let revision=0,proposalRevision=0,busy=false,receipt=null,checkedTask=null;
function status(text,error=false){$('planStatus').textContent=text;$('planStatus').dataset.error=String(error);}
function invalidate(){revision++;receipt=null;checkedTask=null;$('planDownload').disabled=true;$('planScore').disabled=true;$('planResult').textContent='Inputs changed. Solve again to check this challenge.';delete $('planResult').dataset.decision;$('planReceipt').textContent='No current result.';$('planProposal').textContent='Your proposal has not been scored.';}
function values(){return Object.fromEntries([...$('planVariables').querySelectorAll('.plan-variable')].map(row=>[row.dataset.name,{baseline:row.querySelector('[data-role=baseline]').checked,proposal:row.querySelector('[data-role=proposal]').checked,locked:row.querySelector('[data-role=locked]').checked,cost:Number(row.querySelector('[data-role=cost]').value)}]));}
function controls(problem,policies=values()){
 $('planVariables').replaceChildren();
 for(const n of problem.variables){const p=policies[n]||{baseline:false,proposal:false,locked:false,cost:1},row=document.createElement('div');row.className='plan-variable';row.dataset.name=n;const title=document.createElement('strong');title.textContent=n;row.append(title);
  for(const [role,label] of [['baseline','Starting value true'],['locked','Keep fixed'],['proposal','Your plan true'],['cost','Change cost']]){const l=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');input.dataset.role=role;input.setAttribute('aria-label',n+' · '+label);input.type=role==='cost'?'number':'checkbox';if(role==='cost'){input.min='1';input.max='1000000';input.step='1';input.required=true;input.value=String(p.cost);}else input.checked=p[role];span.textContent=label;l.append(input,span);row.append(l);}
  $('planVariables').append(row);
 }
 if(!problem.variables.length){const p=document.createElement('p');p.className='plan-controls-note';p.textContent='This constant task has no variables to change.';$('planVariables').append(p);}
}
function capture(){const problem=conditionalFromText($('planTarget').value,'FALSE',$('planAssumptions').value);const policy=values();controls(problem,policy);const names=problem.variables;
 return {format:TASK,problem,baseline:Object.fromEntries(names.map(n=>[n,policy[n]?.baseline??false])),costs:Object.fromEntries(names.map(n=>[n,policy[n]?.cost??1])),locked:names.filter(n=>policy[n]?.locked)};
}
function line(parent,text){const p=document.createElement('p');p.className='plan-result-line';p.textContent=text;parent.append(p);}
function render(r){const box=$('planResult');box.replaceChildren();box.dataset.decision=r.decision;
 if(r.decision==='optimal_plan'){line(box,`Minimum change cost: ${r.minimum_cost}. Optimal assignments: ${r.optimal_count.toLocaleString()}.`);line(box,'One optimal plan: '+(Object.entries(r.assignment).map(([n,v])=>n+' = '+v).join(' · ')||'No variables.'));line(box,'Change: '+(r.flips.join(', ')||'Nothing — the starting world already meets the goal.'));line(box,'Mandatory in every optimal plan: '+(r.mandatory_flips.join(', ')||'No individual change is mandatory.'));line(box,'Possible in an optimal plan: '+(r.possible_flips.join(', ')||'No changes.'));}
 else line(box,({no_feasible_plan:'No feasible plan satisfies the goal, assumptions and locks. Try relaxing a lock or revisiting the goal.',inconsistent_assumptions:'Your assumptions conflict. No plan is accepted from a contradictory context.',resource_limit:'The computation limit was reached. No minimum, plan or optimality gap is established.'})[r.decision]);
 line(box,`Actual work: ${r.symbolic_receipt.work.bdd_nodes} diagram nodes, ${r.symbolic_receipt.work.apply_calls} apply calls, ${r.dp_nodes} optimization node visits.`);
 $('planReceipt').textContent=JSON.stringify(r,null,2);
}
function setBusy(value){busy=value;$('planSolve').disabled=value;$('planBuild').disabled=value;for(const b of document.querySelectorAll('[data-mission]'))b.disabled=value;$('planScore').disabled=value||!checkedTask;}
$('planBuild').addEventListener('click',()=>{try{invalidate();capture();status('Variable controls rebuilt. Set costs, starting values and locks.');}catch(e){status(e.message,true);}});
$('planForm').addEventListener('input',e=>{if(e.target.dataset.role==='proposal'){proposalRevision++;$('planProposal').textContent='Proposal changed. Score it again.';return;}invalidate();status('Inputs changed. Solve again for a current result.');});
$('planForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;invalidate();const token=revision;setBusy(true);status('Building the exact diagram and optimizing allowed changes…');
 try{const t=capture(),r=await planIntervention(t);if(token!==revision){status('Inputs changed during computation. Solve again.');return;}checkedTask=t;receipt=r;render(r);$('planDownload').disabled=false;status('Result computed locally. Try a proposal, inspect the table, or download for independent replay.');}catch(e){if(token===revision)status(e.message,true);}finally{setBusy(false);}
});
$('planScore').addEventListener('click',async()=>{if(busy||!checkedTask)return;const token=revision,proposalToken=proposalRevision,t=structuredClone(checkedTask),a=Object.fromEntries(Object.entries(values()).map(([n,p])=>[n,p.proposal]));setBusy(true);
 try{const result=await auditInterventionProposal(t,a);if(token!==revision||proposalToken!==proposalRevision)return;const box=$('planProposal');box.replaceChildren();line(box,`Your proposal cost: ${result.cost}. ${result.feasible?'The goal, assumptions and locks are all satisfied.':'This proposal is infeasible.'}`);if(result.optimality_gap!==null)line(box,result.optimality_gap===0?'You found an optimal plan.':'Cost above the minimum: '+result.optimality_gap+'. Can you improve it?');else line(box,'No optimality gap is awarded.');if(result.lock_violations.length)line(box,'Locked values changed: '+result.lock_violations.join(', '));if(!result.target_true)line(box,'The goal is false in your proposal.');if(result.assumptions_true.some(v=>!v))line(box,'At least one assumption is false in your proposal.');}catch(e){status(e.message,true);}finally{setBusy(false);}
});
$('planDownload').addEventListener('click',()=>{if(!receipt)return;const blob=new Blob([JSON.stringify(receipt)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pcs-intervention-result.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
function mission(kind){invalidate();let target='A OR B',assumptions='',policies={A:{baseline:false,proposal:false,locked:false,cost:kind==='tied'?1:3},B:{baseline:false,proposal:false,locked:kind==='locked',cost:1}},text='Either A or B reaches the goal. Changing A costs 3; changing B costs 1. Can you find the cheapest route?';
 if(kind==='tied')text='Two equally priced routes. Find an optimum, then inspect which changes are mandatory.';
 if(kind==='locked')text='B must stay false. Find the cheapest route that respects that lock.';
 if(kind==='premises'){target='B';assumptions='B -> A';text='Reaching B requires A. A costs 3 and B costs 1. A plan must satisfy that dependency.';}
 if(kind==='scale'){const ns=Array.from({length:24},(_,i)=>'V'+String(i).padStart(2,'0'));target=Array.from({length:12},(_,i)=>`(${ns[2*i]} OR ${ns[2*i+1]})`).join(' AND ');policies=Object.fromEntries(ns.map(n=>[n,{baseline:false,proposal:false,locked:false,cost:1}]));text='Twelve independent choices. Reach every pair at minimum cost, then inspect all 4,096 optimal assignments without listing them.';}
 $('planTarget').value=target;$('planAssumptions').value=assumptions;$('planMission').textContent=text;controls(conditionalFromText(target,'FALSE',assumptions),policies);status('Mission ready. Try your plan, then solve the minimum.');
}
for(const b of document.querySelectorAll('[data-mission]'))b.addEventListener('click',()=>mission(b.dataset.mission));mission('weighted');
