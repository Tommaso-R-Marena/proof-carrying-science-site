import test from 'node:test';import assert from 'node:assert/strict';
import {canonical,digest} from '../public/omega-core.mjs';
import {conditionalFromText,evaluateConditional} from '../public/conditional-core.mjs';
import {TASK,planIntervention,verifyIntervention,auditInterventionProposal} from '../public/intervention-core.mjs';
function task(target='A OR B',assumptions=''){const problem=conditionalFromText(target,'FALSE',assumptions),names=problem.variables;return {format:TASK,problem,baseline:Object.fromEntries(names.map(n=>[n,false])),costs:Object.fromEntries(names.map(n=>[n,1])),locked:[]};}
function oracle(t){const ns=t.problem.variables,worlds=[];let context=false;
 for(let mask=0;mask<2**ns.length;mask++){const a=Object.fromEntries(ns.map((n,i)=>[n,Boolean(mask&(2**(ns.length-i-1)))]));if(!t.problem.assumptions.every(f=>evaluateConditional(f,a)))continue;context=true;if(!evaluateConditional(t.problem.source,a)||t.locked.some(n=>a[n]!==t.baseline[n]))continue;worlds.push([ns.reduce((s,n)=>s+(a[n]!==t.baseline[n]?t.costs[n]:0),0),a]);}
 if(!context)return {decision:'inconsistent_assumptions'};if(!worlds.length)return {decision:'no_feasible_plan'};
 const cost=Math.min(...worlds.map(([c])=>c)),winners=worlds.filter(([c])=>c===cost).map(([,a])=>a);
 return {decision:'optimal_plan',minimum_cost:cost,optimal_count:winners.length,assignment:winners[0],flips:ns.filter(n=>winners[0][n]!==t.baseline[n]),mandatory_flips:ns.filter(n=>winners.every(a=>a[n]!==t.baseline[n])),possible_flips:ns.filter(n=>winners.some(a=>a[n]!==t.baseline[n]))};
}
test('200 seeded independent exhaustive optimization/count/explanation comparisons',async()=>{
 for(let seed=1;seed<=200;seed++){let s=seed;const rand=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/2**32;},pick=a=>a[Math.floor(rand()*a.length)];
  function f(d){if(!d||rand()<.25)return pick(['A','B','C','D','E','F','TRUE','FALSE']);return rand()<.2?`NOT (${f(d-1)})`:`(${f(d-1)} ${pick(['AND','OR','->'])} ${f(d-1)})`;}
  const t=task(f(3),Array.from({length:Math.floor(rand()*4)},()=>f(2)).join('\n'));for(const n of t.problem.variables){t.baseline[n]=rand()<.5;t.costs[n]=1+Math.floor(rand()*9);if(rand()<.2)t.locked.push(n);}
  const expected=oracle(t),r=await planIntervention(t);assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k=>[k,r[k]])),expected);assert.equal(await verifyIntervention(r),expected.decision);
 }
});
test('weighted ties, locks, skipped variables and zero-variable constants',async()=>{
 let t=task(),r=await planIntervention(t);assert.equal(r.optimal_count,2);assert.deepEqual(r.assignment,{A:false,B:true});assert.deepEqual(r.mandatory_flips,[]);
 t.costs.A=3;r=await planIntervention(t);assert.deepEqual(r.mandatory_flips,['B']);const a=await auditInterventionProposal(t,{A:true,B:true});assert.equal(a.optimality_gap,3);
 t.locked=['A','B'];assert.equal((await planIntervention(t)).decision,'no_feasible_plan');assert.equal((await auditInterventionProposal(t,{A:true,B:true})).feasible,false);
 t=task('A OR (B AND NOT B)');t.baseline.B=true;r=await planIntervention(t);assert.deepEqual(r.assignment,{A:true,B:true});assert.equal(r.optimal_count,1);
 assert.equal((await planIntervention(task('TRUE'))).optimal_count,1);assert.equal((await planIntervention(task('FALSE'))).decision,'no_feasible_plan');assert.equal((await planIntervention(task('TRUE','FALSE'))).decision,'inconsistent_assumptions');
});
test('24-variable count and resigned tampering are independently checked',async()=>{
 const ns=Array.from({length:24},(_,i)=>'V'+String(i).padStart(2,'0')),t=task(Array.from({length:12},(_,i)=>`(${ns[2*i]} OR ${ns[2*i+1]})`).join(' AND ')),r=await planIntervention(t);
 assert.equal(r.minimum_cost,12);assert.equal(r.optimal_count,4096);assert.deepEqual(r.possible_flips,ns);
 for(const [field,value] of [['minimum_cost',0],['optimal_count',1],['pcs_authority',true],['mandatory_flips',ns],['bellman_cells',[null,[0,1,0,0]]]]){const bad=structuredClone(r);bad[field]=value;delete bad.receipt_sha256;bad.receipt_sha256=await digest(bad);await assert.rejects(verifyIntervention(bad));}
});
test('bounded failures and strict policy types',async()=>{
 for(const limits of [{nodes:1,operations:100000},{nodes:4096,operations:1}]){const r=await planIntervention(task('A AND B'),{limits});assert.equal(r.decision,'resource_limit');assert.equal(r.minimum_cost,null);assert.equal(r.bellman_cells,null);assert.equal(await verifyIntervention(r),'resource_limit');}
 for(const value of [0,true,1.5,1000001]){const t=task();t.costs.A=value;await assert.rejects(planIntervention(t));}
 for(const locked of [['A','A'],['B','A'],['C']]){const t=task();t.locked=locked;await assert.rejects(planIntervention(t));}
});
test('async inputs and verification snapshot before yielding',async()=>{
 const t=task(),expected=await planIntervention(t),pending=planIntervention(t);t.costs.A=8;assert.equal(canonical(await pending),canonical(expected));
 const r=structuredClone(expected),checking=verifyIntervention(r);r.minimum_cost=0;assert.equal(await checking,'optimal_plan');
 const original=task(),a={A:true,B:true},audit=auditInterventionProposal(original,a);a.A=false;original.costs.A=9;assert.equal((await audit).cost,2);
});
