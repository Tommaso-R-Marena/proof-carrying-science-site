import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptiveSearch,replayAdaptive,validateNonlinear,nonlinearFeatures,predictNonlinear} from '../public/omega-adaptive.mjs';
import {digest,strictParse} from '../public/omega-core.mjs';
const atom=s=>({op:'atom',symbol:s,args:[]}),t={variables:['P','Q'],source:{op:'implies',left:atom('P'),right:atom('Q')},candidate:{op:'implies',left:atom('Q'),right:atom('P')}};
const model=()=>strictParse(fs.readFileSync(new URL('../public/omega/nonlinear-v2.json',import.meta.url),'utf8'));
test('actual nonlinear checkpoint drives bounded repair, full checks retain acceptance',async()=>{
 const m=await validateNonlinear(model());assert.equal(m.input_weights.flat().length+m.hidden_bias.length+m.output_weights.length+1,1165);
 for(const learned of [false,true]){const e=await adaptiveSearch(t,{checks:4,proposals:32,model:learned?m:null});assert.ok(e.solution);assert.equal(e.checks_used,2);assert.equal(e.pcs_authority,false);await replayAdaptive(e);}
 const e=await adaptiveSearch(t,{checks:1});assert.equal(e.solution,null);assert.deepEqual(e.attempts,[]);await replayAdaptive(e);
});
test('recommitted false authority, budget and verdict fail independent replay',async()=>{
 const e=await adaptiveSearch(t);for(const [field,value] of [['checks_used',true],['pcs_authority',true],['witness_evaluations',999],['solution',{}]]){
  const bad=structuredClone(e);bad[field]=value;const {episode_sha256,...core}=bad;bad.episode_sha256=await digest(core);await assert.rejects(()=>replayAdaptive(bad));
 }
 const bad=structuredClone(e);bad.attempts[0].receipt.equivalent=false;const {episode_sha256,...core}=bad;bad.episode_sha256=await digest(core);await assert.rejects(()=>replayAdaptive(bad));
});
test('checkpoint bounds and feature semantics do not trust a recomputed digest',async()=>{
 const m=await validateNonlinear(model());const action={kind:'REPAIR_CANDIDATE',path:[],operation:'swap'},xs=nonlinearFeatures(t,action);assert.equal(xs.length,95);assert.equal(xs.at(-1),1);assert.ok(Number.isFinite(predictNonlinear(xs,m)));
 for(const mutate of [m=>m.input_weights[0].push(0),m=>m.output_bias=true,m=>m.authority='PCS',m=>m.training.examples=0]){
  const bad=model();mutate(bad);const {model_sha256,...core}=bad;bad.model_sha256=await digest(core);await assert.rejects(()=>validateNonlinear(bad));
 }
});
