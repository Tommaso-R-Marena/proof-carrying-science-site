import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluatePredictions,baselinePredictions} from '../scripts/semantic_evaluation_firewall.mjs';
import {summaryForDisplay,compareDisplaySummaries,validateFirewallReport} from '../public/evaluation-firewall-view.mjs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
test('local report viewer validates format, limited scope and version match',()=>{
 const a=evaluatePredictions(baselinePredictions('everything_equivalent'));
 const b=evaluatePredictions(baselinePredictions('finite_oracle'));
 assert.equal(summaryForDisplay(a).cases,108);
 assert.equal(summaryForDisplay(b).accuracy,'100.0%');
 assert.ok(compareDisplaySummaries(a,b).same_benchmark);
 const malicious=structuredClone(a);malicious.authority='LEAN_KERNEL_VERIFIED';
 assert.throws(()=>validateFirewallReport(malicious),/unsupported assurance/);
 malicious.authority=a.authority;malicious.pack_sha256='000';
 assert.throws(()=>validateFirewallReport(malicious),/commitments/);
});
test('browser UI never sends report to network and renders submitted values as text',()=>{
 const html=read('public/evaluation-firewall.html'),js=read('public/evaluation-firewall.js');
 assert.match(html,/fwInputA/);assert.match(html,/unverified local report claims/i);
 assert.match(js,/file\.text\(\)/);assert.match(js,/textContent/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
 assert.match(read('public/arena.html'),/evaluation-firewall\.html/);
});
