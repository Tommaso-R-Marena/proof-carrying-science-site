import test from "node:test";
import assert from "node:assert/strict";
import {evaluateTrace,evaluateModel,examples} from "../public/research-preview-engine.mjs";
const fresh = x => structuredClone(x);

test("valid declared trace passes exactly at risk bound", () => {
 const result = evaluateTrace(fresh(examples.trace_pass));
 assert.equal(result.verdict,"PASS");
 assert.equal(result.steps.at(-1).cumulative_risk,4);
 assert.equal(result.steps.length,3);
 assert.match(result.limits,/No signature, Lean theorem/);
});
test("forbidden action and excessive cumulative risk each fail", () => {
 const result = evaluateTrace(fresh(examples.trace_fail));
 assert.equal(result.verdict,"FAIL");
 assert.match(result.conclusion,/forbidden action 7/);
 assert.equal(result.steps[1].passed,false);
 assert.equal(result.steps[2].passed,false);
});
test("boundary rejects non-integral, negative, or malformed trace records", () => {
 const obj=fresh(examples.trace_pass);obj.events[0].risk=-1;
 assert.throws(()=>evaluateTrace(obj),/Event risk/);
 const bad=fresh(examples.trace_pass);bad.events[0].action=1.3;
 assert.throws(()=>evaluateTrace(bad),/integer/);
 const extra=fresh(examples.trace_pass);extra.events[0].source="real_world";
 assert.throws(()=>evaluateTrace(extra),/unsupported fields/);
 const many=fresh(examples.trace_pass);many.events=Array(65).fill({action:1,risk:0});
 assert.throws(()=>evaluateTrace(many),/between 1 and 64/);
});
test("synthetic model passes only within declared tolerance", () => {
 const result=evaluateModel(fresh(examples.model_pass));
 assert.equal(result.verdict,"PASS");
 assert.equal(result.steps.length,3);
 assert.ok(result.steps.every(row=>row.passed));
 assert.match(result.limits,/not empirical truth/);
});
test("perturbed observation is rejected", () => {
 const result=evaluateModel(fresh(examples.model_fail));
 assert.equal(result.verdict,"FAIL");
 assert.match(result.conclusion,/Observation 2/);
});
test("nonfinite, unexpected and unphysical inputs fail closed", () => {
 const a=fresh(examples.model_pass);a.model.volume_l=0;
 assert.throws(()=>evaluateModel(a),/volume_l/);
 const b=fresh(examples.model_pass);b.observations[0].time_h=-1;
 assert.throws(()=>evaluateModel(b),/time_h/);
 const c=fresh(examples.model_pass);c.observations[0].concentration_mg_per_l=Infinity;
 assert.throws(()=>evaluateModel(c),/concentration/);
 const d=fresh(examples.model_pass);d.hint="skip checking";
 assert.throws(()=>evaluateModel(d),/unsupported fields/);
});
