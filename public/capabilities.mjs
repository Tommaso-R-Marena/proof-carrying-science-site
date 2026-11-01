import {CAPABILITIES,MODE_LABELS} from './capability-catalog.mjs';
const $=id=>document.getElementById(id);
const element=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
function render(){
 const filter=$('capabilityFilter').value;
 const rows=CAPABILITIES.filter(c=>filter==='all'||(filter==='models'?['hosted','browser-model'].includes(c.mode):['recorded','replay'].includes(c.mode)));
 $('capabilityCards').replaceChildren();
 for(const c of rows){
  const card=element('article','');card.className='capability-card';
  const label=element('span',MODE_LABELS[c.mode]);label.className='capability-mode';
  const link=element('a','Open '+c.name.toLowerCase());link.href=c.page;
  card.append(label,element('h2',c.name),element('strong',c.engine),element('p',c.does),element('p',c.limit),link);$('capabilityCards').append(card);
 }
 $('capabilityCount').textContent=rows.length+' workflows. Each card describes what executes and what its result means.';
}
$('capabilityFilter').addEventListener('change',render);render();
try{
 const response=await fetch('model-capabilities.json',{credentials:'omit'});
 if(!response.ok)throw Error('Inventory unavailable');
 const inventory=await response.json();
 if(inventory.format!=='pcs-website-model-inventory-v1'||!/^[0-9a-f]{40}$/.test(inventory.core_revision)||!Array.isArray(inventory.models)||inventory.pcs_authority!==false)throw Error('Invalid model inventory');
 const base='https://github.com/Tommaso-R-Marena/proof-carrying-science/blob/'+inventory.core_revision+'/';
 $('modelStatus').textContent=inventory.models.length+' frozen checkpoints in four families. Approved public executor source: '+inventory.core_revision+'. The hybrid portfolio shares the verified-memory weights and can finish before neural ranking is needed.';
 for(const m of inventory.models){
  const row=element('tr',''),name=element('td',''),link=element('a',m.family+' / '+m.id);link.href=base+m.path;name.append(link);
  row.append(name,element('td',m.selected?(m.family==='lean-learning-v2'?'Previous-policy comparison':'Selected public policy'):'Local / comparison'),element('td',m.sha256));$('allModels').append(row);
  if(m.selected){const card=element('article','');card.className='capability-card';card.append(element('h3',m.family),element('p',m.id+' · '+m.parameters.toLocaleString()+' parameters'),element('code',m.sha256));$('selectedModels').append(card);}
 }
}catch{
 $('modelStatus').textContent='Model inventory unavailable. No model identity or new execution result is inferred.';
}
