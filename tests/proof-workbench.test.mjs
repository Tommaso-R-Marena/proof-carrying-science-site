import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog,recognize,publicPayload,validateReport,makeReport,proofSource,shareHtml} from '../public/proof-workbench-core.mjs';
import {canonical,sha256} from '../public/research-governance-core.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../public/'+name,import.meta.url)));
const catalog=await validateCatalog(read('proof-workbench-catalog.json')),record=read('proof-workbench-example.json');
const entry=catalog.entries.find(e=>e.id==='reuse');
async function rehash(r){const {report_sha256,canonical_payload,...p}=r;r.canonical_payload=canonical(p);r.report_sha256=await sha256(r.canonical_payload);return r;}
test('all 87 source-bound forms recognize without inventing interpretation or publishing private context',()=>{
 assert.equal(catalog.entries.length,87);
 for(const e of catalog.entries){assert.equal(recognize('  '+e.statement+'\n',catalog).id,e.id);const p=publicPayload(e);assert.equal(p.statement,e.statement);assert.equal(p.license,'CC0-1.0');assert.equal(p.public_consent,true);assert.equal(Object.keys(p).length,5);}
 for(const input of ['proffer private company text','For all natural numbers n, (n + 9) equals n.','theorem evil : False := by sorry'])assert.equal(recognize(input,catalog),null);
});
test('real recorded proof survives exact report and catalog checks; semantic mutation fails',async()=>{
 assert.equal((await validateReport(record,catalog)).outcome,'proved');
 for(const mutate of [c=>c.entries[0].lean='False',c=>c.catalog_sha256='0'.repeat(64)]){const c=structuredClone(catalog);mutate(c);await assert.rejects(validateCatalog(c));}
 const newer={...catalog,core_revision:'1'.repeat(40)};await validateCatalog(newer);await validateReport(record,newer);
 await assert.rejects(makeReport(newer,entry,{core_sha:record.source_revision,request_id:record.request_id,model_family:record.requested_family},record.evidence),/source/);
});
test('goal, attribution, authority and axioms cannot be changed even with a new self-hash',async()=>{
 for(const mutate of [r=>delete r.evidence.result.search.receipt,r=>r.goal_sha256='0'.repeat(64),r=>r.formal_statement='False',r=>r.outcome='refuted',r=>r.selected_role='baseline',r=>r.evidence.result.search.receipt.kernel.axioms.push('sorryAx'),r=>r.evidence.strong_baseline.pcs_authority=true,r=>r.evidence.automatic_training_authorization=true]){
  const changed=structuredClone(record);mutate(changed);await assert.rejects(validateReport(await rehash(changed),catalog));
 }
 const changed=structuredClone(record);changed.canonical_payload+=' ';await assert.rejects(validateReport(changed,catalog),/commitment/);
});
test('portable HTML contains real proof/evidence and only a fixed CSP-hashed offline download helper',async()=>{
 const html=await shareHtml(record);assert.match(html,/Sender-reported outcome/);assert.match(html,/script-src &#39;sha256-/);assert.match(html,/default-src &#39;none&#39;/);assert.match(html,/id="evidence"/);assert.match(html,/Save evidence JSON/);assert.match(proofSource(record),/theorem pcs_workbench_result/);
 assert.doesNotMatch(html,/<script src=|fetch\(|XMLHttpRequest|WebSocket/);
 const attack=structuredClone(record);attack.evidence.result.search.receipt.proof+='\n</pre><script>throw Error("EXECUTED")</script>';
 const hostile=await shareHtml(await rehash(attack));assert.doesNotMatch(hostile,/<script>throw/);assert.match(hostile,/&lt;script&gt;/);
});
test('proof UI keeps public consent separate, has fixed routes and acknowledged-ticket recovery',()=>{
 const js=readFileSync(new URL('../public/proof-workbench.mjs',import.meta.url),'utf8'),html=readFileSync(new URL('../public/proof-workbench.html',import.meta.url),'utf8');
 for(const id of ['wbClaim','wbFormal','wbMeaningConsent','wbPublishConsent','wbRun','wbResume','wbSave','wbImport'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(js.includes('if(!request)'));assert.ok(js.includes('Idempotency-Key'));assert.ok(js.includes('pending.bind(request)'));assert.ok(js.includes('Sender-reported outcome'));assert.ok(js.includes("$('wbStrategy').value=JSON.parse(saved.body_json).model_family"));
 assert.doesNotMatch(js,/wbContext\)\.value|wbContext'\)\.value/);
});
