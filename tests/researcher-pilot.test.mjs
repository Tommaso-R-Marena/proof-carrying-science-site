import test from "node:test";
import assert from "node:assert/strict";
import {
  EVALUATION_FORMAT, DEFAULTS, validatePilotInput,
  makePilotDraft, emailSummary
} from "../public/researcher-pilot-core.mjs";

const base=()=>({...DEFAULTS});

test("safe first visit generates only an unsigned evaluation draft",()=>{
  const report=makePilotDraft(base());
  assert.equal(report.format,EVALUATION_FORMAT);
  assert.equal(report.signed,false);
  assert.equal(report.authoritative,false);
  assert.equal(report.pcs_verdict,"NOT_EVALUATED");
  assert.equal(report.independent_verification,"NOT_ATTESTED");
  assert.equal(report.assessment.source_version,"not-known");
  assert.equal(report.assessment.observed,"not_run");
});
test("scientist can record an explicitly pinned and self-reported negative result",()=>{
  const a=base();
  a.source_version="c".repeat(40);
  a.observed="unexpected";
  a.track="falsify";
  const r=makePilotDraft(a);
  assert.equal(r.self_reported_observation,"unexpected");
  assert.equal(r.authoritative,false);
  assert.equal(r.pcs_verdict,"NOT_EVALUATED");
});
test("prevents an executed outcome without version provenance",()=>{
  const a=base();
  a.observed="expected";
  assert.throws(()=>makePilotDraft(a),/actual version/);
});
test("unknown status or target cannot manufacture successful verification",()=>{
  for(const [field,val] of [["observed","verified"],["target","private_leak"],["track","PASS"]]){
    const a=base();a[field]=val;
    assert.throws(()=>makePilotDraft(a),/supported/);
  }
});
test("rejects extra authority claims and invalid or oversized strings",()=>{
  const a=base();a.valid=true;
  assert.throws(()=>makePilotDraft(a),/explicitly supported/);
  const b=base();b.experiment="a".repeat(1800);
  assert.throws(()=>makePilotDraft(b),/experiment/);
  const c=base();c.expected=".";
  assert.throws(()=>makePilotDraft(c),/expected/);
});
test("mail summary labels result unverified and exposes no automatic submit action",()=>{
  const summary=emailSummary(base());
  assert.match(summary,/self-reported/);
  assert.match(summary,/not a statement of PCS verification/);
  assert.match(summary,/non-sensitive/);
  assert.doesNotMatch(summary,/PASS ACCEPTED/);
});
test("works for all three independent evaluation tracks",()=>{
  for(const track of ["falsify","reproduce","trust_boundary"]){
    const draft=makePilotDraft({...base(),track});
    assert.equal(draft.assessment.track,track);
    assert.equal(draft.pcs_verdict,"NOT_EVALUATED");
  }
});
test("unsupported data types fail closed instead of trusting them",()=>{
  for(const field of ["source_version","claim","experiment","assumptions"]){
    assert.throws(()=>validatePilotInput({...base(),[field]:{accepted:true}}),/must be text/);
  }
  assert.throws(()=>validatePilotInput(null),/explicitly supported/);
});
