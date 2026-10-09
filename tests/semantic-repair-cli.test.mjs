import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {repairRequestForTask} from '../public/semantic-repair-core.mjs';
import {GAUNTLET_TASKS} from '../public/semantic-gauntlet-core.mjs';
import {makeRepairExperiment,verifyRepairExperiment,sweepRepairBenchmark} from '../scripts/semantic_repair_lab.mjs';
const cli=fileURLToPath(new URL('../scripts/semantic_repair_lab.mjs',import.meta.url));
const run=(...args)=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:30000});
const temporary=(f)=>{const dir=mkdtempSync(join(tmpdir(),'pcs-repair-test-'));try{return f(dir);}finally{rmSync(dir,{recursive:true,force:true});}};
test('exact replay and SHA-pinned source report',()=>{
 const req=repairRequestForTask('implication-reversal-1',{max_edits:1,max_candidates:150});
 const experiment=makeRepairExperiment(req);const verification=verifyRepairExperiment(experiment);
 assert.equal(verification.status,'EXACT_SOURCE_REPLAY_MATCH');
 assert.match(verification.finite_engine_sha256,/^[a-f0-9]{64}$/);
 assert.equal(experiment.lean_kernel_checked,false);
});
test('CLI request/analyze/recheck is a real executable roundtrip',()=>temporary(dir=>{
 const request=join(dir,'request.json'),report=join(dir,'report.json'),verified=join(dir,'verified.json');
 assert.equal(run('request','implication-reversal-1',request).status,0);
 assert.equal(run('analyze',request,report).status,0);
 assert.equal(run('recheck',report,verified).status,0);
 const payload=JSON.parse(readFileSync(verified));assert.equal(payload.status,'EXACT_SOURCE_REPLAY_MATCH');
 assert.equal(run('analyze',request,report).status,2,'No overwrite of existing evidence');
}));
test('tampering, swapped task IDs and duplicate JSON fields fail closed',()=>temporary(dir=>{
 const path=join(dir,'input.json'),output=join(dir,'output.json');
 const experiment=makeRepairExperiment(repairRequestForTask('implication-reversal-1'));
 experiment.result.repairs[0].candidate={op:'eq',x:'x',y:'x'};
 writeFileSync(path,JSON.stringify(experiment));assert.equal(run('recheck',path,output).status,2);
 assert.throws(()=>verifyRepairExperiment(experiment),/TAMPERED/);
 const wrong=makeRepairExperiment(repairRequestForTask('implication-reversal-1'));
 wrong.source.finite_engine_sha256='0'.repeat(64);
 assert.throws(()=>verifyRepairExperiment(wrong),/PROVENANCE/);
 writeFileSync(path,'{"format":"pcs-semantic-repair-lab-v1","format":"forged"}');
 assert.equal(run('analyze',path,output).status,2);
}));
test('deterministic complete public-benchmark sweep reports zero human records',()=>{
 const s=sweepRepairBenchmark();assert.equal(s.results.length,GAUNTLET_TASKS.length);
 assert.equal(s.human_trajectories,0);assert.equal(s.lean_kernel_verified,false);
 assert.equal(s.practice.cases+s.evaluation.cases,60);
 assert.ok(s.overall.repaired_within_budget>4);
 assert.deepEqual(s,sweepRepairBenchmark());
});
