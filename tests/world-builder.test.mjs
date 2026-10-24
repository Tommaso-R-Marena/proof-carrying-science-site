import test from 'node:test';
import assert from 'node:assert/strict';
import {MISSIONS,newSession,addAction,sessionView,collectSession,notebook,readNotebook,analyzeNotebook,verifyRuleset} from '../public/world-builder-core.mjs';
import {COUNTERMODEL_VERSION,COUNTERMODEL_MISSIONS,initialWorld,countermodelVerdict,replayCountermodelSession} from '../public/countermodel-core.mjs';
const session=actions=>({version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions});
const toggle={type:'toggle',p:'P',i:0},check={type:'check'},hint={type:'hint'};

// Independent literal formula oracle, separate from the AST evaluator.
function oracle(id,w){const imp=(a,b)=>!a||b,all=f=>Array.from({length:w.n},(_,i)=>i).every(f),some=f=>Array.from({length:w.n},(_,i)=>i).some(f);
 switch(id){
 case 'implication-flip':return [all(i=>imp(w.P[i],w.Q[i])),all(i=>imp(w.Q[i],w.P[i]))];
 case 'negation-drop':return [all(i=>imp(w.P[i],!w.Q[i])),all(i=>imp(w.P[i],w.Q[i]))];
 case 'connective-swap':return [some(i=>w.P[i]&&w.Q[i]),some(i=>w.P[i]||w.Q[i])];
 case 'assumption-loss':return [all(i=>imp(w.P[i],w.Q[i])),all(i=>w.Q[i])];
 case 'quantifier-switch':return [all(i=>imp(w.P[i],w.Q[i])),some(i=>imp(w.P[i],w.Q[i]))];
 case 'quantifier-scope':return [all(i=>some(j=>w.R[i][j])),some(j=>all(i=>w.R[i][j]))];
 case 'variable-capture':return [all(i=>some(j=>w.R[i][j])),all(i=>w.R[i][i])];
 default:throw Error('Unknown oracle mission');
 }
}
test('all 1,480 relevant worlds reconstruct exactly and match an independent formula oracle',()=>{
 let count=0;
 for(const id of MISSIONS)for(let n=1;n<=3;n++){
  const relation=['quantifier-scope','variable-capture'].includes(id),bits=relation?n*n:2*n;
  for(let mask=0;mask<2**bits;mask++){
   let s=newSession(id);const w=initialWorld(n);for(let i=1;i<n;i++)s=addAction(s,{type:'add'});
   if(relation){for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(mask&(1<<(i*n+j))){w.R[i][j]=true;s=addAction(s,{type:'toggle_relation',i,j});}}
   else for(let i=0;i<n;i++)for(const [p,k]of [['P',2*i],['Q',2*i+1]])if(mask&(1<<k)){w[p][i]=true;s=addAction(s,{type:'toggle',p,i});}
   const view=sessionView(s);assert.deepEqual(view.world,w);assert.equal(view.checks,0);assert.equal(view.checked,null);
   s=addAction(s,check);const v=sessionView(s),[left,right]=oracle(id,w);
   assert.deepEqual(v.world,w);assert.deepEqual(v.checked.final_verdict,{left,right,counterexample:left!==right});
   assert.deepEqual(countermodelVerdict(id,w),v.checked.final_verdict);count++;
  }
 }
 assert.equal(count,1480);
});
test('edits, clues and undo invalidate current authority and retain all actual requests',()=>{
 let s=newSession('implication-flip');s=addAction(s,toggle);s=addAction(s,check);
 assert.equal(sessionView(s).checked.final_verified,true);
 const prior=structuredClone(s);s=addAction(s,hint);assert.equal(sessionView(s).checked,null);
 s=addAction(s,toggle);s=addAction(s,check);
 const r=replayCountermodelSession(s);assert.equal(r.final_verified,false);assert.equal(r.hints,1);assert.equal(r.checks,2);assert.equal(r.edits,2);
 assert.deepEqual(prior.actions,[toggle,check]);
 assert.equal(r.lean_kernel_checked,false);assert.equal(r.pcs_authoritative,false);
});
test('notebook preserves failed and unfinished tested rounds and deduplicates typed choices',async()=>{
 const failed=session([check]),solved=session([check,toggle,check]),unfinished=session([toggle,check,toggle]);
 let saved=[];for(const s of [failed,solved,unfinished,solved])saved=collectSession(saved,s);
 assert.equal(saved.length,3);const n=readNotebook(JSON.stringify(notebook(saved)));assert.equal(n.sessions.length,3);
 const a=await analyzeNotebook(n);assert.equal(a.episodes.filter(e=>e.solved).length,1);assert.equal(a.episodes.reduce((n,e)=>n+e.failed_checks,0),2);
 assert.equal(a.kernel_checked,false);assert.equal(a.pcs_authoritative,false);
 assert.throws(()=>collectSession([],session([toggle])));
 saved[0].actions[0].type='forged';assert.equal(n.sessions[0].actions[0].type,'check');
});
test('pre-action inputs do not contain computed future truth or outcomes; actual feedback is retained',async()=>{
 const n=notebook([session([toggle,check,toggle,check])]);const a=await analyzeNotebook(n);
 assert.equal(a.rows[0].input.previous_check,null);assert.equal(a.rows[1].input.previous_check,null);
 assert.equal(a.rows[2].input.previous_check.counterexample,true);assert.deepEqual(a.rows[2].input.world,a.rows[1].outcome.world);
 assert.equal(a.rows[3].outcome.counterexample,false);
 for(const row of a.rows){assert.deepEqual(Object.keys(row.input).sort(),['assistance_seen','mission_id','previous_check','world']);assert.ok(!('outcome' in row.input));}
 assert.deepEqual(a.rows[2].input.previous_check.world,a.rows[1].outcome.world);
});
test('any recorded assistance excludes an entire episode; held-out mission choices never become training rows',async()=>{
 const a=await analyzeNotebook(notebook([session([toggle,check,hint,check]),{...session([check]),mission_id:'quantifier-switch'},session([toggle,check])]));
 assert.deepEqual(a.episodes.map(e=>e.split),['assisted_excluded','evaluation','training']);
 assert.equal(a.rows.filter(r=>r.split==='training').length,2);
});
test('forged scores, schemas, labels, duplicate JSON, invalid actions and oversized data fail closed',()=>{
 const good=notebook([session([toggle,check])]);
 for(const mutate of [n=>n.score=500,n=>n.ruleset_sha256='0'.repeat(64),n=>n.ui_version='future',n=>n.sessions[0].verified=true,n=>n.sessions[0].actions[0].counterexample=true,n=>n.sessions[0].mission_id='other',n=>n.sessions[0].actions[0].i=3]){
  const n=structuredClone(good);mutate(n);assert.throws(()=>readNotebook(JSON.stringify(n)));
 }
 assert.throws(()=>readNotebook('{"sessions":[],"sessions":[]}'));
 assert.throws(()=>readNotebook(' '.repeat(131073)));
 assert.throws(()=>readNotebook(JSON.stringify({...good,sessions:[]})));
 assert.throws(()=>newSession('other'));
 assert.throws(()=>addAction(newSession('implication-flip'),{type:'toggle_relation',i:0,j:0}));
});
test('move and notebook bounds preserve a final check slot and never silently discard records',()=>{
 let s=newSession('implication-flip');for(let i=0;i<119;i++)s=addAction(s,toggle);
 assert.throws(()=>addAction(s,toggle));s=addAction(s,check);assert.equal(s.actions.length,120);assert.throws(()=>addAction(s,check));
 const records=[];for(let k=0;k<20;k++)records.push(session([...Array.from({length:k},()=>toggle),check]));
 const saved=notebook(records);assert.equal(saved.sessions.length,20);
 assert.throws(()=>collectSession(saved.sessions,session([...Array.from({length:21},()=>toggle),check])));
 assert.equal(saved.sessions.length,20);
});

test('twenty full 120-action relation rounds fit the exact exported byte and parser budgets',()=>{
 const sessions=Array.from({length:20},(_,k)=>({version:COUNTERMODEL_VERSION,mission_id:'quantifier-scope',actions:[
  {type:'add'},{type:'add'},...Array.from({length:5},(_,j)=>({type:'toggle_relation',i:0,j:(k&(1<<j))?0:1})),
  ...Array.from({length:112},()=>({type:'toggle_relation',i:2,j:2})),check]}));
 const raw=JSON.stringify(notebook(sessions))+'\n';assert.ok(Buffer.byteLength(raw)<=131072);
 assert.equal(readNotebook(raw).sessions.length,20);assert.equal(readNotebook(raw).sessions[19].actions.length,120);
});

test('semantic ruleset mutation fails closed before analysis or UI startup',async()=>{
 const node=COUNTERMODEL_MISSIONS[0].a,old=node.op;
 try{node.op='exists';await assert.rejects(verifyRuleset(),/ruleset changed/);}finally{node.op=old;}
 await verifyRuleset();
});
