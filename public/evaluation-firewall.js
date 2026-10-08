import {summaryForDisplay,compareDisplaySummaries} from './evaluation-firewall-view.mjs';
const $=id=>document.getElementById(id);
const status=$('fwStatus'),panel=$('fwResults');
let results=[null,null];
function node(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
function render(){
 panel.replaceChildren();const present=results.filter(Boolean);
 if(!present.length){panel.append(node('p','Select a local evaluation report to inspect it.'));return;}
 if(present.length===2){
  try{compareDisplaySummaries(results[0],results[1]);}
  catch(error){status.textContent=error.message+'; showing separate reports.';}
 }
 const display=results.map((item,i)=>item?{...summaryForDisplay(item),label:i===0?'Report A':'Report B'}:null).filter(Boolean);
 for(const d of display){
  const article=document.createElement('article');article.className='fw-result';
  article.append(node('h2',d.label+' · Unverified local report'));
  article.append(node('p','Public source-derived benchmark: '+d.cases+' finite logic cases in the evaluation split.'));
  const table=document.createElement('dl');table.className='fw-metrics';
  for(const [title,value] of [['Evaluation accuracy',d.accuracy],['Coverage',d.coverage],
    ['Accuracy on attempts',d.accuracy_answered],['False equivalence claims',d.false_equivalence],
    ['Verified finite witnesses (reported)',d.witnesses],['Decision consistency',d.consistency],
    ['Confidence Brier score',d.brier]]){
    table.append(node('dt',title),node('dd',String(value)));
  }
  article.append(table,node('p','Pack SHA-256: '+d.pack),node('p','Prediction SHA-256: '+d.revision));
  const details=document.createElement('details');details.append(node('summary','Results by semantic family'));
  const ul=document.createElement('ul');for(const f of d.families){
    ul.append(node('li',f.name+': '+f.accuracy+' accuracy / '+f.coverage+' coverage ('+f.cases+' cases)'));
  }details.append(ul);article.append(details);panel.append(article);
 }
}
async function loadReport(i,file){
 if(!file){results[i]=null;render();return;}
 if(file.size>3_000_000){status.textContent='Report too large (3 MB maximum).';return;}
 try{
  const raw=JSON.parse(await file.text());summaryForDisplay(raw);results[i]=raw;
  status.textContent='Loaded local report. This page does not execute the checker or authenticate the metrics.';
 }catch(error){results[i]=null;status.textContent='Rejected report: '+error.message;}
 render();
}
$('fwInputA').addEventListener('change',event=>loadReport(0,event.target.files?.[0]));
$('fwInputB').addEventListener('change',event=>loadReport(1,event.target.files?.[0]));
render();
