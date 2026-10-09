import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('repair lab is navigable and contains keyboard-accessible labels, live verdict and task selector',()=>{
 const html=read('public/semantic-repair-lab.html');
 assert.match(html,/<main/);assert.match(html,/<nav/);
 for(const id of ['srTask','srTrack','srSource','srCandidate','srChecks','srSolved',
 'srCheck','srSearch','srUndo','srReset','srSuggestions','srMoves','srWitness','srDownload','srNext']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/not universal|not Lean proof|not Lean/i);
 assert.match(html,/semantic-repair-lab\.js/);
});
test('browser module uses only bounded evaluator and no network/upload/implicit consent flow',()=>{
 const js=read('public/semantic-repair-lab.js');
 assert.match(js,/finiteRepairCheck/);assert.match(js,/analyzeSemanticRepair/);
 assert.match(js,/listRepairMoves/);
 assert.match(js,/local_unverified_actions/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon\s*\(/);
 assert.match(js,/no network donation/);
 assert.doesNotMatch(js,/innerHTML\s*=/);
});
test('mobile stylesheet stacks workbench and scroll-safe edit controls',()=>{
 const css=read('public/semantic-repair-lab.css');
 assert.match(css,/@media\(max-width:860px\)/);
 assert.match(css,/@media\(max-width:510px\)/);
 assert.match(css,/minmax\(0,1fr\)/);
});
