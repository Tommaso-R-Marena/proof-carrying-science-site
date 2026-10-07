import test from "node:test";
import assert from "node:assert/strict";
import {validateTaskCodeWindow,sliceTaskCodeText} from "../src/contribution-github.js";

test("task code windows are bounded and reject repository escape paths",()=>{
  assert.deepEqual(validateTaskCodeWindow("formal/PCS/V2/Checkers.lean",108,130),{
    path:"formal/PCS/V2/Checkers.lean",startLine:108,endLine:130
  });
  assert.throws(()=>validateTaskCodeWindow("../secret.txt",1,10),/approved source-text boundary/);
  assert.throws(()=>validateTaskCodeWindow(".github/workflows/ci.yml",1,10),/approved source-text boundary/);
  assert.throws(()=>validateTaskCodeWindow("keys/private_key.pem",1,10),/approved source-text boundary/);
  assert.throws(()=>validateTaskCodeWindow("pcs/impact.py",1,401),/limited to 400 lines/);
});

test("task code slicing returns only the requested lines",()=>{
  const sliced=sliceTaskCodeText("one\ntwo\nthree\nfour\nfive",2,4);
  assert.equal(sliced.content,"two\nthree\nfour");
  assert.equal(sliced.start_line,2);
  assert.equal(sliced.end_line,4);
  assert.equal(sliced.total_lines,5);
  assert.throws(()=>sliceTaskCodeText("one\ntwo",3,3),/starts beyond/);
});
