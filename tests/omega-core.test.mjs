import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonical,strictParse,check,digest,actions,applyAction,features,validateModel,validateProject,search,verifyEpisode,leanSource} from '../public/omega-core.mjs';
const project=()=>JSON.parse(fs.readFileSync(new URL('../public/omega/project-v1.json',import.meta.url),'utf8'));
const model=name=>JSON.parse(fs.readFileSync(new URL(`../public/omega/${name}-v1.json`,import.meta.url),'utf8'));

test('independent browser checker finds the actual protocol counterexample',async()=>{
 const r=await check(project().claims[0].task);assert.equal(r.assignments_checked,4);assert.equal(r.equivalent,false);assert.deepEqual(r.counterexample,{assignment:{P:false,Q:true},source_true:false,candidate_true:true});assert.equal(r.pcs_authority,false);
});
test('strict JSON rejects duplicates, non-finite values, prototype keys and byte overflow',()=>{
 for(const input of ['{"a":1,"a":2}','{"__proto__":{}}','1e309','[NaN]','[0,]','"\\ud800"'])assert.throws(()=>strictParse(input));
 assert.throws(()=>strictParse(' '.repeat(65537)));assert.deepEqual(strictParse('{"a":[true,false,null,1.25]}'),{a:[true,false,null,1.25]});
 assert.throws(()=>canonical('\ufdd0'));assert.throws(()=>canonical('\uffff'));assert.equal(canonical({b:2,a:1}),'{'+'"a":1,"b":2}');
});
test('typed intake rejects unsupported science, missing source text and cyclic dependencies',()=>{
 const p=project();validateProject(p);p.claims[0].statement='Invented claim';assert.throws(()=>validateProject(p));
 const q=project();q.claims[0].task.source={op:'dose_response',units:'mg'};assert.throws(()=>validateProject(q));
 const r=project();r.claims[0].depends_on=['release'];assert.throws(()=>validateProject(r));
 const s=project();s.source['license|name']=s.source.license;delete s.source.license;delete s.source.name;assert.throws(()=>validateProject(s));
});
test('closed actions cannot change source or smuggle executable code',()=>{
 const t=project().claims[0].task;
 for(const a of [{kind:'REPLACE_SOURCE',source:{op:'true'}},{kind:'REPAIR_CANDIDATE',path:['__proto__'],operation:'insert_not'},{kind:'REPAIR_CANDIDATE',path:[],operation:'eval',code:'throw Error()'}])assert.throws(()=>applyAction(t.candidate,a,t.variables));
 assert.equal(actions(t.candidate,t.variables).length,6);
});
for(const name of ['bag','graph','bandit'])test(`actual ${name} checkpoint is pinned, nonzero and cannot grant authority`,async()=>{
 const m=await validateModel(model(name));assert.ok(m.weights.some(w=>w!==0));assert.equal(m.authority,'NONE');assert.equal(features(project().claims[0].task,actions(project().claims[0].task.candidate,['P','Q'])[0],m.feature_mode).length,m.dimension);
 const forged=structuredClone(m);forged.authority='PCS_VERIFIED';const {model_sha256,...core}=forged;forged.model_sha256=await digest(core);await assert.rejects(()=>validateModel(forged));
});
test('all strategies generate Python-compatible bounded episodes and exact independent replay',async()=>{
 for(const strategy of ['bfs','structural','bag','graph','bandit']){
  const learned=['bag','graph','bandit'].includes(strategy),t=project().claims[0].task;
  const e=await search(t,{strategy:learned?'learned':strategy,model:learned?model(strategy):null,checks:8});assert.ok(e.checks_used<=8);assert.equal(await verifyEpisode(e),true);assert.equal(e.pcs_authority,false);
 }
});
test('rehashed receipt and goal forgery still fail independent replay',async()=>{
 const e=await search(project().claims[0].task);assert.ok(e.solution);
 for(const attack of ['receipt','goal','authority','budget','depth']){
  const f=structuredClone(e);
  if(attack==='receipt')f.attempts[0].receipt.equivalent=false;
  if(attack==='goal'){f.original_task.source={op:'true'};f.original_task_sha256=await digest(f.original_task);}
  if(attack==='authority')f.pcs_authority=true;
  if(attack==='budget')f.checks_used=99;
  if(attack==='depth')f.attempts[0].depth=true;
  const {episode_sha256,...core}=f;f.episode_sha256=await digest(core);await assert.rejects(()=>verifyEpisode(f));
 }
});
test('exhausted search does not offer a false proof and budget types are strict',async()=>{
 const t=project().claims[0].task,e=await search(t,{checks:1});assert.equal(e.solution,null);assert.equal(e.status,'BUDGET_OR_SEARCH_EXHAUSTED');await verifyEpisode(e);
 for(const checks of [true,0,129])await assert.rejects(()=>search(t,{checks}));
 const bad=structuredClone(t);bad.variables[0]='p); #eval IO.println "injected"';assert.throws(()=>leanSource(bad));
});
test('workspace evidence is local, rendered as text, and invalidated by edits',()=>{
 const js=fs.readFileSync(new URL('../public/omega-workspace.js',import.meta.url),'utf8'),html=fs.readFileSync(new URL('../public/omega-workspace.html',import.meta.url),'utf8');
 assert.ok(!js.includes('innerHTML'));assert.ok(!js.includes('localStorage'));assert.ok(!js.includes('/api/'));assert.ok(js.includes("addEventListener('input',dirty)"));assert.ok(html.includes('Scientific')||html.includes('scientific'));assert.ok(html.includes('pcs omega replay'));assert.ok(html.includes('not automatic paper understanding'));
});
