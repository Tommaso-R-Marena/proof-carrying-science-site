import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('website demo never treats stored fixture expectations as live Lean',()=>{
 const data=JSON.parse(read('public/semantic-fixtures-v1.json'));
 assert.equal(data.kernel_result_in_browser,'NOT_RUN');
 assert.equal(data.independently_executed_in_browser,false);
 assert.equal(data.preview_case_count,data.cases.length);
 assert.equal(new Set(data.cases.map(c=>c.id)).size,data.cases.length);
 assert.ok(data.cases.some(c=>c.expected_verdict==='ACCEPTED'));
 assert.ok(data.cases.some(c=>c.expected_verdict==='REJECTED'));
 assert.ok(data.cases.some(c=>c.expected_verdict==='NEEDS_CLARIFICATION'));
 const html=read('public/semantic-audit.html');
 assert.match(html,/not executing Lean/);
 assert.match(html,/semantic-audit\.js/);
 assert.match(read('public/arena.html'),/semantic-audit\.html/);
});
test('arena local session export remains opt-in and private',()=>{
 const html=read('public/arena-countermodel.html'),game=read('public/arena-countermodel.js');
 assert.match(html,/cmSessionExport/);
 assert.match(html,/cmTrajectory/);
 assert.match(game,/pcs-countermodel-local-trace-v1/);
 assert.match(game,/localStorage\.setItem/);
 assert.match(game,/research/); 
});
