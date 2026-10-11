import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseResult,CORE_SHA} from '../src/lean-research.js';

const read=name=>readFileSync(new URL('../public/checked-reuse/'+name,import.meta.url),'utf8');
test('published refinement exposes selection, all seeds and the stronger baseline',()=>{
 const s=JSON.parse(read('refinement-summary.json')),p=JSON.parse(read('refinement-protocol.json'));
 assert.equal(p.selection.includes('select before final'),true);
 assert.equal(s.selected,'refined-17');assert.equal(s.metrics.final.parent.verified,0);
 assert.equal(s.metrics.final[s.selected].verified,5);
 assert.equal(s.metrics.final['refined-31'].verified,0);assert.equal(s.metrics.final['refined-47'].verified,0);
 assert.equal(s.metrics.final.symbolic.verified,6);assert.equal(s.metrics.final.selected_portfolio.verified,6);
 assert.equal(s.financial_spend,0);assert.equal(s.gpu_used,false);
});
test('downloadable transfer proof includes the actual checked dependencies',()=>{
 const source=read('transfer-proof.lean'),e=JSON.parse(read('transfer-evidence.json'));
 assert.equal(e.status,'verified');const r=e.search.receipt;
 assert.ok(source.includes(r.library_declarations));assert.ok(source.includes(r.statement));
 assert.ok(source.includes(r.proof));assert.ok(r.actions.some(a=>a.argument==='PCSReuseL0'));
 assert.equal(r.pcs_scientific_authority,false);assert.deepEqual(r.kernel.axioms,[]);
 assert.doesNotMatch(source,/\b(sorry|admit|axiom|native_decide)\b/);
});
test('each exported multi-step mathematical result has an actual bound final proof',()=>{
 const records=JSON.parse(read('refinement-evidence.json'));
 assert.equal(records.filter(r=>r.result.status==='verified').length,6);
 for(const item of records){if(item.result.status!=='verified')continue;
  const r=item.result.receipt,source=read(item.id+'.lean');
  assert.ok(source.includes(r.statement));assert.ok(source.includes(r.proof));
  assert.ok(item.result.expansions<=64);assert.equal(r.pcs_scientific_authority,false);
  assert.ok(r.kernel.axioms.every(a=>['propext','Classical.choice','Quot.sound'].includes(a)));
 }
 for(const item of records.filter(r=>r.id.startsWith('false_')))assert.equal(item.result.status,'unknown');
});
test('an additional previous-model result cannot smuggle unapproved acceptance',()=>{
 const payload={request_id:'1'.repeat(32),core_sha:CORE_SHA,source_sha256:'2'.repeat(64)};
 const evidence={format:'pcs-public-lean-result-v1',...payload,result:{status:'unknown',pcs_authority:false},previous:{status:'verified',pcs_authority:false,search:{receipt:{kernel:{axioms:['forged']}}}}};
 const log='PCS_LEAN_RESULT_V1:'+Buffer.from(JSON.stringify(evidence)).toString('base64')+'\n';
 assert.throws(()=>parseResult(log,payload),/kernel receipt/);
});
