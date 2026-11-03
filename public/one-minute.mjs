import {sampleFiles,checkSample,recheckDownload} from './one-minute-core.mjs';
import {parseCSV} from './file-check-core.mjs';
const $=id=>document.getElementById(id);
let mode='overlap',checked=null,busy=false,recheckRevision=0;
const progress=text=>$('minuteProgress').textContent=text;
function controls(){for(const id of ['minuteCheck','minuteChange'])$(id).disabled=busy;for(const id of ['minuteReport','minuteReplay'])$(id).disabled=busy||!checked;}
function showSample(){
 checked=null;progress('Step 1 of 3: check the lists.');$('minuteResults').hidden=true;$('minuteStatus').textContent='Example ready. Select “Check these lists”.';
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
  $('minuteMeaning').textContent=n?'The groups overlap. Review the highlighted rows before treating them as separate.':'These lists meet the rule of having no shared IDs.';progress('Step 2 of 3: read the result and save your report.');$('minuteResults').dataset.result=n?'review':'clear';$('minuteResults').hidden=false;
  for(const row of document.querySelectorAll('[data-id]'))row.classList.toggle('minute-match',value.result.shared.some(m=>m.id===row.dataset.id));
  $('minuteStatus').textContent='Check complete. Nothing was uploaded or changed.';$('minuteOutcome').focus();
 }catch(error){checked=null;$('minuteStatus').textContent='The example could not be checked. No result is assumed. Try reloading the page.';}
 finally{busy=false;controls();}
});
$('minuteChange').addEventListener('click',()=>{if(busy)return;mode=mode==='overlap'?'separate':'overlap';showSample();});
function save(name,raw,type){const url=URL.createObjectURL(new Blob([raw],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('minuteReport').addEventListener('click',()=>{if(checked&&!busy){save('pcs-example-report.html',checked.report_html,'text/html');progress('Report saved. Save the recheck file to let someone check the same inputs.');}});
$('minuteReplay').addEventListener('click',()=>{if(checked&&!busy){save('pcs-example-recheck.json',checked.replay_json,'application/json');$('minuteReopen').open=true;progress('Step 3 of 3: choose your downloaded recheck file below.');}});
showSample();$('minuteExamplePanel').dataset.ready='true';

$('minuteRecheckFile').addEventListener('change',async e=>{
 const version=++recheckRevision,file=e.target.files[0];progress('Step 3 of 3: recheck the selected download.');$('minuteRecheckStatus').textContent='No download has been rechecked.';if(!file)return;
 try{
  if(file.size>8454144)throw Error('This recheck file is too large.');
  $('minuteRecheckStatus').textContent='Reading the exact files and checking their IDs again…';
  const value=await recheckDownload(new Uint8Array(await file.arrayBuffer()));if(version!==recheckRevision)return;
  const n=value.result.summary.shared_ids;$('minuteRecheckStatus').textContent='Recheck complete: '+(n?n+' shared ID'+(n===1?'':'s'):'no shared IDs')+'. File identities and recorded counts match a fresh browser calculation. No Lean check ran.';
  progress('All three steps complete: checked, saved and rechecked.');
 }catch(err){if(version===recheckRevision)$('minuteRecheckStatus').textContent='Could not recheck: '+err.message+' No imported result is confirmed.';}
});
