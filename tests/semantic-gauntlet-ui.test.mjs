import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('playable finite-model page has accessible controls and honest scope',()=>{
 const html=read('public/semantic-gauntlet.html'),js=read('public/semantic-gauntlet.js');
 assert.match(html,/id="sgWorld"/);assert.match(html,/aria-live="polite"/);
 assert.match(html,/semantic-gauntlet\.js/);assert.match(html,/semantic-gauntlet\.css/);
 assert.match(html,/not a universal Lean theorem/i);
 assert.match(js,/gauntletVerdict\(current,world\)/);
 assert.match(js,/finiteOracle\(current\)/);
 assert.match(js,/URL\.createObjectURL/);
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
});
test('Arena links to the 60-case benchmark without promising Lean',()=>{
 const arena=read('public/arena.html');
 assert.match(arena,/semantic-gauntlet\.html/);
 assert.match(arena,/60/);
});