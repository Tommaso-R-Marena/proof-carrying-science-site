import {sampleFiles,checkSample} from './one-minute-core.mjs';
import {parseCSV} from './file-check-core.mjs';
const $=id=>document.getElementById(id);
let mode='overlap',checked=null,busy=false;
function controls(){for(const id of ['minuteCheck','minuteChange'])$(id).disabled=busy;for(const id of ['minuteReport','minuteReplay'])$(id).disabled=busy||!checked;}
function showSample(){
 checked=null;$('minuteResults').hidden=true;$('minuteStatus').textContent='Example ready. Select “Check these lists”.';
 $('minuteExample').textContent=mode==='overlap'?'Example 1 of 2.':'Example 2 of 2.';
 const files=sampleFiles(mode);for(let i=0;i<2;i++){
  const body=$('minuteRows'+i);body.replaceChildren();for(const row of parseCSV(files[i].bytes).rows){const tr=document.createElement('tr');tr.dataset.id=row[0];for(const value of row){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);}
 }
 $('minuteChange').textContent=mode==='overlap'?'Try lists with no shared IDs':'Back to the first example';controls();
}
$('minuteCheck').addEventListener('click',async()=>{
 if(busy)return;busy=true;checked=null;$('minuteResults').hidden=true;$('minuteStatus').textContent='Checking the example lists on this device…';controls();
 try{
  const value=await checkSample(mode);checked=value;const n=value.result.summary.shared_ids;
  $('minuteOutcome').textContent=n?'1 shared ID found':'No shared IDs found';
  $('minuteDetail').textContent=n?'ID 103 (Sam) appears in both lists: line 4 of Group A and line 2 of Group B. If the groups must be separate, these are the rows to review.':'No ID in Group A appears in Group B. This answers the question for these two lists.';
  $('minuteResults').dataset.result=n?'review':'clear';$('minuteResults').hidden=false;
  for(const row of document.querySelectorAll('[data-id]'))row.classList.toggle('minute-match',value.result.shared.some(m=>m.id===row.dataset.id));
  $('minuteStatus').textContent='Check complete. Nothing was uploaded or changed.';$('minuteOutcome').focus();
 }catch(error){checked=null;$('minuteStatus').textContent='The example could not be checked. No result is assumed. Try reloading the page.';}
 finally{busy=false;controls();}
});
$('minuteChange').addEventListener('click',()=>{if(busy)return;mode=mode==='overlap'?'separate':'overlap';showSample();});
function save(name,raw,type){const url=URL.createObjectURL(new Blob([raw],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('minuteReport').addEventListener('click',()=>{if(checked&&!busy)save('pcs-example-report.html',checked.report_html,'text/html');});
$('minuteReplay').addEventListener('click',()=>{if(checked&&!busy)save('pcs-example-recheck.json',checked.replay_json,'application/json');});
showSample();$('minuteExamplePanel').dataset.ready='true';
