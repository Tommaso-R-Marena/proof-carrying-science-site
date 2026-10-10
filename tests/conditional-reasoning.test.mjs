import test from 'node:test';import assert from 'node:assert/strict';
import {checkConditional,conditionalFromText,verifyConditional,parseFormula,validateConditional} from '../public/conditional-core.mjs';
import {digest,strictParse} from '../public/omega-core.mjs';
const atom=s=>({op:'atom',symbol:s,args:[]});
function truth(f,a){if(f.op==='atom')return a[f.symbol];if(f.op==='true')return true;if(f.op==='false')return false;if(f.op==='not')return !truth(f.body,a);const x=truth(f.left,a),y=truth(f.right,a);return f.op==='and'?x&&y:f.op==='or'?x||y:!x||y;}
function worlds(names){return Array.from({length:2**names.length},(_,i)=>Object.fromEntries(names.map((n,j)=>[n,Boolean(i&(1<<(names.length-j-1)))])));}
test('independent exhaustive oracle checks all connectives and satisfiable contexts',async()=>{
 let state=2031;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
 function f(d){if(!d||random()<.28)return random()<.8?atom('ABCDEF'[Math.floor(random()*6)]):{op:random()<.5?'true':'false'};const op=['not','and','or','implies'][Math.floor(random()*4)];return op==='not'?{op,body:f(d-1)}:{op,left:f(d-1),right:f(d-1)};}
 for(let i=0;i<160;i++){
  const t={format:'pcs-conditional-boolean-task-v1',variables:[...'ABCDEF'],source:f(3),candidate:f(3),assumptions:Array.from({length:Math.floor(random()*4)},()=>f(2))};const r=await checkConditional(t),all=worlds(t.variables),allowed=all.filter(w=>t.assumptions.every(p=>truth(p,w))),bad=allowed.filter(w=>truth(t.source,w)!==truth(t.candidate,w));
  assert.equal(r.decision,!allowed.length?'inconsistent_assumptions':bad.length?'counterexample':'equivalent_under_assumptions');if(allowed.length)assert.deepEqual(r.context_example,allowed[0]);if(bad.length)assert.deepEqual(r.counterexample.assignment,bad[0]);
  if(!allowed.length){assert.ok(!all.some(w=>r.unsat_core.every(j=>truth(t.assumptions[j],w))));for(const w of r.core_necessity_witnesses){assert.ok(r.unsat_core.filter(j=>j!==w.removed_assumption).every(j=>truth(t.assumptions[j],w.assignment)));assert.equal(truth(t.assumptions[w.removed_assumption],w.assignment),false);}}
  const nodes=r.diagram.nodes;assert.equal(new Set(nodes.map(JSON.stringify)).size,nodes.length);nodes.forEach(([v,lo,hi],j)=>{assert.notEqual(lo,hi);for(const child of [lo,hi]){assert.ok(child>=0&&child<j+2);if(child>=2)assert.ok(nodes[child-2][0]>v);}});assert.equal(await verifyConditional(r),r.decision);
 }
});
test('uses actual premises and diagnoses a minimal conflict without accepting vacuity',async()=>{
 assert.equal((await checkConditional(conditionalFromText('TRUE','B','A\nA -> B'))).decision,'equivalent_under_assumptions');
 assert.equal((await checkConditional(conditionalFromText('TRUE','B','A -> B'))).decision,'counterexample');
 assert.equal((await checkConditional(conditionalFromText('A AND B','A OR B'))).decision,'counterexample');
 assert.equal((await checkConditional(conditionalFromText('A AND B','A OR B','A\nB'))).decision,'equivalent_under_assumptions');
 const r=await checkConditional(conditionalFromText('A AND B','A OR B','A\nNOT A\nB'));assert.equal(r.decision,'inconsistent_assumptions');assert.deepEqual(r.unsat_core,[0,1]);assert.equal(r.diagram.source,null);
});
test('24 variables, constants and right-associative implication',async()=>{
 const names=Array.from({length:24},(_,i)=>'V'+String(i).padStart(2,'0'));const r=await checkConditional(conditionalFromText('NOT ('+names.join(' OR ')+')',names.map(n=>'NOT '+n).join(' AND ')));assert.equal(r.decision,'equivalent_under_assumptions');assert.ok(r.work.bdd_nodes<200&&r.work.apply_calls<1000);
 assert.deepEqual((await checkConditional(conditionalFromText('TRUE','FALSE'))).counterexample.assignment,{});assert.equal(parseFormula('A -> B -> C').right.op,'implies');assert.equal(parseFormula('A OR B AND C').right.op,'and');assert.equal(parseFormula('A\u0085AND B').op,'and');assert.equal(conditionalFromText('A','B','A\u2028B').assumptions.length,2);
});
test('both computation limits stop without an accepted result',async()=>{
 for(const limits of [{nodes:1,operations:100000},{nodes:4096,operations:1}]){const r=await checkConditional(conditionalFromText('A AND B','A OR B'),{limits});assert.equal(r.decision,'resource_limit');assert.equal(r.diagram,null);assert.ok(r.work.bdd_nodes<=limits.nodes&&r.work.apply_calls<=limits.operations);assert.equal(await verifyConditional(r),'resource_limit');}
});
test('replay rejects resigned wrong decisions, witnesses, budgets, diagrams and authority',async()=>{
 const base=await checkConditional(conditionalFromText('A AND B','A OR B'));
 for(const change of [r=>r.decision='equivalent_under_assumptions',r=>r.counterexample.assignment.A=true,r=>r.diagram.difference=0,r=>r.limits.nodes=1,r=>r.work.apply_calls++,r=>r.pcs_authority=true,r=>r.lean_kernel_checked=true,r=>r.extra='unreviewed']){const r=structuredClone(base);change(r);delete r.receipt_sha256;r.receipt_sha256=await digest(r);await assert.rejects(verifyConditional(r));}
});
test('input and replay snapshots survive caller mutation across async hashing',async()=>{
 const t=conditionalFromText('A AND B','A OR B');const pending=checkConditional(t);t.source={op:'true'};const r=await pending;assert.equal(r.original_task.source.op,'and');const replay=verifyConditional(r);r.decision='equivalent_under_assumptions';assert.equal(await replay,'counterexample');
});
test('grammar, duplicate JSON, type and complexity bounds reject malformed inputs',async()=>{
 for(const raw of ['A B','A ->','A + B','A()','a','AND','A OR','('.repeat(34)+'A'+')'.repeat(34),'A\ufeff'])assert.throws(()=>conditionalFromText(raw,'A'));
 for(const mutate of [t=>t.source.op=[],t=>t.source.extra=1,t=>t.variables.push('A'),t=>t.assumptions=Array(9).fill({op:'true'})]){const t=conditionalFromText('A AND B','A OR B');mutate(t);assert.throws(()=>validateConditional(t));}
 assert.throws(()=>strictParse('{"format":1,"format":2}'));assert.throws(()=>conditionalFromText(Array.from({length:25},(_,i)=>'V'+i).join(' AND '),'TRUE'));await assert.rejects(checkConditional(conditionalFromText('A','B'),{limits:{nodes:true,operations:10}}));
});
