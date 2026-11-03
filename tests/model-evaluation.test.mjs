import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {evaluateTables,evaluationDocument,replayEvaluation,DEFAULT_PROVENANCE,evaluationReport} from '../public/model-evaluation-core.mjs';
import {parseCSV,utf8,canonical,sha256} from '../public/file-check-core.mjs';
const table=s=>parseCSV(utf8(s)),columns=[[0,1],[0,1],[0,1]];
const authored=['id,label\na,yes\nb,yes\nc,yes\n','id,label\na,yes\nb,no\nc,no\n','id,label\nc,yes\na,no\nb,yes\n'];
test('a genuine aggregate gain can still lose an earlier match',()=>{
 const r=evaluateTables(authored.map(table),columns);assert.deepEqual(r.summary,{total:3,before_matches:1,after_matches:2,improvements:2,regressions:1});assert.equal(r.preserved,false);assert.deepEqual(r.cases.map(c=>c.id),['a','b','c']);
});
test('the recorded real-model example preserves its negative learned-versus-symbolic finding',()=>{
 const ts=['reference','baseline','candidate'].map(n=>table(fs.readFileSync(new URL('../public/evaluation-'+n+'.csv',import.meta.url),'utf8'))),r=evaluateTables(ts,columns);
 assert.equal(r.summary.total,14);assert.equal(r.summary.before_matches,14);assert.equal(r.summary.after_matches,11);assert.equal(r.preserved,false);
 const p=JSON.parse(fs.readFileSync(new URL('../public/evaluation-example.json',import.meta.url)));assert.equal(p.new_inference_executed,false);assert.equal(p.physical_model_generation_independently_attested,false);
});
test('all three exact ID sets are required; duplicate and ignored predictions cannot improve a denominator',()=>{
 for(const replacement of ['id,label\na,yes\na,no\nc,yes\n','id,label\na,yes\nb,yes\n','id,label\na,yes\nb,yes\nx,yes\n','id,label\n,yes\nb,yes\nc,yes\n'])assert.throws(()=>evaluateTables([table(authored[0]),table(authored[1]),table(replacement)],columns));
 assert.throws(()=>evaluateTables(authored.map(table),[[0,0],[0,1],[0,1]]));
});
test('UTF-8 identities, leading zeros, empty labels and quoted field boundaries stay exact',()=>{
 const ts=['id,label\n001,"a,b"\nα,"x\ny"\n\u00a0,\n','id,label\nα,"x\ny"\n\u00a0,\n001,"a,b"\n','id,label\n001,"a,b"\nα,"x\ny"\n\u00a0,\n'].map(table);
 const r=evaluateTables(ts,columns);assert.equal(r.summary.after_matches,3);assert.equal(r.preserved,true);
});
test('private replay recomputes inputs and counts, rejects edits, and never trusts a recorded receipt',async()=>{
 const inputs=await Promise.all(authored.map(async(s,i)=>({name:i+'.csv',bytes:utf8(s),sha256:await sha256(utf8(s)),table:table(s)}))),r=evaluateTables(inputs.map(x=>x.table),columns);
 const doc=await evaluationDocument(inputs,columns,DEFAULT_PROVENANCE,r,{claimed:'untrusted'},true),replayed=await replayEvaluation(utf8(canonical(doc)+'\n'));
 assert.deepEqual(replayed.result.summary,r.summary);assert.equal(replayed.result.local_receipt,undefined);
 for(const edit of [v=>v.summary.after_matches=3,v=>v.preserved=true,v=>v.inputs[0].sha256='0'.repeat(64),v=>v.columns[0][1].header='other',v=>v.provenance.authority=true]){const v=structuredClone(doc);edit(v);await assert.rejects(replayEvaluation(utf8(canonical(v)+'\n')));}
 const html=evaluationReport(r,inputs,DEFAULT_PROVENANCE,null,false);assert.match(html,/Browser calculation/);assert.match(html,/Row IDs, labels and outputs omitted/);assert.doesNotMatch(html,/<td>a<\/td>/);
});
