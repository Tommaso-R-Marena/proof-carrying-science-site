const ids=id=>document.getElementById(id);
fetch('semantic-fixtures-v1.json',{cache:'no-store'}).then(async r=>{
 if(!r.ok)throw Error('Fixture provenance file unavailable');
 const data=await r.json();
 if(data.format!=='pcs-semantic-curated-fixture-preview-v1'||data.kernel_result_in_browser!=='NOT_RUN'
   ||data.preview_case_count!==data.cases.length||data.fixture_index_sha256.length!==64)
   throw Error('Malformed fixture provenance');
 const sel=ids('auditCase');
 for(const c of data.cases){
  const o=document.createElement('option');o.value=c.id;o.textContent=c.id.replaceAll('_',' ');sel.append(o);
 }
 const render=()=>{
  const c=data.cases.find(c=>c.id===sel.value);
  ids('auditTitle').textContent=c.id.replaceAll('_',' ');
  ids('auditVerdict').textContent=c.expected_verdict+' — recorded expectation';
  ids('auditVerdict').dataset.verdict=c.expected_verdict;
  ids('auditDesc').textContent=c.description;
  const target=ids('auditCodes');target.replaceChildren();
  for(const code of c.failure_codes.length?c.failure_codes:['No failure codes recorded']){
   const li=document.createElement('li');li.textContent=code;target.append(li);
  }
 };
 ids('auditHash').textContent=data.fixture_index_sha256;
 ids('auditCount').textContent=String(data.cases.length);
 sel.addEventListener('change',render);render();
}).catch(()=>{ids('auditError').textContent='Fixture preview unavailable. No verified outcome can be displayed.';});