import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAuditPage,auditSearchPattern} from "../src/audit-query.js";
const parse=text=>parseAuditPage(new URLSearchParams(text));
test("recent admin lists are small and archive pages are bounded",()=>{
  assert.equal(parse("kind=approvals").limit,5);
  assert.equal(parse("kind=admin").limit,10);
  assert.equal(parse("kind=all").limit,25);
  assert.equal(parse("kind=all&limit=100").limit,100);
  assert.throws(()=>parse("kind=all&limit=101"),/exceed/);
  assert.throws(()=>parse("kind=other"),/Unknown/);
  assert.throws(()=>parse("kind=all&limit=-1"),/Invalid/);
});
test("audit cursors fail closed on malformed input and precision overflow",()=>{
  assert.equal(parse("before_seq=654").before,654);
  for(const cursor of ["-1","0","1; DROP TABLE audit_archive","9999999999999999","1.5"]){
    assert.throws(()=>parse("before_seq="+encodeURIComponent(cursor)),/Invalid/);
  }
  assert.equal(parse("kind=all").before,null);
});
test("literal wildcard escape and bounded database search",()=>{
  assert.equal(auditSearchPattern("admin%_"),"%admin\\%\\_%");
  assert.equal(auditSearchPattern("a\\b"),"%a\\\\b%");
  assert.equal(parse("kind=all&q=+proof+accepted+").query,"proof accepted");
  assert.throws(()=>parse("q="+encodeURIComponent("x".repeat(101))),/100/);
});
test("full integrity verification is not repeated for every pagination click",()=>{
  const worker=readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../public/admin.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../public/admin.js",import.meta.url),"utf8");
  assert.match(worker,/page\.verify&&page\.kind==="all"&&page\.before===null/);
  assert.match(worker,/page\.limit\+1/);
  assert.match(html,/id="adminAuditDatabaseDisclosure"/);
  assert.match(html,/id="adminAuditPageSize"/);
  assert.match(js,/loadAuditFeed\("all",\{verify:true\}\)/);
  assert.match(js,/kind==="approvals"\?"5":kind==="admin"\?"10"/);
});
