import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifiedRepairModel,REPAIR_MODEL_DIGEST} from '../public/repair-model-integrity.mjs';
const source=JSON.parse(readFileSync(new URL('../public/repair-policy-model-v1.json',import.meta.url)));
test('the real inference snapshot matches the release model and cannot drift during checking',async()=>{
  const input=structuredClone(source), checking=verifiedRepairModel(input);input.weights[0]+=1;
  const model=await checking;
  assert.equal(model.model_digest_sha256,REPAIR_MODEL_DIGEST);assert.deepEqual(model.weights,source.weights);
  assert.ok(Object.isFrozen(model.weights));assert.throws(()=>{model.weights[0]=123;});
});
test('substitution, self-rehashed weights, malformed numbers and provenance changes fail before inference',async()=>{
  for(const mutate of [m=>m.weights[0]+=1,m=>m.weights[0]='1',m=>m.weights[0]=NaN,m=>m.weights[0]=Infinity,
    m=>m.weights.pop(),m=>m.provenance.evaluation_labels_used_for_training=true,
    m=>{m.weights[0]+=1;m.model_digest_sha256=createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(m).filter(([k])=>k!=='model_digest_sha256')))).digest('hex');}]){
    const m=structuredClone(source);mutate(m);await assert.rejects(verifiedRepairModel(m));
  }
});
