import {canonical,sha256} from './research-governance-core.mjs';
export const FAMILIES=['prospective-hybrid-v2','verified-memory-v1','induction-abstraction-v2','checked-reuse-v2'];
const HASH=/^[0-9a-f]{64}$/;
const fail=message=>{throw Error(message);};
export async function validateCatalog(input){
 const c=structuredClone(input),{catalog_sha256,core_revision,...payload}=c;
 if(c.format!=='pcs-proof-workbench-catalog-v1'||!/^[0-9a-f]{40}$/.test(c.core_revision)||c.pcs_authority!==false||!Array.isArray(c.entries)||c.entries.length>160||!HASH.test(catalog_sha256)||await sha256(canonical(payload))!==catalog_sha256)fail('Unrecognized interpretation catalog');
 const ids=new Set(),statements=new Set();
 for(const e of c.entries){if(typeof e.id!=='string'||ids.has(e.id)||statements.has(e.statement)||typeof e.statement!=='string'||e.statement.length>3000||typeof e.lean!=='string'||!HASH.test(e.goal_sha256)||!FAMILIES.includes(e.recommended_family))fail('Malformed interpretation entry');ids.add(e.id);statements.add(e.statement);}
 return c;
}
export function recognize(statement,catalog){
 if(typeof statement!=='string'||statement.length>3000)return null;
 const normalize=x=>x.trim().replace(/[\t\r\n ]+/g,' ');
 return catalog.entries.find(e=>normalize(e.statement)===normalize(statement))||null;
}
export function publicPayload(entry,family=entry.recommended_family){
 if(!FAMILIES.includes(family))fail('Unsupported search strategy');
 return {statement:entry.statement,interpretation:null,public_consent:true,license:'CC0-1.0',...(family==='checked-reuse-v2'?{}:{model_family:family})};
}
export function selectedObservation(evidence){
 if(evidence?.result?.status==='verified_counterexample'&&['result','strong_baseline','previous','baseline'].some(role=>evidence?.[role]?.status==='verified'))fail('Conflicting proof and refutation claims');
 for(const role of ['result','strong_baseline','previous','baseline'])if(evidence?.[role]?.status==='verified')return {role,observation:evidence[role],receipt:evidence[role].search?.receipt,outcome:'proved'};
 if(evidence?.result?.status==='verified_counterexample')return {role:'result',observation:evidence.result,receipt:evidence.result.counterexample?.receipt,outcome:'refuted'};
 return {role:null,observation:null,receipt:null,outcome:'unresolved'};
}
export function compactEvidence(evidence){
 const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,structuredClone(o[k])]));
 const projected=pick(evidence,['format','request_id','core_sha','source_sha256','model_family','source_license','automatic_training_authorization']);
 projected.projection='pcs-workbench-evidence-projection-v1';
 for(const role of ['result','previous','baseline','strong_baseline']){
  const source=evidence[role];if(!source){if(source===null)projected[role]=null;continue;}
  const row=pick(source,['status','pcs_authority','model','mode','checkpoint_sha256','memory_sha256','library_sha256','primitive_catalog_sha256','formalization','cost','reason']);
  if(source.search)row.search=pick(source.search,['status','receipt','expansions','winning_component','portfolio','independent_replay']);
  if(source.counterexample)row.counterexample=pick(source.counterexample,['status','receipt','tested']);
  projected[role]=row;
 }
 return projected;
}
export async function makeReport(catalog,entry,request,evidence,{runUrl=null,mode='fresh_public_job',created=Date.now(),providerEvidenceSha=null}={}){
 if(!['fresh_public_job','recorded_example'].includes(mode)||evidence?.format!=='pcs-public-lean-result-v1'||evidence.core_sha!==request.core_sha||request.core_sha!==catalog.core_revision||evidence.request_id!==request.request_id||evidence.source_sha256!==await sha256(JSON.stringify(entry.statement))||evidence.result?.pcs_authority!==false)fail('The result does not match this exact request and approved source');
 if(evidence.actions_sha256!==undefined)fail('Exact human-action requests belong to the advanced lab');
 if(evidence.automatic_training_authorization!==false||['result','strong_baseline','previous','baseline'].some(role=>evidence[role]&&evidence[role].pcs_authority!==false))fail('Unexpected authority or training claim');
 const expected=request.model_family||null;if((evidence.model_family||null)!==expected)fail('Search strategy changed');
 const candidates=evidence.result.formalization?.candidates;
 if(!Array.isArray(candidates)||!candidates.some(c=>c.interpretation_sha256===entry.goal_sha256&&c.lean===entry.lean))fail('The returned mathematical meaning differs from your reviewed preview');
 const selected=selectedObservation(evidence),r=selected.receipt;
 if(selected.outcome!=='unresolved'&&(!r||typeof r.proof!=='string'||!r.proof.trim()))fail('A successful outcome requires its complete proof receipt');
 if(r){
  if(r.statement!==entry.lean||(selected.outcome==='proved'?r.goal_sha256:r.original_goal_sha256)!==entry.goal_sha256||!Array.isArray(r.kernel?.axioms)||r.kernel.axioms.some(a=>!['propext','Classical.choice','Quot.sound'].includes(a)))fail('Proof target or assumptions differ from the reviewed claim');
 }
 if(runUrl!==null&&!/^https:\/\/github\.com\/Tommaso-R-Marena\/proof-carrying-science\/actions\/runs\/[0-9]+$/.test(runUrl))fail('Unrecognized job URL');
 if(providerEvidenceSha!==null&&!HASH.test(providerEvidenceSha))fail('Malformed provider evidence digest');
 const report={format:'pcs-proof-workbench-report-v1',provider_evidence_sha256:providerEvidenceSha||await sha256(canonical(evidence)),catalog_sha256:catalog.catalog_sha256,entry_id:entry.id,goal_sha256:entry.goal_sha256,statement:entry.statement,formal_statement:entry.lean,source_revision:request.core_sha,request_id:request.request_id,requested_family:expected||'checked-reuse-v2',run_url:runUrl,execution_mode:mode,created_at:new Date(created).toISOString(),outcome:selected.outcome,selected_role:selected.role,interpretation_confirmed:true,evidence:compactEvidence(evidence),pcs_authority:false,physical_neural_execution_independently_attested:false};
 const canonical_payload=canonical(report);return {...report,canonical_payload,report_sha256:await sha256(canonical_payload)};
}
export async function validateReport(report,catalog){
 if(!report||report.format!=='pcs-proof-workbench-report-v1'||report.pcs_authority!==false||report.physical_neural_execution_independently_attested!==false||report.interpretation_confirmed!==true)fail('Unrecognized workbench report');
 const {report_sha256,canonical_payload,...payload}=report;
 if(!HASH.test(report_sha256)||canonical(payload)!==canonical_payload||await sha256(canonical_payload)!==report_sha256)fail('Report commitment mismatch; this checksum is not an authority signature');
 const entry=catalog.entries.find(e=>e.id===report.entry_id);
 if(!entry||report.catalog_sha256!==catalog.catalog_sha256||report.statement!==entry.statement||report.formal_statement!==entry.lean||report.goal_sha256!==entry.goal_sha256)fail('Report meaning or catalog changed');
 const recreated=await makeReport({...catalog,core_revision:report.source_revision},entry,{core_sha:report.source_revision,request_id:report.request_id,model_family:report.requested_family==='checked-reuse-v2'?undefined:report.requested_family},report.evidence,{runUrl:report.run_url,mode:report.execution_mode,created:Date.parse(report.created_at),providerEvidenceSha:report.provider_evidence_sha256});
 if(canonical(recreated)!==canonical(report))fail('Unexpected or altered report fields');
 return report;
}
export function proofSource(report){
 const {receipt,outcome}=selectedObservation(report.evidence);if(!receipt)return null;
 return 'import Std\nimport Lean\n\n'+(receipt.library_declarations||'')+'\ntheorem pcs_workbench_result : '+(outcome==='refuted'?'¬ ('+receipt.statement+')':receipt.statement)+' := by\n  '+receipt.proof.trimStart()+'\n#print axioms pcs_workbench_result\n';
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function shareHtml(report){
 // No executable embedded producer source, external scripts or network calls.
 // This is a readable recorded report, not an independent verification verdict.
 const selected=selectedObservation(report.evidence),proof=proofSource(report);
 const code="for(const [id,target,name] of [['save-json','evidence','pcs-proof-result.json'],['save-lean','proof','pcs-proof-result.lean']])document.getElementById(id)?.addEventListener('click',()=>{const u=URL.createObjectURL(new Blob([document.getElementById(target).textContent]));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});";
 const scriptHash=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))));
 const embedded=JSON.stringify(report).replace(/</g,'\\u003c');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; script-src &#39;sha256-'+scriptHash+'&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>PCS recorded proof result</title><style>body{font:17px system-ui;max-width:850px;margin:30px auto;padding:20px;line-height:1.6;overflow-wrap:anywhere}pre{white-space:pre-wrap;background:#f0f4f8;padding:18px}h1{font-size:2rem}</style><h1>PCS recorded proof result</h1><p>Sender-reported outcome: <strong>'+escape(report.outcome)+'</strong>. Independent replay has not run in this document.</p><h2>Exact question</h2><p>'+escape(report.statement)+'</p><pre>'+escape(report.formal_statement)+'</pre><p>Source: '+escape(report.source_revision)+'<br>Result supplied by: '+escape(report.selected_role||'no verified method')+'<br>Reported axioms: '+escape(JSON.stringify(selected.receipt?.kernel?.axioms??null))+'</p><p>This concerns the encoded mathematical statement. Real-world assumptions, English intent and physical neural execution are not established by this file.</p><h2>Independent replay</h2><p>Save the matching JSON evidence from PCS, check out the stated trusted core revision, and run the replay tool from the website repository:</p><pre>python scripts/replay_proof_workbench.py --core /path/to/trusted/core report.json</pre><button id="save-json">Save evidence JSON</button><h2>Standalone Lean source</h2><p>Source code is shown for review, not executed here. The receiver replay tool regenerates proof commands from approved typed actions and trusted memory instead of executing arbitrary report text.</p><pre id="proof">'+escape(proof||'No proof. An unresolved result does not establish either truth or falsity.')+'</pre><h2>Report identity</h2><p>'+escape(report.report_sha256)+'<br>This is an integrity checksum, not an authority signature.</p><button id="save-lean">Save Lean source</button><script type="application/json" id="evidence">'+embedded+'</script><script>'+code+'</script></html>';
}
