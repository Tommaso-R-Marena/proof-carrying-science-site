import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MISSIONS} from '../public/world-builder-core.mjs';
import {COUNTERMODEL_VERSION,replayCountermodelSession,initialWorld} from '../public/countermodel-core.mjs';
import {legalSearchActions} from '../public/countermodel-search-policy.mjs';
import {worldIndex,worldFromIndex,editWorld,routeCertificate,verifyRouteCertificate,readRoute,analyzeSearchQuality} from '../public/search-route-core.mjs';
import {normalizeResearchSession,validateSearchResearch,readSearchResearch,collectSearchResearch,SEARCH_RESEARCH_FORMAT,SEARCH_RESEARCH_CONSENT} from '../public/search-research-core.mjs';
import {analyzeResearch} from '../scripts/analyze_search_research.mjs';
const check={type:'check'},toggle={type:'toggle',p:'P',i:0},hint={type:'hint'};
const session=(actions,mission_id='implication-flip')=>({version:COUNTERMODEL_VERSION,mission_id,actions});
const document=entries=>({format:SEARCH_RESEARCH_FORMAT,consent_version:SEARCH_RESEARCH_CONSENT,entries,next_offset:null});
function materialize(id,w){
 const actions=Array.from({length:w.n-1},()=>({type:'add'}));
 if(MISSIONS.indexOf(id)<5){for(const p of ['P','Q'])for(let i=0;i<w.n;i++)if(w[p][i])actions.push({type:'toggle',p,i});}
 else for(let i=0;i<w.n;i++)for(let j=0;j<w.n;j++)if(w.R[i][j])actions.push({type:'toggle_relation',i,j});
 return actions;
}
test('all 1,480 finite states and 13,220 graph edges match actual native replay',()=>{
 let states=0,edges=0;
 for(const id of MISSIONS){const count=MISSIONS.indexOf(id)<5?84:530;
  for(let i=0;i<count;i++){
   const w=worldFromIndex(id,i);assert.equal(worldIndex(id,w),i);states++;
   const prefix=materialize(id,w);
   for(const {action}of legalSearchActions(id,w).filter(e=>e.action.type!=='check')){
    const replay=replayCountermodelSession(session([...prefix,action,check],id));
    assert.deepEqual(editWorld(id,w,action),replay.final_world);edges++;
   }
  }
  assert.throws(()=>worldFromIndex(id,count));
 }
 assert.equal(states,1480);assert.equal(edges,13220);
});
test('seven complete certificates agree with an independent Python forward BFS from every state',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pcs-route-test-'));try{
  const files=[];let states=0,edges=0;
  for(const id of MISSIONS){const c=await routeCertificate(id,initialWorld()),r=await verifyRouteCertificate(c);states+=r.states_checked;edges+=r.edges_checked;
   const file=join(dir,id+'.json');writeFileSync(file,JSON.stringify(c));files.push(file);
  }
  const r=spawnSync('python3',['scripts/verify_search_route.py',...files],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);
  assert.equal(report.independent_python_checks.reduce((n,c)=>n+c.states,0),1480);assert.equal(states,1480);assert.equal(edges,13220);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('forged lower bounds, witnesses, identities, worlds and authority fail closed in both checkers',async()=>{
 const c=await routeCertificate('implication-flip',initialWorld()),dir=mkdtempSync(join(tmpdir(),'pcs-route-bad-'));
 try{
  const attacks=[n=>n.minimum_edits++,n=>n.actions=[],n=>n.potentials[0]=0,n=>n.potentials[0]=2,n=>n.potentials[1]=1,n=>n.graph_sha256='0'.repeat(64),n=>n.ruleset_sha256='0'.repeat(64),n=>n.state_count--,n=>n.lean_kernel_checked=true,n=>n.pcs_authoritative=true,n=>n.extra=true,n=>n.start_world.n=true,n=>n.start_world.P[0]=0,n=>n.start_world.extra=true,n=>n.start_world.R[0][0]=true,n=>n.actions[0].i=false,n=>n.actions[0].extra=true,n=>n.goal_world=initialWorld()];
  for(const mutate of attacks){const bad=structuredClone(c);mutate(bad);await assert.rejects(verifyRouteCertificate(bad));const file=join(dir,'bad.json');writeFileSync(file,JSON.stringify(bad));const r=spawnSync('python3',['scripts/verify_search_route.py',file],{encoding:'utf8',timeout:10000});assert.notEqual(r.status,0);}
  assert.throws(()=>readRoute('{"format":1,"format":2}'));assert.throws(()=>readRoute(' '.repeat(32769)));
  const file=join(dir,'good.json');writeFileSync(file,JSON.stringify(c));assert.notEqual(spawnSync('python3',['-O','scripts/verify_search_route.py',file],{encoding:'utf8'}).status,0,'optimized Python must refuse rather than disable checking');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('quality labels telescope, retain failed searches and never leak future results into inputs',async()=>{
 const s=session([check,toggle,toggle,check,toggle,check]);const q=await analyzeSearchQuality(s);
 assert.equal(q.edit_surplus,2);assert.equal(q.rows.reduce((n,r)=>n+r.derived_labels.edit_regret,0),q.edit_surplus);
 assert.equal(q.rows[0].input.previous_check,null);assert.equal(q.rows[1].input.previous_check.source_true,true);
 assert.equal(q.rows[1].input.previous_check.proposal_true,true);assert.equal(q.rows[5].derived_labels.counterexample,true);
 assert.ok(q.rows.every(r=>r.derived_labels.edit_regret>=0));
 for(const row of q.rows)assert.deepEqual(Object.keys(row.input).sort(),['assistance_seen','previous_check','world']);
 assert.equal((await analyzeSearchQuality(session([hint,check]))).split,'assisted_excluded');
 assert.equal((await analyzeSearchQuality(session([check],'quantifier-switch'))).split,'evaluation');
 assert.equal((await analyzeSearchQuality(session([check,toggle]))).final_checked_counterexample,false);
});
test('v2 export is replay validated, duplicate bounded, paginated, and kept distinct from v1 solved-only data',async()=>{
 const failed=normalizeResearchSession(session([check])),solved=normalizeResearchSession(session([toggle,check])),assisted=normalizeResearchSession(session([hint,check]));
 const doc=document([failed,solved,assisted,failed]);assert.equal(validateSearchResearch(doc).length,3);
 const r=await analyzeResearch(doc);assert.equal(r.summary.tested_rounds,3);assert.equal(r.summary.unfinished_rounds,2);assert.equal(r.summary.assisted_excluded,1);assert.equal(r.summary.unsuccessful_checks,2);
 assert.equal(r.kernel_checked,false);assert.equal(r.pcs_authoritative,false);
 for(const mutate of [n=>n.format='pcs-countermodel-adult-optin-dataset-v1',n=>n.consent_version='old',n=>n.user_id='private',n=>n.entries[0].replay.final_verified=true,n=>n.entries[0].email='private',n=>n.entries[0].session.actions=[],n=>n.next_offset=-1]){const bad=structuredClone(doc);mutate(bad);assert.throws(()=>validateSearchResearch(bad));}
 const pages=[{...document(Array(20).fill(failed)),next_offset:20},document([solved])];const combined=await collectSearchResearch(offset=>pages[offset/20],{pageBudget:2});assert.equal(combined.entries.length,21);assert.equal(validateSearchResearch(combined).length,2);
 await assert.rejects(collectSearchResearch(()=>({...pages[0],next_offset:10})));
});

test('permuted JSON keys normalize to a replayable research record; only eligible successes fit the unchanged model',async()=>{
 const {trainSearchResearch}=await import('../scripts/train_search_research.mjs');
 const a=normalizeResearchSession({actions:[{i:0,p:'P',type:'toggle'},check],mission_id:'implication-flip',version:COUNTERMODEL_VERSION});
 assert.equal(validateSearchResearch(document([a])).length,1);
 const extra=[normalizeResearchSession(session([check])),normalizeResearchSession(session([hint,toggle,check])),normalizeResearchSession(session([check],'quantifier-switch'))];
 const first=await trainSearchResearch(document([a])),second=await trainSearchResearch(document([a,...extra]));
 assert.deepEqual(second.model,first.model);assert.equal(second.intake.unfinished_excluded_from_behavior_cloning,2);
 assert.equal(second.model.training.examples,2);assert.equal(second.quality.summary.tested_rounds,4);
 await assert.rejects(trainSearchResearch(document(extra)),/No unassisted training/);
});

test('large real-format export parses per record without weakening strict duplicate or complexity checks',async()=>{
 const records=Array.from({length:20},(_,k)=>normalizeResearchSession(session([{type:'add'},{type:'add'},...Array.from({length:5},(_,j)=>({type:'toggle_relation',i:0,j:(k&(1<<j))?0:1})),...Array.from({length:112},()=>({type:'toggle_relation',i:2,j:2})),check],'quantifier-scope')));
 const raw=JSON.stringify(document(records));assert.ok(raw.length>1000000);
 assert.equal(readSearchResearch(raw).entries.length,20);
 for(const bad of [raw.replace('"entries":','"entries":[],"entries":'),raw.replace('"version":','"version":"forged","version":'),raw.replace('"next_offset":null','"next_offset":null,"next_offset":0'),'{"entries":[],"format":"x","entries":[]}'])assert.throws(()=>readSearchResearch(bad));
 const batch=await collectSearchResearch(()=>({...document(records),next_offset:20}));assert.equal(batch.next_offset,20);assert.equal(batch.entries.length,20);
});

test('mutating a returned certificate cannot poison the private source graph or later routes',async()=>{
 const first=await routeCertificate('implication-flip',initialWorld()),hash=first.graph_sha256;
 first.actions[0].i=9;
 await assert.rejects(verifyRouteCertificate(first));
 const second=await routeCertificate('implication-flip',initialWorld());
 assert.equal(second.graph_sha256,hash);assert.equal((await verifyRouteCertificate(second)).minimum_edits,1);
 assert.deepEqual(second.actions,[{type:'toggle',p:'P',i:0}]);
});
